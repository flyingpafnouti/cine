#!/usr/bin/env python3
"""Restore the exact raw dataset verified during development (stdlib only)."""
import csv
import hashlib
import io
from pathlib import Path
import urllib.request

SOURCES = [
    ("allocine_brut.csv",
     "https://raw.githubusercontent.com/Camille2T/Movies_ratings_allocine/5365239058968b293e0e1672b703c0ef21b7fb1d/allocine_brut.csv",
     "e22e64eb4193b7298dfb44b3b863e5e0db232e690cd4ec5706379d98a0e44528", 59966,
     {"movie_title", "user_rating", "nber_user_vote"}),
    ("allocine_movies_2026.csv",
     "https://huggingface.co/datasets/Olivier/allocine-movies/resolve/7ee445730377d4339ea6a8b391b04537930cd7f2/allocine_movies.csv",
     "01d1ab7efbf82c8bd67fcb6f9aaeeb5a2d4dc2df18045eb2ac9397a483008604", 42634,
     {"title", "spec_rating", "number_of_spec_rating", "summary"})
]
verified = []
for name, url, digest, count, columns in SOURCES:
    data = urllib.request.urlopen(url, timeout=60).read()
    if hashlib.sha256(data).hexdigest() != digest:
        raise SystemExit(f"Empreinte inattendue : {name}. Aucun fichier modifié.")
    rows = list(csv.DictReader(io.StringIO(data.decode("utf-8"))))
    if len(rows) != count or not columns.issubset(rows[0]):
        raise SystemExit(f"Structure inattendue : {name}. Aucun fichier modifié.")
    verified.append((name, data, count))
for name, data, count in verified:
    target = Path(__file__).resolve().parents[1] / "data/source" / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    print(f"{count:,} films vérifiés et enregistrés dans {target}")
