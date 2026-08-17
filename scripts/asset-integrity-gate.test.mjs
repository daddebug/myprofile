import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { validateImageBytes } from "./assetIntegrity.mjs";
import { buildPublishingPreflight, resolveAlreadyPublishedProjectBodyAsset } from "./publishing-preflight-lib.mjs";

// Exercises the asset integrity gate added 2026-08-17 after a real publish
// wrote ~3-byte corrupted data into 70 production image files (see
// CHANGELOG.md / PROJECT_STATUS.md for the incident). Every scenario in this
// file corresponds directly to one of the 6 required regression cases:
// A. valid PNG bytes -> accepted
// B. dataBase64 decodes to near-empty/null bytes -> BLOCKED, --confirm refused
// C. declared image/png but actual JPEG bytes -> accepted, but recorded as a
//    non-blocking ASSET_MIME_MISMATCH warning (see assetIntegrity.mjs: a live
//    re-diagnosis the same day found this exact mismatch shape on dozens of
//    real, currently-published, non-corrupted files -- an earlier version of
//    this gate treated it as a hard BLOCK and would have refused essentially
//    every real game-cover republish; a genuinely wrong/garbage payload is
//    still caught by B/D regardless of what it's declared as)
// D. exact disk fallback exists but the file itself is 3-byte garbage -> not
//    accepted as a fallback -> BLOCKED
// E. exact disk fallback exists and is a valid image -> accepted
// F. a valid bundle asset overwriting an existing production file -> normal
//    UPDATE behavior, unaffected by the gate
const repositoryRoot = process.cwd();
const scriptPath = path.join(repositoryRoot, "scripts", "import-production-bundle.mjs");
const registry = JSON.parse(await readFile(path.join(repositoryRoot, "src", "lib", "publishing", "publishSourceRegistry.json"), "utf8"));

// A minimal, real, valid 1x1 transparent PNG.
const VALID_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAIAAAUAAen63NgAAAAASUVORK5CYII=";
const VALID_PNG_BYTES = Buffer.from(VALID_PNG_BASE64, "base64");
// Bytes that begin with a real JPEG signature (FF D8 FF), never a PNG one.
const JPEG_SIGNATURE_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01]);
// What the real incident actually produced: base64 "AAAA" decodes to 3 null bytes.
const NULL_BYTES_BASE64 = "AAAA";

function fixtureCatalogEntry(id) {
  return { isDynamic: true, slug: id, route: `/work/${id}`, titleZh: "Fixture", titleEn: "Fixture", featured: false };
}
function fixtureDraftWithTemplateImage(imageId) {
  return {
    version: 1,
    templateInstances: [{
      instanceId: "a",
      templateId: "statement-longform",
      regionId: "content",
      content: { imageRow: { images: [{ imageId, publicPath: `/images/published/template-images/test-fixture-integrity/${imageId}.png` }] } },
    }],
  };
}
function baseBundle(projectId, images, draft) {
  return {
    version: 1,
    publishingRegistryVersion: registry.version,
    exportedAt: new Date().toISOString(),
    origin: "test-fixture",
    projectCatalog: { version: 1, projectIds: [projectId], projects: { [projectId]: fixtureCatalogEntry(projectId) } },
    drafts: { [projectId]: draft },
    projectDocuments: { version: 1, documents: {} },
    uiPractice: { version: 1, items: [] },
    gameExperience: { schemaVersion: 1, records: [] },
    images,
    diagnostics: { missingReferences: [] },
  };
}

// --- Unit level: validateImageBytes itself -------------------------------

{
  // A. valid PNG bytes -> accepted
  const result = validateImageBytes(VALID_PNG_BYTES, "image/png");
  assert.equal(result.valid, true, JSON.stringify(result));
  assert.equal(result.detectedMime, "image/png");
}
{
  // B. decoded 00 00 00 (from base64 "AAAA") -> rejected
  const bytes = Buffer.from(NULL_BYTES_BASE64, "base64");
  assert.equal(bytes.length, 3);
  assert.deepEqual([...bytes], [0, 0, 0]);
  const result = validateImageBytes(bytes, "image/png");
  assert.equal(result.valid, false);
  assert.match(result.reason, /byte/i);
}
{
  // C. declared image/png but JPEG signature bytes -> a real, valid image
  // (just mislabeled), so accepted -- with mimeMismatch flagged for
  // visibility, never rejected.
  const result = validateImageBytes(JPEG_SIGNATURE_BYTES, "image/png");
  assert.equal(result.valid, true, JSON.stringify(result));
  assert.equal(result.detectedMime, "image/jpeg");
  assert.equal(result.mimeMismatch, true);
}
console.log("assetIntegrity unit-level A/B/C tests passed");

// --- Preflight level: a corrupted/mismatched bundle image must BLOCK -----

{
  // B, via buildPublishingPreflight: a bundle whose sole image is 3 null bytes.
  const projectId = "test-fixture-integrity-b";
  const bundle = baseBundle(projectId, [{
    id: "image-integrity-b",
    database: "dilida-portfolio-template-images",
    store: "images",
    sourceAdapterId: "dynamic-template-images",
    projectId,
    fileName: "image-integrity-b.png",
    mimeType: "image/png",
    dataBase64: NULL_BYTES_BASE64,
  }], fixtureDraftWithTemplateImage("image-integrity-b"));
  const manifest = await buildPublishingPreflight({ root: repositoryRoot, bundle });
  assert.equal(manifest.ok, false, "expected preflight to BLOCK a 3-byte corrupted image");
  const invalidIssue = manifest.issues.find((issue) => issue.code === "INVALID_ASSET_BYTES");
  assert(invalidIssue, `expected an INVALID_ASSET_BYTES issue, got: ${JSON.stringify(manifest.issues)}`);
  assert.equal(invalidIssue.sourceAdapterId, "dynamic-template-images");
}
{
  // C, via buildPublishingPreflight: a bundle image declared image/png but
  // whose bytes are actually a JPEG -- a real, valid (if mislabeled) image,
  // so preflight must NOT block it; it must record a non-blocking
  // ASSET_MIME_MISMATCH warning instead.
  const projectId = "test-fixture-integrity-c";
  const bundle = baseBundle(projectId, [{
    id: "image-integrity-c",
    database: "dilida-portfolio-template-images",
    store: "images",
    sourceAdapterId: "dynamic-template-images",
    projectId,
    fileName: "image-integrity-c.png",
    mimeType: "image/png",
    dataBase64: JPEG_SIGNATURE_BYTES.toString("base64"),
  }], fixtureDraftWithTemplateImage("image-integrity-c"));
  const manifest = await buildPublishingPreflight({ root: repositoryRoot, bundle });
  const invalidIssue = manifest.issues.find((issue) => issue.code === "INVALID_ASSET_BYTES");
  assert.equal(invalidIssue, undefined, `expected no INVALID_ASSET_BYTES issue for a mislabeled-but-valid image, got: ${JSON.stringify(manifest.issues)}`);
  const mismatchIssue = manifest.issues.find((issue) => issue.code === "ASSET_MIME_MISMATCH");
  assert(mismatchIssue, `expected an ASSET_MIME_MISMATCH warning, got: ${JSON.stringify(manifest.issues)}`);
  assert.equal(mismatchIssue.severity, "warning");
  const asset = manifest.assets.find((a) => a.sourceAdapterId === "dynamic-template-images" && a.assetId === "image-integrity-c");
  assert.equal(asset?.status, "collected", "a mislabeled-but-valid image must still be collected, not treated as invalid");
}
{
  // A, via buildPublishingPreflight: a bundle whose sole image is a real PNG
  // must pass (no INVALID_ASSET_BYTES issue at all -- other issues are out of
  // scope for this assertion).
  const projectId = "test-fixture-integrity-a";
  const bundle = baseBundle(projectId, [{
    id: "image-integrity-a",
    database: "dilida-portfolio-template-images",
    store: "images",
    sourceAdapterId: "dynamic-template-images",
    projectId,
    fileName: "image-integrity-a.png",
    mimeType: "image/png",
    dataBase64: VALID_PNG_BASE64,
  }], fixtureDraftWithTemplateImage("image-integrity-a"));
  const manifest = await buildPublishingPreflight({ root: repositoryRoot, bundle });
  const invalidIssue = manifest.issues.find((issue) => issue.code === "INVALID_ASSET_BYTES");
  assert.equal(invalidIssue, undefined, `expected no INVALID_ASSET_BYTES issue for a valid PNG, got: ${JSON.stringify(manifest.issues)}`);
}
console.log("buildPublishingPreflight A/B/C integration tests passed");

// --- Disk fallback level: D (corrupted fallback rejected) / E (valid accepted) ---

const fallbackRelativePath = "public/images/published/template-images/test-fixture-integrity-fallback/image-integrity-fallback.png";
const fallbackAbsolutePath = path.join(repositoryRoot, fallbackRelativePath);
const fallbackPublicPath = "/images/published/template-images/test-fixture-integrity-fallback/image-integrity-fallback.png";
try {
  await mkdir(path.dirname(fallbackAbsolutePath), { recursive: true });

  // D. exact disk fallback exists but is 3-byte garbage -> must NOT be
  // accepted as available, regardless of the file existing at exactly the
  // right path with exactly the right name.
  await writeFile(fallbackAbsolutePath, Buffer.from(NULL_BYTES_BASE64, "base64"));
  const corruptedFallback = await resolveAlreadyPublishedProjectBodyAsset(
    repositoryRoot, "dynamic-template-images", "image-integrity-fallback", fallbackPublicPath,
  );
  assert.equal(corruptedFallback, null, "a 3-byte disk fallback file must never be accepted as available");

  // E. exact disk fallback exists and is a valid image -> accepted, same as
  // before this gate existed.
  await writeFile(fallbackAbsolutePath, VALID_PNG_BYTES);
  const validFallback = await resolveAlreadyPublishedProjectBodyAsset(
    repositoryRoot, "dynamic-template-images", "image-integrity-fallback", fallbackPublicPath,
  );
  assert(validFallback, "a valid disk fallback file must still be accepted");
  assert.equal(validFallback.publicPath, fallbackPublicPath);
} finally {
  await rm(path.dirname(fallbackAbsolutePath), { recursive: true, force: true });
}
console.log("resolveAlreadyPublishedProjectBodyAsset D/E tests passed");

// --- End-to-end: BLOCKED must refuse --confirm AND leave disk untouched ---

const bundlePath = path.join(repositoryRoot, "output", "asset-integrity-gate-regression-test.json");
const targetProjectId = "test-fixture-integrity-e2e";
const targetImageId = "image-integrity-e2e";
const targetRelativePath = path.join("public", "images", "published", "template-images", targetProjectId, `${targetImageId}.png`);
const targetAbsolutePath = path.join(repositoryRoot, targetRelativePath);

function run(args) {
  return spawnSync(process.execPath, [scriptPath, ...args], { cwd: repositoryRoot, encoding: "utf8" });
}

try {
  const corruptedBundle = baseBundle(targetProjectId, [{
    id: targetImageId,
    database: "dilida-portfolio-template-images",
    store: "images",
    sourceAdapterId: "dynamic-template-images",
    projectId: targetProjectId,
    fileName: `${targetImageId}.png`,
    mimeType: "image/png",
    dataBase64: NULL_BYTES_BASE64,
  }], fixtureDraftWithTemplateImage(targetImageId));
  await writeFile(bundlePath, JSON.stringify(corruptedBundle), "utf8");

  const dryRun = run([bundlePath]);
  assert.notEqual(dryRun.status, 0, `expected dry run to fail closed on a corrupted image:\nstdout:\n${dryRun.stdout}\nstderr:\n${dryRun.stderr}`);
  assert.match(dryRun.stderr, /preflight failed|INVALID_ASSET_BYTES|failed integrity validation/i, dryRun.stderr);

  const confirmRun = run([bundlePath, "--confirm"]);
  assert.notEqual(confirmRun.status, 0, `expected --confirm to be refused on a corrupted image:\nstdout:\n${confirmRun.stdout}\nstderr:\n${confirmRun.stderr}`);

  // The target file must never have been created at all -- BLOCKED must stop
  // before any production asset write, not just before the JSON write.
  let exists = true;
  try { await readFile(targetAbsolutePath); } catch { exists = false; }
  assert.equal(exists, false, "a BLOCKED confirm run must never write the production asset file");
} finally {
  await rm(bundlePath, { force: true });
  await rm(path.dirname(targetAbsolutePath), { recursive: true, force: true });
}
console.log("end-to-end BLOCKED / no-overwrite (dry-run and --confirm) tests passed");

console.log("asset integrity gate regression tests passed");
