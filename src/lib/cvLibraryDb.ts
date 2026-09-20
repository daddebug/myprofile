// Local CV/resume PDF library, following the exact same IndexedDB pattern
// already used by projectBodyAssetDb.ts (multiple named blob records, keyed
// by id) -- not a new parallel asset system, the same one generalized to a
// non-image blob type. Getting a selected CV to become a real public asset
// URL at publish time still needs wiring through productionBundleExport.ts
// / publishSourceRegistry.json / import-production-bundle.mjs -- not done
// yet, see the session report. Until then this module is the local,
// owner-side source of truth only; the live site only ever shows a CV once
// that publish-time wiring lands and a real publicPath exists.

export const CV_LIBRARY_DB_NAME = "dilida-portfolio-cv-library";
export const CV_LIBRARY_STORE_NAME = "cvAssets";
export const CV_LIBRARY_CHANGED_EVENT = "dilida-portfolio:cv-library-changed";

const DATABASE_VERSION = 1;

export type CvAssetRecord = {
  id: string;
  label: string;
  blob: Blob;
  fileName: string;
  mimeType: string;
  size: number;
  updatedAt: string;
};

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(CV_LIBRARY_DB_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(CV_LIBRARY_STORE_NAME)) {
        database.createObjectStore(CV_LIBRARY_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open the CV library database."));
  });
}

function request<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>) {
  return openDatabase().then((database) => new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(CV_LIBRARY_STORE_NAME, mode);
    const result = operation(transaction.objectStore(CV_LIBRARY_STORE_NAME));
    result.onsuccess = () => resolve(result.result);
    result.onerror = () => reject(result.error ?? new Error("CV library request failed."));
    transaction.oncomplete = () => database.close();
    transaction.onabort = transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("CV library transaction failed."));
    };
  }));
}

function notifyChanged() {
  window.dispatchEvent(new CustomEvent(CV_LIBRARY_CHANGED_EVENT));
}

export function getAllCvAssets() {
  return request<CvAssetRecord[]>("readonly", (store) => store.getAll());
}

export function getCvAsset(id: string) {
  return request<CvAssetRecord | undefined>("readonly", (store) => store.get(id));
}

export async function addCvAsset(id: string, label: string, file: File) {
  if (file.type !== "application/pdf") {
    throw new Error("CV files must be PDF.");
  }
  const record: CvAssetRecord = {
    id,
    label,
    blob: file,
    fileName: file.name,
    mimeType: file.type,
    size: file.size,
    updatedAt: new Date().toISOString(),
  };
  await request<IDBValidKey>("readwrite", (store) => store.put(record));
  notifyChanged();
}

export async function renameCvAsset(id: string, label: string) {
  const existing = await getCvAsset(id);
  if (!existing) return;
  await request<IDBValidKey>("readwrite", (store) => store.put({ ...existing, label, updatedAt: new Date().toISOString() }));
  notifyChanged();
}

export async function deleteCvAsset(id: string) {
  await request<undefined>("readwrite", (store) => store.delete(id));
  notifyChanged();
}
