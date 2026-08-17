// The single Publish Plan Builder (Publishing Architecture V2, Phase 3).
// Combines Window-1 conflict detection, the Edit Intent Model's entity
// merge, recursive reference discovery + per-reference resolution (single
// assets via resolveAsset.mjs, asset trees via resolveAssetTree.mjs,
// external URLs via resolveExternalReference.mjs), and Writeset Rule
// assembly into one authoritative decision -- replacing V1's split across
// import-production-bundle.mjs's inline merge loops,
// publishing-preflight-lib.mjs's collectContentTree, and
// publishing-report-lib.mjs's independent re-diff.
//
// An entity's references are DISCOVERED from its real, arbitrarily nested
// content tree (discoverReferences.mjs), not declared by the caller -- this
// is what gives V2 real parity with V1's collectContentTree coverage
// (localImageId/publicPath, imageId/publicPath, posterAssetId/
// posterPublicPath, coverId/publicUrl, coverAssetId/publicPath, gameId
// asset-trees, and figmaUrl/sourceUrl/embedUrl/playUrl external references).
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { hashContent } from "./contentHash.mjs";
import { applyResolvedReferences, assetReferenceKey, discoverReferences } from "./discoverReferences.mjs";
import { getPublishedAssetLocation } from "./registry.mjs";
import { resolveExternalReference } from "./resolveExternalReference.mjs";
import { bundleAssetKey, resolveAsset } from "./resolveAsset.mjs";
import { assessTreeWriteset, readPublishedTree, resolveAssetTree } from "./resolveAssetTree.mjs";

function hashBytes(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function currentFileHash(root, relativePath) {
  try {
    return hashBytes(await readFile(path.join(root, relativePath)));
  } catch {
    return null;
  }
}

function deriveTreePublicDirectory(reference, providedPublicDirectory) {
  if (providedPublicDirectory) return providedPublicDirectory;
  if (!reference.declaredEntryPublicPath) return null;
  // Strip the trailing entry filename (index.html or whatever it's named),
  // matching V1's addDiskManifests derivation exactly (see
  // publishing-preflight-lib.mjs: `public${game.entryPublicPath?.replace(/\/index\.html$/i, "") || ""}`),
  // generalized to any trailing filename rather than only "index.html".
  return `public${reference.declaredEntryPublicPath.replace(/\/[^/]*$/, "")}`;
}

/**
 * @typedef {
 *   | { kind: "UPSERT", baseContentHash: string, value: unknown }
 *   | { kind: "UNPUBLISH", baseContentHash: string }
 *   | { kind: "DELETE", baseContentHash: string }
 * } EntityIntent
 */

// Window 1 -- edit-time staleness (browser session vs. production, up to
// hours). UPSERT, UNPUBLISH, and DELETE are checked identically, with no
// exception for DELETE: a stale delete request must never remove a
// production entity that was legitimately changed after the delete was
// requested (Publishing Architecture V2, Conflict Model, fix for DELETE
// concurrency). baseContentHash is never recomputed here -- it is whatever
// the caller's intent already carries, frozen by the Dirty Intent Store the
// moment that entity first became dirty.
//
// @param {Map<string, EntityIntent>} intents
// @param {Map<string, unknown>} currentEntities -- entityId -> current published content, or absent (Map.has === false) if never published
// @returns {{ entityId: string, reason: string }[]}
export function detectWindow1Conflicts(intents, currentEntities) {
  const conflicts = [];
  for (const [entityId, intent] of intents) {
    const current = currentEntities.get(entityId);
    const currentHash = hashContent(current);
    if (currentHash !== intent.baseContentHash) {
      conflicts.push({
        entityId,
        reason: `Production changed for this item since the edit was started (expected baseline ${intent.baseContentHash}, production is now ${currentHash}).`,
      });
    }
  }
  return conflicts;
}

/**
 * @param {{
 *   root: string,
 *   entityType: string,
 *   currentEntities: Map<string, unknown>,
 *   intents: Map<string, EntityIntent>,
 *   bundleAssets: Map<string, { bytes: Buffer, fileName?: string, mimeType?: string }>,
 *   bundleAssetTrees?: Map<string, { publicDirectory?: string, requiredRelativePaths?: string[], providedFiles?: Array<{ relativePath: string, bytes: Buffer }> }>,
 * }} options
 */
export async function buildPublishPlan({ root, entityType, currentEntities, intents, bundleAssets, bundleAssetTrees = new Map() }) {
  const conflicts = detectWindow1Conflicts(intents, currentEntities);
  const blockedEntityIds = new Set(conflicts.map((conflict) => conflict.entityId));

  const items = [];
  const writeset = [];
  const assetIntegrity = { total: 0, valid: 0, invalid: 0, inherited: 0 };

  for (const [entityId, intent] of intents) {
    if (blockedEntityIds.has(entityId)) {
      items.push({ entityId, entityType, status: "BLOCKED", reason: conflicts.find((conflict) => conflict.entityId === entityId).reason });
      continue;
    }

    const current = currentEntities.get(entityId);
    const previouslyPublished = currentEntities.has(entityId);

    if (intent.kind === "DELETE") {
      items.push(previouslyPublished
        ? { entityId, entityType, status: "REMOVED", reason: "Removed via explicit delete intent." }
        : { entityId, entityType, status: "UNCHANGED", reason: "Delete requested for an entity that was never published; nothing to remove." });
      continue;
    }

    if (intent.kind === "UNPUBLISH") {
      items.push(previouslyPublished
        ? { entityId, entityType, status: "UNPUBLISHED", reason: "Removed from public view via explicit unpublish intent." }
        : { entityId, entityType, status: "UNCHANGED", reason: "Unpublish requested for an entity that was never published." });
      continue;
    }

    // UPSERT. Window-1 already proved (no conflict above) that `current`
    // is content-identical to whatever this intent's baseline was frozen
    // against -- so discoverReferences(current) IS a valid, concrete stand-in
    // for `base` when computing each reference's referenceIntent below, with
    // no need for the Dirty Intent Store to carry full base snapshots, only
    // hashes.
    const editedRefs = discoverReferences(intent.value, { projectId: entityId });
    const baseRefs = discoverReferences(current, { projectId: entityId });
    const baseAssetKeys = new Set(baseRefs.filter((ref) => ref.kind === "asset").map((ref) => assetReferenceKey(ref)));
    const baseExternalByFieldPath = new Map(baseRefs.filter((ref) => ref.kind === "external").map((ref) => [ref.fieldPath, ref]));
    const baseTreeIds = new Set(baseRefs.filter((ref) => ref.kind === "asset-tree").map((ref) => ref.treeId));

    const resolvedPublicPathByKey = new Map();
    const assetResolutions = [];
    const blockingReasons = [];

    for (const reference of editedRefs) {
      if (reference.kind === "asset") {
        const referenceIntent = baseAssetKeys.has(assetReferenceKey(reference)) ? "inherited" : "changed";
        const resolved = await resolveAsset(
          { sourceAdapterId: reference.sourceAdapterId, assetId: reference.assetId, declaredPublicPath: reference.declaredPublicPath },
          referenceIntent,
          bundleAssets,
          { root },
        );
        assetIntegrity.total += 1;
        if (resolved.status !== "RESOLVED") {
          assetIntegrity.invalid += 1;
          blockingReasons.push(`Asset "${reference.fieldPath}" (${reference.sourceAdapterId}:${reference.assetId}) is ${resolved.status}${resolved.reason ? ` -- ${resolved.reason}` : "."}`);
          continue;
        }
        if (resolved.source === "published-fallback") assetIntegrity.inherited += 1;
        else assetIntegrity.valid += 1;

        // The intended on-disk path's extension must come from the actual
        // resolved content, never guessed from declaredPublicPath (a
        // brand-new "changed" reference legitimately has none yet). A
        // published-fallback result's own publicPath IS the real, already-
        // correct path; a bundle result's extension comes from the bundle
        // asset's own fileName/mimeType.
        let relativePath;
        let publicPath;
        if (resolved.source === "published-fallback") {
          publicPath = resolved.publicPath;
          relativePath = `public${publicPath}`;
        } else {
          const bundleAsset = bundleAssets.get(bundleAssetKey(reference.sourceAdapterId, reference.assetId));
          const location = getPublishedAssetLocation(reference.sourceAdapterId, entityId, reference.assetId, bundleAsset?.fileName || "");
          relativePath = location.relativePath;
          publicPath = location.publicPath;
        }
        resolvedPublicPathByKey.set(assetReferenceKey(reference), publicPath);
        assetResolutions.push({ fieldPath: reference.fieldPath, sourceAdapterId: reference.sourceAdapterId, assetId: reference.assetId, mimeType: resolved.mimeType, source: resolved.source, mimeMismatch: Boolean(resolved.mimeMismatch) });

        // Writeset Rule: a published-fallback resolution IS the file
        // already on disk at that exact path, by construction -- never a
        // WritesetEntry. A bundle-sourced resolution only enters the
        // writeset if its bytes actually differ from what's currently on
        // disk at the intended path.
        if (resolved.source === "bundle") {
          const onDiskHash = await currentFileHash(root, relativePath);
          const nextHash = hashBytes(resolved.bytes);
          if (onDiskHash !== nextHash) {
            writeset.push({ path: relativePath, expectedPreviousHash: onDiskHash, nextHash, content: resolved.bytes });
          }
        }
        continue;
      }

      if (reference.kind === "asset-tree") {
        const provided = bundleAssetTrees.get(reference.treeId);
        const publicDirectory = deriveTreePublicDirectory(reference, provided?.publicDirectory);
        if (!publicDirectory) {
          blockingReasons.push(`Asset tree "${reference.treeId}" has no known public directory (no declared entry path and none provided).`);
          continue;
        }
        const publishedFiles = await readPublishedTree(root, publicDirectory);
        const providedByPath = new Map((provided?.providedFiles ?? []).map((file) => [file.relativePath, file.bytes]));
        const requiredRelativePaths = provided?.requiredRelativePaths
          ?? (reference.declaredEntryPublicPath ? [path.posix.basename(reference.declaredEntryPublicPath)] : []);
        // Required files must be checked even if they exist in NEITHER the
        // currently-published tree nor the bundle-provided set -- otherwise
        // a required file that's simply absent everywhere would never be
        // attempted and so never surface as missing.
        const allRelativePaths = new Set([...publishedFiles.map((file) => file.relativePath), ...providedByPath.keys(), ...requiredRelativePaths]);
        const expectedFiles = [...allRelativePaths].map((relativePath) => ({ relativePath, bytes: providedByPath.get(relativePath) }));

        const resolvedTree = await resolveAssetTree({ publicDirectory, expectedFiles, requiredRelativePaths }, { root });
        if (resolvedTree.status !== "RESOLVED") {
          blockingReasons.push(`Asset tree "${reference.treeId}" is ${resolvedTree.status} -- ${resolvedTree.reason}`);
          continue;
        }
        const treeWriteset = await assessTreeWriteset(resolvedTree.files, { root, publicDirectory });
        writeset.push(...treeWriteset);
        assetResolutions.push({ fieldPath: reference.fieldPath, sourceAdapterId: reference.sourceAdapterId, treeId: reference.treeId, fileCount: resolvedTree.files.length, changedFileCount: treeWriteset.length });
        continue;
      }

      if (reference.kind === "external") {
        const baseExternal = baseExternalByFieldPath.get(reference.fieldPath);
        const referenceIntent = baseExternal && baseExternal.url === reference.url ? "inherited" : "changed";
        const resolved = resolveExternalReference(reference, referenceIntent);
        if (resolved.status !== "RESOLVED") {
          blockingReasons.push(`External reference "${reference.fieldPath}" is BLOCKED -- ${resolved.reason}`);
          continue;
        }
        assetResolutions.push({ fieldPath: reference.fieldPath, sourceAdapterId: "external-embeds", url: resolved.url });
      }
    }

    if (blockingReasons.length) {
      items.push({ entityId, entityType, status: "BLOCKED", reason: blockingReasons.join(" ") });
      continue;
    }

    const nextValue = applyResolvedReferences(intent.value, editedRefs, resolvedPublicPathByKey);
    const status = !previouslyPublished
      ? "NEW"
      : hashContent(current) === hashContent(nextValue)
        ? "UNCHANGED"
        : "UPDATED";
    items.push({ entityId, entityType, status, value: nextValue, assetResolutions });
    void baseTreeIds; // reserved for future tree-level UPDATED/UNCHANGED reporting granularity
  }

  const counts = { NEW: 0, UPDATED: 0, UNCHANGED: 0, REMOVED: 0, UNPUBLISHED: 0, BLOCKED: 0 };
  for (const item of items) counts[item.status] += 1;

  return {
    conflicts,
    items,
    writeset,
    counts,
    blocked: counts.BLOCKED > 0,
    assetIntegrity,
  };
}
