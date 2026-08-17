import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { runImportProductionBundle, withFixtureRepo } from "./publishing/__tests__/fixtureRepo.mjs";

// Exercises the project-CATALOG-level merge algorithm end to end (dry-run
// only). This is distinct from import-production-bundle-inherit.test.mjs,
// which only ever omits a project's DRAFT from the bundle while still
// listing the project in bundle.projectCatalog. Here the project's catalog
// entry itself is absent from bundle.projectCatalog.projectIds/projects --
// simulating a browser session that never loaded that project at all -- to
// prove the whole project (catalog entry + body) is inherited rather than
// silently dropped. Runs the real, still-frozen V1
// import-production-bundle.mjs CLI against an isolated fixture root (see
// publishing/__tests__/fixtureRepo.mjs) -- never against this real repository.

const ids = {
  // A: published catalog entry + body exist; bundle.projectCatalog does not
  // mention this project at all; no delete intent -> whole project (catalog
  // entry, body) preserved, reported as UNCHANGED / inherited.
  inherited: "fixture-catalog-inherited",
  // B: published catalog entry + body exist; bundle.projectCatalog does not
  // mention it either; explicit deletedProjectIds -> REMOVED.
  removed: "fixture-catalog-removed",
  // C: bundle.projectCatalog introduces this project; no previous published
  // catalog entry -> NEW.
  brandNew: "fixture-catalog-new",
  // D: published catalog entry exists AND bundle.projectCatalog carries a
  // modified entry for the same id -> UPDATED.
  updated: "fixture-catalog-updated",
};

function fixtureCatalogEntry(id, overrides = {}) {
  return { isDynamic: true, slug: id, route: `/work/${id}`, titleZh: "Fixture", titleEn: "Fixture", featured: false, ...overrides };
}
function fixtureDraft(text) {
  return { version: 1, templateInstances: [{ instanceId: "a", templateId: "statement-longform", regionId: "content", content: { body: { zh: text, en: "" } } }] };
}

const publishedPortfolio = {
  version: 1,
  projectCatalog: {
    [ids.inherited]: fixtureCatalogEntry(ids.inherited),
    [ids.removed]: fixtureCatalogEntry(ids.removed),
    [ids.updated]: fixtureCatalogEntry(ids.updated, { titleZh: "Fixture Before" }),
    // ids.brandNew intentionally NOT added here -- no previous catalog entry.
  },
  drafts: {
    [ids.inherited]: fixtureDraft("original-catalog-inherited-fixture-body"),
    [ids.removed]: fixtureDraft("original-catalog-removed-fixture-body"),
    [ids.updated]: fixtureDraft("original-catalog-updated-fixture-body"),
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

  // A. published catalog entry + body exist; bundle mentions this project
  // NOWHERE (no catalog entry, no draft, no cover) and there is no delete
  // intent -> Publishing Architecture V2 produces NO intent at all for it
  // (nothing asked V2 to touch this project this run), so there is no report
  // item -- the currently-published catalog entry + body are left exactly as
  // they are by construction, never silently dropped, never BLOCKED.
  const itemA = projectItem(ids.inherited);
  assert.equal(itemA, undefined, "expected no report item for a project untouched by this bundle in every field");

  // B. published catalog entry + body exist; bundle doesn't mention the
  // project either; explicit delete intent -> REMOVED (never BLOCKED, never
  // silently UNCHANGED).
  const itemB = projectItem(ids.removed);
  assert(itemB, "expected a project item for the catalog-removed fixture");
  assert.equal(itemB.status, "REMOVED");
  assert.equal(itemB.reason, "Removed via explicit delete intent.");

  // C. bundle introduces the project (catalog entry + draft); no previous
  // published catalog entry -> NEW.
  const itemC = projectItem(ids.brandNew);
  assert(itemC, "expected a project item for the brand-new catalog fixture");
  assert.equal(itemC.status, "NEW");

  // D. published catalog entry exists AND the bundle carries a modified
  // catalog entry for the same id (body unchanged) -> UPDATED (meta alone
  // changing is enough to change the whole entity's content hash).
  const itemD = projectItem(ids.updated);
  assert(itemD, "expected a project item for the catalog-updated fixture");
  assert.equal(itemD.status, "UPDATED");

  // Nothing here should ever be BLOCKED -- that is the whole point of the
  // catalog-level inherit fix.
  const fixtureIds = new Set(Object.values(ids));
  assert.equal(report.items.filter((item) => fixtureIds.has(item.projectId) && item.status === "BLOCKED").length, 0);

  console.log("import-production-bundle catalog-level inherit/delete-intent regression tests passed");
}, { publishedPortfolio });
