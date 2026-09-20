import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ts from "typescript";

const sourceRoot = new URL("../", import.meta.url);
const tmpDir = mkdtempSync(path.join(tmpdir(), "dynamic-project-hydration-"));
const modules = [
  "projectTemplateInstances",
  "templateImageReferences",
  "translationHydration",
  "dynamicProjectDraftHydration",
];

for (const moduleName of modules) {
  const source = readFileSync(new URL(`${moduleName}.ts`, sourceRoot), "utf8");
  let { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 },
  });
  for (const dependency of modules) {
    outputText = outputText.replaceAll(`"./${dependency}"`, `"./${dependency}.mjs"`);
  }
  outputText = outputText.replace(
    '"../data/activePortfolioTemplateIds.json"',
    '"./activePortfolioTemplateIds.mjs"',
  );
  writeFileSync(path.join(tmpDir, `${moduleName}.mjs`), outputText, "utf8");
}

writeFileSync(
  path.join(tmpDir, "activePortfolioTemplateIds.mjs"),
  `export default ${readFileSync(new URL("../../data/activePortfolioTemplateIds.json", import.meta.url), "utf8")};`,
  "utf8",
);

const {
  hydrateExistingDiskImageAssets,
  resolveDevProjectDraft,
} = await import(`file://${path.join(tmpDir, "dynamicProjectDraftHydration.mjs").replace(/\\/g, "/")}`);

const instance = (instanceId, templateId = "statement-longform", content = {}) => ({
  instanceId,
  templateId,
  regionId: "content",
  anchorId: "__end__",
  content,
});

const draft = (...instances) => ({
  version: 1,
  templateInstances: instances,
  updatedAt: "2026-09-20T00:00:00.000Z",
});

test("A: no local draft hydrates from the published draft without manufacturing content", () => {
  const published = draft(instance("published-a"));
  const result = resolveDevProjectDraft(null, published);
  assert.equal(result.source, "published");
  assert.equal(result.suspiciousLocalDraft, false);
  assert.deepEqual(result.draft.templateInstances, published.templateInstances);
});

test("B: a valid local draft remains authoritative", () => {
  const published = draft(instance("same", "statement-longform", { body: { zh: "published", en: "" } }));
  const local = draft(instance("same", "statement-longform", { body: { zh: "local", en: "" } }));
  const result = resolveDevProjectDraft(JSON.stringify(local), published);
  assert.equal(result.source, "local");
  assert.equal(result.suspiciousLocalDraft, false);
  assert.equal(result.draft.templateInstances[0].content.body.zh, "local");
});

test("C: a structurally suspicious local draft is quarantined and published P2 renders", () => {
  const local = draft();
  const published = draft(instance("published-a"));
  const result = resolveDevProjectDraft(JSON.stringify(local), published);
  assert.equal(result.source, "local");
  assert.equal(result.suspiciousLocalDraft, true);
  assert.deepEqual(result.draft.templateInstances, published.templateInstances);
  assert.match(result.suspiciousReason, /empty/i);
});

test("C: retired template IDs never enter a normalized active draft", () => {
  const published = draft(instance("published-a"));
  const local = draft(
    instance("published-a"),
    instance("legacy-a", "figma-prototype", { figmaUrl: "https://example.invalid" }),
  );
  const result = resolveDevProjectDraft(JSON.stringify(local), published);
  assert.equal(result.suspiciousLocalDraft, false);
  assert.deepEqual(result.draft.templateInstances.map((entry) => entry.templateId), ["statement-longform"]);
});

test("D: a disk mapping for a missing instance is reported and never recreates structure", () => {
  const mapping = {
    version: 1,
    projectId: "qa",
    updatedAt: "2026-09-20T00:00:00.000Z",
    images: { imageA: { imageId: "imageA" } },
    instances: {
      removed: {
        instanceId: "removed",
        templateId: "image-row",
        regionId: "content",
        anchorId: "__end__",
        order: 0,
        content: { items: [{ id: "item-a", image: { imageId: "imageA" } }] },
      },
    },
  };
  const result = hydrateExistingDiskImageAssets([], mapping);
  assert.equal(result.instances.length, 0);
  assert.deepEqual(result.orphanedMappings, [{
    instanceId: "removed",
    templateId: "image-row",
    missingItemIds: [],
    reason: "missing-instance",
  }]);
});

test("D: missing image-row items are reported but never appended", () => {
  const local = instance("row", "image-row", {
    items: [{ id: "kept", image: { imageId: "kept-image", publicPath: "" } }],
  });
  const mapping = {
    version: 1,
    projectId: "qa",
    updatedAt: "2026-09-20T00:00:00.000Z",
    images: {
      "kept-image": { imageId: "kept-image" },
      "removed-image": { imageId: "removed-image" },
    },
    instances: {
      row: {
        instanceId: "row",
        templateId: "image-row",
        regionId: "content",
        anchorId: "__end__",
        order: 0,
        content: {
          items: [
            { id: "kept", image: { imageId: "kept-image", publicPath: "/kept.webp" } },
            { id: "removed", image: { imageId: "removed-image", publicPath: "/removed.webp" } },
          ],
        },
      },
    },
  };
  const result = hydrateExistingDiskImageAssets([local], mapping);
  assert.equal(result.instances[0].content.items.length, 1);
  assert.equal(result.instances[0].content.items[0].id, "kept");
  assert.equal(result.instances[0].content.items[0].image.publicPath, "/kept.webp");
  assert.deepEqual(result.orphanedMappings[0].missingItemIds, ["removed"]);
});
