import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";

const manifest = JSON.parse(readFileSync("manifest.webmanifest", "utf8"));
const worker = readFileSync("sw.js", "utf8");
const listed = (name) =>
  [...worker.match(new RegExp(`const ${name} = \\[([^\\]]*)\\]`))[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);

test("manifest meets the Chrome install criteria", () => {
  assert.ok(manifest.name && manifest.short_name && manifest.start_url);
  assert.equal(manifest.display, "standalone");
  const sizes = manifest.icons.map((icon) => icon.sizes);
  assert.ok(sizes.includes("192x192") && sizes.includes("512x512"));
  assert.ok(manifest.icons.some((icon) => icon.purpose === "maskable"));
  for (const icon of manifest.icons) assert.ok(existsSync(icon.src), icon.src);
});

test("service worker precaches every module and only existing files", () => {
  const shell = listed("SHELL_FILES");
  const modules = readdirSync("js", { recursive: true })
    .filter((file) => file.endsWith(".js"))
    .map((file) => "js/" + file);
  assert.deepEqual(modules.filter((file) => !shell.includes(file)), []);
  for (const file of shell.filter((entry) => entry !== "CATALOG")) assert.ok(existsSync(file), file);
});
