// Deterministic, environment-portable content hash used for Publishing
// Architecture V2's baseContentHash / Window-1 and Window-2 staleness checks.
// The SAME algorithm is duplicated (never imported across the toolchain
// boundary -- scripts/ runs raw under Node with no bundler; src/lib is
// compiled by Vite/tsc and cannot cheaply import a scripts/*.mjs file) in
// src/lib/contentHash.ts, used by the browser-side Dirty Intent Store. A
// hash computed in the browser when an entity first becomes dirty MUST equal
// the hash this module computes for the same content when buildPublishPlan
// re-reads it server-side later -- if these two implementations ever
// diverge, every conflict check silently breaks. Keep both files byte-
// identical in algorithm; the parity test vectors below are duplicated in
// both files specifically so a change to one without the other is visible on
// inspection, not just at runtime.
//
// Not a cryptographic hash -- this only needs to detect "did this content
// change," never to resist deliberate forgery. FNV-1a 64-bit, iterating
// UTF-16 code units (both Node and every browser this app targets run on
// V8/JSC-family engines with identical String#charCodeAt semantics, so this
// is deterministic across the browser/Node boundary without needing
// TextEncoder or any byte-level encoding step).

const FNV_OFFSET_BASIS_64 = 0xcbf29ce484222325n;
const FNV_PRIME_64 = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

function fnv1a64(input) {
  let hash = FNV_OFFSET_BASIS_64;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * FNV_PRIME_64) & MASK_64;
  }
  return hash.toString(16).padStart(16, "0");
}

// Canonical, order-independent serialization: object keys sorted
// recursively, arrays keep their original order (order is meaningful for
// arrays, never for object key order). undefined is serialized explicitly
// (rather than omitted, as plain JSON.stringify would) so a field that
// existed with a value and later becomes undefined still changes the hash.
export function stableStringify(value) {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

export function hashContent(value) {
  return fnv1a64(stableStringify(value));
}

// Parity test vectors -- MUST produce identical output from
// src/lib/contentHash.ts. Verified by scripts/publishing/__tests__/contentHash.test.mjs.
export const PARITY_TEST_VECTORS = [
  { input: null, expected: "5b9bc4ba528108e4" },
  { input: { a: 1, b: 2 }, expected: "a0ebc03bdc71de7b" },
  { input: { b: 2, a: 1 }, expected: "a0ebc03bdc71de7b" }, // key order must not matter
  { input: { zh: "测试标题", en: "Test Title" }, expected: "88bcd57f17fbd87f" }, // non-ASCII must hash identically in both runtimes
  { input: [1, "two", { three: 3 }], expected: "b9d8d9ac011769ab" },
];
