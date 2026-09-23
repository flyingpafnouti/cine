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

export function saveImportedDataset(source) {
  return transaction("readwrite", (store) =>
    store.add({
      name: source.name,
      text: source.text,
      mapping: source.mapping,
      importedAt: new Date().toISOString(),
    }),
  );
}
