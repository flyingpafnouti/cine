import { test, expect } from "@playwright/test";

// Une seconde de silence au format WAV, pour un extrait réellement lisible.
function silentWav(seconds = 1, rate = 8000) {
  const data = rate * seconds;
  const buffer = Buffer.alloc(44 + data);
  buffer.write("RIFF", 0); buffer.writeUInt32LE(36 + data, 4); buffer.write("WAVE", 8);
  buffer.write("fmt ", 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22); buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate, 28);
  buffer.writeUInt16LE(1, 32); buffer.writeUInt16LE(8, 34);
  buffer.write("data", 36); buffer.writeUInt32LE(data, 40); buffer.fill(128, 44);
  return buffer;
}

test("the soundtrack is searched on demand, ranked, playable and cached", async ({ page }) => {
  const calls = { wikidata: 0, musicbrainz: 0, deezer: 0 };
  const film = { value: "http://www.wikidata.org/entity/Q1" };
  await page.route("https://query.wikidata.org/**", (route) => {
    calls.wikidata++;
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: { bindings: [{
      film, filmLabel: { value: "Film test" }, date: { value: "2011-01-01T00:00:00Z" },
      album: { value: "http://www.wikidata.org/entity/Q2" }, albumLabel: { value: "Album test" }, mbid: { value: "rg-test" },
    }] } }) });
  });
  await page.route("https://www.wikidata.org/w/api.php**", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ search: [{ id: "Q1" }] }) }));
  await page.route("https://musicbrainz.org/**", (route) => {
    calls.musicbrainz++;
    const track = (title, artist) => ({ title, recording: { title, "artist-credit": [{ name: artist }], isrcs: [] } });
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ releases: [{
      status: "Official", media: [{ "track-count": 3, tracks: [
        track("Morceau discret", "Artiste B"), track("Grand succès", "Artiste A"), track("Morceau absent", "Artiste C"),
      ] }],
    }] }) });
  });
  await page.route("https://api.deezer.com/**", (route) => {
    calls.deezer++;
    const url = new URL(route.request().url());
    const q = url.searchParams.get("q") || "";
    const body = url.pathname.startsWith("/track/")
      ? { id: 1, preview: "https://cdn.test/preview.wav" }
      : { data: q.includes("Grand succès")
        ? [{ id: 1, title: "Grand succès", rank: 900000, link: "https://www.deezer.com/track/1", artist: { name: "Artiste A" } }]
        : [{ id: 2, title: "Morceau discret", rank: 100000, link: "https://www.deezer.com/track/2", artist: { name: "Artiste B" } }] };
    return route.fulfill({ contentType: "application/javascript",
      body: `${url.searchParams.get("callback")}(${JSON.stringify(body)})` });
  });
  await page.route("https://cdn.test/**", (route) => route.fulfill({ contentType: "audio/wav", body: silentWav() }));

  await page.goto("/");
  await expect(page.locator("#table-view tbody tr")).toHaveCount(250, { timeout: 15000 });
  await page.locator("#table-view .title-button").first().click();

  const section = page.locator("#modal .soundtrack");
  await expect(section.locator("h4")).toHaveText("Bande originale");
  expect(calls).toEqual({ wikidata: 0, musicbrainz: 0, deezer: 0 });
  await section.getByRole("button", { name: "Chercher la bande originale" }).click();

  // « Morceau absent » n'est pas sur Deezer : sans extrait, il n'est pas affiché.
  const titles = section.locator(".soundtrack-title");
  await expect(titles).toHaveText(["Grand succès", "Morceau discret"], { timeout: 15000 });
  await expect(section.locator("a[href='https://www.wikidata.org/wiki/Q1']")).toHaveText("Film test (2011)");

  // Après une recherche : dépliée, et repliable d'un clic sur le titre.
  const summary = section.locator("summary");
  await expect(summary).toContainText("Disponible · 2 morceaux");
  await summary.click();
  await expect(titles.first()).toBeHidden();
  await summary.click();
  await expect(titles.first()).toBeVisible();

  const play = section.locator(".soundtrack-play").first();
  await play.click();
  await expect(play).toHaveText("⏸");
  await play.click();
  await expect(play).toHaveText("▶");

  // Fin d'extrait : lecture du morceau suivant, puis retour au premier après le dernier.
  const second = section.locator(".soundtrack-play").nth(1);
  await play.click();
  await expect(play).toHaveText("⏸");
  await expect(second).toHaveText("⏸", { timeout: 5000 });
  await expect(play).toHaveText("▶");
  await expect(play).toHaveText("⏸", { timeout: 5000 });
  await play.click();
  await expect(play).toHaveText("▶");

  // Barre de lecture ; la répétition évite qu'un extrait d'une seconde passe au suivant pendant le test.
  const control = (name) => section.locator(`.soundtrack-controls [data-control=${name}]`);
  await control("repeat").click();
  await expect(control("repeat")).toHaveAttribute("aria-pressed", "true");
  await control("toggle").click();
  await expect(play).toHaveText("⏸");
  await expect(control("toggle")).toHaveAttribute("aria-label", "Pause");
  await page.waitForTimeout(1500);
  await expect(play).toHaveText("⏸");
  await expect(second).toHaveText("▶");
  await control("next").click();
  await expect(second).toHaveText("⏸");
  await control("back").click();
  await expect(play).toHaveText("⏸");
  await control("back").click();
  await expect(second).toHaveText("⏸");
  await control("toggle").click();
  await expect(second).toHaveText("▶");
  await expect(control("toggle")).toHaveAttribute("aria-label", "Lecture");
  await control("toggle").click();
  await expect(second).toHaveText("⏸");
  await control("shuffle").click();
  await expect(control("shuffle")).toHaveAttribute("aria-pressed", "true");
  await control("next").click();
  await expect(play).toHaveText("⏸");
  await control("shuffle").click();
  await control("repeat").click();
  await expect(control("shuffle")).toHaveAttribute("aria-pressed", "false");
  await expect(control("repeat")).toHaveAttribute("aria-pressed", "false");
  await control("toggle").click();
  await expect(play).toHaveText("▶");

  await play.click();
  await expect(play).toHaveText("⏸");
  await page.locator("#modal-close").click();
  await expect(page.locator("#modal")).not.toBeVisible();

  // Réouverture : BO signalée disponible depuis le cache, repliée, extrait arrêté.
  const before = { ...calls };
  await page.locator("#table-view .title-button").first().click();
  await expect(summary).toContainText("Disponible · 2 morceaux");
  await expect(section.getByRole("button", { name: "Chercher la bande originale" })).toHaveCount(0);
  await expect(titles.first()).toBeHidden();
  await summary.click();
  await expect(titles).toHaveText(["Grand succès", "Morceau discret"]);
  await expect(section.locator(".soundtrack-play").first()).toHaveText("▶");
  expect({ wikidata: calls.wikidata, musicbrainz: calls.musicbrainz }).toEqual({ wikidata: before.wikidata, musicbrainz: before.musicbrainz });
});
