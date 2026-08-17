import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { runImportProductionBundle, withFixtureRepo } from "./publishing/__tests__/fixtureRepo.mjs";

// Exercises the real per-project draft merge algorithm end to end (dry-run
// only -- no --confirm is needed to observe it, since the plan report
// already reflects the merged `output.drafts` before any write happens).
// Runs the real, still-frozen V1 import-production-bundle.mjs CLI against an
// isolated fixture root (see publishing/__tests__/fixtureRepo.mjs), seeded
// with a few self-contained fixture projects -- never against this real
// repository or its real publishedPortfolio.json.

const ids = {
  updated: "fixture-inherit-updated",  // A: published has body, bundle has a modified body -> UPDATED
  inherited: "fixture-inherit-kept",   // B/E: published has body, bundle has none, no delete intent -> UNCHANGED, inherited
  brandNew: "fixture-inherit-new",     // C: published has no body, bundle has one -> NEW
  neverExisted: "fixture-inherit-none", // D: neither side has a body -> no report item at all
  removed: "fixture-inherit-removed",  // F: published has body, bundle has none, explicit delete intent -> REMOVED
};

function fixtureCatalogEntry(id) {
  return { isDynamic: true, slug: id, route: `/work/${id}`, titleZh: "Fixture", titleEn: "Fixture", featured: false };
}
function fixtureDraft(text) {
  return { version: 1, templateInstances: [{ instanceId: "a", templateId: "statement-longform", regionId: "content", content: { body: { zh: text, en: "" } } }] };
}

const publishedPortfolio = {
  version: 1,
  projectCatalog: {
    [ids.updated]: fixtureCatalogEntry(ids.updated),
    [ids.inherited]: fixtureCatalogEntry(ids.inherited),
    [ids.removed]: fixtureCatalogEntry(ids.removed),
    // ids.brandNew and ids.neverExisted intentionally NOT added here --
    // they have no previously-published catalog entry or body.
  },
  drafts: {
    [ids.updated]: fixtureDraft("original-updated-fixture-body"),
    [ids.inherited]: fixtureDraft("original-inherited-fixture-body"),
    [ids.removed]: fixtureDraft("original-removed-fixture-body"),
  },
  projectDocuments: { version: 1, documents: {} },
  covers: {},
  assets: [],
};

await withFixtureRepo(async (root) => {
  const registry = JSON.parse(await readFile(path.join(root, "src", "lib", "publishing", "publishSourceRegistry.json"), "utf8"));

  const bundle = {
    version: 1,
    publishingRegistryVersion: registry.version,
    exportedAt: new Date().toISOString(),
    origin: "test-fixture",
    projectCatalog: {
      version: 1,
      projectIds: [ids.updated, ids.inherited, ids.brandNew, ids.removed],
      projects: {
        [ids.updated]: fixtureCatalogEntry(ids.updated),
        [ids.inherited]: fixtureCatalogEntry(ids.inherited),
        [ids.brandNew]: fixtureCatalogEntry(ids.brandNew),
        [ids.removed]: fixtureCatalogEntry(ids.removed),
      },
    },
    drafts: {
      // A: modified body for ids.updated.
      [ids.updated]: fixtureDraft("modified-updated-fixture-body"),
      // C: brand-new body with no previous published body.
      [ids.brandNew]: fixtureDraft("new-fixture-body"),
      // ids.inherited and ids.removed deliberately absent -- simulating an
      // empty browser session for both (this also covers scenario E: the
      // "browser session completely empty for this project" case is
      // identical in mechanism to B, just framed differently).
    },
    projectDocuments: { version: 1, documents: {} },
    uiPractice: { version: 1, items: [] },
    gameExperience: { schemaVersion: 1, records: [] },
    images: [],
    diagnostics: { missingReferences: [] },
    // F: explicit delete intent for ids.removed -- the only thing that may
    // cause a previously-published body to be omitted from the output.
    deletedProjectIds: [ids.removed],
  };
  const bundlePath = path.join(root, "output", "import-bundle.json");
  await mkdir(path.dirname(bundlePath), { recursive: true });
  await writeFile(bundlePath, JSON.stringify(bundle), "utf8");

  const stateBeforeRun = await readFile(path.join(root, "src", "data", "publishedPortfolio.json"));

  const dryRun = runImportProductionBundle(root, [bundlePath]);
  assert.equal(dryRun.status, 0, `expected dry run to succeed:\nstdout:\n${dryRun.stdout}\nstderr:\n${dryRun.stderr}`);
  assert(dryRun.stdout.includes("DRY RUN ONLY"), dryRun.stdout);
  assert((await readFile(path.join(root, "src", "data", "publishedPortfolio.json"))).equals(stateBeforeRun), "dry run must never modify publishedPortfolio.json");

  const report = JSON.parse(await readFile(path.join(root, "output", "publishing-launcher-report.json"), "utf8"));
  const projectItem = (id) => report.items.find((item) => item.id === `${id}:project`);

  // A. published has a body, bundle has a modified body -> UPDATED.
  const itemA = projectItem(ids.updated);
  assert(itemA, "expected a project item for the updated fixture");
  assert.equal(itemA.status, "UPDATED");

  // B / E. published has a body, bundle's export doesn't include this project
  // at all (an empty browser session for it) and there is no delete intent --
  // Publishing Architecture V2's Edit Intent Model produces NO intent at all
  // for an entity nothing asked it to touch (buildPublishPlan.mjs never even
  // sees it), so there is no report item for it either -- the currently
  // -published body is left byte-for-byte as-is by construction, not
  // re-touched/re-reported as "inherited."
  const itemB = projectItem(ids.inherited);
  assert.equal(itemB, undefined, "expected no report item for an untouched, inherited project");

  // C. published has no body, bundle introduces one -> NEW.
  const itemC = projectItem(ids.brandNew);
  assert(itemC, "expected a project item for the brand-new fixture");
  assert.equal(itemC.status, "NEW");

  // D. neither side has a body -> no report item at all for it.
  const itemD = projectItem(ids.neverExisted);
  assert.equal(itemD, undefined, "expected no project item when neither side ever had one");

  // F. published has a body, bundle has none, explicit delete intent ->
  // REMOVED (never BLOCKED, never silently UNCHANGED).
  const itemF = projectItem(ids.removed);
  assert(itemF, "expected a project item for the removed fixture");
  assert.equal(itemF.status, "REMOVED");
  assert.equal(itemF.reason, "Removed via explicit delete intent.");

  // Nothing here should ever be BLOCKED -- that is the whole point of this fix.
  assert.equal(report.items.filter((item) => Object.values(ids).includes(item.projectId) && item.status === "BLOCKED").length, 0);

  console.log("import-production-bundle inherit/delete-intent regression tests passed");
}, { publishedPortfolio });
