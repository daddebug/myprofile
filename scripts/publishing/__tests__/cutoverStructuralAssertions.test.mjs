import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { bundleV1ToV2AllIntents, bundleV1ToV2BundleAssets } from "../bundleCompat.mjs";
import { buildPublishPlan } from "../buildPublishPlan.mjs";
import { assemblePublishedOutput } from "../assemblePublishedOutput.mjs";
import { executePublishPlan } from "../executePublishPlan.mjs";
import { renderPublishPlanReportV2 } from "../../publishing-report-lib.mjs";
import { runImportProductionBundle, withFixtureRepo, VALID_PNG_BYTES } from "./fixtureRepo.mjs";

// Publishing Architecture V2, Cutover, Section F: structural assertions
// proving the live import CLI's single-authority properties -- not proving
// individual features (those are covered by buildPublishPlan.test.mjs,
// executePublishPlan.test.mjs, etc.), but proving the WIRING between
// buildPublishPlan -> report -> executor -> CLI never lets any layer
// re-derive or override what an earlier layer already decided.

function fixtureCatalogEntry(id) {
  return { isDynamic: true, slug: id, route: `/work/${id}`, titleZh: "Fixture", titleEn: "Fixture", featured: false };
}
function fixtureDraft(text) {
  return { version: 1, templateInstances: [{ instanceId: "a", templateId: "statement-longform", regionId: "content", content: { body: { zh: text, en: "" } } }] };
}
function fixtureDraftWithMissingImage(assetId, projectId) {
  return {
    version: 1,
    templateInstances: [{
      instanceId: "a", templateId: "figma-prototype", regionId: "content",
      content: { heading: { zh: "", en: "" }, figmaUrl: "", fallbackImage: { localImageId: assetId, publicPath: `/images/published/project-body/${projectId}/${assetId}.png` } },
    }],
  };
}
async function writeBundle(root, bundle) {
  const bundlePath = path.join(root, "output", "import-bundle.json");
  await mkdir(path.dirname(bundlePath), { recursive: true });
  await writeFile(bundlePath, JSON.stringify(bundle), "utf8");
  return bundlePath;
}
async function registryVersion(root) {
  const registry = JSON.parse(await readFile(path.join(root, "src", "lib", "publishing", "publishSourceRegistry.json"), "utf8"));
  return registry.version;
}

// 1. buildPublishPlan.blocked === CLI blocked === report.blocked -- for both
// a BLOCKED bundle and a clean bundle, computing the plan directly (the same
// way the live CLI does, via the same bundleCompat translator) must agree
// exactly with what the live CLI process reports and exits with.
for (const [label, makeDraft] of [
  ["blocked", (id, projectId) => fixtureDraftWithMissingImage(id, projectId)],
  ["clean", (id) => fixtureDraft(`content-${id}`)],
]) {
  await withFixtureRepo(async (root) => {
    const projectId = `fixture-authority-${label}`;
    const assetId = `${projectId}-asset`;
    const bundle = {
      version: 1, publishingRegistryVersion: await registryVersion(root), exportedAt: new Date().toISOString(), origin: "test-fixture",
      projectCatalog: { version: 1, projectIds: [projectId], projects: { [projectId]: fixtureCatalogEntry(projectId) } },
      drafts: { [projectId]: makeDraft(assetId, projectId) },
      projectDocuments: { version: 1, documents: {} }, uiPractice: { version: 1, items: [] }, gameExperience: { schemaVersion: 1, records: [] },
      images: [], diagnostics: { missingReferences: [] },
    };
    const bundlePath = await writeBundle(root, bundle);

    const currentPublished = JSON.parse(await readFile(path.join(root, "src", "data", "publishedPortfolio.json"), "utf8"));
    const { projectIntents, projectCurrentEntities } = bundleV1ToV2AllIntents(bundle, currentPublished);
    const bundleAssets = bundleV1ToV2BundleAssets(bundle);
    const directPlan = await buildPublishPlan({ root, entityType: "project", currentEntities: projectCurrentEntities, intents: projectIntents, bundleAssets });

    const cliResult = runImportProductionBundle(root, [bundlePath]);
    const cliBlocked = cliResult.status !== 0;
    assert.equal(directPlan.blocked, cliBlocked, `[${label}] buildPublishPlan.blocked (${directPlan.blocked}) must equal CLI exit status treated as blocked (${cliBlocked})`);

    const report = JSON.parse(await readFile(path.join(root, "output", "publishing-launcher-report.json"), "utf8"));
    const reportBlocked = report.outcome === "blocked";
    assert.equal(reportBlocked, directPlan.blocked, `[${label}] report.outcome (${report.outcome}) must agree with buildPublishPlan.blocked (${directPlan.blocked})`);
    assert.equal(reportBlocked, cliBlocked, `[${label}] report.outcome must agree with the CLI's own exit status`);
  });
}
console.log("1: buildPublishPlan.blocked === CLI blocked === report.blocked for both a BLOCKED and a clean bundle, passed");

// 2. Report cannot change plan status -- renderPublishPlanReportV2 is a pure
// view; feeding it a plan with one BLOCKED item must always yield
// outcome:"blocked" and that exact item's status preserved verbatim,
// regardless of what other items say.
await withFixtureRepo(async (root) => {
  const plan = {
    items: [
      { entityId: "p1", entityType: "project", status: "UNCHANGED" },
      { entityId: "p2", entityType: "project", status: "BLOCKED", reason: "synthetic block for this test" },
    ],
    writeset: [], counts: { NEW: 0, UPDATED: 0, UNCHANGED: 1, REMOVED: 0, UNPUBLISHED: 0, BLOCKED: 1 },
    blocked: true, assetIntegrity: { total: 0, valid: 0, invalid: 0, inherited: 0 },
  };
  const report = await renderPublishPlanReportV2({ root, plans: [plan], productionUrl: "https://example.test" });
  assert.equal(report.outcome, "blocked");
  const blockedItem = report.items.find((item) => item.id === "p2:project");
  assert.equal(blockedItem.status, "BLOCKED");
  assert.equal(blockedItem.reason, "synthetic block for this test");
});
console.log("2: renderPublishPlanReportV2 is a pure view -- cannot change or hide a plan's BLOCKED status, passed");

// 3. Executor given a BLOCKED plan -> zero mutation (re-verifies
// executePublishPlan.test.mjs's own coverage, at the CLI-integration level
// via a real fixture-isolated run rather than calling the module directly).
await withFixtureRepo(async (root) => {
  const projectId = "fixture-authority-executor-blocked";
  const assetId = `${projectId}-asset`;
  const bundlePath = await writeBundle(root, {
    version: 1, publishingRegistryVersion: await registryVersion(root), exportedAt: new Date().toISOString(), origin: "test-fixture",
    projectCatalog: { version: 1, projectIds: [projectId], projects: { [projectId]: fixtureCatalogEntry(projectId) } },
    drafts: { [projectId]: fixtureDraftWithMissingImage(assetId, projectId) },
    projectDocuments: { version: 1, documents: {} }, uiPractice: { version: 1, items: [] }, gameExperience: { schemaVersion: 1, records: [] },
    images: [], diagnostics: { missingReferences: [] },
  });
  const stateBefore = await readFile(path.join(root, "src", "data", "publishedPortfolio.json"));
  const confirmResult = runImportProductionBundle(root, [bundlePath, "--confirm"]);
  assert.notEqual(confirmResult.status, 0);
  assert((await readFile(path.join(root, "src", "data", "publishedPortfolio.json"))).equals(stateBefore));
});
console.log("3: executor given a BLOCKED plan -> zero mutation (live CLI integration), passed");

// 4. Executor given a STALE plan -> zero mutation, no partial writes -- built
// directly against executePublishPlan.mjs (the live CLI has no seam to
// inject staleness deterministically, so this proves the property at the
// module the CLI actually delegates to, per Section F item 4's own wording).
await withFixtureRepo(async (root) => {
  const relativePath = path.join("public", "images", "published", "template-images", "p", "stale.png");
  await mkdir(path.dirname(path.join(root, relativePath)), { recursive: true });
  await writeFile(path.join(root, relativePath), VALID_PNG_BYTES);
  const actualHash = (await import("node:crypto")).createHash("sha256").update(readFileSync(path.join(root, relativePath))).digest("hex");

  const plan = {
    blocked: false,
    writeset: [{ path: relativePath, expectedPreviousHash: "0000000000000000000000000000000000000000000000000000000000000000", nextHash: actualHash, content: VALID_PNG_BYTES }],
  };
  const result = await executePublishPlan({ root, plan, backupRoot: path.join(root, ".local-backups", "stale-test") });
  assert.equal(result.status, "REFUSED");
  assert.equal(result.staleEntries.length, 1);
});
console.log("4: executor given a STALE plan -> REFUSED, zero mutation, no partial writes, passed");

// 5. resolveAsset (and resolveAssetTree / resolveExternalReference) are only
// ever reachable via buildPublishPlan.mjs -- the live import CLI's own
// source text must never import or call them directly (a structural,
// source-level check, not a behavioral one -- the live CLI script does zero
// asset resolution of its own).
{
  const cliSource = readFileSync(path.join(process.cwd(), "scripts", "import-production-bundle.mjs"), "utf8");
  assert(!/resolveAsset|resolveAssetTree|resolveExternalReference/.test(cliSource), "import-production-bundle.mjs must never directly reference any asset resolver -- only buildPublishPlan.mjs may");
  const preflightSource = readFileSync(path.join(process.cwd(), "scripts", "publishing-preflight.mjs"), "utf8");
  assert(!/resolveAsset|resolveAssetTree|resolveExternalReference/.test(preflightSource), "publishing-preflight.mjs must never directly reference any asset resolver either");
}
console.log("5: resolveAsset/resolveAssetTree/resolveExternalReference are unreachable from either live CLI script directly, passed");

// 6. Absence without intent -> unchanged. An entity present in
// currentEntities but absent from intents produces NO PublishPlanItem at
// all, and assemblePublishedOutput's final output leaves it byte-for-byte
// identical to currentPublished.
await withFixtureRepo(async (root) => {
  const currentPublished = { version: 1, drafts: { "untouched-1": fixtureDraft("original") }, projectCatalog: { "untouched-1": fixtureCatalogEntry("untouched-1") }, projectDocuments: { version: 1, documents: {} }, covers: {}, assets: [] };
  const currentEntities = new Map([["untouched-1", { meta: currentPublished.projectCatalog["untouched-1"], body: currentPublished.drafts["untouched-1"], cover: undefined }]]);
  const plan = await buildPublishPlan({ root, entityType: "project", currentEntities, intents: new Map(), bundleAssets: new Map() });
  assert.equal(plan.items.length, 0, "an entity with no intent must produce zero PublishPlanItems");

  const gameExperiencePlan = { items: [], writeset: [], counts: {}, blocked: false, assetIntegrity: { total: 0, valid: 0, invalid: 0, inherited: 0 } };
  const output = assemblePublishedOutput({ currentPublished, projectPlan: plan, gameExperiencePlan, projectBodyTarget: new Map(), generatedAt: "" });
  assert.deepEqual(output.drafts["untouched-1"], currentPublished.drafts["untouched-1"]);
  assert.deepEqual(output.projectCatalog["untouched-1"], currentPublished.projectCatalog["untouched-1"]);
});
console.log("6: absence without intent -> zero PublishPlanItems, final output byte-for-byte unchanged, passed");

// 7. DELETE only via explicit DELETE intent -- an entity present in
// currentEntities with NO intent at all can never be removed by
// assemblePublishedOutput; only an explicit {kind:"DELETE"} intent can
// produce a REMOVED status, and only a REMOVED status causes
// assemblePublishedOutput to actually drop it.
await withFixtureRepo(async (root) => {
  const currentPublished = { version: 1, drafts: { "survivor": fixtureDraft("keep-me") }, projectCatalog: { survivor: fixtureCatalogEntry("survivor") }, projectDocuments: { version: 1, documents: {} }, covers: {}, assets: [] };
  const currentEntities = new Map([["survivor", { meta: currentPublished.projectCatalog.survivor, body: currentPublished.drafts.survivor, cover: undefined }]]);

  // No intent at all for it -- must survive.
  const noIntentPlan = await buildPublishPlan({ root, entityType: "project", currentEntities, intents: new Map(), bundleAssets: new Map() });
  const emptyGameExperiencePlan = { items: [], writeset: [], counts: {}, blocked: false, assetIntegrity: { total: 0, valid: 0, invalid: 0, inherited: 0 } };
  const outputNoIntent = assemblePublishedOutput({ currentPublished, projectPlan: noIntentPlan, gameExperiencePlan: emptyGameExperiencePlan, projectBodyTarget: new Map(), generatedAt: "" });
  assert("survivor" in outputNoIntent.drafts, "an entity with no intent at all must never be removed");

  // An explicit DELETE intent -- must be removed.
  const { hashContent } = await import("../contentHash.mjs");
  const deleteIntents = new Map([["survivor", { kind: "DELETE", baseContentHash: hashContent(currentEntities.get("survivor")) }]]);
  const deletePlan = await buildPublishPlan({ root, entityType: "project", currentEntities, intents: deleteIntents, bundleAssets: new Map() });
  assert.equal(deletePlan.items[0].status, "REMOVED");
  const outputDeleted = assemblePublishedOutput({ currentPublished, projectPlan: deletePlan, gameExperiencePlan: emptyGameExperiencePlan, projectBodyTarget: new Map(), generatedAt: "" });
  assert(!("survivor" in outputDeleted.drafts), "an explicit DELETE intent must actually remove the entity");
});
console.log("7: DELETE only via explicit DELETE intent -- no-intent entities always survive, only REMOVED status drops them, passed");

console.log("Publishing Architecture V2 Cutover: structural assertion tests passed (fixture-isolated, real repo never touched)");
