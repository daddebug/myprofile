import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { bundleAssetKey, resolveAsset } from "../resolveAsset.mjs";
import { VALID_PNG_BYTES, withFixtureRepo } from "./fixtureRepo.mjs";

const CORRUPTED_BYTES = Buffer.from("AAAA", "base64"); // 3 null bytes -- the real 2026-08-17 incident shape
const JPEG_SIGNATURE_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01]);

// A. valid new bundle asset -> RESOLVED, source "bundle"
await withFixtureRepo(async (root) => {
  const bundleAssets = new Map([
    [bundleAssetKey("dynamic-template-images", "image-a"), { bytes: VALID_PNG_BYTES, fileName: "image-a.png" }],
  ]);
  const result = await resolveAsset({ sourceAdapterId: "dynamic-template-images", assetId: "image-a" }, "inherited", bundleAssets, { root });
  assert.equal(result.status, "RESOLVED");
  assert.equal(result.source, "bundle");
  assert.equal(result.mimeType, "image/png");
});
console.log("A: valid new bundle asset -> RESOLVED (bundle) passed");

// B. corrupted new bundle asset -> INVALID, never silently treated as missing or resolved
await withFixtureRepo(async (root) => {
  const bundleAssets = new Map([
    [bundleAssetKey("dynamic-template-images", "image-b"), { bytes: CORRUPTED_BYTES, fileName: "image-b.png" }],
  ]);
  const result = await resolveAsset({ sourceAdapterId: "dynamic-template-images", assetId: "image-b" }, "inherited", bundleAssets, { root });
  assert.equal(result.status, "INVALID");
  assert.match(result.reason, /byte/i);
  assert.equal(result.source, "bundle");
});
console.log("B: corrupted new bundle asset -> INVALID passed");

// C. declared PNG but actually JPEG bytes -> still RESOLVED (mislabeled, not corrupted), with mimeMismatch flagged
await withFixtureRepo(async (root) => {
  const bundleAssets = new Map([
    [bundleAssetKey("dynamic-template-images", "image-c"), { bytes: JPEG_SIGNATURE_BYTES, fileName: "image-c.png" }],
  ]);
  const result = await resolveAsset({ sourceAdapterId: "dynamic-template-images", assetId: "image-c" }, "inherited", bundleAssets, { root });
  assert.equal(result.status, "RESOLVED");
  assert.equal(result.mimeMismatch, true);
});
console.log("C: mislabeled-but-valid bundle asset -> RESOLVED with mimeMismatch passed");

// D. no bundle asset, valid published fallback exists -> RESOLVED, source "published-fallback"
await withFixtureRepo(async (root) => {
  const projectId = "project-d";
  const assetId = "image-d";
  const dir = path.join(root, "public", "images", "published", "project-body", projectId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${assetId}.png`), VALID_PNG_BYTES);
  const declaredPublicPath = `/images/published/project-body/${projectId}/${assetId}.png`;
  const result = await resolveAsset({ sourceAdapterId: "project-body-indexeddb-assets", assetId, declaredPublicPath }, "inherited", new Map(), { root });
  assert.equal(result.status, "RESOLVED");
  assert.equal(result.source, "published-fallback");
  assert.equal(result.publicPath, declaredPublicPath);
});
console.log("D: valid published fallback -> RESOLVED passed");

// E. no bundle asset, published fallback file exists but is corrupted -> MISSING (never accepted)
await withFixtureRepo(async (root) => {
  const projectId = "project-e";
  const assetId = "image-e";
  const dir = path.join(root, "public", "images", "published", "project-body", projectId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${assetId}.png`), CORRUPTED_BYTES);
  const declaredPublicPath = `/images/published/project-body/${projectId}/${assetId}.png`;
  const result = await resolveAsset({ sourceAdapterId: "project-body-indexeddb-assets", assetId, declaredPublicPath }, "inherited", new Map(), { root });
  assert.equal(result.status, "MISSING");
});
console.log("E: corrupted published fallback -> MISSING (not accepted) passed");

// F. no bundle asset, no published fallback file at all -> MISSING
await withFixtureRepo(async (root) => {
  const declaredPublicPath = "/images/published/project-body/project-f/image-f.png";
  const result = await resolveAsset({ sourceAdapterId: "project-body-indexeddb-assets", assetId: "image-f", declaredPublicPath }, "inherited", new Map(), { root });
  assert.equal(result.status, "MISSING");
});
console.log("F: no bundle asset, no published file -> MISSING passed");

// G. published fallback path exists but basename doesn't match assetId -> rejected (identity check), MISSING
await withFixtureRepo(async (root) => {
  const projectId = "project-g";
  const dir = path.join(root, "public", "images", "published", "project-body", projectId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "image-other.png"), VALID_PNG_BYTES);
  // declared path points at a DIFFERENT file than the one that exists -- the resolver must not substitute it.
  const declaredPublicPath = `/images/published/project-body/${projectId}/image-g.png`;
  const result = await resolveAsset({ sourceAdapterId: "project-body-indexeddb-assets", assetId: "image-g", declaredPublicPath }, "inherited", new Map(), { root });
  assert.equal(result.status, "MISSING");
});
console.log("G: identity mismatch (same directory, different id) -> MISSING passed");

// H. referenceIntent "changed", no valid bundle asset, but a valid published
// fallback DOES exist at the declared path -> must still be MISSING, never
// silently resolved via the fallback. This is the fix for a failed capture
// of a genuinely new image looking, in production, like the edit succeeded
// (Publishing Architecture V2, Asset Resolution Model).
await withFixtureRepo(async (root) => {
  const projectId = "project-h";
  const assetId = "image-h";
  const dir = path.join(root, "public", "images", "published", "project-body", projectId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${assetId}.png`), VALID_PNG_BYTES);
  const declaredPublicPath = `/images/published/project-body/${projectId}/${assetId}.png`;
  const result = await resolveAsset({ sourceAdapterId: "project-body-indexeddb-assets", assetId, declaredPublicPath }, "changed", new Map(), { root });
  assert.equal(result.status, "MISSING", "a changed reference with no bundle asset must never fall back to the old published file");
});
console.log("H: changed reference, no bundle asset, valid fallback exists -> MISSING (fallback disabled), passed");

console.log("resolveAsset.mjs regression tests passed (fixture-isolated, real repo never touched)");
