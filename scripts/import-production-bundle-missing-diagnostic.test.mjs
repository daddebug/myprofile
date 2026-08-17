import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { runImportProductionBundle, withFixtureRepo } from "./publishing/__tests__/fixtureRepo.mjs";

// V1's `bundle.diagnostics.missingReferences` cross-check (the fix this file
// originally regression-tested, for the 2026-08-17 "stale browser diagnostic"
// incident) no longer exists in the live CLI at all -- Publishing
// Architecture V2's Cutover Section A requires browser diagnostics be
// TELEMETRY ONLY (see the plan's "Browser Authority" model: the browser's own
// judgment is never trusted as final, buildPublishPlan.mjs always
// independently re-resolves every reference against real bundle bytes and
// the real currently-published state). The live import-production-bundle.mjs
// does not read bundle.diagnostics at all any more, so there is no
// stale-diagnostic bug class left to regress -- this test now proves exactly
// that: an arbitrary/wrong bundle.diagnostics.missingReferences value can
// never influence the plan or its outcome either way.

function fixtureCatalogEntry(id) {
  return { isDynamic: true, slug: id, route: `/work/${id}`, titleZh: "Fixture", titleEn: "Fixture", featured: false };
}
async function buildBundle(root, projectId, draft, missingReferences) {
  const registry = JSON.parse(await readFile(path.join(root, "src", "lib", "publishing", "publishSourceRegistry.json"), "utf8"));
  return {
    version: 1,
    publishingRegistryVersion: registry.version,
    exportedAt: new Date().toISOString(),
    origin: "test-fixture",
    projectCatalog: { version: 1, projectIds: [projectId], projects: { [projectId]: fixtureCatalogEntry(projectId) } },
    drafts: { [projectId]: draft },
    projectDocuments: { version: 1, documents: {} },
    uiPractice: { version: 1, items: [] },
    gameExperience: { schemaVersion: 1, records: [] },
    images: [],
    diagnostics: { missingReferences },
  };
}
async function writeBundle(root, bundle) {
  const bundlePath = path.join(root, "output", "import-bundle.json");
  await mkdir(path.dirname(bundlePath), { recursive: true });
  await writeFile(bundlePath, JSON.stringify(bundle), "utf8");
  return bundlePath;
}

// A plainly wrong/stale diagnostics.missingReferences entry (naming an id
// that isn't referenced by this project's content at all) must have zero
// effect on the plan -- it is never read.
await withFixtureRepo(async (root) => {
  const projectId = "fixture-missing-diag-a";
  const draft = { version: 1, templateInstances: [{ instanceId: "a", templateId: "statement-longform", regionId: "content", content: { body: { zh: "no image reference at all", en: "" } } }] };
  const bundlePath = await writeBundle(root, await buildBundle(root, projectId, draft, ["project-body: some-asset-that-does-not-exist"]));

  const result = runImportProductionBundle(root, [bundlePath]);
  assert.equal(result.status, 0, `expected dry run to succeed regardless of the stale diagnostics entry:\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  assert(result.stdout.includes("DRY RUN ONLY"), result.stdout);

  const report = JSON.parse(await readFile(path.join(root, "output", "publishing-launcher-report.json"), "utf8"));
  assert.equal(report.outcome, "ready");
  const item = report.items.find((entry) => entry.id === `${projectId}:project`);
  assert(item, "expected a report item for the fixture project");
  assert.notEqual(item.status, "BLOCKED");
});
console.log("bundle.diagnostics.missingReferences is never read by the live V2 import CLI (telemetry only), passed");

// Same, with an EMPTY diagnostics array -- also has zero effect (existing
// normal behavior, unchanged).
await withFixtureRepo(async (root) => {
  const projectId = "fixture-missing-diag-c";
  const draft = { version: 1, templateInstances: [{ instanceId: "a", templateId: "statement-longform", regionId: "content", content: { body: { zh: "no image reference at all", en: "" } } }] };
  const bundlePath = await writeBundle(root, await buildBundle(root, projectId, draft, []));

  const result = runImportProductionBundle(root, [bundlePath]);
  assert.equal(result.status, 0, `expected normal dry run to succeed:\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  assert(result.stdout.includes("DRY RUN ONLY"), result.stdout);
});
console.log("empty bundle.diagnostics.missingReferences -> unchanged normal behavior, passed");

console.log("import-production-bundle missing-diagnostic regression tests passed (V1 cross-check retired, confirmed telemetry-only in V2)");
