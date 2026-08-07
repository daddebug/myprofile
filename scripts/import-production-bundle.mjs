import { mkdir, readFile, writeFile, copyFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const OFFICIAL_ROOT = path.resolve("D:/myprofilegit/myprofile");
const OUTPUT_DATA = path.join("src", "data", "publishedPortfolio.json");
const OUTPUT_ASSET_ROOT = path.join("public", "images", "published");
const CONFIRM_FLAG = "--confirm";

const draftImageSources = {
  "from-theme-to-playable-rule": {
    database: "dilida-portfolio-game-jam-draft-assets",
    store: "images",
  },
};

const coverSource = {
  database: "dilida-portfolio-public-project-assets",
  store: "projectCovers",
};

const projectBodySource = {
  database: "dilida-portfolio-project-body-assets",
  store: "assets",
};

const gameCoverSource = {
  database: "dilida-portfolio-game-assets",
  store: "covers",
};

// Matches templateImageSource in src/lib/productionBundleExport.ts — the
// symbolic tag for template-instance images staged via
// stageDynamicProjectImage() (imageId/publicPath pairs), fetched from the
// dev server's already-serving public/portfolio-assets/ URL rather than read
// from an IndexedDB blob.
const templateImageSource = {
  database: "dilida-portfolio-template-images",
  store: "images",
};

function fail(message) {
  console.error(`\nERROR: ${message}\n`);
  process.exit(1);
}

function safeSegment(value) {
  return value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100) || "asset";
}

function extensionFor(image) {
  const extension = path.extname(image.fileName || "").toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif"].includes(extension)) return extension;
  return {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/avif": ".avif",
    "image/gif": ".gif",
  }[image.mimeType] || ".bin";
}

function imageKey(database, store, id) {
  return `${database}\u0000${store}\u0000${id}`;
}

function replaceImagePaths(value, imagePathById, missing) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => replaceImagePaths(item, imagePathById, missing));

  const output = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = replaceImagePaths(item, imagePathById, missing);
  }

  const refId = typeof value.localImageId === "string" && value.localImageId
    ? value.localImageId
    : typeof value.imageId === "string" && value.imageId
      ? value.imageId
      : null;
  if (refId) {
    const publicPath = imagePathById.get(refId);
    if (publicPath) output.publicPath = publicPath;
    else missing.add(refId);
  }
  return output;
}

function replaceDocumentAssetPaths(value, imagePathById, missing) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => replaceDocumentAssetPaths(item, imagePathById, missing));
  const output = Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, replaceDocumentAssetPaths(item, imagePathById, missing)]),
  );
  if (typeof value.assetId === "string" && value.assetId) {
    const publicPath = imagePathById.get(value.assetId);
    if (publicPath) output.publicPath = publicPath;
    else if (!value.publicPath) missing.add(value.assetId);
  }
  return output;
}

async function backupIfPresent(root, relativePath, backupRoot) {
  const source = path.join(root, relativePath);
  try {
    const file = await stat(source);
    if (!file.isFile()) return;
  } catch {
    return;
  }
  const destination = path.join(backupRoot, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

const args = process.argv.slice(2);
const confirm = args.includes(CONFIRM_FLAG);
const bundleArgument = args.find((argument) => argument !== CONFIRM_FLAG && argument !== "--");
if (!bundleArgument) {
  fail("Provide the downloaded export JSON path. Example: pnpm portfolio:import -- C:\\Users\\you\\Downloads\\portfolio-production-export.json");
}

const cwd = path.resolve(process.cwd());
if (cwd.toLowerCase() !== OFFICIAL_ROOT.toLowerCase()) {
  fail(`Run this command from ${OFFICIAL_ROOT}. Current directory: ${cwd}`);
}

let bundle;
try {
  bundle = JSON.parse(await readFile(path.resolve(bundleArgument), "utf8"));
} catch (error) {
  fail(`Cannot read export bundle: ${error instanceof Error ? error.message : String(error)}`);
}

if (!bundle || bundle.version !== 1 || typeof bundle.drafts !== "object" || !Array.isArray(bundle.images)) {
  fail("The selected file is not a supported version-1 portfolio production export.");
}

const reportedMissing = Array.isArray(bundle.diagnostics?.missingReferences)
  ? bundle.diagnostics.missingReferences
  : [];
if (reportedMissing.length) {
  fail(`The browser export reported missing image references:\n- ${reportedMissing.join("\n- ")}`);
}

const catalogStore = bundle.projectCatalog?.version === 1
  ? bundle.projectCatalog
  : bundle.publicMetadata?.version === 1
    ? bundle.publicMetadata
    : { version: 1, projects: {} };
const retiredProjectIds = new Set([
  "game-ux-case-study",
  "ktv-tablet-interface",
  "playable-web-game-prototype",
  "visual-system-ui-art",
]);
const exportedProjectIds = Array.isArray(catalogStore.projectIds)
  ? catalogStore.projectIds
  : Object.keys(catalogStore.projects ?? {});
const canonicalProjectIds = new Set(exportedProjectIds.filter((projectId) => typeof projectId === "string"));
const ignoredProjectIds = [];
const ignoredCoverIds = [];
const storedCatalog = catalogStore.projects && typeof catalogStore.projects === "object"
  ? Object.fromEntries(Object.entries(catalogStore.projects).flatMap(([projectId, project]) => {
      if (retiredProjectIds.has(projectId) || !canonicalProjectIds.has(projectId)) {
        ignoredProjectIds.push(projectId);
        return [];
      }
      if (!project || typeof project !== "object" || Array.isArray(project)) return [[projectId, project]];
      const { homepageGroup: _legacyHomepageGroup, homepageOrder: _legacyHomepageOrder, ...canonicalProject } = project;
      return [[projectId, canonicalProject]];
    }))
  : {};

const assets = [];
const imagePathsByProject = new Map();
const projectBodyPaths = new Map();
const templateImagePaths = new Map();
const gameCoverPaths = new Map();
const covers = {};

for (const image of bundle.images) {
  if (!image || typeof image.id !== "string" || typeof image.dataBase64 !== "string") {
    fail("The export contains an invalid image record.");
  }
  const isCover = image.database === coverSource.database && image.store === coverSource.store;
  const isProjectBody = image.database === projectBodySource.database && image.store === projectBodySource.store;
  const isGameCover = image.database === gameCoverSource.database && image.store === gameCoverSource.store;
  const isTemplateImage = image.database === templateImageSource.database && image.store === templateImageSource.store;
  if (isCover && !canonicalProjectIds.has(image.id)) {
    ignoredCoverIds.push(image.id);
    continue;
  }
  if (isTemplateImage && !(typeof image.projectId === "string" && canonicalProjectIds.has(image.projectId))) {
    fail(`Template image ${image.id} is not attached to a canonical project (projectId: ${image.projectId ?? "<missing>"}).`);
  }
  const owner = isCover
    ? "covers"
    : isGameCover
      ? "game-covers"
    : isProjectBody && typeof image.projectId === "string" && canonicalProjectIds.has(image.projectId)
      ? path.posix.join("project-body", image.projectId)
    : isTemplateImage
      ? path.posix.join("template-images", image.projectId)
    : Object.entries(draftImageSources).find(([, source]) => source.database === image.database && source.store === image.store)?.[0];
  if (!owner) fail(`Unknown image source: ${image.database}/${image.store}/${image.id}`);

  const relativePath = path.posix.join(
    OUTPUT_ASSET_ROOT.replaceAll("\\", "/"),
    safeSegment(owner),
    `${safeSegment(image.id)}${extensionFor(image)}`,
  );
  const publicPath = `/${relativePath.replace(/^public\//, "")}`;
  const asset = {
    sourceDatabase: image.database,
    sourceStore: image.store,
    sourceId: image.id,
    relativePath,
    publicPath,
    bytes: Buffer.from(image.dataBase64, "base64"),
  };
  assets.push(asset);
  if (isCover) covers[image.id] = publicPath;
  else if (isGameCover) gameCoverPaths.set(image.id, publicPath);
  else if (isProjectBody) projectBodyPaths.set(image.id, publicPath);
  else if (isTemplateImage) templateImagePaths.set(image.id, publicPath);
  else {
    if (!imagePathsByProject.has(owner)) imagePathsByProject.set(owner, new Map());
    imagePathsByProject.get(owner).set(image.id, publicPath);
  }
}

const missing = new Set();
const drafts = {};
for (const [projectId, draft] of Object.entries(bundle.drafts)) {
  // Some template-instance images (e.g. older image-row items on dynamic
  // projects) reference localImageId values that live in the project-body
  // asset store (projectBodyPaths) rather than a per-project
  // draftImageSources bucket; others reference imageId values staged to disk
  // (templateImagePaths). Merging all three lookups here is additive only —
  // it changes nothing for existing static-project drafts that have neither.
  const projectImagePaths = new Map([...(imagePathsByProject.get(projectId) ?? new Map()), ...projectBodyPaths, ...templateImagePaths]);
  drafts[projectId] = replaceImagePaths(draft, projectImagePaths, missing);
}
if (missing.size) fail(`Referenced image data is missing from the bundle:\n- ${[...missing].join("\n- ")}`);

const rawProjectDocuments = bundle.projectDocuments?.version === 1 && bundle.projectDocuments.documents && typeof bundle.projectDocuments.documents === "object"
  ? bundle.projectDocuments.documents
  : {};
const projectDocuments = {
  version: 1,
  documents: Object.fromEntries(Object.entries(rawProjectDocuments).flatMap(([projectId, document]) => {
    if (!canonicalProjectIds.has(projectId) || !document || typeof document !== "object" || document.schemaVersion !== 1) return [];
    return [[projectId, replaceDocumentAssetPaths(document, projectBodyPaths, missing)]];
  })),
};
if (missing.size) fail(`Referenced project-body image data is missing from the bundle:\n- ${[...missing].join("\n- ")}`);

const rawGameExperience = bundle.gameExperience?.schemaVersion === 1 && Array.isArray(bundle.gameExperience.records)
  ? bundle.gameExperience
  : null;
const ignoredGameRecordIds = [];
const seenGameRecordIds = new Set();
const gameExperience = rawGameExperience
  ? {
      ...rawGameExperience,
      records: rawGameExperience.records.flatMap((record) => {
        if (!record || typeof record !== "object" || typeof record.id !== "string" || !record.id || record.schemaVersion !== 1 || seenGameRecordIds.has(record.id)) {
          ignoredGameRecordIds.push(typeof record?.id === "string" ? record.id : "<invalid>");
          return [];
        }
        seenGameRecordIds.add(record.id);
        const presentation = record.presentation && typeof record.presentation === "object" ? record.presentation : {};
        const detail = record.detail && typeof record.detail === "object" ? record.detail : {};
        const coverAssetId = typeof presentation.coverAssetId === "string" ? presentation.coverAssetId : "";
        const coverPublicPath = coverAssetId ? gameCoverPaths.get(coverAssetId) : undefined;
        if (coverAssetId && !coverPublicPath && !presentation.coverPublicPath) missing.add(coverAssetId);
        return [{
          ...record,
          detail: {
            zh: typeof detail.zh === "string" ? detail.zh : "",
            en: typeof detail.en === "string" ? detail.en : "",
          },
          presentation: { ...presentation, ...(coverPublicPath ? { coverPublicPath } : {}) },
        }];
      }),
    }
  : undefined;
if (missing.size) fail(`Referenced game-cover data is missing from the bundle:\n- ${[...missing].join("\n- ")}`);

const output = {
  version: 1,
  generatedAt: bundle.exportedAt || new Date().toISOString(),
  drafts,
  projectCatalog: storedCatalog,
  projectDocuments,
  ...(gameExperience ? { gameExperience } : {}),
  covers,
  assets: assets.map(({ sourceDatabase, sourceStore, sourceId, publicPath }) => ({
    sourceDatabase,
    sourceStore,
    sourceId,
    publicPath,
  })),
};

console.log("\nPortfolio production import review");
console.log(`  Drafts: ${Object.keys(drafts).length}`);
console.log(`  Images: ${assets.length}`);
console.log(`  Homepage covers: ${Object.keys(covers).length}`);
console.log(`  Canonical projects: ${Object.keys(storedCatalog).length}`);
console.log(`  Data-driven project documents: ${Object.keys(projectDocuments.documents).length}`);
console.log(`  Game Experience records: ${gameExperience?.records?.length ?? 0}`);
if (ignoredProjectIds.length) console.log(`  Ignored legacy project IDs: ${ignoredProjectIds.join(", ")}`);
if (ignoredCoverIds.length) console.log(`  Ignored non-canonical cover IDs: ${ignoredCoverIds.join(", ")}`);
if (ignoredGameRecordIds.length) console.log(`  Ignored invalid/duplicate game records: ${ignoredGameRecordIds.join(", ")}`);
console.log(`  Output data: ${OUTPUT_DATA}`);
console.log(`  Asset root: ${OUTPUT_ASSET_ROOT}`);
console.log("  Original browser data: unchanged");
console.log("  Existing published files: never deleted");

if (!confirm) {
  console.log("\nDRY RUN ONLY. Review the summary, then repeat with --confirm to write version-controlled files.");
  process.exit(0);
}

const backupTimestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupRoot = path.join(cwd, ".local-backups", `production-import-${backupTimestamp}`);
await backupIfPresent(cwd, OUTPUT_DATA, backupRoot);
for (const asset of assets) await backupIfPresent(cwd, asset.relativePath, backupRoot);

for (const asset of assets) {
  const destination = path.join(cwd, asset.relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, asset.bytes);
}
await mkdir(path.dirname(path.join(cwd, OUTPUT_DATA)), { recursive: true });
await writeFile(path.join(cwd, OUTPUT_DATA), `${JSON.stringify(output, null, 2)}\n`, "utf8");

console.log(`\nImported safely. Backup snapshot: ${backupRoot}`);
console.log("Run pnpm portfolio:check before publishing.");
