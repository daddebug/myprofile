import { mkdir, readFile, writeFile, copyFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const OFFICIAL_ROOT = path.resolve("D:/myprofilegit/myprofile");
const OUTPUT_DATA = path.join("src", "data", "publishedPortfolio.json");
const OUTPUT_ASSET_ROOT = path.join("public", "images", "published");
const CONFIRM_FLAG = "--confirm";

const draftImageSources = {
  "cross-platform-game-ux": {
    database: "dilida-portfolio-cross-platform-draft-assets",
    store: "images",
  },
  "3d-character-ui-rhythm": {
    database: "dilida-portfolio-3d-character-ui-assets",
    store: "images",
  },
  "from-theme-to-playable-rule": {
    database: "dilida-portfolio-game-jam-draft-assets",
    store: "images",
  },
};

const coverSource = {
  database: "dilida-portfolio-public-project-assets",
  store: "projectCovers",
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

  if (typeof value.localImageId === "string" && value.localImageId) {
    const publicPath = imagePathById.get(value.localImageId);
    if (publicPath) output.publicPath = publicPath;
    else missing.add(value.localImageId);
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

const assets = [];
const imagePathsByProject = new Map();
const covers = {};

for (const image of bundle.images) {
  if (!image || typeof image.id !== "string" || typeof image.dataBase64 !== "string") {
    fail("The export contains an invalid image record.");
  }
  const isCover = image.database === coverSource.database && image.store === coverSource.store;
  const owner = isCover
    ? "covers"
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
  else {
    if (!imagePathsByProject.has(owner)) imagePathsByProject.set(owner, new Map());
    imagePathsByProject.get(owner).set(image.id, publicPath);
  }
}

const missing = new Set();
const drafts = {};
for (const [projectId, draft] of Object.entries(bundle.drafts)) {
  drafts[projectId] = replaceImagePaths(draft, imagePathsByProject.get(projectId) ?? new Map(), missing);
}
if (missing.size) fail(`Referenced image data is missing from the bundle:\n- ${[...missing].join("\n- ")}`);

const storedMetadata = bundle.publicMetadata?.version === 1 && bundle.publicMetadata.projects && typeof bundle.publicMetadata.projects === "object"
  ? bundle.publicMetadata.projects
  : {};

const output = {
  version: 1,
  generatedAt: bundle.exportedAt || new Date().toISOString(),
  drafts,
  publicMetadata: storedMetadata,
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
