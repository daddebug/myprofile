import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Exercises the real per-project draft merge algorithm end to end (dry-run
// only -- no --confirm is needed to observe it, since the plan report
// already reflects the merged `output.drafts` before any write happens).
// import-production-bundle.mjs hardcodes its OFFICIAL_ROOT, so this can only
// run against this actual repository; the currently-published data file is
// temporarily given a few self-contained fixture projects and restored
// byte-for-byte in `finally`, verified, exactly like
// import-production-bundle-confirm-gate.test.mjs.
const repositoryRoot = process.cwd();
const scriptPath = path.join(repositoryRoot, "scripts", "import-production-bundle.mjs");
const publishedDataPath = path.join(repositoryRoot, "src", "data", "publishedPortfolio.json");
const bundlePath = path.join(repositoryRoot, "output", "import-inherit-regression-test.json");
const registry = JSON.parse(await readFile(path.join(repositoryRoot, "src", "lib", "publishing", "publishSourceRegistry.json"), "utf8"));

const ids = {
  updated: "test-fixture-inherit-updated",   // A: published has body, bundle has a modified body -> UPDATED
  inherited: "test-fixture-inherit-kept",    // B/E: published has body, bundle has none, no delete intent -> UNCHANGED, inherited
  brandNew: "test-fixture-inherit-new",      // C: published has no body, bundle has one -> NEW
  neverExisted: "test-fixture-inherit-none", // D: neither side has a body -> no report item at all
  removed: "test-fixture-inherit-removed",   // F: published has body, bundle has none, explicit delete intent -> REMOVED
};

function fixtureCatalogEntry(id) {
  return { isDynamic: true, slug: id, route: `/work/${id}`, titleZh: "Fixture", titleEn: "Fixture", featured: false };
}
function fixtureDraft(text) {
  return { version: 1, templateInstances: [{ instanceId: "a", templateId: "statement-longform", regionId: "content", content: { body: { zh: text, en: "" } } }] };
}
function run(args) {
  return spawnSync(process.execPath, [scriptPath, ...args], { cwd: repositoryRoot, encoding: "utf8" });
}

const originalPublishedBytes = await readFile(publishedDataPath);
const originalPublished = JSON.parse(originalPublishedBytes.toString("utf8"));
for (const id of Object.values(ids)) {
  assert(!(id in (originalPublished.projectCatalog || {})), `fixture id collision on ${id} -- aborting before touching real data`);
}

try {
  const withFixtures = {
    ...originalPublished,
    projectCatalog: {
      ...originalPublished.projectCatalog,
      [ids.updated]: fixtureCatalogEntry(ids.updated),
      [ids.inherited]: fixtureCatalogEntry(ids.inherited),
      [ids.removed]: fixtureCatalogEntry(ids.removed),
      // ids.brandNew and ids.neverExisted intentionally NOT added here --
      // they have no previously-published catalog entry or body.
    },
    drafts: {
      ...originalPublished.drafts,
      [ids.updated]: fixtureDraft("original-updated-fixture-body"),
      [ids.inherited]: fixtureDraft("original-inherited-fixture-body"),
      [ids.removed]: fixtureDraft("original-removed-fixture-body"),
    },
  };
  await writeFile(publishedDataPath, JSON.stringify(withFixtures));
  const stateBeforeRun = await readFile(publishedDataPath);

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
  await writeFile(bundlePath, JSON.stringify(bundle), "utf8");

  const dryRun = run([bundlePath]);
  assert.equal(dryRun.status, 0, `expected dry run to succeed:\nstdout:\n${dryRun.stdout}\nstderr:\n${dryRun.stderr}`);
  assert(dryRun.stdout.includes("DRY RUN ONLY"), dryRun.stdout);
  // Real, currently-published projects are legitimately inherited in the
  // same run too (this run's bundle only declares the fixtures, so every
  // other real project is "absent from this export's catalog" and correctly
  // inherited) -- so these lines list more than just the fixtures; check
  // membership, not an exact list.
  const inheritedBodiesLine = dryRun.stdout.split("\n").find((line) => line.includes("Inherited unchanged project bodies"));
  assert(inheritedBodiesLine && inheritedBodiesLine.includes(ids.inherited), dryRun.stdout);
  const removedBodiesLine = dryRun.stdout.split("\n").find((line) => line.includes("Removed project bodies"));
  assert(removedBodiesLine && removedBodiesLine.includes(ids.removed), dryRun.stdout);
  assert((await readFile(publishedDataPath)).equals(stateBeforeRun), "dry run must never modify publishedPortfolio.json");

  const report = JSON.parse(await readFile(path.join(repositoryRoot, "output", "publishing-launcher-report.json"), "utf8"));
  const bodyItem = (id) => report.items.find((item) => item.id === `${id}:body`);

  // A. published has body, bundle has a modified body -> UPDATED.
  const itemA = bodyItem(ids.updated);
  assert(itemA, "expected a Project body item for the updated fixture");
  assert.equal(itemA.status, "UPDATED");

  // B / E. published has body, bundle has none, no delete intent ->
  // UNCHANGED, explicitly described as inherited (not silently dropped, not
  // BLOCKED).
  const itemB = bodyItem(ids.inherited);
  assert(itemB, "expected a Project body item for the inherited fixture");
  assert.equal(itemB.status, "UNCHANGED");
  assert(/inherited/i.test(itemB.description), itemB.description);

  // C. published has no body, bundle introduces one -> NEW.
  const itemC = bodyItem(ids.brandNew);
  assert(itemC, "expected a Project body item for the brand-new fixture");
  assert.equal(itemC.status, "NEW");

  // D. neither side has a body -> no report item at all for it.
  const itemD = bodyItem(ids.neverExisted);
  assert.equal(itemD, undefined, "expected no Project body item when neither side ever had one");

  // F. published has body, bundle has none, explicit delete intent -> REMOVED
  // (never BLOCKED, never silently UNCHANGED).
  const itemF = bodyItem(ids.removed);
  assert(itemF, "expected a Project body item for the removed fixture");
  assert.equal(itemF.status, "REMOVED");
  assert.equal(itemF.reason, "Removed via explicit project deletion intent.");

  // Nothing here should ever be BLOCKED -- that is the whole point of this fix.
  assert.equal(report.items.filter((item) => item.category === "Project body" && [ids.updated, ids.inherited, ids.brandNew, ids.removed].includes(item.projectId) && item.status === "BLOCKED").length, 0);

  console.log("import-production-bundle inherit/delete-intent regression tests passed");
} finally {
  await writeFile(publishedDataPath, originalPublishedBytes);
  const restored = await readFile(publishedDataPath);
  if (!restored.equals(originalPublishedBytes)) {
    throw new Error("CRITICAL: failed to restore publishedPortfolio.json to its original bytes after the inherit regression test.");
  }
}
