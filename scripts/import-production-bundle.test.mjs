import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { VALID_PNG_BYTES, runImportProductionBundle, withFixtureRepo } from "./publishing/__tests__/fixtureRepo.mjs";

// Exercises the project-body disk-fallback rule end to end: (A) the bundle's
// own IndexedDB snapshot is missing a referenced blob but the exact file it
// already published to disk still exists -- dry run must succeed via that
// fallback; (B) the same missing blob with no disk fallback either -- dry run
// must still fail closed. Runs the real, live V2-cutover
// import-production-bundle.mjs CLI (buildPublishPlan/executePublishPlan as
// sole authority) against an isolated fixture root (see
// publishing/__tests__/fixtureRepo.mjs) -- never against this real repository.

const fixtureProjectId = "fixture-project-body";
const fixtureAssetId = "fixture-project-body-asset";
const fixturePublicPath = `/images/published/project-body/${fixtureProjectId}/${fixtureAssetId}.png`;

async function buildBundle(root) {
  const registry = JSON.parse(await readFile(path.join(root, "src", "lib", "publishing", "publishSourceRegistry.json"), "utf8"));
  return {
    version: 1,
    publishingRegistryVersion: registry.version,
    exportedAt: new Date().toISOString(),
    origin: "test-fixture",
    projectCatalog: {
      version: 1,
      projectIds: [fixtureProjectId],
      projects: {
        [fixtureProjectId]: { isDynamic: true, slug: fixtureProjectId, route: `/work/${fixtureProjectId}`, titleZh: "Fixture", titleEn: "Fixture", featured: false },
      },
    },
    drafts: {
      [fixtureProjectId]: {
        version: 1,
        templateInstances: [
          {
            instanceId: "figma-prototype-fixture",
            templateId: "figma-prototype",
            regionId: "content",
            content: {
              heading: { zh: "", en: "" },
              figmaUrl: "",
              caption: { zh: "", en: "" },
              // The exact real-world shape: localImageId missing from
              // bundle.images, but a publicPath already declared alongside it.
              fallbackImage: { localImageId: fixtureAssetId, publicPath: fixturePublicPath },
            },
          },
        ],
      },
    },
    projectDocuments: { version: 1, documents: {} },
    uiPractice: { version: 1, items: [] },
    gameExperience: { schemaVersion: 1, records: [] },
    images: [], // deliberately empty -- simulates the blob missing from this browser session's IndexedDB
    diagnostics: { missingReferences: [] },
  };
}

async function writeBundle(root, bundle) {
  const bundlePath = path.join(root, "output", "import-bundle.json");
  await mkdir(path.dirname(bundlePath), { recursive: true });
  await writeFile(bundlePath, JSON.stringify(bundle), "utf8");
  return bundlePath;
}

// A. bundle blob missing, exact published file exists, AND this exact
// reference was already part of the project's currently-published baseline
// (referenceIntent "inherited") -- dry run must succeed via disk fallback.
// Publishing Architecture V2's Asset Resolution Model deliberately narrows
// disk fallback to inherited references only (Root Cause 11 fix: a brand-new
// or CHANGED reference with no bundle bytes must never silently substitute a
// stale/orphan file) -- so, unlike V1, this scenario requires currentPublished
// to already know about this exact project+asset reference, not just an
// orphan file sitting at the expected path.
await withFixtureRepo(async (root) => {
  const fixtureDirectory = path.join(root, "public", "images", "published", "project-body", fixtureProjectId);
  await mkdir(fixtureDirectory, { recursive: true });
  await writeFile(path.join(fixtureDirectory, `${fixtureAssetId}.png`), VALID_PNG_BYTES);

  const bundle = await buildBundle(root);
  await writeFile(path.join(root, "src", "data", "publishedPortfolio.json"), JSON.stringify({
    version: 1,
    drafts: { [fixtureProjectId]: bundle.drafts[fixtureProjectId] },
    projectCatalog: { [fixtureProjectId]: bundle.projectCatalog.projects[fixtureProjectId] },
    projectDocuments: { version: 1, documents: {} },
    covers: {},
    assets: [],
  }), "utf8");
  const bundlePath = await writeBundle(root, bundle);
  const resolved = runImportProductionBundle(root, [bundlePath]);
  assert.equal(resolved.status, 0, `expected dry run to succeed:\nstdout:\n${resolved.stdout}\nstderr:\n${resolved.stderr}`);
  assert(resolved.stdout.includes("DRY RUN ONLY"), `expected dry-run summary in stdout:\n${resolved.stdout}`);
  assert(!/missing/i.test(resolved.stderr), `expected no missing-asset error:\n${resolved.stderr}`);

  const report = JSON.parse(await readFile(path.join(root, "output", "publishing-launcher-report.json"), "utf8"));
  const projectItem = report.items.find((item) => item.projectId === fixtureProjectId);
  assert(projectItem, "expected a report item for the fixture project");
  assert.notEqual(projectItem.status, "BLOCKED", `expected the inherited disk-fallback reference to resolve cleanly, got: ${JSON.stringify(projectItem)}`);
  assert.equal(report.outcome, "ready");
});
console.log("A: bundle blob missing, published file exists, reference inherited -> dry run succeeds via disk fallback, passed");

// B. bundle blob missing AND published file also missing -> dry run still
// fails closed, exactly as before this fix.
await withFixtureRepo(async (root) => {
  const bundlePath = await writeBundle(root, await buildBundle(root));
  const genuinelyMissing = runImportProductionBundle(root, [bundlePath]);
  assert.notEqual(genuinelyMissing.status, 0, `expected dry run to fail when the file is genuinely missing:\nstdout:\n${genuinelyMissing.stdout}\nstderr:\n${genuinelyMissing.stderr}`);
  const genuinelyMissingOutput = `${genuinelyMissing.stderr}${genuinelyMissing.stdout}`;
  assert(/missing|not collected/i.test(genuinelyMissingOutput), `expected a missing/not-collected asset error:\n${genuinelyMissingOutput}`);
  assert(genuinelyMissingOutput.includes(fixtureAssetId), `expected the error to name the fixture asset:\n${genuinelyMissingOutput}`);
});
console.log("B: bundle blob missing, published file also missing -> dry run fails closed, passed");

console.log("import-production-bundle project-body fallback regression tests passed");
