import assert from "node:assert/strict";
import { hashContent, PARITY_TEST_VECTORS } from "../contentHash.mjs";

// Verifies this module's own fixed test vectors -- the same vectors are
// duplicated in src/lib/contentHash.ts's module comment. There is no shared
// TS test runner in this repo (see Test Isolation Order), so this Node-side
// check is the only automated guard that the two hand-duplicated
// implementations haven't drifted; if this file's computed values ever stop
// matching the vectors below, re-derive them and update BOTH files together.
for (const { input, expected } of PARITY_TEST_VECTORS) {
  const actual = hashContent(input);
  assert.equal(actual, expected, `hashContent(${JSON.stringify(input)}) = ${actual}, expected ${expected}`);
}
console.log(`contentHash: all ${PARITY_TEST_VECTORS.length} parity test vectors passed`);

// Basic sanity: different content must (in practice) hash differently.
assert.notEqual(hashContent({ a: 1 }), hashContent({ a: 2 }));
assert.notEqual(hashContent(undefined), hashContent(null));
assert.equal(hashContent(undefined), hashContent(undefined));
console.log("contentHash: basic differentiation sanity checks passed");
