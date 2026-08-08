import { mkdir, readFile, writeFile, copyFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { buildPublishingPreflight, getPublishedAssetLocation, readPublishSourceRegistry } from "./publishing-preflight-lib.mjs";
import { writeBlockedPublishReport, writePublishPlanReport } from "./publishing-report-lib.mjs";

const OFFICIAL_ROOT = path.resolve("D:/myprofilegit/myprofile");
const OUTPUT_DATA = path.join("src", "data", "publishedPortfolio.json");
const OUTPUT_UI_PRACTICE_DATA = path.join("src", "data", "uiPracticeMetadata.json");
const OUTPUT_ASSET_ROOT = path.join("public", "images", "published");
const CONFIRM_FLAG = "--confirm";
const PRODUCTION_URL = "https://myprofile-teal.vercel.app/zh/";

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
  // PlayableGameTemplate's own launch cover: { coverId, publicUrl } shape,
  // distinct from the imageId/localImageId shape above — rewrites publicUrl
  // in place (that field's real name in this shape) rather than publicPath.
  if (typeof value.coverId === "string" && value.coverId && typeof value.publicUrl === "string") {
    const publicPath = imagePathById.get(value.coverId);
    if (publicPath) output.publicUrl = publicPath;
    else missing.add(value.coverId);
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

const EXCLUDE_PROJECT_PREFIX = "--exclude-project=";

const args = process.argv.slice(2);
const confirm = args.includes(CONFIRM_FLAG);
const bundleArgument = args.find((argument) => argument !== CONFIRM_FLAG && argument !== "--" && !argument.startsWith(EXCLUDE_PROJECT_PREFIX));
if (!bundleArgument) {
  fail("Provide the downloaded export JSON path. Example: pnpm portfolio:import -- C:\\Users\\you\\Downloads\\portfolio-production-export.json");
}
// Explicit, per-run, CLI-visible exclusion — never a silent default. Used
// when a specific project's content is known-blocked by an unrelated,
// already-tracked issue (e.g. Playable Game production hosting is
// unresolved — see TASKS.md) and the rest of the bundle should still
// publish. Excluded projects are removed from the bundle entirely before
// preflight/rewrite ever sees them, so today's publish neither includes nor
// silently drops/corrupts their content — their currently-live production
// state (already-published data) is simply left untouched by this run.
const excludeProjectIds = new Set(
  args.filter((argument) => argument.startsWith(EXCLUDE_PROJECT_PREFIX))
    .flatMap((argument) => argument.slice(EXCLUDE_PROJECT_PREFIX.length).split(",").map((id) => id.trim()).filter(Boolean)),
);

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

if (excludeProjectIds.size) {
  const missingFromBundle = [...excludeProjectIds].filter((id) => !(id in bundle.drafts) && !bundle.images.some((image) => image.projectId === id));
  if (missingFromBundle.length) fail(`--exclude-project referenced a project not present in this export: ${missingFromBundle.join(", ")}`);
  console.log(`Excluding from this publish (explicit --exclude-project): ${[...excludeProjectIds].join(", ")}`);
  for (const id of excludeProjectIds) delete bundle.drafts[id];
  bundle.images = bundle.images.filter((image) => image.projectId === undefined || !excludeProjectIds.has(image.projectId));
  if (bundle.projectCatalog?.projectIds) bundle.projectCatalog.projectIds = bundle.projectCatalog.projectIds.filter((id) => !excludeProjectIds.has(id));
  if (bundle.projectCatalog?.projects) for (const id of excludeProjectIds) delete bundle.projectCatalog.projects[id];
  if (bundle.projectDocuments?.documents) for (const id of excludeProjectIds) delete bundle.projectDocuments.documents[id];
  if (Array.isArray(bundle.diagnostics?.missingReferences)) {
    bundle.diagnostics.missingReferences = bundle.diagnostics.missingReferences.filter((entry) => ![...excludeProjectIds].some((id) => entry.startsWith(`${id}:`)));
  }
}

const registry = await readPublishSourceRegistry(cwd);
if (bundle.publishingRegistryVersion !== registry.version) {
  fail(`The export was not generated with publishing registry version ${registry.version}. Create a fresh browser export before publishing.`);
}
const adapterById = new Map(registry.sources.map((source) => [source.id, source]));
const preflight = await buildPublishingPreflight({ root: cwd, bundle });
const preflightPath = path.join(cwd, "output", "publishing-preflight-manifest.json");
await mkdir(path.dirname(preflightPath), { recursive: true });
await writeFile(preflightPath, `${JSON.stringify(preflight, null, 2)}\n`, "utf8");
if (!preflight.ok) {
  await writeBlockedPublishReport({
    root: cwd,
    manifest: preflight,
    catalog: bundle.projectCatalog?.projects ?? bundle.publicMetadata?.projects ?? {},
    productionUrl: PRODUCTION_URL,
  });
  const failures = preflight.issues
    .filter((issue) => issue.severity === "error")
    .map((issue) => `${issue.sourceAdapterId}: ${issue.message}`);
  fail(`Publishing preflight failed. No production files were changed.\nManifest: ${preflightPath}\n- ${failures.join("\n- ")}`);
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
const playableGameCoverPaths = new Map();
const covers = {};

for (const image of bundle.images) {
  if (!image || typeof image.id !== "string" || typeof image.dataBase64 !== "string") {
    fail("The export contains an invalid image record.");
  }
  const adapter = typeof image.sourceAdapterId === "string" ? adapterById.get(image.sourceAdapterId) : undefined;
  if (!adapter) fail(`Unknown or missing source adapter for ${image.database}/${image.store}/${image.id}.`);
  const isCover = adapter.id === "project-covers-indexeddb" || adapter.id === "project-covers-disk";
  const isProjectBody = adapter.id === "project-body-indexeddb-assets";
  const isGameCover = adapter.id === "game-experience-covers";
  const isPlayableGameCover = adapter.id === "playable-game-covers";
  const isTemplateImage = adapter.id === "dynamic-template-images" || adapter.id === "ui-practice-images";
  if (isCover && !canonicalProjectIds.has(image.id)) {
    ignoredCoverIds.push(image.id);
    continue;
  }
  if ((isTemplateImage || isPlayableGameCover) && !(typeof image.projectId === "string" && canonicalProjectIds.has(image.projectId))) {
    fail(`Image ${image.id} is not attached to a canonical project (projectId: ${image.projectId ?? "<missing>"}).`);
  }
  const owner = isCover
    ? "covers"
    : isGameCover
      ? "game-covers"
    : isPlayableGameCover
      ? path.posix.join("playable-game-covers", image.projectId)
    : isProjectBody && typeof image.projectId === "string" && canonicalProjectIds.has(image.projectId)
      ? path.posix.join("project-body", image.projectId)
    : isTemplateImage
      ? path.posix.join("template-images", image.projectId)
    : undefined;
  if (!owner) fail(`Unknown image source: ${image.database}/${image.store}/${image.id}`);

  const { relativePath, publicPath } = getPublishedAssetLocation(adapter.id, image.projectId, image.id, `${safeSegment(image.id)}${extensionFor(image)}`);
  const asset = {
    sourceAdapterId: adapter.id,
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
  else if (isPlayableGameCover) playableGameCoverPaths.set(image.id, publicPath);
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
  const projectImagePaths = new Map([...(imagePathsByProject.get(projectId) ?? new Map()), ...projectBodyPaths, ...templateImagePaths, ...playableGameCoverPaths]);
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

const uiPractice = bundle.uiPractice?.version === 1 && Array.isArray(bundle.uiPractice.items)
  ? replaceImagePaths(bundle.uiPractice, templateImagePaths, missing)
  : undefined;
if (missing.size) fail(`Referenced UI Practice image data is missing from the bundle:\n- ${[...missing].join("\n- ")}`);

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

// Restore each excluded project's CURRENT published state exactly as-is —
// this run's bundle never contained their content past this point (see the
// exclusion filter above), so without this they would simply vanish from
// publishedPortfolio.json instead of staying untouched.
if (excludeProjectIds.size) {
  let currentPublished = null;
  try {
    currentPublished = JSON.parse(await readFile(path.join(cwd, OUTPUT_DATA), "utf8"));
  } catch (error) {
    fail(`--exclude-project requires the current ${OUTPUT_DATA} to be readable, to preserve excluded projects' existing state: ${error instanceof Error ? error.message : String(error)}`);
  }
  for (const id of excludeProjectIds) {
    if (currentPublished?.projectCatalog?.[id]) storedCatalog[id] = currentPublished.projectCatalog[id];
    if (currentPublished?.drafts?.[id]) drafts[id] = currentPublished.drafts[id];
    if (currentPublished?.projectDocuments?.documents?.[id]) projectDocuments.documents[id] = currentPublished.projectDocuments.documents[id];
    if (currentPublished?.covers?.[id]) covers[id] = currentPublished.covers[id];
  }
  console.log(`Preserved existing published state for excluded project(s): ${[...excludeProjectIds].join(", ")}`);
}

const output = {
  version: 1,
  generatedAt: bundle.exportedAt || new Date().toISOString(),
  drafts,
  projectCatalog: storedCatalog,
  projectDocuments,
  ...(gameExperience ? { gameExperience } : {}),
  covers,
  assets: assets.map(({ sourceAdapterId, sourceDatabase, sourceStore, sourceId, publicPath }) => ({
    sourceAdapterId,
    sourceDatabase,
    sourceStore,
    sourceId,
    publicPath,
  })),
};

// Validate only what THIS run actually produced — an excluded project's
// merged-back existing state (see above) is untouched legacy data, not
// something this run rewrote, so it must not be re-validated here (it may
// legitimately still contain the very local references this check exists
// to catch — that is exactly the already-known, separately-tracked issue
// this run is deliberately not touching).
const outputForValidation = excludeProjectIds.size
  ? {
      ...output,
      projectCatalog: Object.fromEntries(Object.entries(output.projectCatalog).filter(([id]) => !excludeProjectIds.has(id))),
      drafts: Object.fromEntries(Object.entries(output.drafts).filter(([id]) => !excludeProjectIds.has(id))),
      projectDocuments: { ...output.projectDocuments, documents: Object.fromEntries(Object.entries(output.projectDocuments.documents).filter(([id]) => !excludeProjectIds.has(id))) },
      covers: Object.fromEntries(Object.entries(output.covers).filter(([id]) => !excludeProjectIds.has(id))),
    }
  : output;
const rewrittenPreflight = await buildPublishingPreflight({ root: cwd, bundle, rewrittenOutput: { output: outputForValidation, uiPractice } });
await writeFile(preflightPath, `${JSON.stringify(rewrittenPreflight, null, 2)}\n`, "utf8");
if (!rewrittenPreflight.ok) {
  await writePublishPlanReport({ root: cwd, manifest: rewrittenPreflight, output, uiPractice, assets, productionUrl: PRODUCTION_URL });
  const failures = rewrittenPreflight.issues
    .filter((issue) => issue.severity === "error")
    .map((issue) => `${issue.sourceAdapterId}: ${issue.message}`);
  fail(`Publishing rewrite validation failed. No production files were changed.\nManifest: ${preflightPath}\n- ${failures.join("\n- ")}`);
}

await writePublishPlanReport({ root: cwd, manifest: rewrittenPreflight, output, uiPractice, assets, productionUrl: PRODUCTION_URL });

console.log("\nPortfolio production import review");
console.log(`  Drafts: ${Object.keys(drafts).length}`);
console.log(`  Images: ${assets.length}`);
console.log(`  Homepage covers: ${Object.keys(covers).length}`);
console.log(`  Canonical projects: ${Object.keys(storedCatalog).length}`);
console.log(`  Data-driven project documents: ${Object.keys(projectDocuments.documents).length}`);
console.log(`  UI Practice items: ${uiPractice?.items.length ?? 0}`);
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
if (uiPractice) await backupIfPresent(cwd, OUTPUT_UI_PRACTICE_DATA, backupRoot);
for (const asset of assets) await backupIfPresent(cwd, asset.relativePath, backupRoot);

for (const asset of assets) {
  const destination = path.join(cwd, asset.relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, asset.bytes);
}
await mkdir(path.dirname(path.join(cwd, OUTPUT_DATA)), { recursive: true });
await writeFile(path.join(cwd, OUTPUT_DATA), `${JSON.stringify(output, null, 2)}\n`, "utf8");
if (uiPractice) {
  await writeFile(path.join(cwd, OUTPUT_UI_PRACTICE_DATA), `${JSON.stringify(uiPractice, null, 2)}\n`, "utf8");
}

console.log(`\nImported safely. Backup snapshot: ${backupRoot}`);
console.log("Run pnpm portfolio:check before publishing.");
