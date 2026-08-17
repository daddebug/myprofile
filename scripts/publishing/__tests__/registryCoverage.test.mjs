import assert from "node:assert/strict";
import { checkRegistryCoverage } from "../registryCoverage.mjs";
import { withFixtureRepo } from "./fixtureRepo.mjs";

// The real registry (read-only) must have zero adapters missing from the
// coverage matrix entirely -- no silent UNKNOWN pass-through allowed.
await withFixtureRepo(async (root) => {
  const result = await checkRegistryCoverage({ root });
  assert.equal(result.unknown.length, 0, `expected zero adapters missing from ADAPTER_MATRIX, got: ${JSON.stringify(result.unknown)}`);
  assert.equal(result.total, result.rows.length);
  assert(result.publishReady.length > 0);
  // Every editable adapter that ISN'T publish-ready must be explicitly
  // listed, never silently folded into "covered" -- the exact distinction
  // the first version of this matrix failed to make.
  for (const adapterId of result.editableNotReady) {
    const row = result.rows.find((r) => r.adapterId === adapterId);
    assert.equal(row.editable, true);
    assert.equal(row.publishReady, false);
  }
  // A non-editable, inherited-only adapter must never be reported as a gap.
  for (const adapterId of result.inheritedOnly) {
    const row = result.rows.find((r) => r.adapterId === adapterId);
    assert.equal(row.editable, false);
  }
});
console.log("registryCoverage: zero UNKNOWN adapters, publish-ready/inherited-only/gap are mutually distinct, passed");

// An adapter genuinely missing from ADAPTER_MATRIX must be reported UNKNOWN
// -- not silently skipped, and never counted as publish-ready.
await withFixtureRepo(async (root) => {
  const result = await checkRegistryCoverage({ root });
  const row = result.rows.find((r) => r.adapterId === "totally-unknown-future-adapter");
  assert(row, "expected a row for the unknown adapter");
  assert.equal(row.unknown, true);
  assert.equal(row.publishReady, false);
  assert.deepEqual(result.unknown, ["totally-unknown-future-adapter"]);
}, {
  registry: {
    version: 1,
    excludedLocalRoots: [],
    sources: [{ id: "totally-unknown-future-adapter", sourceType: "asset" }],
  },
});
console.log("registryCoverage: an adapter with no matrix entry is reported UNKNOWN, never silently passed, passed");

console.log("registryCoverage.mjs coverage tests passed");
