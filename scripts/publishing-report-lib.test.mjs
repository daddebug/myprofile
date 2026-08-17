import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { writePublishPlanReport, LAUNCHER_REPORT_PATH } from "./publishing-report-lib.mjs";
import { readFile } from "node:fs/promises";

const projectId = "fixture";
const baseProjectCatalog = {
  [projectId]: { isDynamic: true, slug: projectId, route: `/work/${projectId}`, titleZh: "Fixture", titleEn: "Fixture", featured: false },
};
const draftBody = { version: 1, templateInstances: [{ instanceId: "a", templateId: "statement-longform", regionId: "content", content: { body: { zh: "original", en: "" } } }] };
const modifiedDraftBody = { version: 1, templateInstances: [{ instanceId: "a", templateId: "statement-longform", regionId: "content", content: { body: { zh: "changed", en: "" } } }] };

const baseManifest = { projects: [{ projectId }], assets: [], contentRecords: [], issues: [] };

async function setup(currentPublished) {
  const root = await mkdtemp(path.join(os.tmpdir(), "portfolio-publishing-report-"));
  await mkdir(path.join(root, "src", "data"), { recursive: true });
  await writeFile(path.join(root, "src", "data", "publishedPortfolio.json"), JSON.stringify(currentPublished), "utf8");
  return root;
}

async function runReport(root, outputOverrides, { deletedProjectIds, inheritedProjectIds } = {}) {
  const output = {
    projectCatalog: baseProjectCatalog,
    drafts: {},
    projectDocuments: { version: 1, documents: {} },
    covers: {},
    ...outputOverrides,
  };
  await writePublishPlanReport({ root, manifest: baseManifest, output, uiPractice: null, assets: [], productionUrl: "https://example.test", deletedProjectIds, inheritedProjectIds });
  return JSON.parse(await readFile(path.join(root, LAUNCHER_REPORT_PATH), "utf8"));
}

function bodyItem(report) {
  return report.items.find((item) => item.id === `${projectId}:body`);
}

let rootA, rootB, rootC, rootD, rootE, rootF;
try {
  // A. previously-published body, next bundle has no body for this project
  // -> must fail closed as BLOCKED, never silently UNCHANGED or skipped.
  rootA = await setup({ projectCatalog: baseProjectCatalog, drafts: { [projectId]: draftBody }, projectDocuments: { version: 1, documents: {} }, covers: {} });
  const reportA = await runReport(rootA, { drafts: {} });
  const itemA = bodyItem(reportA);
  assert(itemA, "expected a Project body report item even when the body disappeared");
  assert.equal(itemA.status, "BLOCKED");
  assert.equal(itemA.reason, "Published project body is missing from the current export, and there is no explicit delete intent for it.");
  assert.notEqual(reportA.outcome, "ready");
  assert(reportA.counts.blocked >= 1);

  // B. previously-published body, next bundle has the identical body -> UNCHANGED.
  rootB = await setup({ projectCatalog: baseProjectCatalog, drafts: { [projectId]: draftBody }, projectDocuments: { version: 1, documents: {} }, covers: {} });
  const reportB = await runReport(rootB, { drafts: { [projectId]: draftBody } });
  const itemB = bodyItem(reportB);
  assert.equal(itemB.status, "UNCHANGED");

  // C. previously-published body, next bundle has a modified body -> UPDATED.
  rootC = await setup({ projectCatalog: baseProjectCatalog, drafts: { [projectId]: draftBody }, projectDocuments: { version: 1, documents: {} }, covers: {} });
  const reportC = await runReport(rootC, { drafts: { [projectId]: modifiedDraftBody } });
  const itemC = bodyItem(reportC);
  assert.equal(itemC.status, "UPDATED");

  // D. no previously-published body, next bundle introduces one -> NEW.
  rootD = await setup({ projectCatalog: baseProjectCatalog, drafts: {}, projectDocuments: { version: 1, documents: {} }, covers: {} });
  const reportD = await runReport(rootD, { drafts: { [projectId]: draftBody } });
  const itemD = bodyItem(reportD);
  assert.equal(itemD.status, "NEW");

  // E. previously-published body, bundle has none, but the caller marks it
  // as inherited (import-production-bundle.mjs already copied the published
  // body into `output` before calling this) -> UNCHANGED, with a description
  // that says so, not the generic "narrative/template instances" text.
  rootE = await setup({ projectCatalog: baseProjectCatalog, drafts: { [projectId]: draftBody }, projectDocuments: { version: 1, documents: {} }, covers: {} });
  const reportE = await runReport(rootE, { drafts: { [projectId]: draftBody } }, { inheritedProjectIds: new Set([projectId]) });
  const itemE = bodyItem(reportE);
  assert.equal(itemE.status, "UNCHANGED");
  assert(/inherited/i.test(itemE.description), itemE.description);

  // F. previously-published body, bundle has none, explicit delete intent
  // for this project -> REMOVED, never BLOCKED, never UNCHANGED.
  rootF = await setup({ projectCatalog: baseProjectCatalog, drafts: { [projectId]: draftBody }, projectDocuments: { version: 1, documents: {} }, covers: {} });
  const reportF = await runReport(rootF, { drafts: {} }, { deletedProjectIds: new Set([projectId]) });
  const itemF = bodyItem(reportF);
  assert.equal(itemF.status, "REMOVED");
  assert.equal(itemF.reason, "Removed via explicit project deletion intent.");
  assert.equal(reportF.counts.removed, 1);
  assert.equal(reportF.counts.blocked, 0);

  console.log("publishing-report project-body presence regression tests passed");
} finally {
  for (const root of [rootA, rootB, rootC, rootD, rootE, rootF]) {
    if (root) await rm(root, { recursive: true, force: true });
  }
}
