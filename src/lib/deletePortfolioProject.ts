import { deleteProjectDocument, getProjectDocument } from "./projectDocuments";
import { deleteProjectBodyAssetsForProject } from "./projectBodyAssetDb";
import { getProjectCover, removeProjectCover } from "./projectCoverDb";
import { removeProjectPublicMetaOverride } from "./projectMetadata";

// Each bespoke draft page uses a dedicated IndexedDB, entirely owned by that
// one project (never shared), so clearing the whole store is safe. Dynamic
// projects (created via the New Project wizard) never use these — they are
// listed here only for the small set of bespoke pages that still have one.
// Empty now that every bespoke page has been migrated or removed; add an
// entry here again if a future project needs its own dedicated store.
const bespokeImageStores: Record<string, { dbName: string; storeName: string }> = {};

// Every bespoke draft page's localStorage key follows this exact pattern.
const bespokeDraftKeys: Record<string, string> = {};

async function databaseExists(name: string) {
  if (typeof window === "undefined" || !("databases" in window.indexedDB)) return false;
  const databases = await window.indexedDB.databases();
  return databases.some((database) => database.name === name);
}

async function clearImageStore(dbName: string, storeName: string): Promise<number> {
  if (!(await databaseExists(dbName))) return 0;
  return new Promise<number>((resolve, reject) => {
    const request = window.indexedDB.open(dbName);
    request.onerror = () => reject(request.error ?? new Error(`Unable to open ${dbName}.`));
    request.onsuccess = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(storeName)) {
        database.close();
        resolve(0);
        return;
      }
      const transaction = database.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const countRequest = store.count();
      let count = 0;
      countRequest.onsuccess = () => {
        count = countRequest.result;
        store.clear();
      };
      transaction.oncomplete = () => { database.close(); resolve(count); };
      transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error(`Unable to clear ${dbName}.`)); };
    };
  });
}

export type DeletePortfolioProjectResult = {
  removedDraftKey: boolean;
  removedProjectDocument: boolean;
  removedCover: boolean;
  removedBodyAssetCount: number;
  clearedImageRecordCount: number;
  removedRegistryOverride: boolean;
};

// Single entry point for permanently deleting one project's browser-owned
// data, keyed by its real project id / slug. Only ever touches storage that
// is confirmed to belong to this exact id — never a whole store or a whole
// database. Static, source-controlled catalog entries (defined in
// projects.ts) cannot be removed by this function: their compiled catalog
// row stays, but every piece of browser-only data (draft, ProjectDocument,
// images, owner-edited metadata) is still fully cleared, and any owner
// override reverts to the compiled default.
export async function deletePortfolioProject(projectId: string): Promise<DeletePortfolioProjectResult> {
  const result: DeletePortfolioProjectResult = {
    removedDraftKey: false,
    removedProjectDocument: false,
    removedCover: false,
    removedBodyAssetCount: 0,
    clearedImageRecordCount: 0,
    removedRegistryOverride: false,
  };
  if (typeof window === "undefined" || !import.meta.env.DEV) return result;

  // Bespoke pages each have their own hardcoded key; every project created
  // through "New project" (DynamicProjectPage) instead uses this one
  // generic, purely id-derived pattern — checking both covers every real
  // draft-storage shape in the app without needing a lookup entry per id.
  const draftKey = bespokeDraftKeys[projectId] ?? `dilida-portfolio:dynamic-project:${projectId}:draft:v1`;
  if (window.localStorage.getItem(draftKey) !== null) {
    window.localStorage.removeItem(draftKey);
    result.removedDraftKey = true;
  }

  const imageStore = bespokeImageStores[projectId];
  if (imageStore) {
    result.clearedImageRecordCount = await clearImageStore(imageStore.dbName, imageStore.storeName);
  }

  result.removedProjectDocument = Boolean(getProjectDocument(projectId));
  deleteProjectDocument(projectId);

  result.removedBodyAssetCount = await deleteProjectBodyAssetsForProject(projectId);

  result.removedCover = Boolean(await getProjectCover(projectId).catch(() => undefined));
  await removeProjectCover(projectId).catch(() => undefined);

  result.removedRegistryOverride = true;
  removeProjectPublicMetaOverride(projectId);

  return result;
}
