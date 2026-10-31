const DATABASE = "cine-scope-datasets-v1";
const STORE = "imports";

function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, {
        keyPath: "id",
        autoIncrement: true,
      });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transaction(mode, operation) {
  return database().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = operation(tx.objectStore(STORE));
        let result;
        request.onsuccess = () => {
          result = request.result;
        };
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => {
          db.close();
          resolve(result);
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error);
        };
      }),
  );
}

export function readImportedDatasets() {
  return transaction("readonly", (store) => store.getAll());
}

// Importing a file again under the same name updates the stored copy.
export async function saveImportedDataset(source) {
  const previous = (await readImportedDatasets()).filter((record) => record.name === source.name);
  const id = await transaction("readwrite", (store) =>
    store.add({
      name: source.name,
      text: source.text,
      mapping: source.mapping,
      sha256: source.sha256,
      replaces: source.replaces,
      importedAt: new Date().toISOString(),
    }),
  );
  await Promise.all(previous.map((record) => deleteImportedDataset(record.id)));
  return id;
}

export function deleteImportedDataset(id) {
  return transaction("readwrite", (store) => store.delete(id));
}

export async function markDatasetPublished(id, publishedSha256, replaces) {
  const record = (await readImportedDatasets()).find((item) => item.id === id);
  await transaction("readwrite", (store) => store.put({ ...record, publishedSha256, replaces }));
}

// Copies stored before publishing existed have no hash yet.
export async function readHashedDatasets(hash) {
  const records = await readImportedDatasets();
  return Promise.all(
    records.map(async (record) => {
      if (record.sha256) return record;
      const hashed = { ...record, sha256: await hash(record.text) };
      await transaction("readwrite", (store) => store.put(hashed));
      return hashed;
    }),
  );
}
