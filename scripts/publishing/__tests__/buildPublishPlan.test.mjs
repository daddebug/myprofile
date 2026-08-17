import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { hashContent } from "../contentHash.mjs";
import { bundleAssetKey } from "../resolveAsset.mjs";
import { detectWindow1Conflicts, buildPublishPlan } from "../buildPublishPlan.mjs";
import { VALID_PNG_BYTES, withFixtureRepo } from "./fixtureRepo.mjs";

// ==== Window-1 conflict detection, tested in isolation first (Final
// Implementation Order Step 4) -- UPSERT/UNPUBLISH/DELETE alike, no
// exception for DELETE (Publishing Architecture V2, Conflict Model). ====

{
  const currentEntities = new Map([
    ["project-a", { title: "A published" }],
    ["project-b", { title: "B published" }],
    ["project-c", { title: "C published" }],
  ]);
  const intents = new Map([
    // UPSERT whose frozen baseline matches current -> no conflict.
    ["project-a", { kind: "UPSERT", baseContentHash: hashContent({ title: "A published" }), value: { title: "A edited" } }],
    // UNPUBLISH whose frozen baseline is STALE (production moved on) -> conflict.
    ["project-b", { kind: "UNPUBLISH", baseContentHash: hashContent({ title: "B stale baseline" }) }],
    // DELETE whose frozen baseline is STALE -> conflict (the DELETE-concurrency fix: a stale
    // delete must never remove a production entity that changed after the delete was requested).
    ["project-c", { kind: "DELETE", baseContentHash: hashContent({ title: "C stale baseline" }) }],
  ]);
  const conflicts = detectWindow1Conflicts(intents, currentEntities);
  const conflictIds = conflicts.map((c) => c.entityId).sort();
  assert.deepEqual(conflictIds, ["project-b", "project-c"], `expected only project-b and project-c to conflict, got: ${JSON.stringify(conflictIds)}`);
  assert(conflicts.every((c) => typeof c.reason === "string" && c.reason.length > 0));
}
console.log("Window-1: UPSERT clean / UNPUBLISH stale / DELETE stale -> only the stale two conflict, passed");

{
  // An entity never published before, with an UPSERT baseline computed
  // against "nothing published yet" (hashContent(undefined)) -> no conflict,
  // since currentEntities.get() also returns undefined for it.
  const currentEntities = new Map(); // nothing published at all
  const intents = new Map([
    ["project-new", { kind: "UPSERT", baseContentHash: hashContent(undefined), value: { title: "New" } }],
  ]);
  const conflicts = detectWindow1Conflicts(intents, currentEntities);
  assert.equal(conflicts.length, 0, "a brand-new entity's baseline (hash of 'never published') must not conflict against an equally-absent current state");
}
console.log("Window-1: brand-new entity, baseline matches absence -> no conflict, passed");

// ==== Full buildPublishPlan: entity status transitions ====

await withFixtureRepo(async (root) => {
  const currentEntities = new Map([
    ["project-updated", { title: "old title" }],
    ["project-unchanged", { title: "same title" }],
    ["project-removed", { title: "to be removed" }],
    ["project-unpublished", { title: "to be unpublished" }],
  ]);
  const intents = new Map([
    ["project-new", { kind: "UPSERT", baseContentHash: hashContent(undefined), value: { title: "brand new" } }],
    ["project-updated", { kind: "UPSERT", baseContentHash: hashContent(currentEntities.get("project-updated")), value: { title: "new title" } }],
    ["project-unchanged", { kind: "UPSERT", baseContentHash: hashContent(currentEntities.get("project-unchanged")), value: { title: "same title" } }],
    ["project-removed", { kind: "DELETE", baseContentHash: hashContent(currentEntities.get("project-removed")) }],
    ["project-unpublished", { kind: "UNPUBLISH", baseContentHash: hashContent(currentEntities.get("project-unpublished")) }],
    ["project-never-existed", { kind: "DELETE", baseContentHash: hashContent(undefined) }],
  ]);

  const plan = await buildPublishPlan({ root, entityType: "project", currentEntities, intents, bundleAssets: new Map() });
  assert.equal(plan.blocked, false, `expected nothing blocked, got: ${JSON.stringify(plan.items)}`);
  const statusOf = (id) => plan.items.find((item) => item.entityId === id)?.status;

  assert.equal(statusOf("project-new"), "NEW");
  assert.equal(statusOf("project-updated"), "UPDATED");
  assert.equal(statusOf("project-unchanged"), "UNCHANGED");
  assert.equal(statusOf("project-removed"), "REMOVED");
  assert.equal(statusOf("project-unpublished"), "UNPUBLISHED");
  assert.equal(statusOf("project-never-existed"), "UNCHANGED", "a DELETE for an entity that was never published must be a no-op, not REMOVED");
  assert.equal(plan.counts.NEW, 1);
  assert.equal(plan.counts.UPDATED, 1);
  assert.equal(plan.counts.UNCHANGED, 2);
  assert.equal(plan.counts.REMOVED, 1);
  assert.equal(plan.counts.UNPUBLISHED, 1);
});
console.log("buildPublishPlan: NEW/UPDATED/UNCHANGED/REMOVED/UNPUBLISHED status transitions, passed");

await withFixtureRepo(async (root) => {
  // A DELETE whose baseline is stale -> BLOCKED (Window-1 conflict), not REMOVED.
  const currentEntities = new Map([["project-x", { title: "changed after delete was requested" }]]);
  const intents = new Map([
    ["project-x", { kind: "DELETE", baseContentHash: hashContent({ title: "original, before the change" }) }],
  ]);
  const plan = await buildPublishPlan({ root, entityType: "project", currentEntities, intents, bundleAssets: new Map() });
  assert.equal(plan.blocked, true);
  const item = plan.items.find((i) => i.entityId === "project-x");
  assert.equal(item.status, "BLOCKED");
  assert.equal(plan.conflicts.length, 1);
  assert.equal(plan.conflicts[0].entityId, "project-x");
});
console.log("buildPublishPlan: stale DELETE -> BLOCKED via Window-1 conflict, entity never removed, passed");

// ==== Recursive discovery + asset resolution + Writeset Rule integration ====
// Entities now use REAL nested content shapes (discovered via
// discoverReferences.mjs), not a flat `value.assets` map -- proving V2's
// discovery-to-resolution pipeline end to end, the same way a real project
// draft with a deeply nested image reference would flow through.

await withFixtureRepo(async (root) => {
  // Inherited reference (unchanged from base) resolved via published
  // fallback -> RESOLVED and counted, but must NEVER enter the writeset
  // (Writeset Rule: a published-fallback result is already on disk). Uses
  // "dynamic-template-images" -- one of the 4 adapters V1's disk fallback
  // (and this resolver, for parity) actually supports.
  const projectId = "project-inherited-asset";
  const assetId = "cover-asset";
  const declaredPublicPath = `/images/published/template-images/${projectId}/${assetId}.png`;
  const assetDir = path.join(root, "public", "images", "published", "template-images", projectId);
  await mkdir(assetDir, { recursive: true });
  await writeFile(path.join(assetDir, `${assetId}.png`), VALID_PNG_BYTES);

  const content = { templateInstances: [{ content: { imageRow: { images: [{ imageId: assetId, publicPath: declaredPublicPath }] } } }] };
  const currentEntities = new Map([[projectId, content]]);
  const intents = new Map([
    [projectId, { kind: "UPSERT", baseContentHash: hashContent(content), value: content }],
  ]);

  const plan = await buildPublishPlan({ root, entityType: "project", currentEntities, intents, bundleAssets: new Map() });
  assert.equal(plan.blocked, false, JSON.stringify(plan.items));
  assert.equal(plan.writeset.length, 0, "an inherited, resolved-via-fallback asset must never enter the writeset");
  assert.equal(plan.assetIntegrity.inherited, 1);
  const item = plan.items.find((i) => i.entityId === projectId);
  assert.equal(item.status, "UNCHANGED");
  assert.equal(item.value.templateInstances[0].content.imageRow.images[0].publicPath, declaredPublicPath);
});
console.log("buildPublishPlan: deeply nested inherited asset resolved via fallback -> writeset stays empty, passed");

await withFixtureRepo(async (root) => {
  // Changed reference with a valid new bundle asset -> RESOLVED via bundle,
  // writeset gets exactly one entry, and the resolved publicPath is rewritten
  // into the exact nested field the reference was discovered at.
  const projectId = "project-changed-asset";
  const current = { templateInstances: [{ content: { imageRow: { images: [{ imageId: "cover-old", publicPath: `/images/published/template-images/${projectId}/cover-old.png` }] } } }] };
  const edited = { templateInstances: [{ content: { imageRow: { images: [{ imageId: "cover-new" }] } } }] };
  const currentEntities = new Map([[projectId, current]]);
  const intents = new Map([
    [projectId, { kind: "UPSERT", baseContentHash: hashContent(current), value: edited }],
  ]);
  const bundleAssets = new Map([
    [bundleAssetKey("dynamic-template-images", "cover-new"), { bytes: VALID_PNG_BYTES, fileName: "cover-new.png" }],
  ]);

  const plan = await buildPublishPlan({ root, entityType: "project", currentEntities, intents, bundleAssets });
  assert.equal(plan.blocked, false, JSON.stringify(plan.items));
  assert.equal(plan.writeset.length, 1, "a changed reference newly resolved from the bundle must produce exactly one writeset entry");
  assert.equal(plan.writeset[0].expectedPreviousHash, null, "the target path never existed on disk before this write");
  assert.equal(plan.assetIntegrity.valid, 1);
  const item = plan.items.find((i) => i.entityId === projectId);
  assert.equal(item.status, "UPDATED");
  assert.equal(item.value.templateInstances[0].content.imageRow.images[0].publicPath, `/images/published/template-images/${projectId}/cover-new.png`);
});
console.log("buildPublishPlan: deeply nested changed asset resolved from bundle -> one writeset entry, path rewritten in place, passed");

await withFixtureRepo(async (root) => {
  // Changed reference with NO valid bundle asset -> BLOCKED, never silently
  // falls back to the old published file (the fix for a failed capture
  // looking, in production, like the edit succeeded).
  const projectId = "project-failed-capture";
  const current = { templateInstances: [{ content: { imageRow: { images: [{ imageId: "cover-old", publicPath: `/images/published/template-images/${projectId}/cover-old.png` }] } } }] };
  const edited = { templateInstances: [{ content: { imageRow: { images: [{ imageId: "cover-new-failed" }] } } }] };
  // The OLD file still exists on disk (as it legitimately would) -- proving
  // the resolver must not substitute it just because a file happens to exist.
  const templateImagesDir = path.join(root, "public", "images", "published", "template-images", projectId);
  await mkdir(templateImagesDir, { recursive: true });
  await writeFile(path.join(templateImagesDir, "cover-old.png"), VALID_PNG_BYTES);

  const currentEntities = new Map([[projectId, current]]);
  const intents = new Map([
    [projectId, { kind: "UPSERT", baseContentHash: hashContent(current), value: edited }],
  ]);

  const plan = await buildPublishPlan({ root, entityType: "project", currentEntities, intents, bundleAssets: new Map() });
  assert.equal(plan.blocked, true, "a changed reference with no valid new asset must BLOCK, never silently resolve via the old fallback");
  assert.equal(plan.writeset.length, 0);
  const item = plan.items.find((i) => i.entityId === projectId);
  assert.equal(item.status, "BLOCKED");
  assert.match(item.reason, /cover-new-failed/);
});
console.log("buildPublishPlan: changed asset, capture failed -> BLOCKED, no silent fallback, passed");

await withFixtureRepo(async (root) => {
  // A bundle asset that happens to re-capture byte-identical content to
  // what's already on disk at the intended path -- RESOLVED via bundle, but
  // still must not enter the writeset (no real byte change to write).
  const projectId = "project-byte-identical";
  const assetId = "cover-same-bytes";
  const location = path.join(root, "public", "images", "published", "template-images", projectId);
  await mkdir(location, { recursive: true });
  await writeFile(path.join(location, `${assetId}.png`), VALID_PNG_BYTES);

  const current = { templateInstances: [] }; // base had no cover at all -> referenceIntent is "changed"
  const edited = { templateInstances: [{ content: { imageRow: { images: [{ imageId: assetId }] } } }] };
  const currentEntities = new Map([[projectId, current]]);
  const intents = new Map([
    [projectId, { kind: "UPSERT", baseContentHash: hashContent(current), value: edited }],
  ]);
  const bundleAssets = new Map([
    [bundleAssetKey("dynamic-template-images", assetId), { bytes: VALID_PNG_BYTES, fileName: `${assetId}.png` }],
  ]);

  const plan = await buildPublishPlan({ root, entityType: "project", currentEntities, intents, bundleAssets });
  assert.equal(plan.blocked, false, JSON.stringify(plan.items));
  assert.equal(plan.writeset.length, 0, "byte-identical re-capture must not produce a writeset entry even though it came from the bundle");
  assert.equal(plan.assetIntegrity.valid, 1);
});
console.log("buildPublishPlan: bundle asset byte-identical to disk -> no writeset entry, passed");

await withFixtureRepo(async (root) => {
  // A valid external reference (figmaUrl) -> UPDATED, RESOLVED, no writeset entry.
  const projectId = "project-external-ref";
  const current = { templateInstances: [{ content: { figmaUrl: "" } }] };
  const edited = { templateInstances: [{ content: { figmaUrl: "https://www.figma.com/design/real-file" } }] };
  const currentEntities = new Map([[projectId, current]]);
  const intents = new Map([[projectId, { kind: "UPSERT", baseContentHash: hashContent(current), value: edited }]]);

  const plan = await buildPublishPlan({ root, entityType: "project", currentEntities, intents, bundleAssets: new Map() });
  assert.equal(plan.blocked, false, JSON.stringify(plan.items));
  assert.equal(plan.writeset.length, 0);
  assert.equal(plan.items[0].status, "UPDATED");
});
console.log("buildPublishPlan: valid changed external reference -> UPDATED, not BLOCKED, passed");

await withFixtureRepo(async (root) => {
  // An invalid CHANGED external reference (http, not https) -> BLOCKED.
  const projectId = "project-bad-external-ref";
  const current = { templateInstances: [{ content: { figmaUrl: "" } }] };
  const edited = { templateInstances: [{ content: { figmaUrl: "http://insecure.example.com/design" } }] };
  const currentEntities = new Map([[projectId, current]]);
  const intents = new Map([[projectId, { kind: "UPSERT", baseContentHash: hashContent(current), value: edited }]]);

  const plan = await buildPublishPlan({ root, entityType: "project", currentEntities, intents, bundleAssets: new Map() });
  assert.equal(plan.blocked, true);
  assert.equal(plan.items[0].status, "BLOCKED");
  assert.match(plan.items[0].reason, /figmaUrl/);
});
console.log("buildPublishPlan: invalid changed external reference -> BLOCKED, passed");

await withFixtureRepo(async (root) => {
  // An asset-tree reference (playable-game-builds) that's fully inherited
  // and unchanged on disk -> RESOLVED, empty writeset contribution.
  const projectId = "project-tree-inherited";
  const gameId = "game-inherited";
  const treeDir = path.join(root, "public", "playable-games", projectId, gameId);
  await mkdir(treeDir, { recursive: true });
  await writeFile(path.join(treeDir, "index.html"), "<html>game</html>");

  const content = { templateInstances: [{ content: { play: { gameId, entryPublicPath: `/playable-games/${projectId}/${gameId}/index.html` } } }] };
  const currentEntities = new Map([[projectId, content]]);
  const intents = new Map([[projectId, { kind: "UPSERT", baseContentHash: hashContent(content), value: content }]]);

  const plan = await buildPublishPlan({ root, entityType: "project", currentEntities, intents, bundleAssets: new Map() });
  assert.equal(plan.blocked, false, JSON.stringify(plan.items));
  assert.equal(plan.writeset.length, 0, "an inherited, unchanged asset tree must contribute nothing to the writeset");
  assert.equal(plan.items[0].status, "UNCHANGED");
});
console.log("buildPublishPlan: inherited unchanged asset-tree reference -> RESOLVED, no writeset contribution, passed");

await withFixtureRepo(async (root) => {
  // An asset-tree reference missing its required entry file -> BLOCKED.
  const projectId = "project-tree-missing";
  const gameId = "game-missing";
  const treeDir = path.join(root, "public", "playable-games", projectId, gameId);
  await mkdir(treeDir, { recursive: true });
  // index.html deliberately never written.

  const content = { templateInstances: [{ content: { play: { gameId, entryPublicPath: `/playable-games/${projectId}/${gameId}/index.html` } } }] };
  const currentEntities = new Map([[projectId, content]]);
  const intents = new Map([[projectId, { kind: "UPSERT", baseContentHash: hashContent(content), value: content }]]);

  const plan = await buildPublishPlan({ root, entityType: "project", currentEntities, intents, bundleAssets: new Map() });
  assert.equal(plan.blocked, true, JSON.stringify(plan.items));
  assert.equal(plan.items[0].status, "BLOCKED");
  assert.match(plan.items[0].reason, /index\.html|required/i);
});
console.log("buildPublishPlan: asset-tree reference missing required file -> BLOCKED, passed");

// ==== Project cover (project-covers-disk), closed via the SAME discovery/
// resolution/writeset path as every other single-file reference -- no
// project-cover-specific resolver, no adapter special-casing anywhere here
// (Publishing Architecture V2, Pre-Cutover Closure). ====

await withFixtureRepo(async (root) => {
  // Cover changed (new bytes provided in the bundle) -> resolved via bundle
  // (candidate 1 always wins over fallback when present), exactly one
  // writeset entry, path rewritten in place onto cover.publicUrl.
  const projectId = "project-cover-changed";
  const declaredPublicPath = `/images/published/covers/${projectId}.png`;
  const current = { meta: {}, body: {}, cover: { projectCoverId: projectId, publicUrl: declaredPublicPath } };
  const edited = { meta: {}, body: {}, cover: { projectCoverId: projectId, publicUrl: declaredPublicPath } };
  const currentEntities = new Map([[projectId, current]]);
  const intents = new Map([[projectId, { kind: "UPSERT", baseContentHash: hashContent(current), value: edited }]]);
  const bundleAssets = new Map([[bundleAssetKey("project-covers-disk", projectId), { bytes: VALID_PNG_BYTES, fileName: `${projectId}.png` }]]);

  const plan = await buildPublishPlan({ root, entityType: "project", currentEntities, intents, bundleAssets });
  assert.equal(plan.blocked, false, JSON.stringify(plan.items));
  assert.equal(plan.writeset.length, 1, "a freshly provided cover must produce exactly one writeset entry");
  assert.equal(plan.writeset[0].path, `public/images/published/covers/${projectId}.png`);
  assert.equal(plan.items[0].status, "UNCHANGED", "the entity's OWN content hash is identical (only the referenced bytes changed, not the entity JSON) -- matches how every other asset-only edit is reported");
});
console.log("buildPublishPlan: project cover changed, valid new bytes -> exactly one writeset entry, passed");

await withFixtureRepo(async (root) => {
  // Cover unchanged (no bundle-provided bytes, real file already published)
  // -> inherited via fallback, RESOLVED, writeset stays empty.
  const projectId = "project-cover-unchanged";
  const declaredPublicPath = `/images/published/covers/${projectId}.png`;
  const coverDir = path.join(root, "public", "images", "published", "covers");
  await mkdir(coverDir, { recursive: true });
  await writeFile(path.join(coverDir, `${projectId}.png`), VALID_PNG_BYTES);

  const content = { meta: {}, body: {}, cover: { projectCoverId: projectId, publicUrl: declaredPublicPath } };
  const currentEntities = new Map([[projectId, content]]);
  const intents = new Map([[projectId, { kind: "UPSERT", baseContentHash: hashContent(content), value: content }]]);

  const plan = await buildPublishPlan({ root, entityType: "project", currentEntities, intents, bundleAssets: new Map() });
  assert.equal(plan.blocked, false, JSON.stringify(plan.items));
  assert.equal(plan.writeset.length, 0, "an unchanged cover resolved via published-fallback must never enter the writeset");
  assert.equal(plan.items[0].status, "UNCHANGED");
});
console.log("buildPublishPlan: project cover unchanged, resolved via fallback -> no writeset entry, passed");

await withFixtureRepo(async (root) => {
  // Cover acquisition failed locally AND no published file exists to fall
  // back to (e.g. capture failure on a brand-new project) -> BLOCKED, never
  // silently published without a cover.
  const projectId = "project-cover-missing";
  const declaredPublicPath = `/images/published/covers/${projectId}.png`;
  const current = { meta: {}, body: {}, cover: undefined };
  const edited = { meta: {}, body: {}, cover: { projectCoverId: projectId, publicUrl: declaredPublicPath } };
  const currentEntities = new Map([[projectId, current]]);
  const intents = new Map([[projectId, { kind: "UPSERT", baseContentHash: hashContent(current), value: edited }]]);

  const plan = await buildPublishPlan({ root, entityType: "project", currentEntities, intents, bundleAssets: new Map() });
  assert.equal(plan.blocked, true, JSON.stringify(plan.items));
  assert.equal(plan.items[0].status, "BLOCKED");
  assert.equal(plan.writeset.length, 0);
});
console.log("buildPublishPlan: project cover missing (no local capture, no published fallback) -> BLOCKED, passed");

console.log("buildPublishPlan.mjs regression tests passed (fixture-isolated, real repo never touched)");
