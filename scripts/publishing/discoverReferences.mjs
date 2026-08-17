// Recursive reference discovery (Publishing Architecture V2, Phase A).
// Replaces buildPublishPlan.mjs's earlier dependency on a caller-declared
// `value.assets: Record<key, reference>` map with real discovery over an
// entity's actual nested content tree -- the same field-name/sibling-shape
// table V1's collectContentTree (publishing-preflight-lib.mjs) uses to
// decide WHICH adapter a given key belongs to, since that mapping is
// unavoidable, load-bearing domain knowledge that both V1 and V2 must agree
// on to ever reach parity.
//
// This module deliberately does ONLY discovery -- "here is a reference" --
// and NONE of collectContentTree's judgment:
//   - no missing/BLOCKED decisions
//   - no fallback resolution
//   - no integrity checks
//   - no registry-membership checks
//   - no bundle-presence checks
// All discovered single-file asset references are handed to resolveAsset.mjs
// (via buildPublishPlan.mjs) for that judgment; asset-tree references go to
// resolveAssetTree.mjs; external references go to resolveExternalReference.mjs.
// referenceIntent (inherited vs. changed) is still computed by
// buildPublishPlan.mjs alone, by diffing this module's output for base vs.
// edited content -- never here.

const RESOURCE_KEYS = new Set([
  "assetId", "posterAssetId", "imageId", "localImageId", "coverAssetId", "detectedCoverAssetId",
  "coverId", "projectCoverId", "gameId", "publicPath", "publicUrl", "posterPublicPath", "entryPublicPath", "figmaUrl", "sourceUrl", "embedUrl", "playUrl",
]);

/**
 * @typedef {
 *   | { kind: "asset", sourceAdapterId: string, assetId: string, declaredPublicPath?: string, fieldPath: string }
 *   | { kind: "asset-tree", sourceAdapterId: "playable-game-builds", treeId: string, declaredEntryPublicPath?: string, fieldPath: string }
 *   | { kind: "external", sourceAdapterId: "external-embeds", url: string, fieldPath: string }
 * } DiscoveredReference
 */

// projectId is the only context discovery needs -- it's what
// dynamic-template-images vs. ui-practice-images depends on (identical to
// V1's context.projectId === "ui-personal-practice" check).
export function discoverReferences(value, context = {}) {
  const found = [];
  walk(value, { projectId: context.projectId, fieldPath: context.fieldPath || "" }, found);
  return found;
}

function walk(value, context, found) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, { ...context, fieldPath: `${context.fieldPath}[${index}]` }, found));
    return;
  }
  const record = value;
  for (const [key, item] of Object.entries(record)) {
    const fieldPath = context.fieldPath ? `${context.fieldPath}.${key}` : key;
    // A game reference with a playUrl sibling has migrated to one canonical
    // hosted build (see CHANGELOG.md 2026-08-08) -- its gameId/entryPublicPath
    // are no longer real local-asset references, only playUrl itself is
    // walked, exactly like V1.
    const migratedGameField = (key === "gameId" || key === "entryPublicPath")
      && typeof record.playUrl === "string" && record.playUrl.trim();
    if (typeof item === "string" && item.trim() && RESOURCE_KEYS.has(key) && !migratedGameField) {
      const descriptor = describeReference(key, item, record, fieldPath, context);
      if (descriptor) found.push(descriptor);
    }
    walk(item, { ...context, fieldPath }, found);
  }
}

// One descriptor per REAL reference -- a plain sibling field (publicPath,
// publicUrl, posterPublicPath, entryPublicPath) never produces its own
// descriptor; it's folded into the descriptor produced by its owning id key
// (declaredPublicPath / declaredEntryPublicPath), exactly mirroring how V1
// only ever pushes one manifest.assets entry per logical reference, keyed
// off the id field, with the path field captured as metadata alongside it.
function describeReference(key, item, record, fieldPath, context) {
  if (key === "figmaUrl" || key === "sourceUrl" || key === "embedUrl" || key === "playUrl") {
    return { kind: "external", sourceAdapterId: "external-embeds", url: item, fieldPath };
  }
  if (key === "gameId") {
    return {
      kind: "asset-tree",
      sourceAdapterId: "playable-game-builds",
      treeId: item,
      declaredEntryPublicPath: typeof record.entryPublicPath === "string" ? record.entryPublicPath : undefined,
      fieldPath,
    };
  }
  if (key === "entryPublicPath") {
    // Only ever a sibling of gameId (folded into that descriptor above) or,
    // post-migration, of playUrl (excluded above) -- on its own it names
    // nothing new.
    return null;
  }
  if (key === "coverId" && typeof record.publicUrl === "string") {
    return { kind: "asset", sourceAdapterId: "playable-game-covers", assetId: item, declaredPublicPath: record.publicUrl, fieldPath, publicPathFieldKey: "publicUrl" };
  }
  if (key === "publicUrl" && typeof record.coverId === "string") {
    return null; // folded into the coverId descriptor above
  }
  if (key === "projectCoverId") {
    // A project's card/header cover (project-covers-disk) -- distinct key
    // from "coverId" (which already means playable-game-covers) so the two
    // adapters never collide in this shared, key-name-based table. Assigned
    // its own dedicated field pair, same shape family as every other single
    // -file reference (id + sibling publicPath-ish field), so it flows
    // through the exact same discovery -> resolveAsset -> writeset path as
    // everything else -- no second resolver, no adapter-specific branch
    // anywhere downstream of this table entry.
    return { kind: "asset", sourceAdapterId: "project-covers-disk", assetId: item, declaredPublicPath: stringOrUndefined(record.publicUrl), fieldPath, publicPathFieldKey: "publicUrl" };
  }
  if (key === "publicUrl" && typeof record.projectCoverId === "string") {
    return null; // folded into the projectCoverId descriptor above
  }
  if (key === "localImageId") {
    return { kind: "asset", sourceAdapterId: "project-body-indexeddb-assets", assetId: item, declaredPublicPath: stringOrUndefined(record.publicPath), fieldPath, publicPathFieldKey: "publicPath" };
  }
  if (key === "assetId") {
    return { kind: "asset", sourceAdapterId: "project-body-indexeddb-assets", assetId: item, declaredPublicPath: stringOrUndefined(record.publicPath), fieldPath, publicPathFieldKey: "publicPath" };
  }
  if (key === "posterAssetId") {
    return { kind: "asset", sourceAdapterId: "project-body-indexeddb-assets", assetId: item, declaredPublicPath: stringOrUndefined(record.posterPublicPath), fieldPath, publicPathFieldKey: "posterPublicPath" };
  }
  if (key === "coverAssetId" || key === "detectedCoverAssetId") {
    // Game Experience's cover sibling field is always literally named
    // coverPublicPath across the whole codebase (see src/lib/gameExperience.ts,
    // gameExperiencePublishSchema.ts, and V1's own report-lib construction) --
    // never the generic publicPath/publicUrl guess used by other adapters
    // (posterAssetId has the identical fixed-name shape, via posterPublicPath,
    // for the same reason). Discovering this reference under the wrong sibling
    // field name would inject a brand-new, spurious `publicPath` key into
    // every record's presentation object on every resolve (a real, confirmed
    // bug: a live dry-run against a real bundle showed all 33 real Game
    // Experience records reporting UPDATED for exactly this reason, with the
    // correct coverPublicPath left untouched alongside the new bogus field).
    return { kind: "asset", sourceAdapterId: "game-experience-covers", assetId: item, declaredPublicPath: stringOrUndefined(record.coverPublicPath), fieldPath, publicPathFieldKey: "coverPublicPath" };
  }
  if (key === "imageId") {
    const adapterId = context.projectId === "ui-personal-practice" ? "ui-practice-images" : "dynamic-template-images";
    const publicPathFieldKey = typeof record.publicPath !== "string" && typeof record.publicUrl === "string" ? "publicUrl" : "publicPath";
    return { kind: "asset", sourceAdapterId: adapterId, assetId: item, declaredPublicPath: stringOrUndefined(record.publicPath) ?? stringOrUndefined(record.publicUrl), fieldPath, publicPathFieldKey };
  }
  // Plain publicPath/publicUrl/posterPublicPath keys with no id-bearing
  // sibling of their own are not a reference in V1 either -- they only ever
  // matter as metadata alongside an id key, which is captured above.
  return null;
}

function stringOrUndefined(value) {
  return typeof value === "string" ? value : undefined;
}

// Keyed identity for a single-file asset reference -- (sourceAdapterId,
// assetId) is what buildPublishPlan.mjs uses to match a reference between
// base and edited content when computing referenceIntent, and what
// resolveAsset.mjs already keys bundle assets by (see bundleAssetKey in
// resolveAsset.mjs). declaredPublicPath is deliberately NOT part of
// identity -- the same asset id can legitimately carry a stale declared
// path across an edit (that staleness is exactly what the disk-fallback
// path-basename check in resolveAsset.mjs guards against, not this key).
export function assetReferenceKey(reference) {
  return JSON.stringify([reference.sourceAdapterId, reference.assetId]);
}

// Splits a discovered fieldPath ("templateInstances[0].content.localImageId")
// into ["templateInstances", 0, "content", "localImageId"] -- numeric
// segments from array-index brackets, string segments otherwise.
function splitFieldPath(fieldPath) {
  const segments = [];
  for (const part of fieldPath.split(".")) {
    const match = part.match(/^([^[]+)((?:\[\d+])*)$/);
    if (!match) { segments.push(part); continue; }
    segments.push(match[1]);
    for (const indexMatch of match[2].matchAll(/\[(\d+)]/g)) segments.push(Number(indexMatch[1]));
  }
  return segments;
}

// Deep-clones `value` and writes each resolved reference's publicPath onto
// its declared sibling field (publicPath/publicUrl/posterPublicPath, per
// each descriptor's own publicPathFieldKey) -- the V2 equivalent of V1's
// replaceImagePaths, built on top of discoverReferences() instead of a
// second, separately-written tree walk. asset-tree/external references are
// rewritten by their own resolvers' callers, not here (this only ever
// touches single-file `kind: "asset"` descriptors, which are the only kind
// that carries a publicPathFieldKey).
//
// @param {unknown} value
// @param {DiscoveredReference[]} references -- from discoverReferences(value)
// @param {Map<string, string>} resolvedPublicPathByKey -- assetReferenceKey(ref) -> resolved publicPath
export function applyResolvedReferences(value, references, resolvedPublicPathByKey) {
  const clone = structuredClone(value);
  for (const reference of references) {
    if (reference.kind !== "asset" || !reference.publicPathFieldKey) continue;
    const resolvedPublicPath = resolvedPublicPathByKey.get(assetReferenceKey(reference));
    if (resolvedPublicPath === undefined) continue;
    const segments = splitFieldPath(reference.fieldPath);
    const parentSegments = segments.slice(0, -1);
    let parent = clone;
    for (const segment of parentSegments) {
      if (parent === null || parent === undefined) break;
      parent = parent[segment];
    }
    if (parent && typeof parent === "object") parent[reference.publicPathFieldKey] = resolvedPublicPath;
  }
  return clone;
}
