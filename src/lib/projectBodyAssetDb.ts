import { optimizeUploadedImage } from "./imageOptimization";

export const PROJECT_BODY_ASSET_DB_NAME = "dilida-portfolio-project-body-assets";
export const PROJECT_BODY_ASSET_STORE_NAME = "assets";
export const PROJECT_BODY_ASSET_CHANGED_EVENT = "dilida-portfolio:project-body-asset-changed";

const DATABASE_VERSION = 1;

export type ProjectBodyAssetRecord = {
  id: string;
  projectId: string;
  blob: Blob;
  fileName: string;
  mimeType: string;
  size: number;
  updatedAt: string;
};

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(PROJECT_BODY_ASSET_DB_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PROJECT_BODY_ASSET_STORE_NAME)) {
        const store = database.createObjectStore(PROJECT_BODY_ASSET_STORE_NAME, { keyPath: "id" });
        store.createIndex("projectId", "projectId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open project body assets."));
  });
}

function request<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>) {
  return openDatabase().then((database) => new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(PROJECT_BODY_ASSET_STORE_NAME, mode);
    const result = operation(transaction.objectStore(PROJECT_BODY_ASSET_STORE_NAME));
    result.onsuccess = () => resolve(result.result);
    result.onerror = () => reject(result.error ?? new Error("Project body asset request failed."));
    transaction.oncomplete = () => database.close();
    transaction.onabort = transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Project body asset transaction failed."));
    };
  }));
}

export function getProjectBodyAsset(assetId: string) {
  return request<ProjectBodyAssetRecord | undefined>("readonly", (store) => store.get(assetId));
}

export function getAllProjectBodyAssets() {
  return request<ProjectBodyAssetRecord[]>("readonly", (store) => store.getAll());
}

export async function deleteProjectBodyAssetsForProject(projectId: string): Promise<number> {
  if (typeof window === "undefined" || !("databases" in window.indexedDB)) return 0;
  const databases = await window.indexedDB.databases();
  if (!databases.some((database) => database.name === PROJECT_BODY_ASSET_DB_NAME)) return 0;
  const database = await openDatabase();
  return new Promise<number>((resolve, reject) => {
    const transaction = database.transaction(PROJECT_BODY_ASSET_STORE_NAME, "readwrite");
    const store = transaction.objectStore(PROJECT_BODY_ASSET_STORE_NAME);
    const keysRequest = store.index("projectId").getAllKeys(projectId);
    let count = 0;
    keysRequest.onsuccess = () => {
      count = keysRequest.result.length;
      keysRequest.result.forEach((key) => store.delete(key));
    };
    keysRequest.onerror = () => reject(keysRequest.error ?? new Error("Unable to read project body assets."));
    transaction.oncomplete = () => { database.close(); resolve(count); };
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error("Unable to delete project body assets.")); };
  });
}

export async function putProjectBodyAsset(projectId: string, assetId: string, file: File) {
  const optimized = await optimizeUploadedImage(file);
  const record: ProjectBodyAssetRecord = {
    id: assetId,
    projectId,
    blob: optimized,
    fileName: file.name,
    mimeType: optimized.type || file.type,
    size: optimized.size,
    updatedAt: new Date().toISOString(),
  };
  await request<IDBValidKey>("readwrite", (store) => store.put(record));
  window.dispatchEvent(new CustomEvent(PROJECT_BODY_ASSET_CHANGED_EVENT, { detail: { projectId, assetId } }));
}

// Writes an already-optimized record verbatim (no re-encoding) — for
// callers like TemplateFlowRegion that optimize the upload themselves
// before calling db.putDraftImage, so the blob isn't processed twice.
export async function putProjectBodyAssetRecord(record: ProjectBodyAssetRecord) {
  await request<IDBValidKey>("readwrite", (store) => store.put(record));
  window.dispatchEvent(new CustomEvent(PROJECT_BODY_ASSET_CHANGED_EVENT, { detail: { projectId: record.projectId, assetId: record.id } }));
}

export async function deleteProjectBodyAsset(assetId: string) {
  await request<undefined>("readwrite", (store) => store.delete(assetId));
}
