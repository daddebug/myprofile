// The single asset resolver (Publishing Architecture V2, Phase 4). Retires
// the V1 split between publishing-preflight-lib.mjs's collectContentTree/
// resolveProjectBodyAssetFallbacks and import-production-bundle.mjs's
// replaceImagePaths/replaceDocumentAssetPaths -- both independently decided
// "does this reference resolve," kept in sync only by both happening to call
// the same disk-fallback leaf function. Every caller in V2 asks exactly one
// function this exact question and gets exactly one of three answers.
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { isImageSourceAdapter, validateImageBytes } from "../assetIntegrity.mjs";
import { PUBLISHED_ASSET_PATH_PATTERN_BY_ADAPTER, mimeFor } from "./registry.mjs";

// Collision-safe map key for a (sourceAdapterId, assetId) pair -- JSON
// array encoding sidesteps any need for a separator character that could
// theoretically appear inside an id itself.
export function bundleAssetKey(sourceAdapterId, assetId) {
  return JSON.stringify([sourceAdapterId, assetId]);
}

async function fileInfo(root, relativePath) {
  const normalized = relativePath.replaceAll("\\", "/").replace(/^\//, "");
  const absolute = path.resolve(root, normalized);
  // Never resolve outside the repo root, however the path was constructed.
  if (!absolute.toLowerCase().startsWith(`${path.resolve(root).toLowerCase()}${path.sep}`)) return { exists: false };
  try {
    const details = await stat(absolute);
    return { exists: details.isFile(), absolute, byteSize: details.isFile() ? details.size : 0 };
  } catch {
    return { exists: false };
  }
}

// Candidate 2: is there an already-published file at the EXACT path this
// reference itself declares, whose basename exactly equals the referenced
// asset id? A same-directory file with a different id can never satisfy a
// reference -- this is an identity check, not a "something exists nearby"
// check.
async function resolveFromPublishedFallback(root, sourceAdapterId, assetId, declaredPublicPath) {
  const pattern = PUBLISHED_ASSET_PATH_PATTERN_BY_ADAPTER[sourceAdapterId];
  if (!pattern) return null;
  if (typeof declaredPublicPath !== "string" || !declaredPublicPath.trim()) return null;
  const trimmed = declaredPublicPath.trim();
  const match = trimmed.match(pattern);
  if (!match) return null;
  const fileName = match[match.length - 1];
  if (path.parse(fileName).name !== assetId) return null;
  const relativePath = `public${trimmed}`;
  const info = await fileInfo(root, relativePath);
  if (!info.exists) return null;
  return { relativePath, publicPath: trimmed, absolute: info.absolute, byteSize: info.byteSize };
}

/**
 * @param {{ sourceAdapterId: string, assetId: string, declaredPublicPath?: string }} reference
 * @param {"inherited" | "changed"} referenceIntent
 *   "inherited" -- the containing entity has no edit intent this cycle, or
 *   this exact field's value is unchanged between base and edited even
 *   inside an otherwise-edited entity -- candidate 2 (published fallback) is
 *   allowed, exactly as V1 always did. "changed" -- this exact reference's
 *   value differs between base and edited -- candidate 2 is disabled
 *   entirely, so a missing/invalid new asset BLOCKS rather than silently
 *   falling back to the old published file (Publishing Architecture V2,
 *   Asset Resolution Model -- the fix for a failed capture of a genuinely
 *   new image looking, in production, like the edit succeeded).
 * @param {Map<string, { bytes: Buffer, fileName?: string, mimeType?: string }>} bundleAssets
 *   keyed by bundleAssetKey(sourceAdapterId, assetId), one entry per raw
 *   asset this export cycle actually captured (not yet validated -- that
 *   happens here).
 * @param {{ root: string }} options
 * @returns {Promise<
 *   | { status: "RESOLVED", bytes: Buffer, publicPath: string|null, mimeType: string, source: "bundle" | "published-fallback", mimeMismatch?: boolean }
 *   | { status: "INVALID", reason: string, source: "bundle" | "published-fallback" }
 *   | { status: "MISSING" }
 * >}
 */
export async function resolveAsset(reference, referenceIntent, bundleAssets, options) {
  if (referenceIntent !== "inherited" && referenceIntent !== "changed") {
    throw new Error(`resolveAsset: referenceIntent must be "inherited" or "changed", got: ${referenceIntent}`);
  }
  const root = options.root;
  const sourceAdapterId = reference.sourceAdapterId;
  const assetId = reference.assetId;
  const declaredPublicPath = reference.declaredPublicPath;
  const isImage = isImageSourceAdapter(sourceAdapterId);

  // Candidate 1: a valid new bundle asset from this export cycle.
  const bundleAsset = bundleAssets.get(bundleAssetKey(sourceAdapterId, assetId));
  if (bundleAsset) {
    const declaredMime = mimeFor(bundleAsset.fileName || "", bundleAsset.mimeType);
    const integrity = isImage ? validateImageBytes(bundleAsset.bytes, declaredMime) : { valid: true };
    if (!integrity.valid) return { status: "INVALID", reason: integrity.reason, source: "bundle" };
    const resolved = {
      status: "RESOLVED",
      bytes: bundleAsset.bytes,
      publicPath: null, // caller computes the intended publish path via registry.getPublishedAssetLocation; this resolver only judges validity
      mimeType: declaredMime,
      source: "bundle",
    };
    if (integrity.mimeMismatch) resolved.mimeMismatch = true;
    return resolved;
  }

  // A "changed" reference with no valid bundle asset must never fall through
  // to the published fallback -- that would silently resolve a failed new
  // capture using the OLD file, making a failed edit look, in production,
  // like it succeeded. Only "inherited" references may use candidate 2.
  if (referenceIntent === "changed") return { status: "MISSING" };

  // Candidate 2: the exact currently-published asset at its exact declared path.
  const fallback = await resolveFromPublishedFallback(root, sourceAdapterId, assetId, declaredPublicPath);
  if (fallback) {
    if (isImage) {
      const bytes = await readFile(fallback.absolute);
      const integrity = validateImageBytes(bytes, mimeFor(fallback.publicPath));
      // A corrupted disk fallback is never "available" just because a file
      // exists at the expected path with a plausible-looking name -- fall
      // through to MISSING, exactly like V1's resolveAlreadyPublishedProjectBodyAsset.
      if (integrity.valid) {
        return { status: "RESOLVED", bytes, publicPath: fallback.publicPath, mimeType: integrity.detectedMime, source: "published-fallback" };
      }
    } else {
      return { status: "RESOLVED", bytes: null, publicPath: fallback.publicPath, mimeType: mimeFor(fallback.publicPath), source: "published-fallback" };
    }
  }

  // Candidate 3: nothing resolves it.
  return { status: "MISSING" };
}
