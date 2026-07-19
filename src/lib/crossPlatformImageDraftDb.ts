export const CROSS_PLATFORM_IMAGE_DB_NAME = "dilida-portfolio-cross-platform-draft-assets";
export const CROSS_PLATFORM_IMAGE_STORE_NAME = "images";

const DATABASE_VERSION = 1;

export type DraftImageRecord = {
  id: string;
  blob: Blob;
  fileName: string;
  mimeType: string;
  size: number;
  updatedAt: string;
};

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(CROSS_PLATFORM_IMAGE_DB_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(CROSS_PLATFORM_IMAGE_STORE_NAME)) {
        database.createObjectStore(CROSS_PLATFORM_IMAGE_STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open the local image database."));
    request.onblocked = () => reject(new Error("The local image database is blocked by another tab."));
  });
}

function runTransaction<T>(mode: IDBTransactionMode, createRequest: (store: IDBObjectStore) => IDBRequest<T>) {
  return openDatabase().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(CROSS_PLATFORM_IMAGE_STORE_NAME, mode);
        const store = transaction.objectStore(CROSS_PLATFORM_IMAGE_STORE_NAME);
        const request = createRequest(store);
        let result: T;

        request.onsuccess = () => {
          result = request.result;
        };
        transaction.oncomplete = () => {
          database.close();
          resolve(result);
        };
        transaction.onerror = () => {
          database.close();
          reject(transaction.error ?? new Error("The local image transaction failed."));
        };
        transaction.onabort = () => {
          database.close();
          reject(transaction.error ?? new Error("The local image transaction was cancelled."));
        };
      }),
  );
}

export function getDraftImage(id: string) {
  return runTransaction<DraftImageRecord | undefined>("readonly", (store) => store.get(id));
}

export function putDraftImage(record: DraftImageRecord) {
  return runTransaction<IDBValidKey>("readwrite", (store) => store.put(record)).then(() => undefined);
}

export function deleteDraftImage(id: string) {
  return runTransaction<undefined>("readwrite", (store) => store.delete(id));
}
