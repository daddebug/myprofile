import { PROJECT_COVER_DB_NAME, PROJECT_COVER_STORE_NAME } from "./projectCoverDb";
import { PROJECT_BODY_ASSET_DB_NAME, PROJECT_BODY_ASSET_STORE_NAME } from "./projectBodyAssetDb";
import { GAME_COVER_DB_NAME, GAME_COVER_STORE_NAME } from "./gameCoverDb";
import { getGameExperienceStore } from "./gameExperience";
import { getProjectDocumentsExportStore } from "./projectDocuments";
import { getProjectCollectionExportStore } from "./projectMetadata";

type ExportedImage = {
  database: string;
  store: string;
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  updatedAt?: string;
  projectId?: string;
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

const draftSources: readonly { projectId: string; key: string; database: string; store: string }[] = [];

// Symbolic source tag (matched by scripts/import-production-bundle.mjs) for
// template-instance images staged via stageDynamicProjectImage() —
// TemplateInstancesSection.tsx's imageId/publicPath pair. These are never an
// IndexedDB blob: publicPath already points at a real file the dev server's
// portfolioContentPlugin.ts wrote under public/portfolio-assets/, so the only
// way to get the bytes here is to fetch that already-serving local URL.
const templateImageSource = { database: "dilida-portfolio-template-images", store: "images" };

function collectTemplateImageRefs(value: unknown, refs = new Map<string, string>()): Map<string, string> {
  if (!value || typeof value !== "object") return refs;
  if (Array.isArray(value)) {
    value.forEach((item) => collectTemplateImageRefs(item, refs));
    return refs;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.imageId === "string" && record.imageId && typeof record.publicPath === "string" && record.publicPath) {
    refs.set(record.imageId, record.publicPath);
  }
  Object.values(record).forEach((item) => collectTemplateImageRefs(item, refs));
  return refs;
}

async function fetchTemplateImage(projectId: string, imageId: string, publicPath: string): Promise<ExportedImage> {
  const response = await fetch(publicPath, { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const blob = await response.blob();
  const fileName = publicPath.split("/").pop() || `${imageId}.bin`;
  return {
    database: templateImageSource.database,
    store: templateImageSource.store,
    id: imageId,
    projectId,
    fileName,
    mimeType: blob.type || response.headers.get("content-type") || "application/octet-stream",
    size: blob.size,
    dataBase64: bytesToBase64(await blob.arrayBuffer()),
  };
}

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
    ...(typeof record.projectId === "string" ? { projectId: record.projectId } : {}),
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
  dynamicProjectWarnings: string[];
};

// Must match DynamicProjectPage.tsx's own (unexported) draftStorageKey().
// Dynamic-project template instances already carry a stable, standalone
// publicPath on each image reference (no localImageId/IndexedDB blob), so
// unlike draftSources below, this draft is exported as-is — no image
// collection step is needed for it.
function dynamicProjectDraftStorageKey(projectId: string) {
  return `dilida-portfolio:dynamic-project:${projectId}:draft:v1`;
}

function readDynamicProjectDraft(projectId: string, warnings: string[]): unknown {
  const key = dynamicProjectDraftStorageKey(projectId);
  const raw = window.localStorage.getItem(key);
  if (!raw) {
    warnings.push(`${projectId}: no draft found at "${key}".`);
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    warnings.push(`${projectId}: draft at "${key}" is not valid JSON.`);
    return undefined;
  }

  if (
    !parsed
    || typeof parsed !== "object"
    || Array.isArray(parsed)
    || (parsed as Record<string, unknown>).version !== 1
    || !Array.isArray((parsed as Record<string, unknown>).templateInstances)
  ) {
    warnings.push(`${projectId}: draft at "${key}" has an unrecognised shape (expected {version:1, templateInstances:[...]}).`);
    return undefined;
  }

  if ((parsed as { templateInstances: unknown[] }).templateInstances.length === 0) {
    warnings.push(`${projectId}: draft found but templateInstances is empty.`);
  }

  return parsed;
}

export async function exportProductionBundle(): Promise<ProductionExportSummary> {
  const drafts: Record<string, unknown> = {};
  const images: ExportedImage[] = [];
  const missingReferences: string[] = [];
  const dynamicProjectWarnings: string[] = [];

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

  const projectCatalog = getProjectCollectionExportStore();

  // Some template-instance images (e.g. older image-row items) were saved
  // via the same localImageId + project-body-asset IndexedDB store used by
  // ProjectDocument media, rather than the newer disk-staged
  // imageId/publicPath pair — both shapes coexist across instances, so both
  // must be collected. bodyAssetIds is resolved against
  // PROJECT_BODY_ASSET_DB_NAME once, below, after every source (project
  // documents and now dynamic-project drafts) has added its referenced ids.
  const bodyAssetIds = new Set<string>();

  // Every catalog project marked isDynamic keeps its real template-instance
  // content in its own dilida-portfolio:dynamic-project:<id>:draft:v1 key —
  // discovered here from the current catalog, never hardcoded, so newly
  // created projects are picked up automatically and retired ones (like the
  // now-deleted cross-platform-game-ux, which was never dynamic and is no
  // longer in the catalog at all) are never included.
  const staticSourceIds = new Set<string>(draftSources.map((source) => source.projectId));
  for (const projectId of projectCatalog.projectIds) {
    if (staticSourceIds.has(projectId)) continue;
    if (!projectCatalog.projects[projectId]?.isDynamic) continue;
    const draft = readDynamicProjectDraft(projectId, dynamicProjectWarnings);
    if (draft === undefined) continue;
    drafts[projectId] = draft;
    collectLocalImageIds(draft).forEach((id) => bodyAssetIds.add(id));

    const templateImageRefs = collectTemplateImageRefs(draft);
    for (const [imageId, publicPath] of templateImageRefs) {
      try {
        images.push(await fetchTemplateImage(projectId, imageId, publicPath));
      } catch (error) {
        missingReferences.push(`${projectId}: ${imageId} (could not fetch ${publicPath}: ${error instanceof Error ? error.message : String(error)})`);
      }
    }
  }
  if (dynamicProjectWarnings.length) {
    console.warn("[Portfolio export] dynamic project draft warnings:", dynamicProjectWarnings);
  }

  const projectDocuments = getProjectDocumentsExportStore();
  const gameExperience = getGameExperienceStore();
  const canonicalProjectIds = new Set(projectCatalog.projectIds);
  const coverRecords = await readStore(PROJECT_COVER_DB_NAME, PROJECT_COVER_STORE_NAME);
  for (const record of coverRecords) {
    const projectId = typeof record.projectId === "string"
      ? record.projectId
      : typeof record.id === "string"
        ? record.id
        : "";
    if (!canonicalProjectIds.has(projectId)) continue;
    images.push(await serializeImage(PROJECT_COVER_DB_NAME, PROJECT_COVER_STORE_NAME, record));
  }

  Object.values(projectDocuments.documents).forEach((document) => {
    document.sections.forEach((section) => section.blocks.forEach((block) => {
      block.content.media?.forEach((item) => { if (item.assetId) bodyAssetIds.add(item.assetId); });
    }));
  });
  const bodyRecords = await readStore(PROJECT_BODY_ASSET_DB_NAME, PROJECT_BODY_ASSET_STORE_NAME);
  const bodyRecordsById = new Map(bodyRecords.map((record) => [typeof record.id === "string" ? record.id : "", record]));
  for (const id of bodyAssetIds) {
    const record = bodyRecordsById.get(id);
    if (!record) { missingReferences.push(`project-body: ${id}`); continue; }
    images.push(await serializeImage(PROJECT_BODY_ASSET_DB_NAME, PROJECT_BODY_ASSET_STORE_NAME, record));
  }

  const gameCoverIds = new Set(gameExperience.records.flatMap((record) => [
    record.presentation.coverAssetId,
    record.presentation.detectedCoverAssetId,
  ].filter((id): id is string => Boolean(id))));
  const gameCoverRecords = await readStore(GAME_COVER_DB_NAME, GAME_COVER_STORE_NAME);
  const gameCoverRecordsById = new Map(gameCoverRecords.map((record) => [typeof record.id === "string" ? record.id : "", record]));
  for (const id of gameCoverIds) {
    const record = gameCoverRecordsById.get(id);
    if (!record) { missingReferences.push(`game-cover: ${id}`); continue; }
    images.push(await serializeImage(GAME_COVER_DB_NAME, GAME_COVER_STORE_NAME, record));
  }

  const bundle = {
    version: 1,
    exportedAt: new Date().toISOString(),
    origin: window.location.origin,
    drafts,
    projectCatalog,
    projectDocuments,
    gameExperience,
    images,
    diagnostics: {
      missingReferences,
      dynamicProjectWarnings,
      note: "This is a read-only export. Original localStorage and IndexedDB records remain unchanged.",
    },
  };

  downloadJson(bundle);
  return { draftCount: Object.keys(drafts).length, imageCount: images.length, missingReferences, dynamicProjectWarnings };
}
