import { mkdir, readFile, writeFile, copyFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { buildPublishingPreflight, getPublishedAssetLocation, readPublishSourceRegistry, resolveAlreadyPublishedProjectBodyAsset } from "./publishing-preflight-lib.mjs";
import { LAUNCHER_REPORT_PATH, writeBlockedPublishReport, writePublishPlanReport } from "./publishing-report-lib.mjs";

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

// Both functions below resolve a reference the same two ways, in order:
// (A) the exported bundle's own IndexedDB snapshot (imagePathById), then
// (B) resolveAlreadyPublishedProjectBodyAsset() -- the exact file this asset
// already published to disk, if the exporting browser session's IndexedDB
// didn't have it this time. (B) applies to every disk-publishable reference
// type a project body can contain -- project-body-indexeddb-assets
// (localImageId, assetId), dynamic-template-images/ui-practice-images
// (imageId), and playable-game-covers (coverId) -- notably including a whole
// project's own asset references when that project is being inherited
// unedited from the currently-published state (see the per-project
// catalog/draft merge below), so an inherited body's assets resolve the same
// way a fresh edit's would, regardless of which of these types it uses. This
// must stay the same rule buildPublishingPreflight() uses (see
// resolveAlreadyPublishedProjectBodyAsset in publishing-preflight-lib.mjs) so
// import can never judge a reference differently than preflight already did.
async function replaceImagePaths(root, value, imagePathById, missing) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return Promise.all(value.map((item) => replaceImagePaths(root, item, imagePathById, missing)));

  const output = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = await replaceImagePaths(root, item, imagePathById, missing);
  }

  const isProjectBodyRef = typeof value.localImageId === "string" && Boolean(value.localImageId);
  const isTemplateImageRef = !isProjectBodyRef && typeof value.imageId === "string" && Boolean(value.imageId);
  const refId = isProjectBodyRef
    ? value.localImageId
    : isTemplateImageRef
      ? value.imageId
      : null;
  if (refId) {
    let publicPath = imagePathById.get(refId);
    if (!publicPath && (isProjectBodyRef || isTemplateImageRef)) {
      // dynamic-template-images and ui-practice-images publish to the exact
      // same path family, so either adapter id resolves identically here --
      // no need to know which of the two this particular reference is.
      const fallbackAdapterId = isProjectBodyRef ? "project-body-indexeddb-assets" : "dynamic-template-images";
      const declaredPath = typeof value.publicPath === "string" ? value.publicPath : typeof value.publicUrl === "string" ? value.publicUrl : undefined;
      const fallback = await resolveAlreadyPublishedProjectBodyAsset(root, fallbackAdapterId, refId, declaredPath);
      if (fallback) publicPath = fallback.publicPath;
    }
    if (publicPath) output.publicPath = publicPath;
    else missing.add(refId);
  }
  // PlayableGameTemplate's own launch cover: { coverId, publicUrl } shape,
  // distinct from the imageId/localImageId shape above — rewrites publicUrl
  // in place (that field's real name in this shape) rather than publicPath.
  // Same (A) bundle-first, (B) disk-fallback rule as above -- this reference
  // is just as likely to belong to a whole project body being inherited
  // unedited (see the per-project catalog/body merge below).
  if (typeof value.coverId === "string" && value.coverId && typeof value.publicUrl === "string") {
    let publicPath = imagePathById.get(value.coverId);
    if (!publicPath) {
      const fallback = await resolveAlreadyPublishedProjectBodyAsset(root, "playable-game-covers", value.coverId, value.publicUrl);
      if (fallback) publicPath = fallback.publicPath;
    }
    if (publicPath) output.publicUrl = publicPath;
    else missing.add(value.coverId);
  }
  return output;
}

async function replaceDocumentAssetPaths(root, value, imagePathById, missing) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return Promise.all(value.map((item) => replaceDocumentAssetPaths(root, item, imagePathById, missing)));
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = await replaceDocumentAssetPaths(root, item, imagePathById, missing);
  }
  if (typeof value.assetId === "string" && value.assetId) {
    let publicPath = imagePathById.get(value.assetId);
    if (!publicPath) {
      const fallback = await resolveAlreadyPublishedProjectBodyAsset(root, "project-body-indexeddb-assets", value.assetId, value.publicPath);
      if (fallback) publicPath = fallback.publicPath;
    }
    if (publicPath) output.publicPath = publicPath;
    else missing.add(value.assetId);
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

// The currently-published state is the source of truth a project's body
// inherits from when this run's export doesn't include it. Read once, up
// front, so both the per-project draft merge below and the (unrelated)
// --exclude-project restore step share the same read instead of drifting.
let currentPublished = {};
let currentPublishedReadError = null;
try {
  currentPublished = JSON.parse(await readFile(path.join(cwd, OUTPUT_DATA), "utf8"));
} catch (error) {
  currentPublishedReadError = error instanceof Error ? error : new Error(String(error));
}

// Absence from an export must never be interpreted as "delete this body" --
// only an explicit, per-run deletedProjectIds entry may remove a previously
// -published project body. Defaults to empty; nothing infers deletion from
// a missing key, an empty browser session, or any other implicit signal.
const deletedProjectIds = new Set(
  Array.isArray(bundle.deletedProjectIds) ? bundle.deletedProjectIds.filter((id) => typeof id === "string") : [],
);
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
const bundleProjectIds = new Set(
  (Array.isArray(catalogStore.projectIds) ? catalogStore.projectIds : Object.keys(catalogStore.projects ?? {}))
    .filter((projectId) => typeof projectId === "string"),
);

// A previously-published project that's simply absent from this export's
// own catalog was not loaded/edited this cycle -- that alone must never be
// interpreted as "delete this project" (the same principle already applied
// to project bodies above). So the set of projects this run considers
// canonical is the bundle's own catalog PLUS every currently-published
// project id, minus retired ids. deletedProjectIds is intentionally NOT
// subtracted here: every consumer below (storedCatalog, drafts,
// projectDocuments, covers) independently checks deletedProjectIds at its
// own point of assignment, precisely so a deleted id still reaches those
// checks -- and their own bookkeeping (e.g. deletedAppliedProjectIds) --
// instead of silently vanishing one step earlier were it filtered out here.
const previousProjectIds = new Set(Object.keys(currentPublished.projectCatalog || {}));
const canonicalProjectIds = new Set(
  [...bundleProjectIds, ...previousProjectIds].filter((projectId) => !retiredProjectIds.has(projectId)),
);

const ignoredProjectIds = [...bundleProjectIds].filter((projectId) => retiredProjectIds.has(projectId));
const ignoredCoverIds = [];
const inheritedCatalogProjectIds = [];
const deletedCatalogProjectIds = [];
const storedCatalog = {};
for (const projectId of canonicalProjectIds) {
  if (deletedProjectIds.has(projectId)) {
    deletedCatalogProjectIds.push(projectId);
    continue; // explicit delete intent -- the only path allowed to omit an entire project
  }
  const bundleProject = bundleProjectIds.has(projectId) ? catalogStore.projects?.[projectId] : undefined;
  if (bundleProject !== undefined) {
    if (!bundleProject || typeof bundleProject !== "object" || Array.isArray(bundleProject)) {
      storedCatalog[projectId] = bundleProject;
      continue;
    }
    const { homepageGroup: _legacyHomepageGroup, homepageOrder: _legacyHomepageOrder, ...canonicalProject } = bundleProject;
    storedCatalog[projectId] = canonicalProject;
  } else if (currentPublished.projectCatalog?.[projectId] !== undefined) {
    // Absent from this export's catalog entirely -- inherit the whole
    // currently-published project (metadata here; body/documents/cover are
    // inherited the same way further below, all keyed off the same
    // canonicalProjectIds membership) rather than silently dropping it.
    storedCatalog[projectId] = currentPublished.projectCatalog[projectId];
    inheritedCatalogProjectIds.push(projectId);
  }
}

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

// Covers follow the same inherit rule as everything else: a catalog
// -inherited project's cover wasn't re-collected this cycle (its whole
// project wasn't loaded), so it's inherited from the currently-published
// state rather than silently disappearing from the output.
for (const projectId of inheritedCatalogProjectIds) {
  if (!(projectId in covers) && currentPublished.covers?.[projectId]) {
    covers[projectId] = currentPublished.covers[projectId];
  }
}

// Per-project merge, never a wholesale `output.drafts = bundle.drafts`
// replace: a project's published body must survive any publish run that
// simply didn't touch it this cycle. For every project id known either to
// this export or to the currently-published state:
//   A. bundle has a draft for it       -> use the bundle's (fresh edit)
//   B. bundle doesn't, published does  -> inherit the published body as-is
//   C. neither has it                  -> stays absent
//   (explicit deletedProjectIds entry) -> omitted regardless of A/B/C
// "No local edit draft found" is never treated as "delete this body."
const missing = new Set();
const drafts = {};
const inheritedProjectIds = [];
const deletedAppliedProjectIds = [];
const draftProjectIds = new Set([
  ...Object.keys(bundle.drafts || {}),
  ...Object.keys(currentPublished.drafts || {}),
]);
for (const projectId of draftProjectIds) {
  if (!canonicalProjectIds.has(projectId)) continue; // outside this run's catalog entirely -- unrelated to body inheritance/deletion
  if (deletedProjectIds.has(projectId)) {
    deletedAppliedProjectIds.push(projectId);
    continue; // the only path allowed to omit a previously-published body
  }
  // Some template-instance images (e.g. older image-row items on dynamic
  // projects) reference localImageId values that live in the project-body
  // asset store (projectBodyPaths) rather than a per-project
  // draftImageSources bucket; others reference imageId values staged to disk
  // (templateImagePaths). Merging all three lookups here is additive only —
  // it changes nothing for existing static-project drafts that have neither.
  const projectImagePaths = new Map([...(imagePathsByProject.get(projectId) ?? new Map()), ...projectBodyPaths, ...templateImagePaths, ...playableGameCoverPaths]);
  if (Object.prototype.hasOwnProperty.call(bundle.drafts || {}, projectId)) {
    drafts[projectId] = await replaceImagePaths(cwd, bundle.drafts[projectId], projectImagePaths, missing);
  } else if (Object.prototype.hasOwnProperty.call(currentPublished.drafts || {}, projectId)) {
    // No local edit draft in this export -- inherit the currently-published
    // body unchanged, routed through the same path-resolution rules a fresh
    // edit goes through, so an inherited body's own asset references are
    // validated identically (see resolveAlreadyPublishedProjectBodyAsset).
    drafts[projectId] = await replaceImagePaths(cwd, currentPublished.drafts[projectId], projectImagePaths, missing);
    inheritedProjectIds.push(projectId);
  }
}
if (missing.size) fail(`Referenced image data is missing from the bundle:\n- ${[...missing].join("\n- ")}`);

const rawProjectDocuments = bundle.projectDocuments?.version === 1 && bundle.projectDocuments.documents && typeof bundle.projectDocuments.documents === "object"
  ? bundle.projectDocuments.documents
  : {};
const currentProjectDocuments = currentPublished.projectDocuments?.version === 1 && currentPublished.projectDocuments.documents && typeof currentPublished.projectDocuments.documents === "object"
  ? currentPublished.projectDocuments.documents
  : {};
const documentProjectIds = new Set([...Object.keys(rawProjectDocuments), ...Object.keys(currentProjectDocuments)]);
const projectDocumentEntries = await Promise.all([...documentProjectIds].map(async (projectId) => {
  if (!canonicalProjectIds.has(projectId) || deletedProjectIds.has(projectId)) return null;
  if (Object.prototype.hasOwnProperty.call(rawProjectDocuments, projectId)) {
    const document = rawProjectDocuments[projectId];
    if (!document || typeof document !== "object" || document.schemaVersion !== 1) return null;
    return [projectId, await replaceDocumentAssetPaths(cwd, document, projectBodyPaths, missing)];
  }
  if (Object.prototype.hasOwnProperty.call(currentProjectDocuments, projectId)) {
    // Same inherit rule as project bodies above: no fresh document in this
    // export is not "delete this document," so the currently-published one
    // is carried forward, re-validated through the same path resolution.
    const document = currentProjectDocuments[projectId];
    if (!document || typeof document !== "object" || document.schemaVersion !== 1) return null;
    if (!inheritedProjectIds.includes(projectId)) inheritedProjectIds.push(projectId);
    return [projectId, await replaceDocumentAssetPaths(cwd, document, projectBodyPaths, missing)];
  }
  return null;
}));
const projectDocuments = {
  version: 1,
  documents: Object.fromEntries(projectDocumentEntries.filter(Boolean)),
};
if (missing.size) fail(`Referenced project-body image data is missing from the bundle:\n- ${[...missing].join("\n- ")}`);

const uiPractice = bundle.uiPractice?.version === 1 && Array.isArray(bundle.uiPractice.items)
  ? await replaceImagePaths(cwd, bundle.uiPractice, templateImagePaths, missing)
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
  if (currentPublishedReadError) fail(`--exclude-project requires the current ${OUTPUT_DATA} to be readable, to preserve excluded projects' existing state: ${currentPublishedReadError.message}`);
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
  await writePublishPlanReport({ root: cwd, manifest: rewrittenPreflight, output, uiPractice, assets, productionUrl: PRODUCTION_URL, deletedProjectIds, inheritedProjectIds: new Set(inheritedProjectIds), inheritedCatalogProjectIds: new Set(inheritedCatalogProjectIds) });
  const failures = rewrittenPreflight.issues
    .filter((issue) => issue.severity === "error")
    .map((issue) => `${issue.sourceAdapterId}: ${issue.message}`);
  fail(`Publishing rewrite validation failed. No production files were changed.\nManifest: ${preflightPath}\n- ${failures.join("\n- ")}`);
}

const planReport = await writePublishPlanReport({ root: cwd, manifest: rewrittenPreflight, output, uiPractice, assets, productionUrl: PRODUCTION_URL, deletedProjectIds, inheritedProjectIds: new Set(inheritedProjectIds), inheritedCatalogProjectIds: new Set(inheritedCatalogProjectIds) });

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
if (inheritedCatalogProjectIds.length) console.log(`  Inherited whole projects (absent from this export's catalog): ${inheritedCatalogProjectIds.join(", ")}`);
if (inheritedProjectIds.length) console.log(`  Inherited unchanged project bodies (no local edit in this export): ${inheritedProjectIds.join(", ")}`);
if (deletedCatalogProjectIds.length) console.log(`  Removed whole projects (explicit delete intent): ${deletedCatalogProjectIds.join(", ")}`);
if (deletedAppliedProjectIds.length) console.log(`  Removed project bodies (explicit delete intent): ${deletedAppliedProjectIds.join(", ")}`);
console.log(`  Output data: ${OUTPUT_DATA}`);
console.log(`  Asset root: ${OUTPUT_ASSET_ROOT}`);
console.log("  Original browser data: unchanged");
console.log("  Existing published files: never deleted");

if (!confirm) {
  console.log("\nDRY RUN ONLY. Review the summary, then repeat with --confirm to write version-controlled files.");
  process.exit(0);
}

// A confirmed run may only proceed to mutation once the SAME publish report
// just shown above (planReport) reports nothing blocked. This is not a
// second, independently-maintained BLOCKED judgment — it consumes
// writePublishPlanReport()'s own result directly, so "what the report says"
// and "what confirm actually allows" can never drift apart. Everything below
// this point is a real write (backup, asset copy, publishedPortfolio.json,
// uiPracticeMetadata.json); nothing above it has touched disk except the
// always-generated preflight manifest and this same plan report.
if (planReport.outcome === "blocked" || planReport.counts.blocked > 0) {
  const blockedReasons = planReport.items
    .filter((item) => item.status === "BLOCKED")
    .map((item) => `${item.category}${item.projectId ? ` (${item.projectId})` : ""}: ${item.reason || item.description}`);
  fail(`Publish report is BLOCKED. No production files were changed, no backup was created, no assets were copied.\nReport: ${LAUNCHER_REPORT_PATH}\n- ${blockedReasons.join("\n- ")}`);
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
