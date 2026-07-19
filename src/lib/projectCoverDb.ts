export const PROJECT_COVER_DB_NAME = "dilida-portfolio-public-project-assets";
export const PROJECT_COVER_STORE_NAME = "projectCovers";
export const PROJECT_COVER_CHANGED_EVENT = "dilida-portfolio:project-cover-changed";

const DATABASE_VERSION = 1;

export type ProjectCoverRecord = {
  projectId: string;
  blob: Blob;
  fileName: string;
  mimeType: string;
  size: number;
  updatedAt: number;
};

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(PROJECT_COVER_DB_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PROJECT_COVER_STORE_NAME)) {
        database.createObjectStore(PROJECT_COVER_STORE_NAME, { keyPath: "projectId" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open the project cover database."));
    request.onblocked = () => reject(new Error("The project cover database is blocked by another tab."));
  });
}

function runTransaction<T>(mode: IDBTransactionMode, createRequest: (store: IDBObjectStore) => IDBRequest<T>) {
  return openDatabase().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(PROJECT_COVER_STORE_NAME, mode);
        const request = createRequest(transaction.objectStore(PROJECT_COVER_STORE_NAME));
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
          reject(transaction.error ?? new Error("The project cover transaction failed."));
        };
        transaction.onabort = () => {
          database.close();
          reject(transaction.error ?? new Error("The project cover transaction was cancelled."));
        };
      }),
  );
}

function notifyCoverChanged(projectId: string) {
  window.dispatchEvent(new CustomEvent(PROJECT_COVER_CHANGED_EVENT, { detail: { projectId } }));
}

export function getProjectCover(projectId: string) {
  return runTransaction<ProjectCoverRecord | undefined>("readonly", (store) => store.get(projectId));
}

export async function setProjectCover(projectId: string, file: File) {
  const record: ProjectCoverRecord = {
    projectId,
    blob: file,
    fileName: file.name,
    mimeType: file.type,
    size: file.size,
    updatedAt: Date.now(),
  };

  await runTransaction<IDBValidKey>("readwrite", (store) => store.put(record));
  notifyCoverChanged(projectId);
}

export async function removeProjectCover(projectId: string) {
  await runTransaction<undefined>("readwrite", (store) => store.delete(projectId));
  notifyCoverChanged(projectId);
}
