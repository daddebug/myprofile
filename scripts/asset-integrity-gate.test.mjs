import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateImageBytes } from "./assetIntegrity.mjs";
import { buildPublishingPreflight, resolveAlreadyPublishedProjectBodyAsset } from "./publishing-preflight-lib.mjs";
import { VALID_PNG_BYTES, runImportProductionBundle, withFixtureRepo } from "./publishing/__tests__/fixtureRepo.mjs";

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
//
// Every scenario below that needs a filesystem root (preflight-level,
// disk-fallback-level, end-to-end) runs against an isolated fixture root
// (see publishing/__tests__/fixtureRepo.mjs) -- never against this real
// repository.

const JPEG_SIGNATURE_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01]);
const NULL_BYTES_BASE64 = "AAAA";

function fixtureCatalogEntry(id) {
  return { isDynamic: true, slug: id, route: `/work/${id}`, titleZh: "Fixture", titleEn: "Fixture", featured: false };
}
function fixtureDraftWithTemplateImage(imageId, projectId) {
  return {
    version: 1,
    templateInstances: [{
      instanceId: "a",
      templateId: "statement-longform",
      regionId: "content",
      content: { imageRow: { images: [{ imageId, publicPath: `/images/published/template-images/${projectId}/${imageId}.png` }] } },
    }],
  };
}
function baseBundle(registryVersion, projectId, images, draft) {
  return {
    version: 1,
    publishingRegistryVersion: registryVersion,
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
async function registryVersion(root) {
  const registry = JSON.parse(await readFile(path.join(root, "src", "lib", "publishing", "publishSourceRegistry.json"), "utf8"));
  return registry.version;
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

await withFixtureRepo(async (root) => {
  // B, via buildPublishingPreflight: a bundle whose sole image is 3 null bytes.
  const projectId = "fixture-integrity-b";
  const bundle = baseBundle(await registryVersion(root), projectId, [{
    id: "image-integrity-b",
    database: "dilida-portfolio-template-images",
    store: "images",
    sourceAdapterId: "dynamic-template-images",
    projectId,
    fileName: "image-integrity-b.png",
    mimeType: "image/png",
    dataBase64: NULL_BYTES_BASE64,
  }], fixtureDraftWithTemplateImage("image-integrity-b", projectId));
  const manifest = await buildPublishingPreflight({ root, bundle });
  assert.equal(manifest.ok, false, "expected preflight to BLOCK a 3-byte corrupted image");
  const invalidIssue = manifest.issues.find((issue) => issue.code === "INVALID_ASSET_BYTES");
  assert(invalidIssue, `expected an INVALID_ASSET_BYTES issue, got: ${JSON.stringify(manifest.issues)}`);
  assert.equal(invalidIssue.sourceAdapterId, "dynamic-template-images");
});
console.log("preflight B: 3-byte corrupted bundle image -> BLOCKED, passed");

await withFixtureRepo(async (root) => {
  // C, via buildPublishingPreflight: a bundle image declared image/png but
  // whose bytes are actually a JPEG -- a real, valid (if mislabeled) image,
  // so preflight must NOT block it; it must record a non-blocking
  // ASSET_MIME_MISMATCH warning instead.
  const projectId = "fixture-integrity-c";
  const bundle = baseBundle(await registryVersion(root), projectId, [{
    id: "image-integrity-c",
    database: "dilida-portfolio-template-images",
    store: "images",
    sourceAdapterId: "dynamic-template-images",
    projectId,
    fileName: "image-integrity-c.png",
    mimeType: "image/png",
    dataBase64: JPEG_SIGNATURE_BYTES.toString("base64"),
  }], fixtureDraftWithTemplateImage("image-integrity-c", projectId));
  const manifest = await buildPublishingPreflight({ root, bundle });
  const invalidIssue = manifest.issues.find((issue) => issue.code === "INVALID_ASSET_BYTES");
  assert.equal(invalidIssue, undefined, `expected no INVALID_ASSET_BYTES issue for a mislabeled-but-valid image, got: ${JSON.stringify(manifest.issues)}`);
  const mismatchIssue = manifest.issues.find((issue) => issue.code === "ASSET_MIME_MISMATCH");
  assert(mismatchIssue, `expected an ASSET_MIME_MISMATCH warning, got: ${JSON.stringify(manifest.issues)}`);
  assert.equal(mismatchIssue.severity, "warning");
  const asset = manifest.assets.find((a) => a.sourceAdapterId === "dynamic-template-images" && a.assetId === "image-integrity-c");
  assert.equal(asset?.status, "collected", "a mislabeled-but-valid image must still be collected, not treated as invalid");
});
console.log("preflight C: mislabeled-but-valid bundle image -> collected + mimeMismatch warning, passed");

await withFixtureRepo(async (root) => {
  // A, via buildPublishingPreflight: a bundle whose sole image is a real PNG
  // must pass (no INVALID_ASSET_BYTES issue at all -- other issues are out of
  // scope for this assertion).
  const projectId = "fixture-integrity-a";
  const bundle = baseBundle(await registryVersion(root), projectId, [{
    id: "image-integrity-a",
    database: "dilida-portfolio-template-images",
    store: "images",
    sourceAdapterId: "dynamic-template-images",
    projectId,
    fileName: "image-integrity-a.png",
    mimeType: "image/png",
    dataBase64: VALID_PNG_BYTES.toString("base64"),
  }], fixtureDraftWithTemplateImage("image-integrity-a", projectId));
  const manifest = await buildPublishingPreflight({ root, bundle });
  const invalidIssue = manifest.issues.find((issue) => issue.code === "INVALID_ASSET_BYTES");
  assert.equal(invalidIssue, undefined, `expected no INVALID_ASSET_BYTES issue for a valid PNG, got: ${JSON.stringify(manifest.issues)}`);
});
console.log("preflight A: valid PNG bundle image -> no INVALID_ASSET_BYTES issue, passed");

// --- Disk fallback level: D (corrupted fallback rejected) / E (valid accepted) ---

await withFixtureRepo(async (root) => {
  const projectId = "fixture-integrity-fallback";
  const assetId = "image-integrity-fallback";
  const publicPath = `/images/published/template-images/${projectId}/${assetId}.png`;
  const directory = path.join(root, "public", "images", "published", "template-images", projectId);
  await mkdir(directory, { recursive: true });

  // D. exact disk fallback exists but is 3-byte garbage -> must NOT be
  // accepted as available, regardless of the file existing at exactly the
  // right path with exactly the right name.
  await writeFile(path.join(directory, `${assetId}.png`), Buffer.from(NULL_BYTES_BASE64, "base64"));
  const corruptedFallback = await resolveAlreadyPublishedProjectBodyAsset(root, "dynamic-template-images", assetId, publicPath);
  assert.equal(corruptedFallback, null, "a 3-byte disk fallback file must never be accepted as available");

  // E. exact disk fallback exists and is a valid image -> accepted, same as
  // before this gate existed.
  await writeFile(path.join(directory, `${assetId}.png`), VALID_PNG_BYTES);
  const validFallback = await resolveAlreadyPublishedProjectBodyAsset(root, "dynamic-template-images", assetId, publicPath);
  assert(validFallback, "a valid disk fallback file must still be accepted");
  assert.equal(validFallback.publicPath, publicPath);
});
console.log("resolveAlreadyPublishedProjectBodyAsset D/E tests passed");

// --- End-to-end: BLOCKED must refuse --confirm AND leave disk untouched ---

await withFixtureRepo(async (root) => {
  const projectId = "fixture-integrity-e2e";
  const imageId = "image-integrity-e2e";
  const targetPath = path.join(root, "public", "images", "published", "template-images", projectId, `${imageId}.png`);

  const corruptedBundle = baseBundle(await registryVersion(root), projectId, [{
    id: imageId,
    database: "dilida-portfolio-template-images",
    store: "images",
    sourceAdapterId: "dynamic-template-images",
    projectId,
    fileName: `${imageId}.png`,
    mimeType: "image/png",
    dataBase64: NULL_BYTES_BASE64,
  }], fixtureDraftWithTemplateImage(imageId, projectId));

  const bundlePath = path.join(root, "output", "import-bundle.json");
  await mkdir(path.dirname(bundlePath), { recursive: true });
  await writeFile(bundlePath, JSON.stringify(corruptedBundle), "utf8");

  const dryRun = runImportProductionBundle(root, [bundlePath]);
  assert.notEqual(dryRun.status, 0, `expected dry run to fail closed on a corrupted image:\nstdout:\n${dryRun.stdout}\nstderr:\n${dryRun.stderr}`);
  assert.match(dryRun.stderr, /BLOCKED/i, dryRun.stderr);
  assert.match(dryRun.stderr, new RegExp(imageId), dryRun.stderr);

  const confirmRun = runImportProductionBundle(root, [bundlePath, "--confirm"]);
  assert.notEqual(confirmRun.status, 0, `expected --confirm to be refused on a corrupted image:\nstdout:\n${confirmRun.stdout}\nstderr:\n${confirmRun.stderr}`);

  // The target file must never have been created at all -- BLOCKED must stop
  // before any production asset write, not just before the JSON write.
  let exists = true;
  try { await readFile(targetPath); } catch { exists = false; }
  assert.equal(exists, false, "a BLOCKED confirm run must never write the production asset file");
});
console.log("end-to-end BLOCKED / no-overwrite (dry-run and --confirm) tests passed");

console.log("asset integrity gate regression tests passed");
