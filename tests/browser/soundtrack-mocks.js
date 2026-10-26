import { Buffer } from "node:buffer";

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

// Wikidata, MusicBrainz et Deezer simulés : une BO de deux morceaux avec extrait
// (« Grand succès », « Morceau discret ») et un troisième absent de Deezer.
export async function mockSoundtrack(page) {
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

  return calls;
}
