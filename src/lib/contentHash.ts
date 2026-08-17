// Deterministic, environment-portable content hash used for Publishing
// Architecture V2's baseContentHash / Window-1 and Window-2 staleness
// checks. The SAME algorithm is duplicated (never imported across the
// toolchain boundary -- scripts/ runs raw under Node with no bundler; this
// file is compiled by Vite/tsc) in scripts/publishing/contentHash.mjs, used
// server-side by buildPublishPlan.mjs. A hash computed here in the browser
// when an entity first becomes dirty (see dirtyIntentStore.ts) MUST equal
// the hash the server-side module computes for the same content later -- if
// these two implementations ever diverge, every conflict check silently
// breaks. Keep both files byte-identical in algorithm; the parity test
// vectors below are duplicated in both files specifically so a change to one
// without the other is visible on inspection (also verified automatically
// server-side by scripts/publishing/__tests__/contentHash.test.mjs -- there
// is no TS test runner in this repo to verify this file the same way).
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

function fnv1a64(input: string): string {
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
export function stableStringify(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

export function hashContent(value: unknown): string {
  return fnv1a64(stableStringify(value));
}

// Parity test vectors -- MUST match scripts/publishing/contentHash.mjs's
// PARITY_TEST_VECTORS exactly. See that file's automated test for the
// authoritative check; this comment is the only guard on the TS side.
// hashContent(null)                                  === "5b9bc4ba528108e4"
// hashContent({ a: 1, b: 2 })                         === "a0ebc03bdc71de7b"
// hashContent({ b: 2, a: 1 })                         === "a0ebc03bdc71de7b" (key order must not matter)
// hashContent({ zh: "测试标题", en: "Test Title" })    === "88bcd57f17fbd87f" (non-ASCII must match)
// hashContent([1, "two", { three: 3 }])               === "b9d8d9ac011769ab"
