import { optimizeUploadedImage } from "./imageOptimization";

export const GAME_COVER_DB_NAME = "dilida-portfolio-game-assets";
export const GAME_COVER_STORE_NAME = "covers";
export const GAME_COVER_DB_VERSION = 1;
export const GAME_COVER_CHANGE_EVENT = "dilida:game-cover-change";
export const GAME_COVER_MAX_BYTES = 12 * 1024 * 1024;

export type GameCoverRecord = {
  id: string;
  gameId: string;
  fileName: string;
  mimeType: string;
  size: number;
  blob: Blob;
  createdAt: string;
  updatedAt: string;
};

const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/avif"]);

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(GAME_COVER_DB_NAME, GAME_COVER_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(GAME_COVER_STORE_NAME)) {
        const store = database.createObjectStore(GAME_COVER_STORE_NAME, { keyPath: "id" });
        store.createIndex("gameId", "gameId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open the game-cover database."));
  });
}

async function withStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  const database = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(GAME_COVER_STORE_NAME, mode);
    const request = action(transaction.objectStore(GAME_COVER_STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Game-cover operation failed."));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => reject(transaction.error ?? new Error("Game-cover transaction failed."));
  });
}

export async function getGameCoverRecord(id: string) {
  if (!id) return undefined;
  return withStore<GameCoverRecord | undefined>("readonly", (store) => store.get(id));
}

export async function getAllGameCoverRecords() {
  return withStore<GameCoverRecord[]>("readonly", (store) => store.getAll());
}

// Was missing from this module even though every other asset-db module
// (projectBodyAssetDb.ts's deleteProjectBodyAsset, projectCoverDb.ts's
// removeProjectCover) already has the equivalent -- added so V2 browser
// integration tests have a real, non-hacky way to clean up the specific
// test records they create, instead of leaving permanent IndexedDB residue
// (see Publishing Architecture V2's Test Safety report). Only ever deletes
// the exact id passed in, never a bulk/whole-store operation.
export async function deleteGameCoverRecord(id: string) {
  if (!id) return;
  await withStore<undefined>("readwrite", (store) => store.delete(id));
  window.dispatchEvent(new CustomEvent(GAME_COVER_CHANGE_EVENT, { detail: { id } }));
}

export function validateGameCoverFile(file: Blob & { name?: string }) {
  if (!allowedTypes.has(file.type)) throw new Error("Please use a PNG, JPEG, WebP, or AVIF image.");
  if (file.size > GAME_COVER_MAX_BYTES) throw new Error("Game covers must be 12 MB or smaller.");
}

export async function saveGameCover(gameId: string, file: Blob & { name?: string }, assetId?: string) {
  validateGameCoverFile(file);
  const optimized = await optimizeUploadedImage(file);
  const now = new Date().toISOString();
  const id = assetId || `game-cover-${crypto.randomUUID()}`;
  const existing = await getGameCoverRecord(id);
  const record: GameCoverRecord = {
    id,
    gameId,
    fileName: file.name || existing?.fileName || `${id}.img`,
    mimeType: optimized.type || file.type,
    size: optimized.size,
    blob: optimized,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await withStore<IDBValidKey>("readwrite", (store) => store.put(record));
  window.dispatchEvent(new CustomEvent(GAME_COVER_CHANGE_EVENT, { detail: { id, gameId } }));
  return record;
}
