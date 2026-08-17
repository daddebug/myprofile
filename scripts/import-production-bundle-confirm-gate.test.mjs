import assert from "node:assert/strict";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { runImportProductionBundle, withFixtureRepo } from "./publishing/__tests__/fixtureRepo.mjs";

// Exercises the real --confirm mutation gate end to end, against an isolated
// fixture root (see publishing/__tests__/fixtureRepo.mjs) -- never against
// this real repository's real publishedPortfolio.json. Each scenario below
// gets its own fixture root, so there is no shared state to restore and
// nothing left over if an assertion throws mid-scenario.
//
// Note: a project body that's simply absent from an export (no local edit
// draft, no delete intent) is NOT a BLOCKED condition -- it's correctly
// inherited from the currently-published state (see
// import-production-bundle-inherit.test.mjs for that behavior in detail).
// So the "genuinely blocked" scenario below uses a still-legitimately-
// blocking condition instead (a referenced image that exists nowhere), to
// prove --confirm is still refused whenever the publish report has anything
// BLOCKED in it, regardless of which underlying check caught it.

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
      instanceId: "a",
      templateId: "figma-prototype",
      regionId: "content",
      content: { heading: { zh: "", en: "" }, figmaUrl: "", fallbackImage: { localImageId: assetId, publicPath: `/images/published/project-body/${projectId}/${assetId}.png` } },
    }],
  };
}
async function listBackupDirs(root) {
  try { return new Set(await readdir(path.join(root, ".local-backups"))); } catch { return new Set(); }
}
async function writeBundle(root, bundle) {
  const bundlePath = path.join(root, "output", "import-bundle.json");
  await mkdir(path.dirname(bundlePath), { recursive: true });
  await writeFile(bundlePath, JSON.stringify(bundle), "utf8");
  return bundlePath;
}
async function readRegistryVersion(root) {
  const registry = JSON.parse(await readFile(path.join(root, "src", "lib", "publishing", "publishSourceRegistry.json"), "utf8"));
  return registry.version;
}

// 1. Genuinely BLOCKED (a project actually touched this run -- a fresh local
// edit -- whose referenced image exists nowhere) -> --confirm is refused,
// published data byte-identical, no backup created. Publishing Architecture
// V2 never examines an UNTOUCHED entity at all (see scenario 2 below), so
// this scenario must put the broken reference inside the bundle's own draft
// (a genuine "the user edited this project and the image capture failed"
// case), not merely inherited from an untouched published body.
{
  const projectId = "fixture-confirm-blocked";
  const assetId = "fixture-confirm-blocked-asset";
  await withFixtureRepo(async (root) => {
    const stateBefore = await readFile(path.join(root, "src", "data", "publishedPortfolio.json"));
    const bundlePath = await writeBundle(root, {
      version: 1,
      publishingRegistryVersion: await readRegistryVersion(root),
      exportedAt: new Date().toISOString(),
      origin: "test-fixture",
      projectCatalog: { version: 1, projectIds: [projectId], projects: { [projectId]: fixtureCatalogEntry(projectId) } },
      drafts: { [projectId]: fixtureDraftWithMissingImage(assetId, projectId) }, // touched: a fresh local edit whose image never made it into this bundle
      projectDocuments: { version: 1, documents: {} },
      uiPractice: { version: 1, items: [] },
      gameExperience: { schemaVersion: 1, records: [] },
      images: [],
      diagnostics: { missingReferences: [] },
    });

    const blockedRun = runImportProductionBundle(root, [bundlePath, "--confirm"]);
    assert.notEqual(blockedRun.status, 0, `expected --confirm to be refused for a genuinely missing asset:\nstdout:\n${blockedRun.stdout}\nstderr:\n${blockedRun.stderr}`);
    assert((await readFile(path.join(root, "src", "data", "publishedPortfolio.json"))).equals(stateBefore), "refused --confirm must not modify publishedPortfolio.json");
    assert.equal((await listBackupDirs(root)).size, 0, "refused --confirm must not create a backup snapshot");
  });
  console.log("1: genuinely BLOCKED -> --confirm refused, no changes, no backup, passed");
}

// 2. Body missing from the bundle, no delete intent -> Publishing
// Architecture V2 produces no intent at all for this project (nothing asked
// it to touch this project this run), so the whole run is correctly a no-op
// for it: not BLOCKED, no report item, no writeset entry, no rewrite of
// publishedPortfolio.json, no backup -- and the currently-published body is
// left exactly as it was, byte-for-byte, by construction (never a V1-style
// blind whole-file rewrite of unchanged content).
{
  const projectId = "fixture-confirm-inherited";
  await withFixtureRepo(async (root) => {
    const stateBefore = await readFile(path.join(root, "src", "data", "publishedPortfolio.json"));
    const bundlePath = await writeBundle(root, {
      version: 1,
      publishingRegistryVersion: await readRegistryVersion(root),
      exportedAt: new Date().toISOString(),
      origin: "test-fixture",
      projectCatalog: { version: 1, projectIds: [projectId], projects: { [projectId]: fixtureCatalogEntry(projectId) } },
      drafts: {}, // no local edit
      projectDocuments: { version: 1, documents: {} },
      uiPractice: { version: 1, items: [] },
      gameExperience: { schemaVersion: 1, records: [] },
      images: [],
      diagnostics: { missingReferences: [] },
    });

    const dryRun = runImportProductionBundle(root, [bundlePath]);
    assert.equal(dryRun.status, 0, `expected dry run to succeed:\nstdout:\n${dryRun.stdout}\nstderr:\n${dryRun.stderr}`);
    const reportAfterDry = JSON.parse(await readFile(path.join(root, "output", "publishing-launcher-report.json"), "utf8"));
    assert.equal(reportAfterDry.outcome, "ready");
    assert(!reportAfterDry.items.some((item) => item.projectId === projectId), "expected no report item at all for an untouched project");

    const confirmRun = runImportProductionBundle(root, [bundlePath, "--confirm"]);
    assert.equal(confirmRun.status, 0, `expected --confirm to succeed once the body is safely inherited:\nstdout:\n${confirmRun.stdout}\nstderr:\n${confirmRun.stderr}`);
    assert(confirmRun.stdout.includes("Imported safely"), confirmRun.stdout);
    const after = JSON.parse(await readFile(path.join(root, "src", "data", "publishedPortfolio.json"), "utf8"));
    assert.equal(after.drafts[projectId]?.templateInstances[0]?.content?.body?.zh, "original-inherited-fixture-body");
    assert((await readFile(path.join(root, "src", "data", "publishedPortfolio.json"))).equals(stateBefore), "an untouched entity must never even trigger a whole-file rewrite");
    assert.equal((await listBackupDirs(root)).size, 0, "nothing changed -- no backup snapshot should be created");
  }, {
    publishedPortfolio: {
      version: 1,
      generatedAt: "2020-01-01T00:00:00.000Z",
      projectCatalog: { [projectId]: fixtureCatalogEntry(projectId) },
      drafts: { [projectId]: fixtureDraft("original-inherited-fixture-body") },
      projectDocuments: { version: 1, documents: {} },
      covers: {},
      assets: [],
    },
  });
  console.log("2: untouched project -> no intent, --confirm is a true no-op, no rewrite, no backup, passed");
}

// 3. Explicit delete intent -> --confirm succeeds and genuinely removes the body.
{
  const projectId = "fixture-confirm-removed";
  await withFixtureRepo(async (root) => {
    const bundlePath = await writeBundle(root, {
      version: 1,
      publishingRegistryVersion: await readRegistryVersion(root),
      exportedAt: new Date().toISOString(),
      origin: "test-fixture",
      projectCatalog: { version: 1, projectIds: [projectId], projects: { [projectId]: fixtureCatalogEntry(projectId) } },
      drafts: {},
      projectDocuments: { version: 1, documents: {} },
      uiPractice: { version: 1, items: [] },
      gameExperience: { schemaVersion: 1, records: [] },
      images: [],
      diagnostics: { missingReferences: [] },
      deletedProjectIds: [projectId],
    });

    const removeConfirm = runImportProductionBundle(root, [bundlePath, "--confirm"]);
    assert.equal(removeConfirm.status, 0, `expected --confirm to succeed for an explicit delete intent:\nstdout:\n${removeConfirm.stdout}\nstderr:\n${removeConfirm.stderr}`);
    const after = JSON.parse(await readFile(path.join(root, "src", "data", "publishedPortfolio.json"), "utf8"));
    assert.equal(after.drafts[projectId], undefined, "expected the explicitly-deleted body to actually be removed");
  }, {
    publishedPortfolio: {
      version: 1,
      projectCatalog: { [projectId]: fixtureCatalogEntry(projectId) },
      drafts: { [projectId]: fixtureDraft("original-removed-fixture-body") },
      projectDocuments: { version: 1, documents: {} },
      covers: {},
      assets: [],
    },
  });
  console.log("3: explicit delete intent -> --confirm succeeds, body genuinely removed, passed");
}

// 4. Brand-new project, no previously-published body -> normal successful
// import behavior (NEW), unaffected by any integrity/diagnostic changes.
{
  const projectId = "fixture-confirm-ready";
  await withFixtureRepo(async (root) => {
    const bundlePath = await writeBundle(root, {
      version: 1,
      publishingRegistryVersion: await readRegistryVersion(root),
      exportedAt: new Date().toISOString(),
      origin: "test-fixture",
      projectCatalog: { version: 1, projectIds: [projectId], projects: { [projectId]: fixtureCatalogEntry(projectId) } },
      drafts: { [projectId]: fixtureDraft("ready-fixture-body") },
      projectDocuments: { version: 1, documents: {} },
      uiPractice: { version: 1, items: [] },
      gameExperience: { schemaVersion: 1, records: [] },
      images: [],
      diagnostics: { missingReferences: [] },
    });

    const confirmedReady = runImportProductionBundle(root, [bundlePath, "--confirm"]);
    assert.equal(confirmedReady.status, 0, `expected a ready --confirm to succeed:\nstdout:\n${confirmedReady.stdout}\nstderr:\n${confirmedReady.stderr}`);
    assert(confirmedReady.stdout.includes("Imported safely"), confirmedReady.stdout);
    const after = JSON.parse(await readFile(path.join(root, "src", "data", "publishedPortfolio.json"), "utf8"));
    assert(after.drafts[projectId], "expected the new ready fixture body to actually be written");
    assert.equal(after.drafts[projectId].templateInstances[0].content.body.zh, "ready-fixture-body");
    const readyReport = JSON.parse(await readFile(path.join(root, "output", "publishing-launcher-report.json"), "utf8"));
    assert.equal(readyReport.outcome, "ready");
  });
  console.log("4: brand-new project, no previous body -> ready --confirm succeeds, passed");
}

console.log("import-production-bundle confirm-gate regression tests passed");
