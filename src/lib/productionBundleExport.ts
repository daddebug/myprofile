import { PROJECT_COVER_DB_NAME, PROJECT_COVER_STORE_NAME } from "./projectCoverDb";
import { PROJECT_BODY_ASSET_DB_NAME, PROJECT_BODY_ASSET_STORE_NAME } from "./projectBodyAssetDb";
import { GAME_COVER_DB_NAME, GAME_COVER_STORE_NAME } from "./gameCoverDb";
import { getGameExperienceStore } from "./gameExperience";
import { getProjectDocumentsExportStore } from "./projectDocuments";
import { getProjectCollectionExportStore } from "./projectMetadata";
import uiPracticeMetadata from "../data/uiPracticeMetadata.json";
import { getPublishSourceAdapter, publishSourceRegistry } from "./publishing/publishSourceRegistry";
import { getDiskProjectCover, getDiskPlayableGameCover } from "./portfolioContentClient";
import { getPublishedProjectDraft } from "./publishedPortfolio";
import { hydrateTranslations } from "./translationHydration";

type ExportedImage = {
  sourceAdapterId: string;
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
const templateImageSource = getPublishSourceAdapter("dynamic-template-images").storage!;
const uiPracticeImageSource = getPublishSourceAdapter("ui-practice-images").storage!;
const UI_PRACTICE_PROJECT_ID = "ui-personal-practice";

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

async function fetchTemplateImage(sourceAdapterId: string, projectId: string, imageId: string, publicPath: string): Promise<ExportedImage> {
  const response = await fetch(publicPath, { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const blob = await response.blob();
  const fileName = publicPath.split("/").pop() || `${imageId}.bin`;
  return {
    sourceAdapterId,
    database: sourceAdapterId === "ui-practice-images" ? uiPracticeImageSource.database : templateImageSource.database,
    store: sourceAdapterId === "ui-practice-images" ? uiPracticeImageSource.store : templateImageSource.store,
    id: imageId,
    projectId,
    fileName,
    mimeType: blob.type || response.headers.get("content-type") || "application/octet-stream",
    size: blob.size,
    dataBase64: bytesToBase64(await blob.arrayBuffer()),
  };
}

// project-covers-disk: ProjectCoverEditor.tsx (DEV-only) saves a project's
// cover to content/projects/project-covers.json via the dev server's
// stage/commit endpoints — never to the project-covers-indexeddb store the
// collector above reads (that store has had zero writers for a while; see
// projectCoverDb.ts). getDiskProjectCover() is the same per-project resolve
// endpoint the live site's own useProjectCover() hook already uses in DEV,
// re-fetched here purely to get the real bytes into the export bundle.
// image.id must equal the projectId — import-production-bundle.mjs keys its
// covers map by image.id and requires it to be a canonical project ID.
async function fetchDiskProjectCover(projectId: string, publicUrl: string, format: string, size: number, updatedAt: string): Promise<ExportedImage> {
  const response = await fetch(publicUrl, { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const blob = await response.blob();
  const fileName = publicUrl.split("/").pop() || `${projectId}.${format}`;
  return {
    sourceAdapterId: "project-covers-disk",
    database: "disk",
    store: "project-covers",
    id: projectId,
    projectId,
    fileName,
    mimeType: blob.type || `image/${format === "jpeg" ? "jpeg" : format}`,
    size: blob.size || size,
    updatedAt,
    dataBase64: bytesToBase64(await blob.arrayBuffer()),
  };
}

// playable-game-covers: PlayableGameTemplate's own launch-cover (distinct
// from the project card cover above) — saved to
// content/projects/<projectId>/playable-games.json#covers via the same
// dev-server stage/commit pattern as project covers, never IndexedDB.
// getDiskPlayableGameCover() mirrors getDiskProjectCover() exactly. id is
// the coverId (not projectId) — import-production-bundle.mjs matches this
// against content.game.cover.coverId wherever it appears in a project's
// template instances, the same way dynamic-template-images matches by
// imageId, since a project's own catalog id is already taken by its card
// cover's entry in the same bundle.
async function fetchDiskPlayableGameCover(projectId: string, coverId: string, publicUrl: string, format: string, size: number): Promise<ExportedImage> {
  const response = await fetch(publicUrl, { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const blob = await response.blob();
  const fileName = publicUrl.split("/").pop() || `${coverId}.${format}`;
  return {
    sourceAdapterId: "playable-game-covers",
    database: "disk",
    store: "playable-game-covers",
    id: coverId,
    projectId,
    fileName,
    mimeType: blob.type || `image/${format === "jpeg" ? "jpeg" : format}`,
    size: blob.size || size,
    dataBase64: bytesToBase64(await blob.arrayBuffer()),
  };
}

// game-experience-covers: normally sourced from the game-cover IndexedDB
// blob a fresh upload/edit creates (see gameCoverDb.ts). Once a cover has
// already been published, useGameCover() (src/hooks/useGameCover.ts) falls
// back to presentation.coverPublicPath instead of re-reading IndexedDB, so
// the live site renders correctly even from a browser whose IndexedDB blob
// for that cover was never (re-)populated since the last publish - the
// export must not block on a blob that was never meant to persist past its
// own publish cycle when the already-published file is right there.
async function fetchAlreadyPublishedGameCover(coverAssetId: string, coverPublicPath: string): Promise<ExportedImage> {
  const response = await fetch(coverPublicPath, { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const blob = await response.blob();
  const fileName = coverPublicPath.split("/").pop() || `${coverAssetId}.bin`;
  return {
    sourceAdapterId: "game-experience-covers",
    database: "disk",
    store: "published-game-covers",
    id: coverAssetId,
    fileName,
    mimeType: blob.type || "application/octet-stream",
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
  sourceAdapterId: string,
  database: string,
  store: string,
  record: IndexedImageRecord,
): Promise<ExportedImage> {
  const blob = record.blob;
  const id = typeof record.id === "string" ? record.id : typeof record.projectId === "string" ? record.projectId : "";
  if (!id || !(blob instanceof Blob)) throw new Error(`Invalid image record in ${database}/${store}.`);
  return {
    sourceAdapterId,
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

async function deliverLauncherExport(value: unknown, requestToken: string) {
  const response = await fetch(
    `/__portfolio-content/publishing-export/complete?token=${encodeURIComponent(requestToken)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: `${JSON.stringify(value, null, 2)}\n`,
    },
  );
  const result = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw new Error(result?.error || `Launcher export delivery failed (HTTP ${response.status}).`);
}

export async function reportLauncherExportFailure(requestToken: string, error: unknown) {
  await fetch(
    `/__portfolio-content/publishing-export/fail?token=${encodeURIComponent(requestToken)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
    },
  ).catch(() => undefined);
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
    // Absence here is never "delete this project's body" — it only means
    // this browser session has no pending edit. The publish pipeline
    // inherits the currently-published body for this project when the
    // export doesn't carry one (see import-production-bundle.mjs), so this
    // warning must not read as "publish data is incomplete."
    warnings.push(
      getPublishedProjectDraft(projectId) !== undefined
        ? `${projectId}: no local edit draft found; current published body will be inherited.`
        : `${projectId}: no local or published project body found.`,
    );
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

export async function exportProductionBundle(options?: { launcherRequestToken?: string }): Promise<ProductionExportSummary> {
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
      const sourceAdapter = publishSourceRegistry.sources.find((adapter) => adapter.storage?.database === source.database && adapter.storage.store === source.store);
      if (!sourceAdapter) throw new Error(`Unregistered publishing source: ${source.database}/${source.store}`);
      images.push(await serializeImage(sourceAdapter.id, source.database, source.store, record));
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
    // Translation Persistence fix, export-time safety net: this reader is
    // deliberately separate from DynamicProjectPage.tsx's own loadDraft()
    // (see that function's comment), so a hydration fix there does not
    // reach here on its own. Without this, a browser draft whose `en`
    // fields are still empty -- because this browser session never
    // reopened the editor after publishedPortfolio.json gained real
    // English -- would export verbatim and silently erase already-published
    // English on the next publish that touches this project. Hydrating
    // against the current published draft here, right before it enters the
    // bundle, closes that gap regardless of whether the editor UI was ever
    // reopened in this browser.
    drafts[projectId] = hydrateTranslations(draft, getPublishedProjectDraft(projectId));
    collectLocalImageIds(draft).forEach((id) => bodyAssetIds.add(id));

    const templateImageRefs = collectTemplateImageRefs(draft);
    for (const [imageId, publicPath] of templateImageRefs) {
      try {
        images.push(await fetchTemplateImage("dynamic-template-images", projectId, imageId, publicPath));
      } catch (error) {
        missingReferences.push(`${projectId}: ${imageId} (could not fetch ${publicPath}: ${error instanceof Error ? error.message : String(error)})`);
      }
    }
  }

  // UI Personal Practice is a source-controlled gallery rather than a
  // dynamic-project draft, but its newer items use the same disk-staged
  // imageId/publicPath shape. Export those bytes through the same published
  // image channel so its canonical metadata never points at local-only
  // /portfolio-assets files in production.
  const uiPractice = structuredClone(uiPracticeMetadata) as unknown;
  const uiPracticeImageRefs = collectTemplateImageRefs(uiPractice);
  for (const [imageId, publicPath] of uiPracticeImageRefs) {
    try {
      images.push(await fetchTemplateImage("ui-practice-images", UI_PRACTICE_PROJECT_ID, imageId, publicPath));
    } catch (error) {
      missingReferences.push(`${UI_PRACTICE_PROJECT_ID}: ${imageId} (could not fetch ${publicPath}: ${error instanceof Error ? error.message : String(error)})`);
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
    images.push(await serializeImage("project-covers-indexeddb", PROJECT_COVER_DB_NAME, PROJECT_COVER_STORE_NAME, record));
  }

  // The real, currently-used cover pipeline: content/projects/project-covers.json
  // (disk, written by ProjectCoverEditor.tsx). Every canonical project is
  // checked; a project with no saved cover simply has no disk record and is
  // skipped here (not an error — missingAssetsAllowed: true on the
  // project-covers-disk registry row, since not every project has a cover).
  for (const projectId of canonicalProjectIds) {
    const diskCover = await getDiskProjectCover(projectId).catch(() => null);
    if (!diskCover) continue;
    try {
      images.push(await fetchDiskProjectCover(projectId, diskCover.publicUrl, diskCover.format, diskCover.size, diskCover.updatedAt));
    } catch (error) {
      missingReferences.push(`${projectId}: cover (could not fetch ${diskCover.publicUrl}: ${error instanceof Error ? error.message : String(error)})`);
    }
  }

  // Same disk-resident pattern as the project cover loop above, for
  // PlayableGameTemplate's own launch cover. A project with no playable-game
  // cover simply has none (missingAssetsAllowed: true on the
  // playable-game-covers registry row).
  for (const projectId of canonicalProjectIds) {
    const gameCover = await getDiskPlayableGameCover(projectId).catch(() => null);
    if (!gameCover) continue;
    try {
      images.push(await fetchDiskPlayableGameCover(projectId, gameCover.coverId, gameCover.publicUrl, gameCover.format, gameCover.size));
    } catch (error) {
      missingReferences.push(`${projectId}: playable-game cover (could not fetch ${gameCover.publicUrl}: ${error instanceof Error ? error.message : String(error)})`);
    }
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
    images.push(await serializeImage("project-body-indexeddb-assets", PROJECT_BODY_ASSET_DB_NAME, PROJECT_BODY_ASSET_STORE_NAME, record));
  }

  const gameCoverIds = new Set(gameExperience.records.flatMap((record) => [
    record.presentation.coverAssetId,
    record.presentation.detectedCoverAssetId,
  ].filter((id): id is string => Boolean(id))));
  // A cover id can be referenced by coverAssetId and/or detectedCoverAssetId;
  // either way it shares the same record's coverPublicPath, which is what
  // the already-published fallback below needs.
  const publishedPathByCoverId = new Map<string, string>();
  for (const record of gameExperience.records) {
    const path = record.presentation.coverPublicPath;
    if (!path) continue;
    if (record.presentation.coverAssetId) publishedPathByCoverId.set(record.presentation.coverAssetId, path);
    if (record.presentation.detectedCoverAssetId) publishedPathByCoverId.set(record.presentation.detectedCoverAssetId, path);
  }
  const gameCoverRecords = await readStore(GAME_COVER_DB_NAME, GAME_COVER_STORE_NAME);
  const gameCoverRecordsById = new Map(gameCoverRecords.map((record) => [typeof record.id === "string" ? record.id : "", record]));
  const publishedGameCoverPrefix = "/images/published/game-covers/";
  for (const id of gameCoverIds) {
    const record = gameCoverRecordsById.get(id);
    if (record) {
      images.push(await serializeImage("game-experience-covers", GAME_COVER_DB_NAME, GAME_COVER_STORE_NAME, record));
      continue;
    }
    // Not in the local blob store - only reuse an already-published file
    // when its path is the exact canonical published path for THIS asset
    // id (never a stale or unrelated coverPublicPath), so a genuinely
    // missing cover still fails loudly instead of silently substituting
    // the wrong image.
    const publicPath = publishedPathByCoverId.get(id);
    const isCanonicalPublishedPath = typeof publicPath === "string"
      && publicPath.startsWith(publishedGameCoverPrefix)
      && publicPath.slice(publishedGameCoverPrefix.length).replace(/\.[^./]+$/, "") === id;
    if (isCanonicalPublishedPath) {
      try {
        images.push(await fetchAlreadyPublishedGameCover(id, publicPath!));
        continue;
      } catch (error) {
        missingReferences.push(`game-cover: ${id} (already-published fetch failed: ${error instanceof Error ? error.message : String(error)})`);
        continue;
      }
    }
    missingReferences.push(`game-cover: ${id}`);
  }

  const bundle = {
    version: 1,
    publishingRegistryVersion: publishSourceRegistry.version,
    exportedAt: new Date().toISOString(),
    origin: window.location.origin,
    drafts,
    projectCatalog,
    projectDocuments,
    gameExperience,
    uiPractice,
    images,
    diagnostics: {
      missingReferences,
      dynamicProjectWarnings,
      sourceAdapters: publishSourceRegistry.sources.map((source) => source.id),
      note: "This is a read-only export. Original localStorage and IndexedDB records remain unchanged.",
    },
  };

  if (options?.launcherRequestToken) {
    await deliverLauncherExport(bundle, options.launcherRequestToken);
  } else {
    downloadJson(bundle);
  }
  return { draftCount: Object.keys(drafts).length, imageCount: images.length, missingReferences, dynamicProjectWarnings };
}
