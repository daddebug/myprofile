// Narrow-scope tests for the Translation Persistence fix
// (src/lib/translationHydration.ts). No existing JS test runner is wired
// up for src/lib/*.ts (only scripts/publishing/__tests__ has one, for the
// Node-side publishing scripts) -- this test transpiles the single
// TypeScript source file in-process via the already-installed `typescript`
// compiler API (no new dependency), then exercises the real compiled
// function with node:test + node:assert, matching this repo's existing
// __tests__ convention.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ts from "typescript";

const sourcePath = new URL("../translationHydration.ts", import.meta.url);
const source = readFileSync(sourcePath, "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 },
});
const tmpDir = mkdtempSync(path.join(tmpdir(), "translation-hydration-"));
const tmpFile = path.join(tmpDir, "translationHydration.mjs");
writeFileSync(tmpFile, outputText, "utf8");
const { hydrateTranslations } = await import(`file://${tmpFile.replace(/\\/g, "/")}`);

// --- 1/2/3/4: the four core zh-identity-gated cases, on a plain {zh,en} pair ---

test("same zh + empty local en -> published en is inherited", () => {
  const local = { id: "tag-0", zh: "模拟经营", en: "" };
  const published = { id: "tag-0", zh: "模拟经营", en: "Farm Sim" };
  assert.equal(hydrateTranslations(local, published).en, "Farm Sim");
});

test("same zh + existing (non-empty) local en -> local en is preserved untouched", () => {
  const local = { id: "tag-0", zh: "模拟经营", en: "My Own Wording" };
  const published = { id: "tag-0", zh: "模拟经营", en: "Farm Sim" };
  assert.equal(hydrateTranslations(local, published).en, "My Own Wording");
});

test("changed zh + empty local en -> published en is NOT inherited (stays empty)", () => {
  const local = { id: "tag-0", zh: "全新中文", en: "" };
  const published = { id: "tag-0", zh: "模拟经营", en: "Farm Sim" };
  assert.equal(hydrateTranslations(local, published).en, "");
});

test("changed zh + local en present -> local en is preserved (never overwritten by published)", () => {
  const local = { id: "tag-0", zh: "全新中文", en: "New draft English" };
  const published = { id: "tag-0", zh: "模拟经营", en: "Farm Sim" };
  assert.equal(hydrateTranslations(local, published).en, "New draft English");
});

// --- 5: nested draft localization (templateInstances-like shape, arrays + flat pairs + nested {zh,en}) ---

test("nested draft localization: flat *Zh/*En pairs and nested {zh,en} pairs are both hydrated through templateInstances-shaped content", () => {
  const local = {
    version: 1,
    templateInstances: [
      {
        instanceId: "a",
        templateId: "statement-longform",
        content: {
          headingZh: "标题",
          headingEn: "",
          items: [
            { id: "i0", zh: "第一项", en: "" },
            { id: "i1", zh: "第二项", en: "Already Translated" },
          ],
        },
      },
    ],
  };
  const published = {
    version: 1,
    templateInstances: [
      {
        instanceId: "a",
        templateId: "statement-longform",
        content: {
          headingZh: "标题",
          headingEn: "Heading",
          items: [
            { id: "i0", zh: "第一项", en: "Item One" },
            { id: "i1", zh: "第二项", en: "Stale Published" },
          ],
        },
      },
    ],
  };
  const result = hydrateTranslations(local, published);
  assert.equal(result.templateInstances[0].content.headingEn, "Heading");
  assert.equal(result.templateInstances[0].content.items[0].en, "Item One");
  assert.equal(result.templateInstances[0].content.items[1].en, "Already Translated");
  // Non-translation fields untouched.
  assert.equal(result.templateInstances[0].instanceId, "a");
  assert.equal(result.templateInstances[0].content.items[0].id, "i0");
});

// --- 6: Game Experience real shape -- identity.titleZh/En, presentation.tags[].{zh,en}, detail.{zh,en}, reflection.*Zh/*En ---

test("Game Experience record shape: identity/tags/detail/reflection all hydrate generically, per-record, no per-field special-casing", () => {
  const localRecord = {
    id: "game-x",
    identity: { canonicalTitle: "Some Game", titleZh: "某游戏", titleEn: "" },
    presentation: {
      tags: [{ id: "t0", zh: "标签一", en: "" }],
      shortSummaryZh: "简介",
    },
    detail: { zh: "详情文本", en: "" },
    reflection: {
      strengthsZh: "优点文本",
      strengthsEn: "",
      weaknessesZh: "缺点文本",
      weaknessesEn: "Kept Local Text",
    },
  };
  const publishedRecord = {
    id: "game-x",
    identity: { canonicalTitle: "Some Game", titleZh: "某游戏", titleEn: "Some Game" },
    presentation: {
      tags: [{ id: "t0", zh: "标签一", en: "Tag One" }],
      shortSummaryZh: "简介",
    },
    detail: { zh: "详情文本", en: "Detail Text" },
    reflection: {
      strengthsZh: "优点文本",
      strengthsEn: "Strengths Text",
      weaknessesZh: "缺点文本",
      weaknessesEn: "Stale Published Weaknesses",
    },
  };
  const result = hydrateTranslations(localRecord, publishedRecord);
  assert.equal(result.identity.titleEn, "Some Game");
  assert.equal(result.presentation.tags[0].en, "Tag One");
  assert.equal(result.detail.en, "Detail Text");
  assert.equal(result.reflection.strengthsEn, "Strengths Text");
  assert.equal(result.reflection.weaknessesEn, "Kept Local Text"); // non-empty local preserved
  assert.equal(result.id, "game-x");
});

test("Game Experience: zh changed on one record field -> that field's empty en is NOT backfilled, siblings still are", () => {
  const localRecord = {
    id: "game-x",
    identity: { canonicalTitle: "Some Game", titleZh: "某游戏（已修改）", titleEn: "" },
    detail: { zh: "详情文本", en: "" },
  };
  const publishedRecord = {
    id: "game-x",
    identity: { canonicalTitle: "Some Game", titleZh: "某游戏", titleEn: "Some Game" },
    detail: { zh: "详情文本", en: "Detail Text" },
  };
  const result = hydrateTranslations(localRecord, publishedRecord);
  assert.equal(result.identity.titleEn, ""); // zh changed -> not inherited
  assert.equal(result.detail.en, "Detail Text"); // zh unchanged -> inherited
});

// --- 7: catalog explicit empty override (ProjectPublicMetaOverride flat shape, simulating readProjectPublicMetaOverrides' merge) ---

test("catalog: a stored override with an explicit empty titleEn no longer shadows published titleEn when zh still matches", () => {
  const published = { projectId: "p1", titleZh: "标题", titleEn: "Title", summaryZh: "简介", summaryEn: "Summary" };
  // Simulates a previously-saved "EDIT PROJECT INFO" patch that always
  // wrote the whole form, including an empty English field at the time.
  const stored = { projectId: "p1", titleZh: "标题", titleEn: "", summaryZh: "简介", summaryEn: "" };
  const hydratedStored = hydrateTranslations(stored, published);
  const merged = { ...published, ...hydratedStored, projectId: "p1" };
  assert.equal(merged.titleEn, "Title");
  assert.equal(merged.summaryEn, "Summary");
});

test("catalog: a stored override with edited zh keeps its own (possibly empty) English, not published's", () => {
  const published = { projectId: "p1", titleZh: "标题", titleEn: "Title" };
  const stored = { projectId: "p1", titleZh: "新标题", titleEn: "" };
  const hydratedStored = hydrateTranslations(stored, published);
  const merged = { ...published, ...hydratedStored, projectId: "p1" };
  assert.equal(merged.titleEn, "");
});

test("catalog: a stored override with real local English is never clobbered by published", () => {
  const published = { projectId: "p1", titleZh: "标题", titleEn: "Published Title" };
  const stored = { projectId: "p1", titleZh: "标题", titleEn: "My Edited Title" };
  const hydratedStored = hydrateTranslations(stored, published);
  const merged = { ...published, ...hydratedStored, projectId: "p1" };
  assert.equal(merged.titleEn, "My Edited Title");
});

// --- 8/9: export-path simulation -- the exact same function, applied the same way
//          productionBundleExport.ts and getGameExperienceStore() apply it, right
//          before content leaves the browser as part of the export bundle. ---

test("export path: local draft en empty, published en present, zh unchanged -> exported bundle carries published English", () => {
  const localDraft = { version: 1, templateInstances: [{ instanceId: "a", content: { headingZh: "标题", headingEn: "" } }] };
  const publishedDraft = { version: 1, templateInstances: [{ instanceId: "a", content: { headingZh: "标题", headingEn: "Heading" } }] };
  const exportedBundleDraft = hydrateTranslations(localDraft, publishedDraft);
  assert.equal(exportedBundleDraft.templateInstances[0].content.headingEn, "Heading");
});

test("export path: local zh changed since publish -> exported bundle does NOT silently reuse stale published English", () => {
  const localDraft = { version: 1, templateInstances: [{ instanceId: "a", content: { headingZh: "全新中文标题", headingEn: "" } }] };
  const publishedDraft = { version: 1, templateInstances: [{ instanceId: "a", content: { headingZh: "标题", headingEn: "Heading" } }] };
  const exportedBundleDraft = hydrateTranslations(localDraft, publishedDraft);
  assert.equal(exportedBundleDraft.templateInstances[0].content.headingEn, "");
});

// --- Safety: ids, ordering, numbers, booleans, publish state, and zh itself are never touched ---

test("never touches ids, ordering, numbers, booleans, publish state, or zh values -- only writes into an empty en field, at any depth", () => {
  // Mirrors the real shape: a record's own structural fields (id, order,
  // archived, publicationState) sit alongside a nested { zh, en } pair
  // (e.g. gameExperience.records[i].detail), never merged onto the same
  // object as zh/en themselves -- a {zh,en} pair is always a terminal leaf
  // in the real schemas this protects (Game Experience tags/detail,
  // catalog titleZh/titleEn, drafts' headingZh/headingEn, etc.).
  const local = {
    id: "record-1",
    order: 3,
    archived: false,
    publicationState: "draft",
    title: { zh: "中文不变", en: "" },
  };
  const published = {
    id: "record-1-DIFFERENT-WOULD-BE-A-BUG",
    order: 99,
    archived: true,
    publicationState: "published",
    title: { zh: "中文不变", en: "English" },
  };
  const result = hydrateTranslations(local, published);
  assert.equal(result.id, "record-1");
  assert.equal(result.order, 3);
  assert.equal(result.archived, false);
  assert.equal(result.publicationState, "draft");
  assert.equal(result.title.zh, "中文不变");
  assert.equal(result.title.en, "English");
});

test("a {zh,en} pair is a terminal leaf: it is never itself recursed into further (matches the real schema, where a zh/en pair never carries additional nested translatable content)", () => {
  const local = { id: "leaf-1", zh: "中文不变", en: "" };
  const published = { id: "leaf-1", zh: "中文不变", en: "English" };
  const result = hydrateTranslations(local, published);
  assert.equal(result.id, "leaf-1");
  assert.equal(result.en, "English");
});

test("no published counterpart (e.g. brand-new project) -> local returned unchanged", () => {
  const local = { zh: "中文", en: "" };
  assert.deepEqual(hydrateTranslations(local, undefined), local);
  assert.deepEqual(hydrateTranslations(local, null), local);
});
