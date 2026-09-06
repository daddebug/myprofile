// Regression tests for the anchorId protocol-layer fix
// (src/lib/projectTemplateInstances.ts: resolveNewInstanceAnchorId /
// resolveExistingInstanceAnchorId).
//
// Root cause this guards against: the region-end sentinel REGION_END_ANCHOR
// ("__end__") is valid CommonMark bold syntax. When an AI's raw JSON
// response is copied out of a Markdown-rendering chat surface (the app's
// own Project Code prompt explicitly asks the AI not to wrap its answer in
// a code fence), the double underscores can be silently swallowed, handing
// back the bare string "end" for a brand-new template instance's anchorId.
// That is accepted here as a one-way compatibility alias and canonicalized
// back to "__end__" - but only for NEW instances; existing instances (which
// may legitimately carry a legacy:<blockId> anchor) get no such alias, so a
// genuinely wrong value there still fails loudly.
//
// Same in-process TypeScript transpile approach as
// src/lib/__tests__/translationHydration.test.mjs (no JS test runner is
// wired up for src/lib/*.ts beyond this convention).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ts from "typescript";

const sourcePath = new URL("../projectTemplateInstances.ts", import.meta.url);
const source = readFileSync(sourcePath, "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 },
});
const tmpDir = mkdtempSync(path.join(tmpdir(), "project-template-instances-"));
const tmpFile = path.join(tmpDir, "projectTemplateInstances.mjs");
writeFileSync(tmpFile, outputText, "utf8");
const { REGION_END_ANCHOR, resolveNewInstanceAnchorId, resolveExistingInstanceAnchorId } = await import(
  `file://${tmpFile.replace(/\\/g, "/")}`
);

// --- new instances ---

test('new instance: "__end__" -> PASS, canonicalizes to "__end__"', () => {
  const result = resolveNewInstanceAnchorId("__end__");
  assert.equal(result.ok, true);
  assert.equal(result.anchorId, REGION_END_ANCHOR);
});

test('new instance: "end" (Markdown-damaged alias) -> PASS + normalize to "__end__"', () => {
  const result = resolveNewInstanceAnchorId("end");
  assert.equal(result.ok, true);
  assert.equal(result.anchorId, REGION_END_ANCHOR);
});

test('new instance: "whatever" -> FAIL', () => {
  assert.equal(resolveNewInstanceAnchorId("whatever").ok, false);
});

test("new instance: legacy:<blockId> is NOT a valid anchor for a brand-new instance -> FAIL", () => {
  assert.equal(resolveNewInstanceAnchorId("legacy:abc").ok, false);
});

test("new instance: missing/undefined anchorId -> FAIL", () => {
  assert.equal(resolveNewInstanceAnchorId(undefined).ok, false);
});

test("multiple new instances imported at once: each is resolved independently and correctly", () => {
  const batch = ["__end__", "end", "whatever"].map((candidate) => resolveNewInstanceAnchorId(candidate));
  assert.deepEqual(
    batch.map((r) => r.ok),
    [true, true, false],
  );
  assert.equal(batch[0].anchorId, REGION_END_ANCHOR);
  assert.equal(batch[1].anchorId, REGION_END_ANCHOR);
});

// --- existing instances ---

test('existing instance: "__end__" -> PASS', () => {
  const result = resolveExistingInstanceAnchorId("__end__");
  assert.equal(result.ok, true);
  assert.equal(result.anchorId, REGION_END_ANCHOR);
});

test("existing instance: legacy:abc -> PASS, handled per existing legacy rules, kept unchanged", () => {
  const result = resolveExistingInstanceAnchorId("legacy:abc");
  assert.equal(result.ok, true);
  assert.equal(result.anchorId, "legacy:abc");
});

test('existing instance: "end" does NOT get the new-instance compatibility alias -> FAIL', () => {
  assert.equal(resolveExistingInstanceAnchorId("end").ok, false);
});

test('existing instance: "whatever" -> FAIL', () => {
  assert.equal(resolveExistingInstanceAnchorId("whatever").ok, false);
});
