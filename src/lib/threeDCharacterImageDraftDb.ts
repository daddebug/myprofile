export const THREE_D_CHARACTER_IMAGE_DB_NAME = "dilida-portfolio-3d-character-ui-assets";
export const THREE_D_CHARACTER_IMAGE_STORE_NAME = "images";

const DATABASE_VERSION = 1;

export type ThreeDCharacterDraftImageRecord = {
  id: string;
  blob: Blob;
  fileName: string;
  mimeType: string;
  size: number;
  updatedAt: string;
};

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(THREE_D_CHARACTER_IMAGE_DB_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(THREE_D_CHARACTER_IMAGE_STORE_NAME)) {
        database.createObjectStore(THREE_D_CHARACTER_IMAGE_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open the 3D character case image database."));
    request.onblocked = () => reject(new Error("The 3D character case image database is blocked by another tab."));
  });
}

function runTransaction<T>(mode: IDBTransactionMode, createRequest: (store: IDBObjectStore) => IDBRequest<T>) {
  return openDatabase().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(THREE_D_CHARACTER_IMAGE_STORE_NAME, mode);
        const request = createRequest(transaction.objectStore(THREE_D_CHARACTER_IMAGE_STORE_NAME));
        let result: T;
        request.onsuccess = () => { result = request.result; };
        transaction.oncomplete = () => { database.close(); resolve(result); };
        transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error("The image transaction failed.")); };
        transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error("The image transaction was cancelled.")); };
      }),
  );
}

export function getThreeDCharacterDraftImage(id: string) {
  return runTransaction<ThreeDCharacterDraftImageRecord | undefined>("readonly", (store) => store.get(id));
}

export function putThreeDCharacterDraftImage(record: ThreeDCharacterDraftImageRecord) {
  return runTransaction<IDBValidKey>("readwrite", (store) => store.put(record)).then(() => undefined);
}

export function deleteThreeDCharacterDraftImage(id: string) {
  return runTransaction<undefined>("readwrite", (store) => store.delete(id));
}
