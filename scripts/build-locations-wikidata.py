#!/usr/bin/env python3
"""
Build data/locations-enriched.json by joining the AlloCiné datasets with
filming locations, keyed by Wikidata production (QID).

Locations of a production = Wikidata filming location (P915, live SPARQL)
  ∪ data/source/productions.csv (moviescenemap.com open data, CC0: Wikidata
    statements plus places cited by the production's Wikipedia article).

Pipeline:
1. SPARQL: every AlloCiné film ID (P1265) → QID: exact join on the `id`
   column of allocine_movies_2026.csv.
2. SPARQL: French/English labels, French aliases, original titles, year and
   directors of every production with locations → title + year join for the
   remaining rows (and for allocine_brut.csv, which has no ID).
3. Place details come from data/source/filming-locations.csv, completed by
   Wikidata for places it does not list.

Output (version 2), places deduplicated:
{
  "version": 2,
  "places": {"Q65": {"name", "latitude", "longitude", "country", "category", "slug"}},
  "films": [{"qid", "allocine_id" | null, "key" | null, "title", "year", "match", "places": [...]}]
}
`allocine_id` entries are matched on the movie's sourceId, `key` entries
(fold(title) + "|" + year) on brut movies without ID.

SPARQL responses are cached in data/.cache/ so a rerun costs nothing.
Usage: python3 scripts/build-locations-wikidata.py [--refresh]
"""

import argparse
import ast
import csv
import hashlib
import json
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

SPARQL_URL = "https://query.wikidata.org/sparql"
USER_AGENT = "CineScope/1.0 (filming locations research)"
BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"
SOURCE_DIR = DATA_DIR / "source"
CACHE_DIR = DATA_DIR / ".cache"
BATCH_SIZE = 250

# Productions that are not films (series, episodes, games…) are never title-matched.
NON_FILM_TYPES = {
    "Q5398426",  # television series
    "Q21191270",  # television series episode
    "Q3464665",  # television series season
    "Q7889",  # video game
    "Q1259759",  # miniseries
    "Q63952888",  # anime television series
    "Q526877",  # web series
    "Q15416",  # television program
}

csv.field_size_limit(sys.maxsize)


def fold(text):
    """Same key as js/engine.js locationKey(): no accents, lowercase, alnum words."""
    text = unicodedata.normalize("NFD", text or "")
    text = "".join(c for c in text if not "̀" <= c <= "ͯ")
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def qid(uri):
    return uri.rsplit("/", 1)[-1]


def sparql(query, cache_name, refresh=False, retries=5):
    cache_path = CACHE_DIR / f"{cache_name}.json"
    if cache_path.exists() and not refresh:
        return json.loads(cache_path.read_text(encoding="utf-8"))
    data = urllib.parse.urlencode({"query": query}).encode()
    for attempt in range(retries):
        req = urllib.request.Request(
            SPARQL_URL,
            data=data,
            headers={
                "User-Agent": USER_AGENT,
                "Accept": "application/sparql-results+json",
                "Content-Type": "application/x-www-form-urlencoded",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as response:
                rows = json.loads(response.read().decode("utf-8"))["results"]["bindings"]
            rows = [{k: v["value"] for k, v in row.items()} for row in rows]
            CACHE_DIR.mkdir(parents=True, exist_ok=True)
            cache_path.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
            time.sleep(1)
            return rows
        except Exception as e:
            wait = 10 * (attempt + 1)
            print(f"  [SPARQL] {cache_name}: {e} — retry in {wait}s", file=sys.stderr, flush=True)
            time.sleep(wait)
    raise RuntimeError(f"SPARQL query failed: {cache_name}")


def batched(items, size):
    """Chunks with a content-based name, so the cache survives a changed input set."""
    items = sorted(items)
    for i in range(0, len(items), size):
        chunk = items[i : i + size]
        yield hashlib.sha1(" ".join(chunk).encode()).hexdigest()[:12], chunk


def split_slugs(value):
    return [s.strip() for s in (value or "").split(";") if s.strip()]


def fetch_locations(refresh):
    print("1. Production → locations", flush=True)
    by_film = defaultdict(set)
    for row in sparql("SELECT ?f ?l WHERE { ?f wdt:P915 ?l . }", "all-locations", refresh):
        by_film[qid(row["f"])].add(qid(row["l"]))
    wikidata_count = len(by_film)

    slug_to_qid = {}
    with open(SOURCE_DIR / "filming-locations.csv", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row["url"]:
                slug_to_qid[row["url"].rstrip("/").rsplit("/", 1)[-1]] = row["qid"]
    kinds = {}
    with open(SOURCE_DIR / "productions.csv", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            kinds[row["qid"]] = row["kind"]
            for column in ("place_slugs", "wiki_place_slugs", "verified_place_slugs"):
                by_film[row["qid"]].update(slug_to_qid[s] for s in split_slugs(row[column]) if s in slug_to_qid)

    film_of_allocine = defaultdict(set)
    for row in sparql("SELECT ?f ?a WHERE { ?f wdt:P1265 ?a . }", "allocine-ids", refresh):
        if qid(row["f"]) in by_film:
            film_of_allocine[row["a"]].add(qid(row["f"]))
    print(
        f"   {wikidata_count} productions on Wikidata, {len(kinds)} in productions.csv, "
        f"{len(by_film)} together; {len(film_of_allocine)} AlloCiné IDs with locations",
        flush=True,
    )
    return film_of_allocine, by_film, kinds


def fetch_film_metadata(film_qids, refresh):
    print(f"2. Metadata for {len(film_qids)} productions", flush=True)
    meta = {}
    total = (len(film_qids) + BATCH_SIZE - 1) // BATCH_SIZE
    for n, (name, chunk) in enumerate(batched(film_qids, BATCH_SIZE)):
        values = " ".join(f"wd:{q}" for q in chunk)
        query = f"""
SELECT ?f
  (GROUP_CONCAT(DISTINCT ?t; separator="\\u001f") AS ?titles)
  (MIN(YEAR(?d)) AS ?year)
  (GROUP_CONCAT(DISTINCT ?dn; separator="\\u001f") AS ?directors)
  (GROUP_CONCAT(DISTINCT STRAFTER(STR(?type), "entity/"); separator=" ") AS ?types)
  (SAMPLE(?a) AS ?allocine)
WHERE {{
  VALUES ?f {{ {values} }}
  OPTIONAL {{ {{ ?f rdfs:label ?t FILTER(LANG(?t) IN ("fr", "en")) }}
    UNION {{ ?f skos:altLabel ?t FILTER(LANG(?t) = "fr") }}
    UNION {{ ?f wdt:P1476 ?t }} }}
  OPTIONAL {{ ?f wdt:P577 ?d }}
  OPTIONAL {{ ?f wdt:P57 ?dir . ?dir rdfs:label ?dn FILTER(LANG(?dn) IN ("fr", "en")) }}
  OPTIONAL {{ ?f wdt:P31 ?type }}
  OPTIONAL {{ ?f wdt:P1265 ?a }}
}} GROUP BY ?f"""
        for row in sparql(query, f"meta-{name}", refresh):
            split = lambda k: [v for v in row.get(k, "").split("\u001f") if v]
            meta[qid(row["f"])] = {
                "titles": split("titles"),
                "year": int(row["year"]) if row.get("year") else None,
                "directors": split("directors"),
                "types": set(row.get("types", "").split()),
                "allocine": row.get("allocine"),
            }
        if (n + 1) % 20 == 0 or n + 1 == total:
            print(f"   batch {n + 1}/{total}", flush=True)
    return meta


def load_places(place_qids, refresh):
    print(f"3. Details for {len(place_qids)} places", flush=True)
    places = {}
    with open(SOURCE_DIR / "filming-locations.csv", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row["qid"] in place_qids and row["latitude"] and row["longitude"]:
                places[row["qid"]] = {
                    "name": row["name"],
                    "latitude": float(row["latitude"]),
                    "longitude": float(row["longitude"]),
                    "country": row["country"],
                    "category": row["category_label"],
                    "slug": row["url"].rstrip("/").rsplit("/", 1)[-1] if row["url"] else "",
                }
    missing = place_qids - places.keys()
    print(f"   {len(places)} from filming-locations.csv, {len(missing)} from Wikidata", flush=True)
    for name, chunk in batched(missing, BATCH_SIZE):
        values = " ".join(f"wd:{q}" for q in chunk)
        query = f"""
SELECT ?l (SAMPLE(?c) AS ?coord) (SAMPLE(?en) AS ?en) (SAMPLE(?fr) AS ?fr) (SAMPLE(?cn) AS ?country) WHERE {{
  VALUES ?l {{ {values} }}
  ?l wdt:P625 ?c .
  OPTIONAL {{ ?l rdfs:label ?en FILTER(LANG(?en) = "en") }}
  OPTIONAL {{ ?l rdfs:label ?fr FILTER(LANG(?fr) = "fr") }}
  OPTIONAL {{ ?l wdt:P17 ?cty . ?cty rdfs:label ?cn FILTER(LANG(?cn) = "en") }}
}} GROUP BY ?l"""
        for row in sparql(query, f"places-{name}", refresh):
            m = re.match(r"Point\(([-\d.eE]+) ([-\d.eE]+)\)", row.get("coord", ""))
            if not m:
                continue  # coordinates on another globe or malformed
            places[qid(row["l"])] = {
                "name": row.get("en") or row.get("fr") or qid(row["l"]),
                "latitude": round(float(m.group(2)), 5),
                "longitude": round(float(m.group(1)), 5),
                "country": row.get("country", ""),
                "category": "",
                "slug": "",
            }
    return places


def parse_list(value):
    value = (value or "").strip()
    if value.startswith("["):
        try:
            return [str(v).strip() for v in ast.literal_eval(value)]
        except (ValueError, SyntaxError):
            pass
    return [v.strip() for v in value.split(",") if v.strip()]


def year_of(value):
    m = re.match(r"\s*(\d{4})", value or "")
    return int(m.group(1)) if m else None


def load_allocine():
    films = []
    with open(SOURCE_DIR / "allocine_movies_2026.csv", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            films.append({
                "allocine_id": row["id"].strip(),
                "title": row["title"].strip(),
                "year": year_of(row["release_date"]),
                "directors": parse_list(row["directors"]),
            })
    with open(SOURCE_DIR / "allocine_brut.csv", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            films.append({
                "allocine_id": None,
                "title": row["movie_title"].strip(),
                "year": year_of(row["release_date"]),  # same year as the app (js/data/normalizer.js)
                "directors": parse_list(row["directors"]),
            })
    return films


def build_title_index(meta, kinds):
    index = defaultdict(list)
    for q, m in meta.items():
        if m["types"] & NON_FILM_TYPES or kinds.get(q, "film") != "film":
            continue
        for t in {fold(t) for t in m["titles"]}:
            if t:
                index[t].append(q)
    return index


def match_by_title(film, index, meta):
    """Return the production QID only when a single candidate is plausible."""
    key = fold(film["title"])
    if not key or not film["year"]:
        return None
    directors = {fold(d) for d in film["directors"]} - {""}
    strong, weak = set(), set()
    for q in index.get(key, ()):
        m = meta[q]
        if m["year"] is None:
            continue
        gap = abs(m["year"] - film["year"])
        same_director = bool(directors & {fold(d) for d in m["directors"]})
        if same_director and gap <= 3:
            strong.add(q)
        elif gap <= 1 and not (directors and m["directors"]):
            # Nothing to compare: accept on title + year alone.
            weak.add(q)
    if len(strong) == 1:
        return strong.pop()
    if not strong and len(weak) == 1:
        return weak.pop()
    return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true", help="ignore the SPARQL cache")
    args = parser.parse_args()

    film_of_allocine, by_film, kinds = fetch_locations(args.refresh)
    meta = fetch_film_metadata(set(by_film), args.refresh)
    index = build_title_index(meta, kinds)

    print("4. Matching AlloCiné films", flush=True)
    entries, stats = [], defaultdict(int)
    seen_keys = set()
    for film in load_allocine():
        aid = film["allocine_id"]
        if aid and aid in film_of_allocine:
            film_qids, how = sorted(film_of_allocine[aid]), "allocine_id"
        else:
            film_qid, how = match_by_title(film, index, meta), "title_year"
            if film_qid and aid and meta[film_qid]["allocine"] not in (None, aid):
                film_qid = None  # Wikidata links that production to another AlloCiné film
            film_qids = [film_qid] if film_qid else []
        if not film_qids:
            stats["unmatched_2026" if aid else "unmatched_brut"] += 1
            continue
        key = None if aid else f"{fold(film['title'])}|{film['year']}"
        if key in seen_keys:
            continue
        if key:
            seen_keys.add(key)
        stats[f"{'2026' if aid else 'brut'}_{how}"] += 1
        entries.append({
            "qid": film_qids[0],
            "allocine_id": aid,
            "key": key,
            "title": film["title"],
            "year": film["year"],
            "match": how,
            "places": sorted(set().union(*(by_film[q] for q in film_qids))),
        })

    places = load_places({p for e in entries for p in e["places"]}, args.refresh)
    for e in entries:
        e["places"] = [p for p in e["places"] if p in places]
    entries = [e for e in entries if e["places"]]

    output = {
        "version": 2,
        "source": "Wikidata P915 (CC0) and moviescenemap.com open data (CC0)",
        "generated": time.strftime("%Y-%m-%d"),
        "places": {q: places[q] for q in sorted({p for e in entries for p in e["places"]})},
        "films": entries,
    }
    out_path = DATA_DIR / "locations-enriched.json"
    out_path.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    print("-" * 60)
    for k in sorted(stats):
        print(f"   {k}: {stats[k]}")
    print(f"   entries with places: {len(entries)}, places: {len(output['places'])}")
    print(f"   written {out_path} ({out_path.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
