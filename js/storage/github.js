import { CATALOG_PATH, DATASET_DIRECTORY, parseCatalog, safeFileName, updatedCatalog } from "../data/catalog.js?v=pwa-1";

const TOKEN_KEY = "cine-scope-github-token-v1";
const REPOSITORY = "https://api.github.com/repos/flyingpafnouti/cine";
const BRANCH = "main";
const MAX_BYTES = 100 * 1000 * 1000;

export function readGithubToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function writeGithubToken(token) {
  if (token.trim()) localStorage.setItem(TOKEN_KEY, token.trim());
  else localStorage.removeItem(TOKEN_KEY);
}

export async function sha256(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function failure(status) {
  if (status === 401) return "Jeton GitHub refusé ou expiré.";
  if (status === 403 || status === 404)
    return "Ce jeton n’a pas accès en écriture au contenu du dépôt cine.";
  if (status === 409 || status === 422)
    return "GitHub a refusé la publication : le dépôt vient de changer ou le fichier est trop gros. Réessayez.";
  return "GitHub a répondu par une erreur (" + status + ").";
}

// Everything lands in a single commit, so a failure leaves the repository unchanged.
export async function publishDataset({ token, record, replaces = "", fetcher = fetch }) {
  const name = safeFileName(record.name);
  const hash = await sha256(record.text);
  if (new TextEncoder().encode(record.text).length > MAX_BYTES)
    throw Error("GitHub n’accepte pas les fichiers de plus de 100 Mo.");

  async function call(path, { raw = false, ...options } = {}) {
    const response = await fetcher(REPOSITORY + path, {
      ...options,
      headers: {
        Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
        Authorization: "Bearer " + token,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!response.ok) throw Error(failure(response.status));
    return raw ? response.text() : response.json();
  }
  const post = (path, body, method = "POST") => call(path, { method, body: JSON.stringify(body) });

  const parent = (await call("/git/ref/heads/" + BRANCH)).object.sha;
  const baseTree = (await call("/git/commits/" + parent)).tree.sha;
  const catalog = parseCatalog(await call("/contents/" + CATALOG_PATH + "?ref=" + parent, { raw: true }));
  const entry = { name, sha256: hash, mapping: record.mapping };
  const dropped = replaces && replaces !== name && catalog.some((item) => item.name === replaces);
  const blob = await post("/git/blobs", { content: record.text, encoding: "utf-8" });
  const tree = await post("/git/trees", {
    base_tree: baseTree,
    tree: [
      { path: DATASET_DIRECTORY + name, mode: "100644", type: "blob", sha: blob.sha },
      {
        path: CATALOG_PATH,
        mode: "100644",
        type: "blob",
        content: JSON.stringify(updatedCatalog(catalog, entry, replaces), null, 2) + "\n",
      },
      ...(dropped ? [{ path: DATASET_DIRECTORY + replaces, mode: "100644", type: "blob", sha: null }] : []),
    ],
  });
  const commit = await post("/git/commits", {
    message: "data: publish dataset " + name,
    tree: tree.sha,
    parents: [parent],
  });
  await post("/git/refs/heads/" + BRANCH, { sha: commit.sha }, "PATCH");
  return { sha256: hash, commit: commit.sha };
}
