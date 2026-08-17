import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { bundleV1ToV2AllIntents, compareV1V2 } from "../compareV1V2.mjs";
import { withFixtureRepo } from "./fixtureRepo.mjs";

// The V1-bundle-to-V2-intents translator: a project present in the bundle
// becomes an UPSERT intent; a project absent from the bundle but present in
// currentPublished is treated as inherited (V1's own rule) -- no V2 intent
// at all, matching V1's real inherit behavior exactly.
{
  const bundle = { drafts: { "project-a": { title: "edited" } }, gameExperience: { records: [] } };
  const currentPublished = { drafts: { "project-a": { title: "old" }, "project-b": { title: "untouched" } } };
  const { projectIntents, projectCurrentEntities } = bundleV1ToV2AllIntents(bundle, currentPublished);
  assert.equal(projectIntents.size, 1, "only the project present in the bundle should produce an intent");
  assert(projectIntents.has("project-a"));
  assert(!projectIntents.has("project-b"), "a project absent from the bundle (V1's own inherit case) must produce no V2 intent");
  assert.equal(projectIntents.get("project-a").kind, "UPSERT");
  assert.deepEqual(projectCurrentEntities.get("project-b"), { title: "untouched" });
}
console.log("bundleV1ToV2AllIntents: project bundle-present -> UPSERT, bundle-absent -> no intent (inherited), passed");

// Game Experience: V1's real whole-store-overwrite semantics -- a record
// present in the bundle always becomes an UPSERT intent; a record present in
// currentPublished but ABSENT from the bundle is tracked separately as
// "V1 would silently drop this" -- never fed into V2 as any kind of intent.
{
  const bundle = { drafts: {}, gameExperience: { records: [{ id: "g1", title: "edited" }] } };
  const currentPublished = { drafts: {}, gameExperience: { records: [{ id: "g1", title: "old" }, { id: "g2", title: "will be dropped by V1" }] } };
  const { gameExperienceIntents, gameExperienceCurrentEntities, gameExperienceDroppedByV1 } = bundleV1ToV2AllIntents(bundle, currentPublished);
  assert.equal(gameExperienceIntents.size, 1);
  assert(gameExperienceIntents.has("g1"));
  assert.deepEqual(gameExperienceCurrentEntities.get("g1"), { id: "g1", title: "old" });
  assert.deepEqual(gameExperienceDroppedByV1, ["g2"]);
}
console.log("bundleV1ToV2AllIntents: Game Experience whole-store semantics + droppedByV1 tracking, passed");

// uiPractice: plain structural comparison, no intent produced either way.
{
  const same = bundleV1ToV2AllIntents({ drafts: {}, uiPractice: { items: [1] } }, { drafts: {}, uiPractice: { items: [1] } });
  assert.equal(same.uiPracticeChanged, false);
  const different = bundleV1ToV2AllIntents({ drafts: {}, uiPractice: { items: [2] } }, { drafts: {}, uiPractice: { items: [1] } });
  assert.equal(different.uiPracticeChanged, true);
}
console.log("bundleV1ToV2AllIntents: uiPractice structural comparison, passed");

// End-to-end compareV1V2() against a small, self-contained fixture bundle +
// fixture currentPublished -- read-only, real V1 buildPublishingPreflight
// and real V2 buildPublishPlan, both against the same fixture root.
await withFixtureRepo(async (root) => {
  const bundlePath = path.join(root, "output", "fixture-bundle.json");
  await mkdir(path.dirname(bundlePath), { recursive: true });
  const bundle = {
    version: 1,
    publishingRegistryVersion: 1,
    exportedAt: new Date().toISOString(),
    projectCatalog: { version: 1, projectIds: ["p1"], projects: { p1: { isDynamic: true } } },
    drafts: { p1: { title: "edited body" } },
    projectDocuments: { version: 1, documents: {} },
    uiPractice: { version: 1, items: [] },
    gameExperience: { schemaVersion: 1, records: [] },
    images: [],
    diagnostics: { missingReferences: [] },
  };
  await writeFile(bundlePath, JSON.stringify(bundle), "utf8");
  await writeFile(path.join(root, "src", "data", "publishedPortfolio.json"), JSON.stringify({
    version: 1, drafts: { p1: { title: "original body" } }, projectCatalog: { p1: { isDynamic: true } },
    projectDocuments: { version: 1, documents: {} }, covers: {}, assets: [],
    uiPractice: { version: 1, items: [] }, gameExperience: { schemaVersion: 1, records: [] },
  }), "utf8");

  const result = await compareV1V2({ root, bundlePath });
  assert.equal(result.v1.ok, true, "expected V1 preflight to be clean for this simple fixture bundle");
  assert.equal(result.v2.projectPlanBlocked, false, "expected V2 project plan to be unblocked for the same fixture bundle");
  assert.equal(result.unexplainedCount, 0, `expected zero unexplained differences, got: ${JSON.stringify(result.differences.UNEXPLAINED)}`);
  assert.equal(result.v2.projectCounts.UPDATED, 1);
});
console.log("compareV1V2: clean fixture bundle, full-state -> V1 ok / V2 unblocked, zero unexplained differences, passed");

console.log("compareV1V2.mjs coverage tests passed (fixture-isolated, real repo never touched)");
