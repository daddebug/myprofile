import { clearDirtyIntent, getDirtyIntent, captureDirtyIntent } from "./dirtyIntentStore";
import { deleteProjectDocument, getProjectDocument } from "./projectDocuments";
import { deleteProjectBodyAssetsForProject } from "./projectBodyAssetDb";
import { getProjectCover, removeProjectCover } from "./projectCoverDb";
import { removeProjectPublicMetaOverride } from "./projectMetadata";
import { currentPublishedProjectSnapshot } from "./publishIntent";

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

// The actual, permanent, local-data purge -- everything deletePortfolioProject
// used to do immediately on click. Now ONLY ever called by
// finalizeProjectDeletion() below, once production has proven this project's
// deletion publish actually succeeded. Never call this directly from UI.
async function purgeProjectLocalData(projectId: string): Promise<DeletePortfolioProjectResult> {
  const result: DeletePortfolioProjectResult = {
    removedDraftKey: false,
    removedProjectDocument: false,
    removedCover: false,
    removedBodyAssetCount: 0,
    clearedImageRecordCount: 0,
    removedRegistryOverride: false,
  };

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

// Phase 1 of two-phase deletion (Publishing Architecture V2, Deletion
// Transaction Model): opens (or reuses) a DELETE dirty intent for this
// project. Deliberately does NOT touch any local data — the project's
// draft, assets, cover, and catalog override are all left completely intact
// and immediately recoverable via undoProjectPendingDeletion(). The caller
// (WorkPage.tsx) is responsible for filtering this project out of the
// visible catalog once this returns — that filtering, not data loss, is
// what makes deletion "look done" to the user.
export function markProjectPendingDeletion(projectId: string): void {
  if (typeof window === "undefined" || !import.meta.env.DEV) return;
  captureDirtyIntent(projectId, "project", "DELETE", currentPublishedProjectSnapshot(projectId));
}

// Reverses markProjectPendingDeletion(). Since no local data was ever
// touched, undo is exactly "stop treating this as pending deletion" — zero
// data was ever at risk. Only clears an entry that is actually still a
// DELETE intent, so it can never clobber an unrelated UPSERT/UNPUBLISH
// intent that happens to share this project's id.
export function undoProjectPendingDeletion(projectId: string): void {
  if (getDirtyIntent(projectId)?.kind !== "DELETE") return;
  clearDirtyIntent(projectId);
}

export function isProjectPendingDeletion(projectId: string): boolean {
  return getDirtyIntent(projectId)?.kind === "DELETE";
}

// Phase 2, lazy — intended to be called once per project with an open
// DELETE intent, e.g. on app/page load. Only actually purges local data
// once production has PROVEN this project's deletion publish succeeded:
// absent from currentPublished AND the local intent is still DELETE. A
// Window-1 conflict on this entity (see buildPublishPlan.mjs) leaves the
// intent open and the project still published — this function must never
// guess at success, only confirm it against currentPublished, the same
// source of truth every other inherit/absence check in this system uses.
export async function finalizeProjectDeletion(projectId: string): Promise<DeletePortfolioProjectResult | null> {
  if (typeof window === "undefined" || !import.meta.env.DEV) return null;
  if (getDirtyIntent(projectId)?.kind !== "DELETE") return null;
  const stillPublished = currentPublishedProjectSnapshot(projectId) !== undefined;
  if (stillPublished) return null;
  const result = await purgeProjectLocalData(projectId);
  clearDirtyIntent(projectId);
  return result;
}
