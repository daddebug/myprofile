import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

// import-production-bundle.mjs hardcodes its official root (a deliberate
// safety gate -- see OFFICIAL_ROOT in that file), so unlike
// publishing-preflight-lib.mjs's pure functions this can only be exercised
// as a real dry run against this actual repository, using a self-contained
// fixture project/asset id that cannot collide with real content.
const repositoryRoot = process.cwd();
const scriptPath = path.join(repositoryRoot, "scripts", "import-production-bundle.mjs");
const registry = JSON.parse(await readFile(path.join(repositoryRoot, "src", "lib", "publishing", "publishSourceRegistry.json"), "utf8"));

const fixtureProjectId = "test-fixture-import-regression";
const fixtureAssetId = "test-fixture-import-regression-asset";
const fixturePublicPath = `/images/published/project-body/${fixtureProjectId}/${fixtureAssetId}.png`;
const fixtureDirectory = path.join(repositoryRoot, "public", "images", "published", "project-body", fixtureProjectId);
const fixtureFile = path.join(fixtureDirectory, `${fixtureAssetId}.png`);
const bundlePath = path.join(repositoryRoot, "output", "import-production-bundle-regression-test.json");
const preflightManifestPath = path.join(repositoryRoot, "output", "publishing-preflight-manifest.json");
// A minimal, real, valid 1x1 PNG -- the disk-fallback path now requires
// genuinely decodable image bytes (see assetIntegrity.mjs), so a placeholder
// text string no longer stands in for a published image file.
const VALID_PNG_BYTES = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAIAAAUAAen63NgAAAAASUVORK5CYII=", "base64");

function buildBundle() {
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

async function runDryRun() {
  await writeFile(bundlePath, JSON.stringify(buildBundle()), "utf8");
  return spawnSync(process.execPath, [scriptPath, bundlePath], { cwd: repositoryRoot, encoding: "utf8" });
}

try {
  // A. bundle blob missing, exact published file exists -> dry run succeeds,
  // path resolves correctly, no missing-asset error.
  await mkdir(fixtureDirectory, { recursive: true });
  await writeFile(fixtureFile, VALID_PNG_BYTES);

  const resolved = await runDryRun();
  assert.equal(resolved.status, 0, `expected dry run to succeed:\nstdout:\n${resolved.stdout}\nstderr:\n${resolved.stderr}`);
  assert(resolved.stdout.includes("DRY RUN ONLY"), `expected dry-run summary in stdout:\n${resolved.stdout}`);
  assert(!/missing/i.test(resolved.stderr), `expected no missing-asset error:\n${resolved.stderr}`);

  const manifest = JSON.parse(await readFile(preflightManifestPath, "utf8"));
  const resolvedAsset = manifest.assets.find((asset) => asset.sourceAdapterId === "project-body-indexeddb-assets" && asset.assetId === fixtureAssetId);
  assert(resolvedAsset, "expected the fixture asset to appear in the preflight manifest");
  assert.equal(resolvedAsset.status, "available");
  assert.equal(resolvedAsset.publishedFileFallback, true);
  assert.equal(resolvedAsset.intendedProductionPath, `public/images/published/project-body/${fixtureProjectId}/${fixtureAssetId}.png`);
  assert(!manifest.issues.some((issue) => issue.code === "MISSING_REFERENCED_ASSET" && issue.sourceAdapterId === "project-body-indexeddb-assets"));

  await rm(fixtureFile, { force: true });

  // B. bundle blob missing AND published file also missing -> dry run still
  // fails closed, exactly as before this fix.
  const genuinelyMissing = await runDryRun();
  assert.notEqual(genuinelyMissing.status, 0, `expected dry run to fail when the file is genuinely missing:\nstdout:\n${genuinelyMissing.stdout}\nstderr:\n${genuinelyMissing.stderr}`);
  const genuinelyMissingOutput = `${genuinelyMissing.stderr}${genuinelyMissing.stdout}`;
  assert(/missing|not collected/i.test(genuinelyMissingOutput), `expected a missing/not-collected asset error:\n${genuinelyMissingOutput}`);
  assert(genuinelyMissingOutput.includes(fixtureAssetId), `expected the error to name the fixture asset:\n${genuinelyMissingOutput}`);

  console.log("import-production-bundle project-body fallback regression tests passed");
} finally {
  await rm(fixtureFile, { force: true });
  await rm(fixtureDirectory, { recursive: true, force: true });
  await rm(bundlePath, { force: true });
}
