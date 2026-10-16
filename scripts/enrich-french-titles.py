#!/usr/bin/env python3
"""
Enrich MCP results with French titles from Wikidata.

Reads: data/locations-mcp-raw.json
Uses: Wikidata batch API (50 QIDs per request)
Writes: data/locations-enriched.json

Output format:
{
  "titre_francais_fold": {
    "title": "Titre Français",
    "english_title": "English Title",
    "year": 2004,
    "locations": [...],
    "qid": "Q936425"
  }
}
"""
import json
import re
import sys
import time
import unicodedata
import urllib.request
import urllib.parse
import urllib.error
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock

WIKIDATA_API = "https://www.wikidata.org/w/api.php"
USER_AGENT = "CineScope/1.0 (research; https://github.com/cinescope)"

MAX_WORKERS = 3
REQUEST_DELAY = 0.5
BATCH_SIZE = 50
SAVE_EVERY = 5  # Save every 5 batches


def fold(text: str) -> str:
    if not text:
        return ""
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return text.strip()


def extract_qid(wikidata_url: str) -> str | None:
    """Extract QID from Wikidata URL."""
    if not wikidata_url:
        return None
    match = re.search(r"Q\d+", wikidata_url)
    return match.group(0) if match else None


def api_request(params: dict, retries: int = 3) -> dict | None:
    params["format"] = "json"
    url = WIKIDATA_API + "?" + urllib.parse.urlencode(params)

    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=30) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = min(2 ** attempt * 2, 30)
                print(f"  [RATE LIMIT] Waiting {wait}s...", file=sys.stderr, flush=True)
                time.sleep(wait)
            else:
                print(f"  [HTTP {e.code}]", file=sys.stderr, flush=True)
                if attempt < retries - 1:
                    time.sleep((attempt + 1))
                else:
                    return None
        except Exception as e:
            print(f"  [ERROR] {e}", file=sys.stderr, flush=True)
            if attempt < retries - 1:
                time.sleep((attempt + 1))
            else:
                return None
    return None


def get_french_labels(qids: list[str]) -> dict[str, str]:
    """Get French labels for a batch of QIDs."""
    if not qids:
        return {}

    result = api_request({
        "action": "wbgetentities",
        "ids": "|".join(qids),
        "props": "labels",
        "languages": "fr|en",
    })

    if not result or "entities" not in result:
        return {}

    labels = {}
    for qid, entity in result["entities"].items():
        entity_labels = entity.get("labels", {})
        # Prefer French, fallback to English
        if "fr" in entity_labels:
            labels[qid] = entity_labels["fr"]["value"]
        elif "en" in entity_labels:
            labels[qid] = entity_labels["en"]["value"]

    return labels


def main():
    base = Path(__file__).resolve().parents[1]
    raw_path = base / "data/locations-mcp-raw.json"
    output_path = base / "data/locations-enriched.json"
    cache_path = base / "data/.french-labels-cache.json"
    progress_path = base / "data/.french-progress.json"

    print("=" * 60, flush=True)
    print("Enrichissement avec les titres français (Wikidata batch)")
    print(f"Batch size: {BATCH_SIZE}, Workers: {MAX_WORKERS}")
    print("=" * 60, flush=True)

    if not raw_path.exists():
        print(f"ERREUR: {raw_path} n'existe pas.", flush=True)
        print("Lancez d'abord fetch-locations-mcp.py", flush=True)
        return

    print("\nLecture des données MCP...", flush=True)
    with open(raw_path, "r", encoding="utf-8") as f:
        raw_data = json.load(f)
    print(f"  {len(raw_data)} entrées", flush=True)

    # Extract QIDs
    qid_to_titles = {}  # qid -> list of english titles
    title_to_qid = {}   # english title -> qid
    for title, data in raw_data.items():
        qid = extract_qid(data.get("wikidata", ""))
        if qid:
            title_to_qid[title] = qid
            if qid not in qid_to_titles:
                qid_to_titles[qid] = []
            qid_to_titles[qid].append(title)

    unique_qids = list(qid_to_titles.keys())
    print(f"  {len(unique_qids)} QIDs uniques à résoudre", flush=True)

    # Load cache
    cache = {}
    if cache_path.exists():
        print("Chargement du cache...", flush=True)
        with open(cache_path, "r", encoding="utf-8") as f:
            cache = json.load(f)
        print(f"  {len(cache)} labels en cache", flush=True)

    # Load progress
    done_qids = set()
    if progress_path.exists():
        with open(progress_path, "r", encoding="utf-8") as f:
            progress = json.load(f)
            done_qids = set(progress.get("done_qids", []))
        print(f"  {len(done_qids)} QIDs déjà traités", flush=True)

    todo_qids = [q for q in unique_qids if q not in done_qids and q not in cache]
    print(f"\n{len(todo_qids)} QIDs à traiter", flush=True)

    # Split into batches
    batches = [todo_qids[i:i+BATCH_SIZE] for i in range(0, len(todo_qids), BATCH_SIZE)]
    print(f"  {len(batches)} batches", flush=True)

    if not batches:
        print("Rien à faire!", flush=True)
    else:
        start_time = time.time()

        def process_batch(batch_idx: int, batch: list[str]):
            time.sleep(batch_idx * REQUEST_DELAY / MAX_WORKERS)
            labels = get_french_labels(batch)
            return batch, labels

        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            futures = {
                executor.submit(process_batch, i, batch): (i, batch)
                for i, batch in enumerate(batches)
            }

            for future in as_completed(futures):
                batch_idx, batch = futures[future]
                try:
                    _, labels = future.result()
                    for qid, label in labels.items():
                        cache[qid] = label
                        done_qids.add(qid)

                    done = len(done_qids)
                    total = len(unique_qids)
                    elapsed = time.time() - start_time
                    eta = (elapsed / done) * (total - done) if done > 0 else 0

                    if done % (SAVE_EVERY * BATCH_SIZE) < BATCH_SIZE or done == total:
                        print(f"  [{done}/{total}] ETA: {eta/60:.1f}min", flush=True)

                    if done % (SAVE_EVERY * BATCH_SIZE) < BATCH_SIZE:
                        with open(cache_path, "w", encoding="utf-8") as f:
                            json.dump(cache, f, ensure_ascii=False)
                        with open(progress_path, "w", encoding="utf-8") as f:
                            json.dump({"done_qids": list(done_qids)}, f)

                except Exception as e:
                    print(f"  [ERROR] Batch {batch_idx}: {e}", file=sys.stderr, flush=True)

        # Final save
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(cache, f, ensure_ascii=False)
        with open(progress_path, "w", encoding="utf-8") as f:
            json.dump({"done_qids": list(done_qids)}, f)

    # Build final output
    print("\nConstruction du mapping final...", flush=True)
    output = {}
    matched = 0
    unmatched = 0

    for title, data in raw_data.items():
        qid = extract_qid(data.get("wikidata", ""))
        french_title = cache.get(qid) if qid else None

        locations = data.get("locations", [])
        if not locations:
            continue

        entry = {
            "english_title": data.get("english_title", title),
            "locations": locations,
            "year": data.get("year"),
            "qid": qid,
            "slug": data.get("slug", ""),
        }

        # Index by French title (primary)
        if french_title:
            french_fold = fold(french_title)
            if french_fold not in output:
                output[french_fold] = {"title": french_title, **entry}
                matched += 1

        # Index by English title
        english_fold = fold(data.get("english_title", title))
        if english_fold and english_fold not in output:
            output[english_fold] = {"title": data.get("english_title", title), **entry}

        # Index by original title
        title_fold = fold(title)
        if title_fold not in output:
            output[title_fold] = {"title": title, **entry}

        if not french_title:
            unmatched += 1

    # Save output
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, separators=(",", ":"))

    print(f"\n{'=' * 60}", flush=True)
    print("TERMINÉ!", flush=True)
    print(f"  Fichier: {output_path}", flush=True)
    print(f"  Entrées dans le mapping: {len(output)}", flush=True)
    print(f"  Titres avec label FR: {matched}", flush=True)
    print(f"  Titres sans label FR: {unmatched}", flush=True)
    print(f"{'=' * 60}", flush=True)

    # Show some examples
    print("\nExemples:", flush=True)
    for key in list(output.keys())[:10]:
        entry = output[key]
        print(f"  {entry['title']} ({entry.get('year', '?')}) - {len(entry['locations'])} lieux", flush=True)


if __name__ == "__main__":
    main()
