// V1-format-bundle -> V2-entity-intent compatibility adapter (Publishing
// Architecture V2, Cutover). The real "EXPORT FOR PUBLISH" button still
// produces V1-shaped bundles (productionBundleExportV2.ts is not wired into
// any live export entry point yet) -- this is the ONE formal place such a
// bundle is translated into the Edit Intent Model's entities/intents, for
// buildPublishPlan.mjs to judge. Used by the live import CLI
// (import-production-bundle.mjs). Per the frozen architecture: this module
// does ONLY format translation (constructing entities/intents from the
// bundle's own already-declared shape and the currently-published state) --
// it makes NO judgment. It does not decide missing/BLOCKED/status, does not
// resolve assets, does not diff content beyond "is this id present." All of
// that is buildPublishPlan.mjs's job, applied uniformly to whatever intents
// this adapter hands it.
//
// A project's V2 entity value is shaped exactly like productionBundleExportV2.ts's
// ProjectEditValue -- { meta, body, cover } -- so discoverReferences.mjs finds
// project covers (projectCoverId/publicUrl) and legacy ProjectDocument bodies
// through the SAME generic path a V2-native export would use, closing the
// narrower draft-only scope the parity harness (compareV1V2.mjs) deliberately
// accepted for comparison purposes only (see its own EXPLAINED_LEGACY_REPRESENTATION
// notes) -- the real publish path must not have that gap.
import { hashContent } from "./contentHash.mjs";
import { bundleAssetKey } from "./resolveAsset.mjs";

function currentProjectEntity(currentPublished, projectId) {
  const meta = currentPublished.projectCatalog?.[projectId];
  const body = currentPublished.drafts?.[projectId] ?? currentPublished.projectDocuments?.documents?.[projectId];
  const coverUrl = currentPublished.covers?.[projectId];
  const cover = coverUrl ? { projectCoverId: projectId, publicUrl: coverUrl } : undefined;
  if (meta === undefined && body === undefined && cover === undefined) return undefined;
  return { meta, body, cover };
}

/**
 * projects: a project is "touched" this run iff it has a fresh body (bundle.drafts
 * or bundle.projectDocuments.documents), a fresh cover image in bundle.images, or
 * an explicit delete intent (bundle.deletedProjectIds) -- mirroring V1's own
 * per-field inherit rule (import-production-bundle.mjs's draft/document/cover
 * merges) applied at the entity level. A project touched by none of these is
 * "no local edit this cycle" (V1's inherit case) -- no V2 intent at all, so
 * buildPublishPlan.mjs correctly does nothing for it. Catalog-only metadata
 * (bundle.projectCatalog, a full per-export snapshot of every locally-known
 * project) is deliberately NOT itself a touch signal -- it is present for
 * essentially every project on every export, so treating it as "touched"
 * would defeat the inherit rule entirely; catalog values still flow into a
 * touched project's `meta` field (bundle's own if present, else inherited).
 *
 * gameExperienceRecords: V1 has NO per-record inherit for Game Experience --
 * the historical importer replaced the ENTIRE store with
 * bundle.gameExperience.records verbatim on every run (documented Root
 * Cause #7: a record present in currentPublished but absent from the bundle
 * was SILENTLY DROPPED). V2 deliberately does not replicate this -- absence
 * never means delete. Every bundle-present record becomes an UPSERT intent;
 * records V1 would have silently dropped are reported (droppedByV1) but
 * never fed into V2 as any kind of intent.
 *
 * baseContentHash for every intent is synthesized as
 * hash(currentPublished's own current value) -- "assume no Window-1
 * conflict." A real bundle produced by V1's still-frozen exporter carries no
 * real baseline (the Dirty Intent Store didn't exist when it was captured),
 * so this is the correct, honest translation: it can never produce a false
 * conflict, and Window-1 simply has nothing to catch for these bundles until
 * the browser export itself is cut over to read real baselines.
 */
export function bundleV1ToV2AllIntents(bundle, currentPublished, options = {}) {
  const excludeProjectIds = options.excludeProjectIds ?? new Set();
  const deletedProjectIds = new Set(Array.isArray(bundle.deletedProjectIds) ? bundle.deletedProjectIds.filter((id) => typeof id === "string") : []);
  const catalogStore = bundle.projectCatalog?.version === 1
    ? bundle.projectCatalog
    : bundle.publicMetadata?.version === 1
      ? bundle.publicMetadata
      : { projects: {} };
  const bundleDrafts = bundle.drafts || {};
  const bundleDocuments = bundle.projectDocuments?.version === 1 ? (bundle.projectDocuments.documents || {}) : {};
  const coverImageIdsInBundle = new Set(
    (Array.isArray(bundle.images) ? bundle.images : [])
      .filter((image) => image?.sourceAdapterId === "project-covers-disk" || image?.sourceAdapterId === "project-covers-indexeddb")
      .map((image) => image.id),
  );

  const touchedProjectIds = new Set([
    ...Object.keys(bundleDrafts),
    ...Object.keys(bundleDocuments),
    ...coverImageIdsInBundle,
    ...deletedProjectIds,
  ]);

  const projectIntents = new Map();
  const projectCurrentEntities = new Map();
  // Which output file family (drafts vs projectDocuments.documents) each
  // touched project's resolved body belongs to -- decided here, at
  // translation time, from the bundle's/currentPublished's own already-known
  // shape (a project's body is EITHER a dynamic draft OR a legacy
  // ProjectDocument, never both), so the final-assembly step
  // (assemblePublishedOutput.mjs) never has to guess it back out of content
  // shape.
  const projectBodyTarget = new Map();
  const allKnownProjectIds = new Set([...touchedProjectIds, ...Object.keys(currentPublished.projectCatalog || {})]);
  for (const projectId of allKnownProjectIds) {
    const current = currentProjectEntity(currentPublished, projectId);
    if (current !== undefined) projectCurrentEntities.set(projectId, current);
    if (excludeProjectIds.has(projectId) || !touchedProjectIds.has(projectId)) continue;

    if (deletedProjectIds.has(projectId)) {
      projectIntents.set(projectId, { kind: "DELETE", baseContentHash: hashContent(current) });
      continue;
    }

    const meta = Object.prototype.hasOwnProperty.call(catalogStore.projects || {}, projectId) ? catalogStore.projects[projectId] : current?.meta;
    const hasBundleDraft = Object.prototype.hasOwnProperty.call(bundleDrafts, projectId);
    const hasBundleDocument = Object.prototype.hasOwnProperty.call(bundleDocuments, projectId);
    const body = hasBundleDraft ? bundleDrafts[projectId] : hasBundleDocument ? bundleDocuments[projectId] : current?.body;
    projectBodyTarget.set(projectId, hasBundleDraft
      ? "drafts"
      : hasBundleDocument
        ? "documents"
        : Object.prototype.hasOwnProperty.call(currentPublished.projectDocuments?.documents || {}, projectId)
          ? "documents"
          : "drafts");
    const cover = coverImageIdsInBundle.has(projectId)
      ? { projectCoverId: projectId, publicUrl: currentPublished.covers?.[projectId] || `/images/published/covers/${projectId}` }
      : current?.cover;
    projectIntents.set(projectId, { kind: "UPSERT", baseContentHash: hashContent(current), value: { meta, body, cover } });
  }

  const bundleGameRecords = Array.isArray(bundle.gameExperience?.records) ? bundle.gameExperience.records : [];
  const currentGameRecords = Array.isArray(currentPublished.gameExperience?.records) ? currentPublished.gameExperience.records : [];
  const currentGameById = new Map(currentGameRecords.filter((r) => r?.id).map((r) => [r.id, r]));
  const gameExperienceIntents = new Map();
  const gameExperienceCurrentEntities = new Map();
  for (const record of bundleGameRecords) {
    if (!record?.id) continue;
    const current = currentGameById.get(record.id);
    if (current !== undefined) gameExperienceCurrentEntities.set(record.id, current);
    gameExperienceIntents.set(record.id, { kind: "UPSERT", baseContentHash: hashContent(current), value: record });
  }
  const bundleGameIds = new Set(bundleGameRecords.filter((r) => r?.id).map((r) => r.id));
  const gameExperienceDroppedByV1 = currentGameRecords.filter((r) => r?.id && !bundleGameIds.has(r.id)).map((r) => r.id);

  const uiPracticeChanged = JSON.stringify(bundle.uiPractice ?? null) !== JSON.stringify(currentPublished.uiPractice ?? null);

  return { projectIntents, projectCurrentEntities, projectBodyTarget, gameExperienceIntents, gameExperienceCurrentEntities, gameExperienceDroppedByV1, uiPracticeChanged, touchedProjectIds };
}

// Converts a real V1-format bundle's `images` array (base64 blobs) into the
// Map shape resolveAsset.mjs expects (bundleAssetKey(sourceAdapterId,
// assetId) -> { bytes, fileName, mimeType }). Cover images are re-keyed onto
// the single "project-covers-disk" adapter id regardless of which of V1's two
// cover adapter ids (project-covers-disk / project-covers-indexeddb) actually
// collected them -- discoverReferences.mjs's projectCoverId branch always
// discovers references under "project-covers-disk" (see its own comment on
// why the two adapters must never collide downstream of that table entry;
// project-covers-indexeddb is a dead adapter with zero real writers per the
// Registry Coverage Matrix), so a bundle image collected under the other id
// must still be reachable under the key V2 will actually look up.
export function bundleV1ToV2BundleAssets(bundle) {
  const bundleAssets = new Map();
  for (const image of Array.isArray(bundle.images) ? bundle.images : []) {
    if (!image || typeof image.sourceAdapterId !== "string" || typeof image.id !== "string" || typeof image.dataBase64 !== "string") continue;
    const adapterId = (image.sourceAdapterId === "project-covers-disk" || image.sourceAdapterId === "project-covers-indexeddb")
      ? "project-covers-disk"
      : image.sourceAdapterId;
    bundleAssets.set(bundleAssetKey(adapterId, image.id), {
      bytes: Buffer.from(image.dataBase64, "base64"),
      fileName: image.fileName,
      mimeType: image.mimeType,
    });
  }
  return bundleAssets;
}
