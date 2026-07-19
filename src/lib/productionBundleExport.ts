import { CROSS_PLATFORM_DRAFT_STORAGE_KEY } from "./crossPlatformDraftStorage";
import {
  CROSS_PLATFORM_IMAGE_DB_NAME,
  CROSS_PLATFORM_IMAGE_STORE_NAME,
} from "./crossPlatformImageDraftDb";
import { GAME_JAM_DRAFT_STORAGE_KEY } from "./gameJamDraftStorage";
import { GAME_JAM_IMAGE_DB_NAME, GAME_JAM_IMAGE_STORE_NAME } from "./gameJamImageDraftDb";
import { INTERACTION_PROFILE_AGENT_DRAFT_STORAGE_KEY } from "./interactionProfileAgentDraftStorage";
import { PROJECT_COVER_DB_NAME, PROJECT_COVER_STORE_NAME } from "./projectCoverDb";
import { PROJECT_PUBLIC_META_STORAGE_KEY } from "./projectMetadata";
import { THREE_D_CHARACTER_DRAFT_STORAGE_KEY } from "./threeDCharacterDraftStorage";
import {
  THREE_D_CHARACTER_IMAGE_DB_NAME,
  THREE_D_CHARACTER_IMAGE_STORE_NAME,
} from "./threeDCharacterImageDraftDb";

type ExportedImage = {
  database: string;
  store: string;
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  updatedAt?: string;
  dataBase64: string;
};

type IndexedImageRecord = {
  id?: unknown;
  projectId?: unknown;
  fileName?: unknown;
  mimeType?: unknown;
  size?: unknown;
  updatedAt?: unknown;
  blob?: unknown;
};

const draftSources = [
  {
    projectId: "cross-platform-game-ux",
    key: CROSS_PLATFORM_DRAFT_STORAGE_KEY,
    database: CROSS_PLATFORM_IMAGE_DB_NAME,
    store: CROSS_PLATFORM_IMAGE_STORE_NAME,
  },
  {
    projectId: "3d-character-ui-rhythm",
    key: THREE_D_CHARACTER_DRAFT_STORAGE_KEY,
    database: THREE_D_CHARACTER_IMAGE_DB_NAME,
    store: THREE_D_CHARACTER_IMAGE_STORE_NAME,
  },
  {
    projectId: "from-theme-to-playable-rule",
    key: GAME_JAM_DRAFT_STORAGE_KEY,
    database: GAME_JAM_IMAGE_DB_NAME,
    store: GAME_JAM_IMAGE_STORE_NAME,
  },
  {
    projectId: "interaction-profile-agent",
    key: INTERACTION_PROFILE_AGENT_DRAFT_STORAGE_KEY,
  },
] as const;

function parseStoredJson(key: string): unknown {
  const raw = window.localStorage.getItem(key);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`Cannot export invalid JSON stored under ${key}.`);
  }
}

function collectLocalImageIds(value: unknown, ids = new Set<string>()): Set<string> {
  if (!value || typeof value !== "object") return ids;
  if (Array.isArray(value)) {
    value.forEach((item) => collectLocalImageIds(item, ids));
    return ids;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.localImageId === "string" && record.localImageId) ids.add(record.localImageId);
  Object.values(record).forEach((item) => collectLocalImageIds(item, ids));
  return ids;
}

async function databaseExists(name: string) {
  if (!("databases" in window.indexedDB)) return false;
  const databases = await window.indexedDB.databases();
  return databases.some((database) => database.name === name);
}

async function readStore(databaseName: string, storeName: string): Promise<IndexedImageRecord[]> {
  if (!(await databaseExists(databaseName))) return [];
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(databaseName);
    request.onerror = () => reject(request.error ?? new Error(`Unable to open ${databaseName}.`));
    request.onsuccess = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(storeName)) {
        database.close();
        resolve([]);
        return;
      }
      const transaction = database.transaction(storeName, "readonly");
      const getAllRequest = transaction.objectStore(storeName).getAll();
      getAllRequest.onerror = () => reject(getAllRequest.error ?? new Error(`Unable to read ${databaseName}/${storeName}.`));
      getAllRequest.onsuccess = () => resolve(getAllRequest.result as IndexedImageRecord[]);
      transaction.oncomplete = () => database.close();
      transaction.onerror = () => reject(transaction.error ?? new Error(`Unable to read ${databaseName}/${storeName}.`));
    };
  });
}

function bytesToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return window.btoa(binary);
}

async function serializeImage(
  database: string,
  store: string,
  record: IndexedImageRecord,
): Promise<ExportedImage> {
  const blob = record.blob;
  const id = typeof record.id === "string" ? record.id : typeof record.projectId === "string" ? record.projectId : "";
  if (!id || !(blob instanceof Blob)) throw new Error(`Invalid image record in ${database}/${store}.`);
  return {
    database,
    store,
    id,
    fileName: typeof record.fileName === "string" ? record.fileName : `${id}.bin`,
    mimeType: typeof record.mimeType === "string" && record.mimeType ? record.mimeType : blob.type || "application/octet-stream",
    size: typeof record.size === "number" ? record.size : blob.size,
    ...(typeof record.updatedAt === "string" ? { updatedAt: record.updatedAt } : {}),
    dataBase64: bytesToBase64(await blob.arrayBuffer()),
  };
}

function downloadJson(value: unknown) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `portfolio-production-export-${timestamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export type ProductionExportSummary = {
  draftCount: number;
  imageCount: number;
  missingReferences: string[];
};

export async function exportProductionBundle(): Promise<ProductionExportSummary> {
  const drafts: Record<string, unknown> = {};
  const images: ExportedImage[] = [];
  const missingReferences: string[] = [];

  for (const source of draftSources) {
    const draft = parseStoredJson(source.key);
    if (draft === undefined) continue;
    drafts[source.projectId] = draft;

    if (!("database" in source)) continue;
    const referencedIds = collectLocalImageIds(draft);
    const records = await readStore(source.database, source.store);
    const recordsById = new Map(
      records.map((record) => [typeof record.id === "string" ? record.id : "", record]),
    );

    for (const id of referencedIds) {
      const record = recordsById.get(id);
      if (!record) {
        missingReferences.push(`${source.projectId}: ${id}`);
        continue;
      }
      images.push(await serializeImage(source.database, source.store, record));
    }
  }

  const coverRecords = await readStore(PROJECT_COVER_DB_NAME, PROJECT_COVER_STORE_NAME);
  for (const record of coverRecords) {
    images.push(await serializeImage(PROJECT_COVER_DB_NAME, PROJECT_COVER_STORE_NAME, record));
  }

  const publicMetadata = parseStoredJson(PROJECT_PUBLIC_META_STORAGE_KEY);
  const bundle = {
    version: 1,
    exportedAt: new Date().toISOString(),
    origin: window.location.origin,
    drafts,
    publicMetadata: publicMetadata ?? { version: 1, projects: {} },
    images,
    diagnostics: {
      missingReferences,
      note: "This is a read-only export. Original localStorage and IndexedDB records remain unchanged.",
    },
  };

  downloadJson(bundle);
  return { draftCount: Object.keys(drafts).length, imageCount: images.length, missingReferences };
}
