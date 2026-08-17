import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Exercises the project-CATALOG-level merge algorithm end to end (dry-run
// only). This is distinct from import-production-bundle-inherit.test.mjs,
// which only ever omits a project's DRAFT from the bundle while still
// listing the project in bundle.projectCatalog. Here the project's catalog
// entry itself is absent from bundle.projectCatalog.projectIds/projects --
// simulating a browser session that never loaded that project at all -- to
// prove the whole project (catalog entry + body) is inherited rather than
// silently dropped.
// import-production-bundle.mjs hardcodes its OFFICIAL_ROOT, so this can only
// run against this actual repository; the currently-published data file is
// temporarily given a few self-contained fixture projects and restored
// byte-for-byte in `finally`, verified, exactly like the sibling tests.
const repositoryRoot = process.cwd();
const scriptPath = path.join(repositoryRoot, "scripts", "import-production-bundle.mjs");
const publishedDataPath = path.join(repositoryRoot, "src", "data", "publishedPortfolio.json");
const bundlePath = path.join(repositoryRoot, "output", "import-catalog-inherit-regression-test.json");
const registry = JSON.parse(await readFile(path.join(repositoryRoot, "src", "lib", "publishing", "publishSourceRegistry.json"), "utf8"));

const ids = {
  // A: published catalog entry + body exist; bundle.projectCatalog does not
  // mention this project at all; no delete intent -> whole project (catalog
  // entry, body) preserved, reported as UNCHANGED / inherited.
  inherited: "test-fixture-catalog-inherited",
  // B: published catalog entry + body exist; bundle.projectCatalog does not
  // mention it either; explicit deletedProjectIds -> REMOVED.
  removed: "test-fixture-catalog-removed",
  // C: bundle.projectCatalog introduces this project; no previous published
  // catalog entry -> NEW.
  brandNew: "test-fixture-catalog-new",
  // D: published catalog entry exists AND bundle.projectCatalog carries a
  // modified entry for the same id -> UPDATED.
  updated: "test-fixture-catalog-updated",
};

function fixtureCatalogEntry(id, overrides = {}) {
  return { isDynamic: true, slug: id, route: `/work/${id}`, titleZh: "Fixture", titleEn: "Fixture", featured: false, ...overrides };
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
      [ids.inherited]: fixtureCatalogEntry(ids.inherited),
      [ids.removed]: fixtureCatalogEntry(ids.removed),
      [ids.updated]: fixtureCatalogEntry(ids.updated, { titleZh: "Fixture Before" }),
      // ids.brandNew intentionally NOT added here -- no previous catalog entry.
    },
    drafts: {
      ...originalPublished.drafts,
      [ids.inherited]: fixtureDraft("original-catalog-inherited-fixture-body"),
      [ids.removed]: fixtureDraft("original-catalog-removed-fixture-body"),
      [ids.updated]: fixtureDraft("original-catalog-updated-fixture-body"),
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
      // ids.inherited and ids.removed are deliberately absent from BOTH
      // projectIds and projects -- simulating a browser session that never
      // loaded those projects' catalog entries this cycle at all.
      projectIds: [ids.brandNew, ids.updated],
      projects: {
        [ids.brandNew]: fixtureCatalogEntry(ids.brandNew),
        [ids.updated]: fixtureCatalogEntry(ids.updated, { titleZh: "Fixture After" }),
      },
    },
    drafts: {
      [ids.brandNew]: fixtureDraft("new-catalog-fixture-body"),
      [ids.updated]: fixtureDraft("original-catalog-updated-fixture-body"),
      // ids.inherited and ids.removed deliberately absent -- consistent with
      // their catalog entries also being absent.
    },
    projectDocuments: { version: 1, documents: {} },
    uiPractice: { version: 1, items: [] },
    gameExperience: { schemaVersion: 1, records: [] },
    images: [],
    diagnostics: { missingReferences: [] },
    // B: explicit delete intent for ids.removed -- the only thing that may
    // cause a previously-published project to be omitted entirely.
    deletedProjectIds: [ids.removed],
  };
  await writeFile(bundlePath, JSON.stringify(bundle), "utf8");

  const dryRun = run([bundlePath]);
  assert.equal(dryRun.status, 0, `expected dry run to succeed:\nstdout:\n${dryRun.stdout}\nstderr:\n${dryRun.stderr}`);
  assert(dryRun.stdout.includes("DRY RUN ONLY"), dryRun.stdout);

  // Real, currently-published projects are legitimately inherited in the
  // same run too (this run's bundle only declares two fixtures), so these
  // lines list more than just the fixtures -- check membership, not an
  // exact list.
  const inheritedCatalogLine = dryRun.stdout.split("\n").find((line) => line.includes("Inherited whole projects"));
  assert(inheritedCatalogLine && inheritedCatalogLine.includes(ids.inherited), dryRun.stdout);
  assert(!inheritedCatalogLine.includes(ids.removed), dryRun.stdout);
  const removedCatalogLine = dryRun.stdout.split("\n").find((line) => line.includes("Removed whole projects"));
  assert(removedCatalogLine && removedCatalogLine.includes(ids.removed), dryRun.stdout);
  assert(!removedCatalogLine.includes(ids.inherited), dryRun.stdout);
  assert((await readFile(publishedDataPath)).equals(stateBeforeRun), "dry run must never modify publishedPortfolio.json");

  const report = JSON.parse(await readFile(path.join(repositoryRoot, "output", "publishing-launcher-report.json"), "utf8"));
  const metadataItem = (id) => report.items.find((item) => item.id === `${id}:metadata`);
  const bodyItem = (id) => report.items.find((item) => item.id === `${id}:body`);

  // A. published catalog entry + body exist; bundle.projectCatalog doesn't
  // mention the project at all; no delete intent -> whole project
  // preserved, UNCHANGED / explicitly described as inherited (never BLOCKED,
  // never silently dropped).
  const metaA = metadataItem(ids.inherited);
  assert(metaA, "expected a Project metadata item for the catalog-inherited fixture");
  assert.equal(metaA.status, "UNCHANGED");
  assert(/inherited/i.test(metaA.description), metaA.description);
  const bodyA = bodyItem(ids.inherited);
  assert(bodyA, "expected a Project body item for the catalog-inherited fixture");
  assert.equal(bodyA.status, "UNCHANGED");
  assert(/inherited/i.test(bodyA.description), bodyA.description);

  // B. published catalog entry + body exist; bundle.projectCatalog doesn't
  // mention the project; explicit delete intent -> REMOVED (never BLOCKED,
  // never silently UNCHANGED).
  const metaB = metadataItem(ids.removed);
  assert(metaB, "expected a Project metadata item for the catalog-removed fixture");
  assert.equal(metaB.status, "REMOVED");
  assert.equal(metaB.reason, "Removed via explicit project deletion intent.");
  const bodyB = bodyItem(ids.removed);
  assert(bodyB, "expected a Project body item for the catalog-removed fixture");
  assert.equal(bodyB.status, "REMOVED");

  // C. bundle.projectCatalog introduces the project; no previous published
  // catalog entry -> NEW.
  const metaC = metadataItem(ids.brandNew);
  assert(metaC, "expected a Project metadata item for the brand-new catalog fixture");
  assert.equal(metaC.status, "NEW");

  // D. published catalog entry exists AND bundle.projectCatalog carries a
  // modified entry for the same id -> UPDATED.
  const metaD = metadataItem(ids.updated);
  assert(metaD, "expected a Project metadata item for the catalog-updated fixture");
  assert.equal(metaD.status, "UPDATED");

  // Nothing here should ever be BLOCKED -- that is the whole point of the
  // catalog-level inherit fix.
  const fixtureIds = new Set(Object.values(ids));
  assert.equal(
    report.items.filter((item) => (item.category === "Project metadata" || item.category === "Project body") && fixtureIds.has(item.projectId) && item.status === "BLOCKED").length,
    0,
  );

  console.log("import-production-bundle catalog-level inherit/delete-intent regression tests passed");
} finally {
  await writeFile(publishedDataPath, originalPublishedBytes);
  const restored = await readFile(publishedDataPath);
  if (!restored.equals(originalPublishedBytes)) {
    throw new Error("CRITICAL: failed to restore publishedPortfolio.json to its original bytes after the catalog-inherit regression test.");
  }
}
