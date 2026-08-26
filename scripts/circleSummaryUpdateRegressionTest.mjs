// Regression test for the circle-summary editor "editing one item changes
// all of them" bug. No test framework exists in this repo, so this transpiles
// the pure update function (src/lib/circleSummaryItems.ts) with esbuild and
// runs the exact scenario reported: load [A,B,C], edit index 1, then edit
// index 0, asserting only the targeted item ever changes and unedited items
// keep their original object reference (never a shared/mutated reference).
//
// Run: node scripts/circleSummaryUpdateRegressionTest.mjs

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const esbuildBin = path.join(
  repoRoot,
  "node_modules/.pnpm/esbuild@0.28.1/node_modules/esbuild/bin/esbuild",
);
const sourceFile = path.join(repoRoot, "src/lib/circleSummaryItems.ts");
const outFile = path.join(
  os.tmpdir(),
  `circleSummaryItems.${Date.now()}.mjs`,
);

execFileSync(
  process.execPath,
  [
    esbuildBin,
    sourceFile,
    "--bundle",
    "--platform=node",
    "--format=esm",
    "--packages=external",
    `--outfile=${outFile}`,
  ],
  { stdio: "inherit" },
);

const { replaceCircleSummaryItemAt } = await import(`file://${outFile}`);
fs.rmSync(outFile, { force: true });

function assertEqual(actual, expected, message) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    console.error(`FAIL: ${message}`);
    console.error(`  expected: ${JSON.stringify(expected)}`);
    console.error(`  actual:   ${JSON.stringify(actual)}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${message}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${message}`);
  }
}

// Imported/legacy content: every item is missing `id` entirely (undefined),
// which is exactly the shape that triggered the bug (item.id === id collapsed
// to matching every item at once).
const initial = [
  { text: { zh: "A", en: "A" } },
  { text: { zh: "B", en: "B" } },
  { text: { zh: "C", en: "C" } },
];

// Step 1: edit index 1 (B -> B2)
const afterB = replaceCircleSummaryItemAt(initial, 1, {
  text: { zh: "B2", en: "B2" },
});
assertEqual(
  afterB.map((item) => item.text.zh),
  ["A", "B2", "C"],
  "edit index 1: only B changes -> [A, B2, C]",
);
assert(
  afterB[0] === initial[0],
  "edit index 1: item 0 (A) keeps its original object reference",
);
assert(
  afterB[2] === initial[2],
  "edit index 1: item 2 (C) keeps its original object reference",
);
assert(
  afterB[1] !== initial[1],
  "edit index 1: item 1 (B) is a new object, not a mutation of the original",
);

// Step 2: edit index 0 (A -> A2), applied on top of the array from step 1
const afterA = replaceCircleSummaryItemAt(afterB, 0, {
  text: { zh: "A2", en: "A2" },
});
assertEqual(
  afterA.map((item) => item.text.zh),
  ["A2", "B2", "C"],
  "edit index 0 after previous edit: only A changes -> [A2, B2, C]",
);
assert(
  afterA[1] === afterB[1],
  "edit index 0: item 1 (B2) keeps its reference from the previous edit (not re-touched)",
);
assert(
  afterA[2] === afterB[2] && afterA[2] === initial[2],
  "edit index 0: item 2 (C) still traces back to its original, never-touched reference",
);

// The original array passed into step 1 must never have been mutated
// in place -- this is what "preview uses independent items, not a shared
// reference" means concretely: the source array is untouched.
assertEqual(
  initial.map((item) => item.text.zh),
  ["A", "B", "C"],
  "original array is never mutated by either edit",
);

if (process.exitCode) {
  console.error("\nRegression test FAILED.");
  process.exit(1);
} else {
  console.log("\nAll regression test assertions passed.");
}
