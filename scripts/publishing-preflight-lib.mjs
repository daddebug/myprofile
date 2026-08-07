import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const REGISTRY_PATH = path.join("src", "lib", "publishing", "publishSourceRegistry.json");
const FORBIDDEN_PUBLISHED_REFERENCE = /^(?:blob:|file:|https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/)|^[a-zA-Z]:[\\/]|^\/portfolio-assets\/|^\/__portfolio-content\//;
const RESOURCE_KEYS = new Set([
  "assetId", "posterAssetId", "imageId", "localImageId", "coverAssetId", "detectedCoverAssetId",
  "coverId", "gameId", "publicPath", "publicUrl", "posterPublicPath", "entryPublicPath", "figmaUrl", "sourceUrl", "embedUrl",
]);

const MIME_BY_EXTENSION = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".gif": "image/gif", ".avif": "image/avif", ".svg": "image/svg+xml", ".html": "text/html",
  ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".wasm": "application/wasm",
  ".data": "application/octet-stream", ".br": "application/octet-stream", ".unityweb": "application/octet-stream",
};

export async function readPublishSourceRegistry(root) {
  const registry = JSON.parse(await readFile(path.join(root, REGISTRY_PATH), "utf8"));
  if (registry?.version !== 1 || !Array.isArray(registry.sources)) throw new Error("Publishing source registry is invalid.");
  const ids = new Set();
  for (const source of registry.sources) {
    if (!source?.id || ids.has(source.id)) throw new Error(`Publishing source registry contains an invalid or duplicate ID: ${source?.id ?? "<missing>"}`);
    ids.add(source.id);
  }
  return registry;
}

function mimeFor(filePath, declared) {
  return declared || MIME_BY_EXTENSION[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function outputFor(adapterId, projectId, id, sourcePath) {
  const extension = path.extname(sourcePath || "") || ".bin";
  const safeId = String(id || "asset").replace(/[^a-zA-Z0-9._-]+/g, "-");
  const safeProject = String(projectId || "shared").replace(/[^a-zA-Z0-9._-]+/g, "-");
  if (adapterId === "project-covers-indexeddb" || adapterId === "project-covers-disk") return `public/images/published/covers/${safeId}${extension}`;
  if (adapterId === "project-body-indexeddb-assets") return `public/images/published/project-body/${safeProject}/${safeId}${extension}`;
  if (adapterId === "game-experience-covers") return `public/images/published/game-covers/${safeId}${extension}`;
  if (adapterId === "dynamic-template-images" || adapterId === "ui-practice-images") return `public/images/published/template-images/${safeProject}/${safeId}${extension}`;
  if (adapterId === "playable-game-covers") return `public/images/published/playable-game-covers/${safeProject}/${safeId}${extension}`;
  return undefined;
}

export function getPublishedAssetLocation(adapterId, projectId, id, sourcePath) {
  const relativePath = outputFor(adapterId, projectId, id, sourcePath);
  if (!relativePath) throw new Error(`Source adapter ${adapterId} has no file output strategy.`);
  return { relativePath, publicPath: `/${relativePath.replace(/^public\//, "")}` };
}

async function existsFile(filePath) {
  try { return (await stat(filePath)).isFile(); } catch { return false; }
}

async function fileInfo(root, relativePath, declaredMime) {
  const normalized = relativePath.replaceAll("\\", "/").replace(/^\//, "");
  const absolute = path.resolve(root, normalized);
  if (!absolute.toLowerCase().startsWith(`${path.resolve(root).toLowerCase()}${path.sep}`)) return { exists: false, byteSize: 0, mimeType: mimeFor(normalized, declaredMime) };
  try {
    const details = await stat(absolute);
    return { exists: details.isFile(), byteSize: details.isFile() ? details.size : 0, mimeType: mimeFor(normalized, declaredMime) };
  } catch {
    return { exists: false, byteSize: 0, mimeType: mimeFor(normalized, declaredMime) };
  }
}

async function walkFiles(directory, root = directory) {
  const output = [];
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); } catch { return output; }
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await walkFiles(absolute, root));
    else if (entry.isFile()) output.push({ absolute, relative: path.relative(root, absolute).replaceAll("\\", "/"), size: (await stat(absolute)).size });
  }
  return output;
}

function adapterForBundleImage(registry, image) {
  if (typeof image.sourceAdapterId === "string") return registry.sources.find((source) => source.id === image.sourceAdapterId);
  return registry.sources.find((source) => source.storage?.database === image.database && source.storage.store === image.store);
}

function collectContentTree(manifest, value, context, registryIds, bundleImageIds) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectContentTree(manifest, item, { ...context, fieldPath: `${context.fieldPath}[${index}]` }, registryIds, bundleImageIds));
    return;
  }
  const record = value;
  if (typeof record.templateId === "string") {
    manifest.contentRecords.push({
      recordId: typeof record.instanceId === "string" ? record.instanceId : `${context.projectId}:${context.fieldPath}`,
      projectId: context.projectId,
      sectionId: typeof record.regionId === "string" ? record.regionId : "content",
      sourceAdapterId: context.sourceAdapterId,
      sourcePath: context.fieldPath,
      contentType: `template:${record.templateId}`,
      status: "included",
    });
  }

  for (const [key, item] of Object.entries(record)) {
    const fieldPath = context.fieldPath ? `${context.fieldPath}.${key}` : key;
    if (typeof item === "string" && item.trim() && RESOURCE_KEYS.has(key)) {
      let adapterId;
      let referenceId = item;
      if (key === "figmaUrl" || key === "sourceUrl" || key === "embedUrl") adapterId = "external-embeds";
      else if (key === "localImageId") adapterId = "project-body-indexeddb-assets";
      else if (key === "assetId" || key === "posterAssetId") adapterId = "project-body-indexeddb-assets";
      else if (key === "coverAssetId" || key === "detectedCoverAssetId") adapterId = "game-experience-covers";
      else if (key === "gameId" || key === "entryPublicPath") adapterId = "playable-game-builds";
      else if (key === "coverId" && typeof record.publicUrl === "string") adapterId = "playable-game-covers";
      else if (key === "publicUrl" && typeof record.coverId === "string") adapterId = "playable-game-covers";
      else if (key === "imageId") adapterId = context.projectId === "ui-personal-practice" ? "ui-practice-images" : "dynamic-template-images";
      else if ((key === "publicPath" || key === "publicUrl") && typeof record.imageId === "string") {
        adapterId = context.projectId === "ui-personal-practice" ? "ui-practice-images" : "dynamic-template-images";
        referenceId = record.imageId;
      }
      else if (key === "publicPath" && typeof record.localImageId === "string") {
        adapterId = "project-body-indexeddb-assets";
        referenceId = record.localImageId;
      }
      else if ((key === "publicPath" || key === "posterPublicPath") && (typeof record.assetId === "string" || typeof record.posterAssetId === "string")) {
        adapterId = "project-body-indexeddb-assets";
        referenceId = typeof record.assetId === "string" ? record.assetId : record.posterAssetId;
      }
      else if ((key === "publicPath" || key === "publicUrl") && (typeof record.coverAssetId === "string" || typeof record.detectedCoverAssetId === "string")) {
        adapterId = "game-experience-covers";
        referenceId = typeof record.coverAssetId === "string" ? record.coverAssetId : record.detectedCoverAssetId;
      }
      else if (key === "entryPublicPath" && typeof record.gameId === "string") {
        adapterId = "playable-game-builds";
        referenceId = record.gameId;
      }
      if (!adapterId || !registryIds.has(adapterId)) {
        manifest.issues.push({ severity: "error", code: "UNHANDLED_RESOURCE_FIELD", sourceAdapterId: context.sourceAdapterId, sourcePath: fieldPath, message: `No registered source adapter handles ${key}.` });
      } else if (adapterId === "external-embeds") {
        const valid = /^https:\/\//i.test(item) && !/localhost|127\.0\.0\.1|appdata|\\temp\\/i.test(item);
        manifest.assets.push({ assetId: item, projectId: context.projectId, sourceAdapterId: adapterId, sourcePath: fieldPath, intendedProductionPath: item, byteSize: 0, mimeType: "text/uri-list", status: valid ? "external" : "invalid" });
        if (!valid) manifest.issues.push({ severity: "error", code: "INVALID_EXTERNAL_URL", sourceAdapterId: adapterId, sourcePath: fieldPath, message: `External resource is not a production-safe HTTPS URL: ${item}` });
      } else if (["imageId", "localImageId", "assetId", "posterAssetId", "coverAssetId", "detectedCoverAssetId", "gameId", "coverId"].includes(key)) {
        const hasBundleAsset = bundleImageIds.has(`${adapterId}\u0000${referenceId}`);
        manifest.assets.push({ assetId: referenceId, projectId: context.projectId, sourceAdapterId: adapterId, sourcePath: fieldPath, intendedProductionPath: null, byteSize: 0, mimeType: "application/octet-stream", status: hasBundleAsset ? "collected" : "discovered" });
      }
    }
    collectContentTree(manifest, item, { ...context, fieldPath }, registryIds, bundleImageIds);
  }
}

async function addDiskManifests(root, manifest, registryIds) {
  const projectsRoot = path.join(root, "content", "projects");
  let projectEntries = [];
  try { projectEntries = await readdir(projectsRoot, { withFileTypes: true }); } catch { return; }

  const coverManifestPath = path.join(projectsRoot, "project-covers.json");
  if (await existsFile(coverManifestPath)) {
    const covers = JSON.parse(await readFile(coverManifestPath, "utf8"));
    manifest.contentRecords.push({ recordId: "project-covers", sourceAdapterId: "project-covers-disk", sourcePath: "content/projects/project-covers.json", contentType: "asset-manifest", status: "included" });
    for (const [projectId, record] of Object.entries(covers.covers || {})) {
      const sourcePath = record.sourceRelativePath || record.publicRelativePath || "";
      const info = await fileInfo(root, sourcePath, record.format ? `image/${record.format === "jpg" ? "jpeg" : record.format}` : undefined);
      const status = info.exists ? "available" : "missing";
      manifest.assets.push({ assetId: projectId, projectId, sourceAdapterId: "project-covers-disk", sourcePath, intendedProductionPath: outputFor("project-covers-disk", projectId, projectId, sourcePath), ...info, status });
      if (!info.exists) manifest.issues.push({ severity: "error", code: "MISSING_PROJECT_COVER", sourceAdapterId: "project-covers-disk", sourcePath, message: `Project cover source is missing for ${projectId}.` });
    }
  }

  for (const entry of projectEntries) {
    if (!entry.isDirectory()) continue;
    const projectId = entry.name;
    const imageManifest = path.join(projectsRoot, projectId, "project-images.json");
    if (await existsFile(imageManifest)) {
      const value = JSON.parse(await readFile(imageManifest, "utf8"));
      const adapterId = projectId === "ui-personal-practice" ? "ui-practice-images" : "dynamic-template-images";
      manifest.contentRecords.push({ recordId: `${projectId}:project-images`, projectId, sourceAdapterId: adapterId, sourcePath: path.relative(root, imageManifest).replaceAll("\\", "/"), contentType: "asset-manifest", status: "included" });
      for (const record of Object.values(value.images || {})) {
        const sourcePath = record.sourcePath || record.sourceRelativePath || record.publicPath || "";
        const info = await fileInfo(root, sourcePath, record.format ? `image/${record.format === "jpg" ? "jpeg" : record.format}` : undefined);
        const status = info.exists ? "available" : "missing";
        manifest.assets.push({ assetId: record.imageId, projectId, sourceAdapterId: adapterId, sourcePath, intendedProductionPath: outputFor(adapterId, projectId, record.imageId, sourcePath), ...info, status });
        if (!info.exists) manifest.issues.push({ severity: "error", code: "MISSING_PROJECT_IMAGE", sourceAdapterId: adapterId, sourcePath, message: `Project image ${record.imageId} is missing.` });
      }
    }

    const playableManifest = path.join(projectsRoot, projectId, "playable-games.json");
    if (await existsFile(playableManifest)) {
      const value = JSON.parse(await readFile(playableManifest, "utf8"));
      manifest.contentRecords.push({ recordId: `${projectId}:playable-games`, projectId, sourceAdapterId: "playable-game-builds", sourcePath: path.relative(root, playableManifest).replaceAll("\\", "/"), contentType: "asset-tree-manifest", status: "included" });
      for (const game of value.games || []) {
        const publicDirectory = game.publicDirectory || `public${game.entryPublicPath?.replace(/\/index\.html$/i, "") || ""}`;
        const files = await walkFiles(path.resolve(root, publicDirectory));
        if (!files.length) manifest.issues.push({ severity: "error", code: "MISSING_PLAYABLE_BUILD", sourceAdapterId: "playable-game-builds", sourcePath: publicDirectory, message: `Playable build ${game.gameId} has no files.` });
        manifest.assets.push({ assetId: game.gameId, projectId, sourceAdapterId: "playable-game-builds", sourcePath: publicDirectory, intendedProductionPath: `public/playable-games/${projectId}/${game.gameId}/`, byteSize: files.reduce((total, file) => total + file.size, 0), mimeType: "application/x-directory", status: files.length ? "available" : "missing" });
        for (const file of files) manifest.assets.push({ assetId: `${game.gameId}:${file.relative}`, projectId, sourceAdapterId: "playable-game-builds", sourcePath: path.relative(root, file.absolute).replaceAll("\\", "/"), intendedProductionPath: `public/playable-games/${projectId}/${game.gameId}/${file.relative}`, byteSize: file.size, mimeType: mimeFor(file.relative), status: "available" });
      }
      for (const cover of value.covers || []) {
        const sourcePath = cover.sourceRelativePath || cover.publicRelativePath || "";
        const info = await fileInfo(root, sourcePath, cover.format ? `image/${cover.format === "jpg" ? "jpeg" : cover.format}` : undefined);
        const status = info.exists ? "available" : "missing";
        manifest.assets.push({ assetId: cover.coverId, projectId, sourceAdapterId: "playable-game-covers", sourcePath, intendedProductionPath: outputFor("playable-game-covers", projectId, cover.coverId, sourcePath), ...info, status });
        if (!info.exists) manifest.issues.push({ severity: "error", code: "MISSING_PLAYABLE_COVER", sourceAdapterId: "playable-game-covers", sourcePath, message: `Playable cover ${cover.coverId} is missing.` });
      }
    }
  }

  for (const id of ["project-covers-disk", "dynamic-template-images", "ui-practice-images", "playable-game-builds", "playable-game-covers"]) {
    if (!registryIds.has(id) && manifest.assets.some((asset) => asset.sourceAdapterId === id)) manifest.issues.push({ severity: "error", code: "DISCOVERED_UNREGISTERED_SOURCE_FAMILY", sourceAdapterId: id, message: `Discovered source family ${id} is not represented in the registry.` });
  }

  const bundledUiDirectory = path.join(root, "src", "assets", "ui-practice-optimized");
  for (const file of await walkFiles(bundledUiDirectory)) {
    manifest.assets.push({ assetId: file.relative, projectId: "ui-personal-practice", sourceAdapterId: "ui-practice-bundled-images", sourcePath: path.relative(root, file.absolute).replaceAll("\\", "/"), intendedProductionPath: "dist/assets/<vite-hash>", byteSize: file.size, mimeType: mimeFor(file.relative), status: "available" });
  }

  const legacyGameDirectory = path.join(root, "public", "games", "afterwarm");
  for (const file of await walkFiles(legacyGameDirectory)) {
    manifest.assets.push({ assetId: `afterwarm:${file.relative}`, sourceAdapterId: "legacy-static-game-build", sourcePath: path.relative(root, file.absolute).replaceAll("\\", "/"), intendedProductionPath: `dist/games/afterwarm/${file.relative}`, byteSize: file.size, mimeType: mimeFor(file.relative), status: "available" });
  }
}

export async function buildPublishingPreflight({ root, bundle, rewrittenOutput }) {
  const registry = await readPublishSourceRegistry(root);
  const registryIds = new Set(registry.sources.map((source) => source.id));
  const manifest = {
    version: 1,
    registryVersion: registry.version,
    generatedAt: new Date().toISOString(),
    projects: [],
    contentRecords: [],
    assets: [],
    sources: registry.sources.map((source) => ({ sourceAdapterId: source.id, sourceType: source.sourceType, discoveredRecords: 0, discoveredAssets: 0, status: "not-discovered", issues: [] })),
    issues: [],
    ok: false,
  };

  const bundleImages = Array.isArray(bundle?.images) ? bundle.images : [];
  const bundleImageIds = new Set();
  for (const image of bundleImages) {
    const adapter = adapterForBundleImage(registry, image);
    if (!adapter) {
      manifest.issues.push({ severity: "error", code: "UNREGISTERED_BUNDLE_ASSET", sourceAdapterId: "unknown", sourcePath: `${image?.database ?? "?"}/${image?.store ?? "?"}/${image?.id ?? "?"}`, message: "Exported asset has no registered source adapter." });
      continue;
    }
    bundleImageIds.add(`${adapter.id}\u0000${image.id}`);
    const byteSize = typeof image.size === "number" ? image.size : Buffer.from(image.dataBase64 || "", "base64").length;
    manifest.assets.push({ assetId: image.id, projectId: image.projectId, sourceAdapterId: adapter.id, sourcePath: `browser:${image.database}/${image.store}/${image.id}`, intendedProductionPath: outputFor(adapter.id, image.projectId, image.id, image.fileName), byteSize, mimeType: mimeFor(image.fileName || "", image.mimeType), status: "collected" });
  }

  const catalog = bundle?.projectCatalog?.version === 1 ? bundle.projectCatalog : bundle?.publicMetadata;
  const projectIds = Array.isArray(catalog?.projectIds) ? catalog.projectIds : Object.keys(catalog?.projects || {});
  for (const projectId of projectIds) {
    manifest.projects.push({ projectId, sourceAdapterId: "project-catalog", status: "included", sections: [] });
    manifest.contentRecords.push({ recordId: projectId, projectId, sourceAdapterId: "project-catalog", sourcePath: `projectCatalog.projects.${projectId}`, contentType: "project-metadata", status: "included" });
  }

  for (const [projectId, draft] of Object.entries(bundle?.drafts || {})) {
    const templateInstances = Array.isArray(draft?.templateInstances) ? draft.templateInstances : [];
    manifest.contentRecords.push({ recordId: `${projectId}:draft`, projectId, sourceAdapterId: "dynamic-project-drafts", sourcePath: `drafts.${projectId}`, contentType: "dynamic-project-draft", status: "included" });
    const project = manifest.projects.find((candidate) => candidate.projectId === projectId);
    if (project) project.sections = templateInstances.map((instance) => ({ instanceId: instance.instanceId, templateId: instance.templateId, regionId: instance.regionId || "content" }));
    collectContentTree(manifest, draft, { projectId, sourceAdapterId: "dynamic-project-drafts", fieldPath: `drafts.${projectId}` }, registryIds, bundleImageIds);
  }
  for (const [projectId] of Object.entries(bundle?.projectDocuments?.documents || {})) {
    manifest.contentRecords.push({ recordId: `${projectId}:project-document`, projectId, sourceAdapterId: "project-documents", sourcePath: `projectDocuments.documents.${projectId}`, contentType: "project-document", status: "included" });
  }
  for (const item of Array.isArray(bundle?.uiPractice?.items) ? bundle.uiPractice.items : []) {
    manifest.contentRecords.push({ recordId: item.id || `ui-practice:${manifest.contentRecords.length}`, projectId: "ui-personal-practice", sectionId: "gallery", sourceAdapterId: "ui-practice-metadata", sourcePath: "uiPractice.items", contentType: "ui-practice-item", status: "included" });
  }
  for (const record of Array.isArray(bundle?.gameExperience?.records) ? bundle.gameExperience.records : []) {
    manifest.contentRecords.push({ recordId: record.id || `game-experience:${manifest.contentRecords.length}`, sourceAdapterId: "game-experience-records", sourcePath: "gameExperience.records", contentType: "game-experience-record", status: "included" });
  }
  collectContentTree(manifest, bundle?.projectDocuments, { sourceAdapterId: "project-documents", fieldPath: "projectDocuments" }, registryIds, bundleImageIds);
  collectContentTree(manifest, bundle?.uiPractice, { projectId: "ui-personal-practice", sourceAdapterId: "ui-practice-metadata", fieldPath: "uiPractice" }, registryIds, bundleImageIds);
  collectContentTree(manifest, bundle?.gameExperience, { sourceAdapterId: "game-experience-records", fieldPath: "gameExperience" }, registryIds, bundleImageIds);
  await addDiskManifests(root, manifest, registryIds);

  const collected = new Set(manifest.assets.filter((asset) => asset.status === "collected" || asset.status === "available" || asset.status === "external").map((asset) => `${asset.sourceAdapterId}\u0000${asset.assetId}`));
  for (const asset of manifest.assets) {
    if (asset.status !== "discovered") continue;
    if (!collected.has(`${asset.sourceAdapterId}\u0000${asset.assetId}`)) manifest.issues.push({ severity: "error", code: "MISSING_REFERENCED_ASSET", sourceAdapterId: asset.sourceAdapterId, sourcePath: asset.sourcePath, message: `Referenced asset ${asset.assetId} was not collected.` });
  }

  if (rewrittenOutput) {
    const publishedReferences = new Set();
    const inspect = (value, fieldPath = "output") => {
      if (typeof value === "string" && FORBIDDEN_PUBLISHED_REFERENCE.test(value)) manifest.issues.push({ severity: "error", code: "FORBIDDEN_PUBLISHED_REFERENCE", sourceAdapterId: "published-assets", sourcePath: fieldPath, message: `Published data still contains a local or development-only reference: ${value}` });
      else if (typeof value === "string" && value.startsWith("/images/published/")) publishedReferences.add(value);
      else if (Array.isArray(value)) value.forEach((item, index) => inspect(item, `${fieldPath}[${index}]`));
      else if (value && typeof value === "object") Object.entries(value).forEach(([key, item]) => inspect(item, `${fieldPath}.${key}`));
    };
    inspect(rewrittenOutput);
    const intendedReferences = new Set(manifest.assets.flatMap((asset) => typeof asset.intendedProductionPath === "string" && asset.intendedProductionPath.startsWith("public/images/published/") ? [`/${asset.intendedProductionPath.replace(/^public\//, "")}`] : []));
    for (const reference of publishedReferences) {
      if (!intendedReferences.has(reference)) manifest.issues.push({ severity: "error", code: "PUBLISHED_FILE_NOT_IN_OUTPUT", sourceAdapterId: "published-assets", sourcePath: reference, message: `Published metadata references a file that is not included in the output manifest: ${reference}` });
    }
  }

  for (const source of manifest.sources) {
    source.discoveredRecords = manifest.contentRecords.filter((record) => record.sourceAdapterId === source.sourceAdapterId).length;
    source.discoveredAssets = manifest.assets.filter((asset) => asset.sourceAdapterId === source.sourceAdapterId).length;
    source.issues = manifest.issues.filter((issue) => issue.sourceAdapterId === source.sourceAdapterId);
    source.status = source.issues.some((issue) => issue.severity === "error") ? "failed" : source.discoveredRecords || source.discoveredAssets ? "passed" : "not-discovered";
  }
  manifest.ok = !manifest.issues.some((issue) => issue.severity === "error");
  return manifest;
}
