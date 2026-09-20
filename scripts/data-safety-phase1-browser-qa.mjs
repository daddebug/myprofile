import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";

const baseUrl = process.env.QA_BASE_URL ?? "http://localhost:4187";
const chromePath = process.env.QA_CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const projectId = "ai-assisted-ui-environment-design";
const projectUrl = `${baseUrl}/zh/work/${projectId}`;
const draftKey = `dilida-portfolio:dynamic-project:${projectId}:draft:v1`;
const published = JSON.parse(await readFile(new URL("../src/data/publishedPortfolio.json", import.meta.url), "utf8"));
const diskMapping = JSON.parse(await readFile(
  new URL(`../content/projects/${projectId}/project-images.json`, import.meta.url),
  "utf8",
));
const publishedDraft = published.drafts[projectId];
assert(publishedDraft?.templateInstances?.length > 0, "QA project must have published template instances");

async function withIsolatedProfile(run) {
  const profile = await mkdtemp(path.join(os.tmpdir(), "portfolio-data-safety-qa-"));
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: chromePath,
    headless: true,
    viewport: { width: 1440, height: 1000 },
  });
  await context.addInitScript(() => {
    window.__qaStorageWrites = [];
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key, value) {
      if (this === window.localStorage) window.__qaStorageWrites.push(String(key));
      return originalSetItem.call(this, key, value);
    };
  });
  await context.route("**/__portfolio-content/project-images/mapping?*", async (route) => {
    const requestProjectId = new URL(route.request().url()).searchParams.get("projectId");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        projectId: requestProjectId,
        mapping: requestProjectId === projectId
          ? diskMapping
          : { version: 1, projectId: requestProjectId, updatedAt: new Date(0).toISOString(), images: {}, instances: {} },
      }),
    });
  });
  try {
    const page = context.pages()[0] ?? await context.newPage();
    await page.goto(`${baseUrl}/zh`, { waitUntil: "networkidle" });
    await page.evaluate(() => { window.__qaStorageWrites = []; });
    return await run(page);
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
}

async function openProject(page) {
  await page.goto(projectUrl, { waitUntil: "networkidle" });
  const root = page.locator("[data-dynamic-project-page]");
  await root.waitFor();
  await page.waitForFunction(() => (
    document.querySelector("[data-dynamic-project-page]")?.getAttribute("data-draft-lifecycle") === "ready-clean"
  ));
  return root;
}

async function storageWriteSummary(page) {
  const keys = await page.evaluate(() => [...window.__qaStorageWrites]);
  return {
    keys,
    projectDraftWrites: keys.filter((key) => key === draftKey).length,
  };
}

const results = {};

results.A = await withIsolatedProfile(async (page) => {
  const root = await openProject(page);
  const instances = await page.locator("[data-template-instance-id]").count();
  const writes = await storageWriteSummary(page);
  const stored = await page.evaluate((key) => localStorage.getItem(key), draftKey);
  assert.equal(instances, publishedDraft.templateInstances.length);
  assert.equal(stored, null);
  assert.equal(writes.projectDraftWrites, 0);
  assert.deepEqual(writes.keys, []);
  return { instances, projectDraftWrites: writes.projectDraftWrites, otherWriteKeys: writes.keys.filter((key) => key !== draftKey), draftCreated: false };
});

results.B = await withIsolatedProfile(async (page) => {
  const localDraft = structuredClone(publishedDraft);
  localDraft.updatedAt = "2026-09-20T01:00:00.000Z";
  const storedValue = JSON.stringify(localDraft);
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [draftKey, storedValue]);
  await page.evaluate(() => { window.__qaStorageWrites = []; });
  const root = await openProject(page);
  const suspicious = await root.getAttribute("data-suspicious-local-draft");
  const after = await page.evaluate((key) => localStorage.getItem(key), draftKey);
  const writes = await storageWriteSummary(page);
  assert.equal(suspicious, "false");
  assert.equal(after, storedValue);
  assert.equal(writes.projectDraftWrites, 0);
  assert.deepEqual(writes.keys, []);
  return { preserved: true, projectDraftWrites: writes.projectDraftWrites, otherWriteKeys: writes.keys.filter((key) => key !== draftKey) };
});

results.C = await withIsolatedProfile(async (page) => {
  const emptyDraft = JSON.stringify({ version: 1, templateInstances: [], updatedAt: "2026-09-20T02:00:00.000Z" });
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [draftKey, emptyDraft]);
  await page.evaluate(() => { window.__qaStorageWrites = []; });
  const root = await openProject(page);
  const suspicious = await root.getAttribute("data-suspicious-local-draft");
  const instances = await page.locator("[data-template-instance-id]").count();
  const after = await page.evaluate((key) => localStorage.getItem(key), draftKey);
  const writes = await storageWriteSummary(page);
  assert.equal(suspicious, "true");
  assert.equal(instances, 0);
  assert.equal(after, emptyDraft);
  assert.equal(writes.projectDraftWrites, 0);
  assert.deepEqual(writes.keys, []);
  return { suspicious: true, instances, preserved: true, projectDraftWrites: writes.projectDraftWrites, otherWriteKeys: writes.keys.filter((key) => key !== draftKey) };
});

results.D = await withIsolatedProfile(async (page) => {
  const root = await openProject(page);
  const instances = await page.locator("[data-template-instance-id]").count();
  const orphaned = Number(await root.getAttribute("data-orphaned-disk-mapping-count"));
  const writes = await storageWriteSummary(page);
  assert.equal(instances, publishedDraft.templateInstances.length);
  assert.equal(orphaned, 6);
  assert.equal(writes.projectDraftWrites, 0);
  assert.deepEqual(writes.keys, []);
  return { instances, orphaned, resurrected: false, projectDraftWrites: writes.projectDraftWrites, otherWriteKeys: writes.keys.filter((key) => key !== draftKey) };
});

results.explicitEdit = await withIsolatedProfile(async (page) => {
  await page.evaluate(() => {
    localStorage.setItem("dilida-portfolio:editing-mode:v1", "1");
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.evaluate(() => { window.__qaStorageWrites = []; });
  await openProject(page);
  const statement = page.locator('[data-template-instance-template-id="statement-longform"]').first();
  await statement.getByRole("button", { name: "编辑" }).click();
  const field = page.getByLabel("章节标签").first();
  await field.waitFor();
  const initial = await field.inputValue();
  await field.fill(`${initial} QA`);
  await page.waitForFunction((key) => window.__qaStorageWrites.includes(key), draftKey);
  const writes = await page.evaluate((key) => window.__qaStorageWrites.filter((entry) => entry === key).length, draftKey);
  assert(writes >= 1);
  return { autosaved: true, draftWrites: writes };
});

console.log(JSON.stringify(results, null, 2));
