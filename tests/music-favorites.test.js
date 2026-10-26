import { test } from "node:test";
import assert from "node:assert/strict";
import {
  musicFavorite,
  musicFavoriteFrom,
  sortedMusicFavorites,
  toggledMusicFavorites,
} from "../js/storage/music-favorites.js";

const movie = { id: "allocine-1", title: "Film", year: 2001 };
const track = { deezerId: "42", title: "Morceau", artist: "Artiste", link: "https://www.deezer.com/track/42" };

test("a music favorite keeps the track and its film", () => {
  const entry = musicFavoriteFrom(movie, track);
  assert.deepEqual({ ...entry, addedAt: null }, {
    filmId: "allocine-1", deezerId: "42", title: "Morceau", artist: "Artiste",
    link: "https://www.deezer.com/track/42", filmTitle: "Film", filmYear: 2001, addedAt: null,
  });
});

test("incomplete entries are rejected", () => {
  for (const value of [null, {}, { filmId: "a", deezerId: "1" }, { filmId: "a", title: "t" }, { deezerId: "1", title: "t" }]) {
    assert.equal(musicFavorite(value), null);
  }
});

test("toggling adds then removes the same track of the same film only", () => {
  const entry = musicFavoriteFrom(movie, track);
  const other = musicFavoriteFrom({ ...movie, id: "allocine-2" }, track);
  const once = toggledMusicFavorites(new Map(), entry);
  const both = toggledMusicFavorites(once, other);
  assert.equal(both.size, 2);
  assert.deepEqual([...toggledMusicFavorites(both, entry).values()], [other]);
});

test("favorites are listed most recent first", () => {
  const old = musicFavorite({ ...musicFavoriteFrom(movie, track), addedAt: "2026-01-01T00:00:00Z" });
  const recent = musicFavorite({ ...musicFavoriteFrom(movie, { ...track, deezerId: "7" }), addedAt: "2026-06-01T00:00:00Z" });
  const favorites = toggledMusicFavorites(toggledMusicFavorites(new Map(), old), recent);
  assert.deepEqual(sortedMusicFavorites(favorites).map((entry) => entry.deezerId), ["7", "42"]);
});
