import assert from "node:assert/strict";
import { assemblePublishedOutput } from "../assemblePublishedOutput.mjs";

// Regression for a real production incident (2026-08-17): a real V2
// --confirm wrote a gameExperience store missing homepageLimit/updatedAt --
// fields GameExperienceStore requires (src/lib/gameExperience.ts) -- because
// assemblePublishedOutput.mjs rebuilt the whole store as
// `{ schemaVersion, records }` instead of merging only `records` into the
// currently-published store. V2's entity merge only ever produces per-RECORD
// intents; it must never have an opinion about store-level metadata.

function currentPublishedWithGameExperience(records) {
  return {
    version: 1,
    drafts: {},
    projectCatalog: {},
    projectDocuments: { version: 1, documents: {} },
    covers: {},
    assets: [],
    gameExperience: { schemaVersion: 1, homepageLimit: 6, updatedAt: "2026-08-16T07:56:44.372Z", records },
  };
}

const recordA = { schemaVersion: 1, id: "game-a", identity: { canonicalTitle: "A", titleZh: "A", titleEn: "A" } };
const recordB = { schemaVersion: 1, id: "game-b", identity: { canonicalTitle: "B", titleZh: "B", titleEn: "B" } };
const emptyProjectPlan = { items: [], writeset: [], counts: {}, blocked: false, assetIntegrity: { total: 0, valid: 0, invalid: 0, inherited: 0 } };

// 1. All records UNCHANGED (no NEW/UPDATED/REMOVED items at all) -- store
// -level metadata must still be preserved verbatim, and records must be
// exactly what was already published.
{
  const currentPublished = currentPublishedWithGameExperience([recordA, recordB]);
  const gameExperiencePlan = {
    items: [
      { entityId: "game-a", entityType: "gameExperienceRecord", status: "UNCHANGED" },
      { entityId: "game-b", entityType: "gameExperienceRecord", status: "UNCHANGED" },
    ],
    writeset: [], counts: {}, blocked: false, assetIntegrity: { total: 0, valid: 0, invalid: 0, inherited: 0 },
  };
  const output = assemblePublishedOutput({ currentPublished, projectPlan: emptyProjectPlan, gameExperiencePlan, projectBodyTarget: new Map(), generatedAt: "" });
  assert.deepEqual(Object.keys(output.gameExperience).sort(), ["homepageLimit", "records", "schemaVersion", "updatedAt"]);
  assert.equal(output.gameExperience.homepageLimit, 6);
  assert.equal(output.gameExperience.updatedAt, "2026-08-16T07:56:44.372Z");
  assert.equal(output.gameExperience.records.length, 2);
  assert.deepEqual(output.gameExperience.records.find((r) => r.id === "game-a"), recordA);
  assert.deepEqual(output.gameExperience.records.find((r) => r.id === "game-b"), recordB);
}
console.log("1: all records UNCHANGED -> store-level metadata (homepageLimit/updatedAt) preserved, records intact, passed");

// 2. One record UPDATED -- only that record's content changes; store-level
// metadata (homepageLimit/updatedAt) and the untouched sibling record must
// both still survive unchanged.
{
  const currentPublished = currentPublishedWithGameExperience([recordA, recordB]);
  const updatedRecordA = { ...recordA, identity: { ...recordA.identity, titleZh: "A (更新)" } };
  const gameExperiencePlan = {
    items: [
      { entityId: "game-a", entityType: "gameExperienceRecord", status: "UPDATED", value: updatedRecordA },
      { entityId: "game-b", entityType: "gameExperienceRecord", status: "UNCHANGED" },
    ],
    writeset: [], counts: {}, blocked: false, assetIntegrity: { total: 0, valid: 0, invalid: 0, inherited: 0 },
  };
  const output = assemblePublishedOutput({ currentPublished, projectPlan: emptyProjectPlan, gameExperiencePlan, projectBodyTarget: new Map(), generatedAt: "" });
  assert.equal(output.gameExperience.homepageLimit, 6, "store-level homepageLimit must survive a record-level UPDATE");
  assert.equal(output.gameExperience.updatedAt, "2026-08-16T07:56:44.372Z", "store-level updatedAt must survive a record-level UPDATE");
  assert.deepEqual(output.gameExperience.records.find((r) => r.id === "game-a"), updatedRecordA);
  assert.deepEqual(output.gameExperience.records.find((r) => r.id === "game-b"), recordB, "the untouched sibling record must be byte-for-byte unchanged");
}
console.log("2: one record UPDATED -> store-level metadata AND the untouched sibling record both preserved, passed");

console.log("assemblePublishedOutput.mjs gameExperience store-level metadata regression tests passed");
