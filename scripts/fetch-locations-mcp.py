#!/usr/bin/env python3
"""
Fetch filming locations from the FilmMap MCP server.

For each English title in filming-locations.csv:
1. Call where_was_it_filmed on https://moviescenemap.com/mcp
2. Get: places with coordinates, year, Wikidata QID, Wikipedia links
3. Save to data/locations-mcp-raw.json

Then a second pass uses Wikidata batch API to get French labels.
"""
import csv
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
import threading

MCP_URL = "https://moviescenemap.com/mcp"
WIKIDATA_API = "https://www.wikidata.org/w/api.php"
USER_AGENT = "CineScope/1.0 (research; https://github.com/cinescope)"

MAX_WORKERS = 4
REQUEST_DELAY = 0.2  # 200ms between requests per thread
SAVE_EVERY = 50

rate_lock = Lock()
last_request_time = [0.0] * MAX_WORKERS
thread_local = threading.local()

cache_lock = Lock()
cache = {}

stats_lock = Lock()
stats = {"processed": 0, "with_places": 0, "errors": 0}


def fold(text: str) -> str:
    if not text:
        return ""
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return text.strip()


def get_thread_id() -> int:
    if not hasattr(thread_local, "id"):
        with rate_lock:
            for i in range(MAX_WORKERS):
                if last_request_time[i] == 0.0:
                    thread_local.id = i
                    last_request_time[i] = time.time()
                    break
            else:
                thread_local.id = 0
    return thread_local.id


def rate_limit():
    tid = get_thread_id()
    with rate_lock:
        elapsed = time.time() - last_request_time[tid]
        if elapsed < REQUEST_DELAY:
            time.sleep(REQUEST_DELAY - elapsed)
        last_request_time[tid] = time.time()


def mcp_call(method: str, params: dict, request_id: int = 1, retries: int = 3) -> dict | None:
    """Call the MCP server."""
    payload = {
        "jsonrpc": "2.0",
        "id": request_id,
        "method": method,
        "params": params,
    }

    for attempt in range(retries):
        rate_limit()
        try:
            req = urllib.request.Request(
                MCP_URL,
                data=json.dumps(payload).encode("utf-8"),
                headers={
                    "Content-Type": "application/json",
                    "Accept": "application/json, text/event-stream",
                    "User-Agent": USER_AGENT,
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=30) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = min(2 ** attempt * 2, 30)
                print(f"  [RATE LIMIT] Waiting {wait}s...", file=sys.stderr, flush=True)
                time.sleep(wait)
            else:
                print(f"  [HTTP {e.code}] {method}", file=sys.stderr, flush=True)
                if attempt < retries - 1:
                    time.sleep((attempt + 1))
                else:
                    return None
        except Exception as e:
            print(f"  [ERROR] {method}: {e}", file=sys.stderr, flush=True)
            if attempt < retries - 1:
                time.sleep((attempt + 1))
            else:
                return None
    return None


def call_tool(name: str, arguments: dict, request_id: int = 1) -> dict | None:
    """Call an MCP tool and parse the response."""
    result = mcp_call("tools/call", {"name": name, "arguments": arguments}, request_id)
    if not result:
        return None

    if "error" in result:
        print(f"  [MCP ERROR] {result['error']}", file=sys.stderr, flush=True)
        return None

    if "result" not in result:
        return None

    content = result["result"].get("content", [])
    if not content:
        return None

    text = content[0].get("text", "")
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {"raw": text}


def extract_titles_from_csv(csv_path: Path) -> list[str]:
    """Extract unique production titles from filming-locations.csv."""
    titles = set()
    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            productions = row.get("top_productions", "")
            if not productions:
                continue
            for production in productions.split(";"):
                production = production.strip()
                if production:
                    titles.add(production)
    return sorted(titles)


def fetch_film_locations(title: str) -> dict | None:
    """Fetch filming locations for a title from the MCP server."""
    cache_key = f"mcp:{title}"
    with cache_lock:
        if cache_key in cache:
            return cache[cache_key]

    # Try where_was_it_filmed directly with the title
    result = call_tool("where_was_it_filmed", {"title": title, "limit": 100})

    if not result or "places" not in result:
        # Try search first, then where_was_it_filmed with the slug
        search = call_tool("search_productions", {"query": title, "kind": "film", "limit": 5})
        if search and search.get("results"):
            slug = search["results"][0].get("slug")
            if slug:
                result = call_tool("where_was_it_filmed", {"title": slug, "limit": 100})

    with cache_lock:
        cache[cache_key] = result

    return result


def parse_locations(result: dict) -> list[dict]:
    """Parse locations from MCP result."""
    locations = []
    places = result.get("places", []) + result.get("wiki_places", [])
    for place in places:
        locations.append({
            "name": place.get("name", ""),
            "latitude": place.get("latitude"),
            "longitude": place.get("longitude"),
            "country": place.get("country", ""),
            "category": place.get("category_label", ""),
            "slug": place.get("slug", ""),
        })
    return locations


def save_cache(cache_path: Path):
    with cache_lock:
        tmp = cache_path.with_suffix(".tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(cache, f, ensure_ascii=False)
        tmp.replace(cache_path)


def main():
    base = Path(__file__).resolve().parents[1]
    csv_path = base / "data/source/filming-locations.csv"
    cache_path = base / "data/.mcp-cache.json"
    progress_path = base / "data/.mcp-progress.json"
    output_path = base / "data/locations-mcp-raw.json"

    print("=" * 60, flush=True)
    print("Récupération des lieux via FilmMap MCP")
    print(f"Workers: {MAX_WORKERS}, Delay: {REQUEST_DELAY}s")
    print("=" * 60, flush=True)

    print("\nExtraction des titres depuis le CSV...", flush=True)
    titles = extract_titles_from_csv(csv_path)
    print(f"  {len(titles)} titres uniques", flush=True)

    # Load cache
    global cache
    if cache_path.exists():
        print("Chargement du cache...", flush=True)
        with open(cache_path, "r", encoding="utf-8") as f:
            cache = json.load(f)
        print(f"  {len(cache)} entrées", flush=True)

    # Load progress
    done_titles = set()
    results = {}
    if progress_path.exists():
        with open(progress_path, "r", encoding="utf-8") as f:
            progress = json.load(f)
            done_titles = set(progress.get("done", []))
            results = progress.get("results", {})
        print(f"  {len(done_titles)} titres déjà traités", flush=True)

    todo = [t for t in titles if t not in done_titles]
    print(f"\n{len(todo)} titres à traiter", flush=True)

    if not todo:
        print("Rien à faire!", flush=True)
        return

    start_time = time.time()
    request_counter = [0]

    def process_title(title: str):
        request_counter[0] += 1
        rid = request_counter[0]
        result = fetch_film_locations(title)
        return title, result

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(process_title, t): t for t in todo}

        for future in as_completed(futures):
            title = futures[future]
            try:
                _, result = future.result()
                done_titles.add(title)

                if result:
                    locations = parse_locations(result)
                    results[title] = {
                        "english_title": result.get("name", title),
                        "slug": title.lower().replace(" ", "-"),
                        "year": result.get("year"),
                        "kind": result.get("kind", "film"),
                        "relation": result.get("relation", "filmed at"),
                        "description": result.get("description", ""),
                        "wikidata": result.get("wikidata", ""),
                        "wikipedia": result.get("wikipedia", ""),
                        "locations": locations,
                    }
                    with stats_lock:
                        stats["with_places"] += 1
                else:
                    results[title] = {
                        "english_title": title,
                        "slug": title.lower().replace(" ", "-"),
                        "year": None,
                        "kind": "film",
                        "relation": "filmed at",
                        "description": "",
                        "wikidata": "",
                        "wikipedia": "",
                        "locations": [],
                    }

                with stats_lock:
                    stats["processed"] += 1
                    done = stats["processed"]
                    total = len(todo)
                    elapsed = time.time() - start_time
                    eta = (elapsed / done) * (total - done) if done > 0 else 0

                    if done % 20 == 0 or done == total:
                        print(f"  [{done}/{total}] ETA: {eta/60:.1f}min | "
                              f"Avec lieux: {stats['with_places']}", flush=True)

                    if done % SAVE_EVERY == 0:
                        save_cache(cache_path)
                        with open(progress_path, "w", encoding="utf-8") as f:
                            json.dump({
                                "done": list(done_titles),
                                "results": results,
                            }, f, ensure_ascii=False)

            except Exception as e:
                with stats_lock:
                    stats["errors"] += 1
                    print(f"  [ERROR] {title}: {e}", file=sys.stderr, flush=True)

    # Final save
    save_cache(cache_path)
    with open(progress_path, "w", encoding="utf-8") as f:
        json.dump({"done": list(done_titles), "results": results}, f, ensure_ascii=False)

    # Save raw results
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, separators=(",", ":"))

    print(f"\n{'=' * 60}", flush=True)
    print("TERMINÉ!", flush=True)
    print(f"  Fichier: {output_path}", flush=True)
    print(f"  Titres traités: {stats['processed']}", flush=True)
    print(f"  Avec lieux: {stats['with_places']}", flush=True)
    print(f"  Erreurs: {stats['errors']}", flush=True)
    print(f"  Temps: {(time.time() - start_time) / 60:.1f} min", flush=True)
    print(f"{'=' * 60}", flush=True)


if __name__ == "__main__":
    main()
