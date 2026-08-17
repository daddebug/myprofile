import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { detectImageSignature } from "./assetIntegrity.mjs";

// This test exercises the real --confirm mutation gate end to end, which
// means running the real script (its OFFICIAL_ROOT is hardcoded, so it can
// only run against this actual repository) against the real
// publishedPortfolio.json and uiPracticeMetadata.json. Both are snapshotted
// up front and restored byte-for-byte in `finally`, with a hard failure if
// restoration ever doesn't verify -- this test must never be the reason
// real project data changes.
//
// Note: a project body that's simply absent from an export (no local edit
// draft, no delete intent) is NO LONGER a BLOCKED condition -- it's
// correctly inherited from the currently-published state (see
// import-production-bundle-inherit.test.mjs for that behavior in detail).
// So the "genuinely blocked" scenario below uses a still-legitimately-
// blocking condition instead (a referenced image that exists nowhere), to
// prove --confirm is still refused whenever the publish report has anything
// BLOCKED in it, regardless of which underlying check caught it.
const repositoryRoot = process.cwd();
const scriptPath = path.join(repositoryRoot, "scripts", "import-production-bundle.mjs");
const publishedDataPath = path.join(repositoryRoot, "src", "data", "publishedPortfolio.json");
const uiPracticeDataPath = path.join(repositoryRoot, "src", "data", "uiPracticeMetadata.json");
const bundlePath = path.join(repositoryRoot, "output", "import-confirm-gate-regression-test.json");
const localBackupsDir = path.join(repositoryRoot, ".local-backups");
const registry = JSON.parse(await readFile(path.join(repositoryRoot, "src", "lib", "publishing", "publishSourceRegistry.json"), "utf8"));

const blockedFixtureId = "test-fixture-confirm-gate-blocked";
const blockedAssetId = "test-fixture-confirm-gate-blocked-asset";
const inheritedFixtureId = "test-fixture-confirm-gate-inherited";
const removedFixtureId = "test-fixture-confirm-gate-removed";
const readyFixtureId = "test-fixture-confirm-gate-ready";
const allFixtureIds = [blockedFixtureId, inheritedFixtureId, removedFixtureId, readyFixtureId];

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
function run(args) {
  return spawnSync(process.execPath, [scriptPath, ...args], { cwd: repositoryRoot, encoding: "utf8" });
}
async function listBackupDirs() {
  try { return new Set(await readdir(localBackupsDir)); } catch { return new Set(); }
}

const originalPublishedBytes = await readFile(publishedDataPath);
const originalUiPracticeBytes = await readFile(uiPracticeDataPath);
const originalPublished = JSON.parse(originalPublishedBytes.toString("utf8"));
for (const id of allFixtureIds) {
  assert(!(id in (originalPublished.projectCatalog || {})), `fixture id collision on ${id} -- aborting before touching real data`);
}
const backupDirsBefore = await listBackupDirs();

try {
  // ==== 1. Genuinely BLOCKED (referenced image exists nowhere) -> --confirm
  // is refused, published file byte-identical, no backup created. ====
  const withBlockedFixture = {
    ...originalPublished,
    projectCatalog: { ...originalPublished.projectCatalog, [blockedFixtureId]: fixtureCatalogEntry(blockedFixtureId) },
    drafts: { ...originalPublished.drafts, [blockedFixtureId]: fixtureDraftWithMissingImage(blockedAssetId, blockedFixtureId) },
  };
  await writeFile(publishedDataPath, JSON.stringify(withBlockedFixture));
  const stateBeforeBlocked = await readFile(publishedDataPath);

  const blockedBundle = {
    version: 1,
    publishingRegistryVersion: registry.version,
    exportedAt: new Date().toISOString(),
    origin: "test-fixture",
    projectCatalog: { version: 1, projectIds: [blockedFixtureId], projects: { [blockedFixtureId]: fixtureCatalogEntry(blockedFixtureId) } },
    drafts: {}, // no local edit -- inherits the published body, which itself references a genuinely-missing image
    projectDocuments: { version: 1, documents: {} },
    uiPractice: { version: 1, items: [] },
    gameExperience: { schemaVersion: 1, records: [] },
    images: [],
    diagnostics: { missingReferences: [] },
  };
  await writeFile(bundlePath, JSON.stringify(blockedBundle), "utf8");

  const blockedRun = run([bundlePath, "--confirm"]);
  assert.notEqual(blockedRun.status, 0, `expected --confirm to be refused for a genuinely missing asset:\nstdout:\n${blockedRun.stdout}\nstderr:\n${blockedRun.stderr}`);
  assert((await readFile(publishedDataPath)).equals(stateBeforeBlocked), "refused --confirm must not modify publishedPortfolio.json (byte-for-byte)");
  assert.deepEqual(await listBackupDirs(), backupDirsBefore, "refused --confirm must not create a backup snapshot");

  await writeFile(publishedDataPath, originalPublishedBytes);

  // ==== 2. Body missing, no delete intent -> now correctly inherited, NOT
  // blocked; --confirm succeeds and writes the inherited body verbatim. ====
  const withInheritedFixture = {
    ...originalPublished,
    projectCatalog: { ...originalPublished.projectCatalog, [inheritedFixtureId]: fixtureCatalogEntry(inheritedFixtureId) },
    drafts: { ...originalPublished.drafts, [inheritedFixtureId]: fixtureDraft("original-inherited-fixture-body") },
  };
  await writeFile(publishedDataPath, JSON.stringify(withInheritedFixture));

  const inheritBundle = {
    version: 1,
    publishingRegistryVersion: registry.version,
    exportedAt: new Date().toISOString(),
    origin: "test-fixture",
    projectCatalog: { version: 1, projectIds: [inheritedFixtureId], projects: { [inheritedFixtureId]: fixtureCatalogEntry(inheritedFixtureId) } },
    drafts: {}, // no local edit
    projectDocuments: { version: 1, documents: {} },
    uiPractice: { version: 1, items: [] },
    gameExperience: { schemaVersion: 1, records: [] },
    images: [],
    diagnostics: { missingReferences: [] },
  };
  await writeFile(bundlePath, JSON.stringify(inheritBundle), "utf8");

  const inheritReport = run([bundlePath]); // dry run first
  assert.equal(inheritReport.status, 0, `expected dry run to succeed:\nstdout:\n${inheritReport.stdout}\nstderr:\n${inheritReport.stderr}`);
  const reportAfterInheritDry = JSON.parse(await readFile(path.join(repositoryRoot, "output", "publishing-launcher-report.json"), "utf8"));
  assert.equal(reportAfterInheritDry.outcome, "ready");
  assert(reportAfterInheritDry.items.some((item) => item.projectId === inheritedFixtureId && item.category === "Project body" && item.status === "UNCHANGED"));

  const inheritConfirm = run([bundlePath, "--confirm"]);
  assert.equal(inheritConfirm.status, 0, `expected --confirm to succeed once the body is safely inherited:\nstdout:\n${inheritConfirm.stdout}\nstderr:\n${inheritConfirm.stderr}`);
  const afterInheritConfirm = JSON.parse(await readFile(publishedDataPath, "utf8"));
  assert.equal(afterInheritConfirm.drafts[inheritedFixtureId]?.templateInstances[0]?.content?.body?.zh, "original-inherited-fixture-body");

  await writeFile(publishedDataPath, originalPublishedBytes);

  // ==== 3. Explicit delete intent -> --confirm succeeds and genuinely
  // removes the body. ====
  const withRemovedFixture = {
    ...originalPublished,
    projectCatalog: { ...originalPublished.projectCatalog, [removedFixtureId]: fixtureCatalogEntry(removedFixtureId) },
    drafts: { ...originalPublished.drafts, [removedFixtureId]: fixtureDraft("original-removed-fixture-body") },
  };
  await writeFile(publishedDataPath, JSON.stringify(withRemovedFixture));

  const removeBundle = {
    version: 1,
    publishingRegistryVersion: registry.version,
    exportedAt: new Date().toISOString(),
    origin: "test-fixture",
    projectCatalog: { version: 1, projectIds: [removedFixtureId], projects: { [removedFixtureId]: fixtureCatalogEntry(removedFixtureId) } },
    drafts: {},
    projectDocuments: { version: 1, documents: {} },
    uiPractice: { version: 1, items: [] },
    gameExperience: { schemaVersion: 1, records: [] },
    images: [],
    diagnostics: { missingReferences: [] },
    deletedProjectIds: [removedFixtureId],
  };
  await writeFile(bundlePath, JSON.stringify(removeBundle), "utf8");

  const removeConfirm = run([bundlePath, "--confirm"]);
  assert.equal(removeConfirm.status, 0, `expected --confirm to succeed for an explicit delete intent:\nstdout:\n${removeConfirm.stdout}\nstderr:\n${removeConfirm.stderr}`);
  const afterRemoveConfirm = JSON.parse(await readFile(publishedDataPath, "utf8"));
  assert.equal(afterRemoveConfirm.drafts[removedFixtureId], undefined, "expected the explicitly-deleted body to actually be removed");

  await writeFile(publishedDataPath, originalPublishedBytes);

  // ==== 4. No previously-published body, next bundle introduces one, with
  // every other real project fully present -> existing successful import
  // behavior unaffected by any of today's changes. ====
  //
  // Deliberately `images: []` here rather than reconstructing bundle image
  // entries from every real published asset: this used to synthesize fake
  // `dataBase64: "AAAA"` payloads for every one of them (including real
  // adapters like project covers, template images, game covers) and run a
  // REAL --confirm against them -- meaning a successful run of this test
  // actually overwrote real production asset files with 3-byte garbage, and
  // the `finally` block below only ever restored the two JSON data files,
  // never those asset files. That is very likely the source of the
  // 2026-08-17 asset-corruption incident's pre-existing (not
  // exporter-caused) corrupted files. With `images: []`, every real
  // project's existing image references resolve the same way any other
  // untouched project's do -- via the already-proven disk-fallback path in
  // resolveAlreadyPublishedProjectBodyAsset -- so this scenario still
  // exercises "the whole real catalog present in-bundle, new fixture added"
  // without ever writing to a single real asset file.
  const readyPublished = {
    ...originalPublished,
    projectCatalog: { ...originalPublished.projectCatalog, [readyFixtureId]: fixtureCatalogEntry(readyFixtureId) },
  };
  await writeFile(publishedDataPath, JSON.stringify(readyPublished));

  // game-experience-covers has no server-side disk-fallback (unlike project
  // covers/template images/project-body/playable-game covers -- see
  // resolveAlreadyPublishedProjectBodyAsset), so a bundle that includes the
  // real gameExperience.records (needed to keep them from being wiped out --
  // an empty/absent gameExperience field in the bundle replaces or drops the
  // real data, which is out of scope to fix here) must still supply real
  // bundle image entries for their covers. Reading the actual currently-
  // published cover bytes back in keeps this genuinely safe: the bytes
  // written are byte-identical to what's already on disk, never placeholder
  // data, so even if something did write them there is no content change.
  const gameCoverImages = await Promise.all(
    (readyPublished.gameExperience?.records ?? [])
      .map((record) => record.presentation?.coverAssetId)
      .filter((coverAssetId) => typeof coverAssetId === "string" && coverAssetId)
      .map(async (coverAssetId) => {
        const asset = (readyPublished.assets || []).find((a) => a.sourceAdapterId === "game-experience-covers" && a.sourceId === coverAssetId);
        if (!asset) return null;
        const bytes = await readFile(path.join(repositoryRoot, "public", asset.publicPath.replace(/^\//, "")));
        // Several real published files carry an extension that doesn't match
        // their actual encoded format (e.g. `.jpg` files that are really
        // WEBP, from an earlier compression pass that kept the original
        // extension for stable referencing -- see assetIntegrity.mjs). The
        // output path must still match the real, currently-published
        // extension (fileName stays as-is; import-production-bundle.mjs
        // prefers a known extension straight off the filename), but a fresh
        // bundle image is validated strictly (declared vs. detected
        // signature must agree), so the declared mimeType must reflect what
        // the bytes actually are, not what the on-disk filename claims.
        const detectedMime = detectImageSignature(bytes) || "image/jpeg";
        return {
          sourceAdapterId: "game-experience-covers",
          database: asset.sourceDatabase,
          store: asset.sourceStore,
          id: coverAssetId,
          fileName: path.basename(asset.publicPath),
          mimeType: detectedMime,
          dataBase64: bytes.toString("base64"),
        };
      }),
  );

  const readyBundle = {
    version: 1,
    publishingRegistryVersion: registry.version,
    exportedAt: new Date().toISOString(),
    origin: "test-fixture",
    projectCatalog: { version: 1, projectIds: Object.keys(readyPublished.projectCatalog), projects: readyPublished.projectCatalog },
    drafts: { ...readyPublished.drafts, [readyFixtureId]: fixtureDraft("ready-fixture-body") },
    projectDocuments: readyPublished.projectDocuments,
    uiPractice: JSON.parse(originalUiPracticeBytes.toString("utf8")),
    gameExperience: readyPublished.gameExperience,
    images: gameCoverImages.filter(Boolean),
    diagnostics: { missingReferences: [] },
  };
  await writeFile(bundlePath, JSON.stringify(readyBundle), "utf8");

  const confirmedReady = run([bundlePath, "--confirm"]);
  assert.equal(confirmedReady.status, 0, `expected a ready --confirm to succeed as before:\nstdout:\n${confirmedReady.stdout}\nstderr:\n${confirmedReady.stderr}`);
  assert(confirmedReady.stdout.includes("Imported safely"), confirmedReady.stdout);
  const afterReadyConfirm = JSON.parse(await readFile(publishedDataPath, "utf8"));
  assert(afterReadyConfirm.drafts[readyFixtureId], "expected the new ready fixture body to actually be written");
  assert.equal(afterReadyConfirm.drafts[readyFixtureId].templateInstances[0].content.body.zh, "ready-fixture-body");
  const readyReport = JSON.parse(await readFile(path.join(repositoryRoot, "output", "publishing-launcher-report.json"), "utf8"));
  assert.equal(readyReport.outcome, "ready");

  console.log("import-production-bundle confirm-gate regression tests passed");
} finally {
  await writeFile(publishedDataPath, originalPublishedBytes);
  await writeFile(uiPracticeDataPath, originalUiPracticeBytes);
  const restoredPublished = await readFile(publishedDataPath);
  const restoredUiPractice = await readFile(uiPracticeDataPath);
  if (!restoredPublished.equals(originalPublishedBytes) || !restoredUiPractice.equals(originalUiPracticeBytes)) {
    throw new Error("CRITICAL: failed to restore publishedPortfolio.json/uiPracticeMetadata.json to their original bytes after the confirm-gate regression test.");
  }
  for (const dir of await listBackupDirs()) {
    if (!backupDirsBefore.has(dir)) await rm(path.join(localBackupsDir, dir), { recursive: true, force: true });
  }
  await rm(bundlePath, { force: true });
}
