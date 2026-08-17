// Final Assembly (Publishing Architecture V2, Cutover). PublishPlan.items
// only covers entities that carried an intent this run (the dirty ones) --
// producing the actual whole publishedPortfolio.json requires combining
// those resolved values with everything else carried forward unchanged from
// currentPublished (untouched entities nothing asked V2 to touch). This is a
// PURE STRUCTURAL MERGE, not judgment: every status (NEW/UPDATED/UNCHANGED/
// REMOVED/UNPUBLISHED/BLOCKED) was already decided once, by
// buildPublishPlan.mjs; this module only decides where each already-resolved
// value lands in the output file shape. A BLOCKED item is never reached here
// in practice (plan.blocked already refuses the whole publish upstream), but
// is skipped defensively (no rewrite) rather than assumed absent.
//
// @param {{
//   currentPublished: object,
//   projectPlan: import("./buildPublishPlan.mjs").PublishPlan,
//   gameExperiencePlan: import("./buildPublishPlan.mjs").PublishPlan,
//   projectBodyTarget: Map<string, "drafts"|"documents">,
//   generatedAt: string,
// }} options
export function assemblePublishedOutput({ currentPublished, projectPlan, gameExperiencePlan, projectBodyTarget, generatedAt }) {
  const projectCatalog = { ...(currentPublished.projectCatalog || {}) };
  const drafts = { ...(currentPublished.drafts || {}) };
  const documents = { ...(currentPublished.projectDocuments?.documents || {}) };
  const covers = { ...(currentPublished.covers || {}) };

  for (const item of projectPlan.items) {
    const id = item.entityId;
    if (item.status === "REMOVED") {
      delete projectCatalog[id];
      delete drafts[id];
      delete documents[id];
      delete covers[id];
      continue;
    }
    if (item.status !== "NEW" && item.status !== "UPDATED") continue; // UNCHANGED/BLOCKED/UNPUBLISHED -> no rewrite for this entity

    const value = item.value;
    if (value.meta !== undefined) projectCatalog[id] = value.meta;
    else delete projectCatalog[id];

    const target = projectBodyTarget.get(id) ?? "drafts";
    delete drafts[id];
    delete documents[id];
    if (value.body !== undefined) {
      if (target === "documents") documents[id] = value.body;
      else drafts[id] = value.body;
    }

    if (value.cover?.publicUrl) covers[id] = value.cover.publicUrl;
    else delete covers[id];
  }

  // GameExperienceStore carries store-level metadata (homepageLimit,
  // updatedAt, and whatever else the real schema adds later) alongside
  // records -- V2's entity merge only ever produces per-RECORD intents, so
  // it must never replace the whole store, only ever replace/merge `records`
  // within it. currentPublished.gameExperience is spread first so every
  // store-level field neither this run's intents nor this function has any
  // opinion about survives unchanged, by construction -- the same
  // absence-means-unchanged rule already applied to every other field in
  // this file, just at the store level instead of the entity level. (Root
  // cause of a real production incident: an earlier version of this function
  // rebuilt gameExperience as `{ schemaVersion, records }` only, silently
  // dropping homepageLimit/updatedAt from every publish that touched any
  // Game Experience record.)
  let gameExperience = currentPublished.gameExperience;
  if (gameExperiencePlan.items.length && currentPublished.gameExperience) {
    const recordsById = new Map((currentPublished.gameExperience.records || []).map((record) => [record.id, record]));
    for (const item of gameExperiencePlan.items) {
      if (item.status === "REMOVED") { recordsById.delete(item.entityId); continue; }
      if (item.status !== "NEW" && item.status !== "UPDATED") continue; // UNCHANGED/BLOCKED/UNPUBLISHED (no new value supplied) -> leave as currently published
      recordsById.set(item.entityId, item.value);
    }
    gameExperience = { ...currentPublished.gameExperience, records: [...recordsById.values()] };
  }

  // Informational/audit trail only (PublishedAsset[] -- not read by any
  // runtime code path, see src/lib/publishedPortfolio.ts's own type). Carry
  // forward every currently-published entry, then append one entry per
  // writeset path actually written this run that isn't already represented.
  const existingAssetPaths = new Set((currentPublished.assets || []).map((asset) => asset.publicPath));
  const newAssetEntries = [...projectPlan.writeset, ...gameExperiencePlan.writeset]
    .filter((entry) => entry.path.startsWith("public/") && !existingAssetPaths.has(entry.path.replace(/^public/, "")))
    .map((entry) => ({
      sourceAdapterId: "publish-plan-writeset",
      sourceDatabase: "",
      sourceStore: "",
      sourceId: entry.path,
      publicPath: entry.path.replace(/^public/, ""),
    }));

  return {
    version: 1,
    generatedAt,
    drafts,
    projectCatalog,
    projectDocuments: { version: 1, documents },
    ...(gameExperience ? { gameExperience } : {}),
    covers,
    assets: [...(currentPublished.assets || []), ...newAssetEntries],
  };
}
