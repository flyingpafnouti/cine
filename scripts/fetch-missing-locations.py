#!/usr/bin/env python3
"""
Fetch missing filming locations for films from allocine_movies_2026.csv.

Pipeline:
1. Load films without locations (filtered by criteria: year >= 1990, rating >= 3, votes >= 200)
2. For each film:
   a. Try MCP directly with the title
   b. If not found, search Wikidata for original title (English)
   c. Try MCP with original title
   d. If locations found, save them
3. Update locations-enriched.json with new entries
4. Save progress regularly for resumability

Usage: python3 fetch-missing-locations.py [--limit N] [--resume]
"""

import json
import csv
import urllib.request
import urllib.parse
import time
import re
import unicodedata
import sys
import os
from pathlib import Path
from threading import Lock
from concurrent.futures import ThreadPoolExecutor, as_completed

WIKIDATA_API = "https://www.wikidata.org/w/api.php"
MCP_URL = "https://moviescenemap.com/mcp"
BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"

# Rate limiting
wikidata_lock = Lock()
last_wikidata_time = [0.0]
mcp_lock = Lock()
last_mcp_time = [0.0]

# Cache
wikidata_cache = {}
cache_lock = Lock()

def rate_limit_mcp(delay=0.3):
    with mcp_lock:
        elapsed = time.time() - last_mcp_time[0]
        if elapsed < delay:
            time.sleep(delay - elapsed)
        last_mcp_time[0] = time.time()

def rate_limit_wikidata(delay=1.0):
    with wikidata_lock:
        elapsed = time.time() - last_wikidata_time[0]
        if elapsed < delay:
            time.sleep(delay - elapsed)
        last_wikidata_time[0] = time.time()

def fold(text):
    if not text:
        return ""
    text = unicodedata.normalize('NFD', text)
    text = ''.join(c for c in text if unicodedata.category(c) != 'Mn')
    text = text.lower()
    text = re.sub(r'[^a-z0-9]+', ' ', text)
    return text.strip()

def load_films_without_locations():
    """Load the list of films that match criteria but don't have locations."""
    csv_path = DATA_DIR / "source" / "allocine_movies_2026.csv"
    
    # Load existing locations
    locations_path = DATA_DIR / "locations-enriched.json"
    with open(locations_path, 'r', encoding='utf-8') as f:
        locations_data = json.load(f)
    
    existing_keys = set()
    for key, val in locations_data.items():
        existing_keys.add(key)
        if val.get('title'):
            existing_keys.add(fold(val['title']))
        if val.get('english_title'):
            existing_keys.add(fold(val['english_title']))
    
    films = []
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                date_str = row.get('release_date', '').strip()
                if not date_str:
                    continue
                year = int(date_str.split('-')[0])
                
                spec_rating_str = row.get('spec_rating', '').strip()
                if not spec_rating_str:
                    continue
                spec_rating = float(spec_rating_str.replace(',', '.'))
                
                votes_str = row.get('number_of_spec_rating', '').strip()
                if not votes_str:
                    continue
                votes = float(votes_str.replace(',', '.').replace(' ', ''))
                
                if year >= 1990 and spec_rating >= 3 and votes >= 200:
                    title = row.get('title', '').strip()
                    folded_title = fold(title)
                    if folded_title not in existing_keys:
                        films.append({
                            'id': row.get('id', ''),
                            'title': title,
                            'year': year,
                            'rating': spec_rating,
                            'votes': int(votes),
                            'director': row.get('directors', '').strip(),
                            'folded': folded_title
                        })
            except Exception:
                pass
    
    # Sort by votes descending (most popular first)
    films.sort(key=lambda x: x['votes'], reverse=True)
    return films, locations_data

def search_wikidata(title, year=None):
    """Search Wikidata for a film."""
    cache_key = f"{title}|{year}"
    with cache_lock:
        if cache_key in wikidata_cache:
            return wikidata_cache[cache_key]
    
    rate_limit_wikidata()
    params = {
        "action": "wbsearchentities",
        "search": title,
        "language": "fr",
        "format": "json",
        "type": "item",
        "limit": 3
    }
    url = WIKIDATA_API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "CineScope/1.0 (research)"})
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            result = json.loads(response.read().decode("utf-8"))
        results = result.get("search", [])
        with cache_lock:
            wikidata_cache[cache_key] = results
        return results
    except Exception as e:
        print(f"  [Wikidata error] {title}: {e}", file=sys.stderr, flush=True)
        return []

def get_wikidata_entity(qid):
    """Get entity data from Wikidata."""
    with cache_lock:
        if qid in wikidata_cache:
            return wikidata_cache[qid]
    
    rate_limit_wikidata()
    params = {
        "action": "wbgetentities",
        "ids": qid,
        "format": "json",
        "props": "labels|claims",
        "languages": "en|fr"
    }
    url = WIKIDATA_API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "CineScope/1.0 (research)"})
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            result = json.loads(response.read().decode("utf-8"))
        entity = result.get("entities", {}).get(qid, {})
        with cache_lock:
            wikidata_cache[qid] = entity
        return entity
    except Exception:
        return {}

def get_original_title(entity):
    """Extract original title from Wikidata entity."""
    claims = entity.get("claims", {})
    if "P1476" in claims:
        for claim in claims["P1476"]:
            value = claim.get("mainsnak", {}).get("datavalue", {}).get("value", "")
            if isinstance(value, dict):
                value = value.get("text", "")
            if value:
                return value
    labels = entity.get("labels", {})
    if "en" in labels:
        return labels["en"].get("value", "")
    return None

def call_mcp_tool(name, arguments):
    """Call MCP tool."""
    rate_limit_mcp()
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {"name": name, "arguments": arguments}
    }
    req = urllib.request.Request(
        MCP_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "User-Agent": "CineScope/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            result = json.loads(response.read().decode("utf-8"))
        if "result" in result and "content" in result["result"]:
            text = result["result"]["content"][0].get("text", "")
            try:
                return json.loads(text)
            except:
                return {"raw": text}
    except Exception as e:
        print(f"  [MCP error] {name}: {e}", file=sys.stderr, flush=True)
        return {"error": str(e)}
    return result

def process_film(film):
    """Process a single film to find locations."""
    title = film['title']
    year = film['year']
    result = {
        'title': title,
        'year': year,
        'votes': film['votes'],
        'director': film['director'],
        'found': False,
        'places': [],
        'method': None,
        'original_title': None,
        'qid': None
    }
    
    # Try 1: Direct MCP search
    mcp_result = call_mcp_tool("where_was_it_filmed", {"title": title, "limit": 20})
    if mcp_result and not mcp_result.get('error'):
        places = mcp_result.get('wiki_places', []) + mcp_result.get('places', [])
        if places:
            result['found'] = True
            result['places'] = places
            result['method'] = 'direct'
            result['qid'] = mcp_result.get('wikidata', '').replace('https://www.wikidata.org/wiki/', '')
            return result
    
    # Try 2: Search Wikidata for original title
    wikidata_results = search_wikidata(title, year)
    for r in wikidata_results[:2]:
        qid = r.get("id")
        if not qid:
            continue
        
        entity = get_wikidata_entity(qid)
        if not entity:
            continue
        
        original_title = get_original_title(entity)
        if original_title and original_title.lower() != title.lower():
            result['original_title'] = original_title
            result['qid'] = qid
            
            mcp_result = call_mcp_tool("where_was_it_filmed", {"title": original_title, "limit": 20})
            if mcp_result and not mcp_result.get('error'):
                places = mcp_result.get('wiki_places', []) + mcp_result.get('places', [])
                if places:
                    result['found'] = True
                    result['places'] = places
                    result['method'] = 'wikidata'
                    return result
    
    return result

def save_progress(new_locations, processed_titles, output_path):
    """Save progress to locations-enriched.json."""
    locations_path = DATA_DIR / "locations-enriched.json"
    with open(locations_path, 'r', encoding='utf-8') as f:
        locations_data = json.load(f)
    
    for title_key, entry in new_locations.items():
        if title_key not in locations_data:
            locations_data[title_key] = entry
    
    with open(locations_path, 'w', encoding='utf-8') as f:
        json.dump(locations_data, f, ensure_ascii=False, indent=2)
    
    # Save processed list
    progress_path = DATA_DIR / ".locations-progress.json"
    with open(progress_path, 'w', encoding='utf-8') as f:
        json.dump(list(processed_titles), f, ensure_ascii=False)

def load_progress():
    """Load progress from previous run."""
    progress_path = DATA_DIR / ".locations-progress.json"
    if progress_path.exists():
        with open(progress_path, 'r', encoding='utf-8') as f:
            return set(json.load(f))
    return set()

def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--limit', type=int, default=None, help='Limit number of films to process')
    parser.add_argument('--resume', action='store_true', help='Resume from previous run')
    parser.add_argument('--workers', type=int, default=2, help='Number of parallel workers')
    args = parser.parse_args()
    
    print("=" * 60, flush=True)
    print("Fetch Missing Filming Locations", flush=True)
    print("=" * 60, flush=True)
    
    # Load films
    print("Loading films without locations...", flush=True)
    films, _ = load_films_without_locations()
    print(f"Found {len(films)} films without locations", flush=True)
    
    # Load progress if resuming
    processed_titles = set()
    if args.resume:
        processed_titles = load_progress()
        films = [f for f in films if fold(f['title']) not in processed_titles]
        print(f"Resuming: {len(films)} films remaining", flush=True)
    
    # Apply limit
    if args.limit:
        films = films[:args.limit]
        print(f"Limited to {len(films)} films", flush=True)
    
    if not films:
        print("No films to process!", flush=True)
        return
    
    # Process films
    new_locations = {}
    found_count = 0
    start_time = time.time()
    
    print(f"\nProcessing {len(films)} films with {args.workers} workers...", flush=True)
    print(f"Estimated time: {len(films) * 2 / args.workers / 60:.1f} minutes", flush=True)
    print("-" * 60, flush=True)
    
    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {executor.submit(process_film, film): film for film in films}
        
        for i, future in enumerate(as_completed(futures)):
            film = futures[future]
            try:
                result = future.result()
            except Exception as e:
                print(f"[{i+1}/{len(films)}] ERROR: {film['title']}: {e}", flush=True)
                continue
            
            processed_titles.add(fold(film['title']))
            
            if result['found']:
                found_count += 1
                folded = fold(film['title'])
                new_locations[folded] = {
                    "title": film['title'],
                    "english_title": result['original_title'] or film['title'],
                    "locations": [
                        {
                            "name": p.get('name', ''),
                            "latitude": p.get('latitude'),
                            "longitude": p.get('longitude'),
                            "country": p.get('country', ''),
                            "category": p.get('category_label', ''),
                            "slug": p.get('slug', '')
                        }
                        for p in result['places']
                    ],
                    "year": str(film['year']),
                    "qid": result['qid'] or "",
                    "directors": [film['director']] if film['director'] else [],
                    "slug": folded
                }
                # Also add under original title if different
                if result['original_title']:
                    orig_folded = fold(result['original_title'])
                    if orig_folded != folded:
                        new_locations[orig_folded] = new_locations[folded]
                
                elapsed = time.time() - start_time
                rate = (i + 1) / elapsed if elapsed > 0 else 0
                eta = (len(films) - i - 1) / rate / 60 if rate > 0 else 0
                print(f"[{i+1}/{len(films)}] ✓ {film['title']} ({film['year']}) - {len(result['places'])} lieux via {result['method']} - ETA: {eta:.1f}min", flush=True)
            else:
                if (i + 1) % 10 == 0 or i < 5:
                    print(f"[{i+1}/{len(films)}] ✗ {film['title']} ({film['year']}) - no locations", flush=True)
            
            # Save progress every 50 films
            if (i + 1) % 50 == 0:
                save_progress(new_locations, processed_titles, DATA_DIR / "locations-enriched.json")
                print(f"  [Progress saved: {found_count} new locations found so far]", flush=True)
    
    # Final save
    save_progress(new_locations, processed_titles, DATA_DIR / "locations-enriched.json")
    
    elapsed = time.time() - start_time
    print("\n" + "=" * 60, flush=True)
    print("COMPLETED", flush=True)
    print("=" * 60, flush=True)
    print(f"Total films processed: {len(films)}", flush=True)
    print(f"New locations found: {found_count}", flush=True)
    print(f"Success rate: {found_count/len(films)*100:.1f}%", flush=True)
    print(f"Time elapsed: {elapsed/60:.1f} minutes", flush=True)
    print(f"Locations saved to: {DATA_DIR / 'locations-enriched.json'}", flush=True)
    print("=" * 60, flush=True)

if __name__ == "__main__":
    main()
