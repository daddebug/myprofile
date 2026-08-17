import assert from "node:assert/strict";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { executePublishPlan } from "../executePublishPlan.mjs";
import { VALID_PNG_BYTES, withFixtureRepo } from "./fixtureRepo.mjs";

function backupRootFor(root) {
  return path.join(root, ".local-backups", "publish-execution-test");
}
async function listBackedUpPaths(backupRoot) {
  try {
    const entries = await readdir(backupRoot, { recursive: true, withFileTypes: true });
    return entries.filter((entry) => entry.isFile()).map((entry) => path.join(entry.path ?? backupRoot, entry.name));
  } catch {
    return [];
  }
}

// A. plan.blocked -> REFUSED, nothing written, no backup attempted.
await withFixtureRepo(async (root) => {
  const plan = { blocked: true, writeset: [{ path: "public/x.png", expectedPreviousHash: null, nextHash: "irrelevant", content: VALID_PNG_BYTES }] };
  const result = await executePublishPlan({ root, plan, backupRoot: backupRootFor(root) });
  assert.equal(result.status, "REFUSED");
  assert.match(result.reason, /BLOCKED/);
  let exists = true;
  try { await readFile(path.join(root, "public", "x.png")); } catch { exists = false; }
  assert.equal(exists, false, "a BLOCKED plan must never write anything, even a syntactically valid writeset entry");
});
console.log("A: plan.blocked -> REFUSED, nothing written, passed");

// B. clean plan, target path doesn't exist yet (expectedPreviousHash: null) -> WRITTEN.
await withFixtureRepo(async (root) => {
  const plan = {
    blocked: false,
    writeset: [{ path: "public/images/published/covers/new.png", expectedPreviousHash: null, nextHash: "n/a", content: VALID_PNG_BYTES }],
  };
  const result = await executePublishPlan({ root, plan, backupRoot: backupRootFor(root) });
  assert.equal(result.status, "WRITTEN", JSON.stringify(result));
  assert.deepEqual(result.writtenPaths, ["public/images/published/covers/new.png"]);
  const written = await readFile(path.join(root, "public", "images", "published", "covers", "new.png"));
  assert(written.equals(VALID_PNG_BYTES));
});
console.log("B: clean plan, new path -> WRITTEN, content matches, passed");

// C. clean plan, target path exists and matches expectedPreviousHash -> WRITTEN, backup created.
await withFixtureRepo(async (root) => {
  const targetDir = path.join(root, "public", "images", "published", "covers");
  await mkdir(targetDir, { recursive: true });
  const OLD_BYTES = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAIAAAUAAen63NgAAAAASUVORK5CYII=", "base64");
  await writeFile(path.join(targetDir, "existing.png"), OLD_BYTES);
  const { createHash } = await import("node:crypto");
  const oldHash = createHash("sha256").update(OLD_BYTES).digest("hex");

  const backupRoot = backupRootFor(root);
  const plan = {
    blocked: false,
    writeset: [{ path: "public/images/published/covers/existing.png", expectedPreviousHash: oldHash, nextHash: "n/a", content: VALID_PNG_BYTES }],
  };
  const result = await executePublishPlan({ root, plan, backupRoot });
  assert.equal(result.status, "WRITTEN", JSON.stringify(result));
  const written = await readFile(path.join(targetDir, "existing.png"));
  assert(written.equals(VALID_PNG_BYTES));
  const backedUp = await listBackedUpPaths(backupRoot);
  assert(backedUp.length > 0, "an overwritten pre-existing file must be backed up before being replaced");
});
console.log("C: clean plan, existing path with matching hash -> WRITTEN, backup created, passed");

// D. STALE PLAN: on-disk content changed since the plan was built -> REFUSED,
// NOTHING in the writeset gets written, not even the entries that were still valid.
await withFixtureRepo(async (root) => {
  const targetDir = path.join(root, "public", "images", "published", "covers");
  await mkdir(targetDir, { recursive: true });
  await writeFile(path.join(targetDir, "moved.png"), Buffer.from("originally-this"));

  const plan = {
    blocked: false,
    writeset: [
      // This entry's expectedPreviousHash is now WRONG -- someone/something
      // else wrote to this path after the plan was built.
      { path: "public/images/published/covers/moved.png", expectedPreviousHash: "stale-hash-that-no-longer-matches", nextHash: "n/a", content: VALID_PNG_BYTES },
      // This entry is otherwise perfectly valid (new path, correct null
      // expectation) -- it must STILL be refused, because the whole publish
      // is all-or-nothing.
      { path: "public/images/published/covers/valid-but-must-not-write.png", expectedPreviousHash: null, nextHash: "n/a", content: VALID_PNG_BYTES },
    ],
  };
  const result = await executePublishPlan({ root, plan, backupRoot: backupRootFor(root) });
  assert.equal(result.status, "REFUSED", JSON.stringify(result));
  assert.match(result.reason, /STALE PLAN/);
  assert.equal(result.staleEntries.length, 1);
  assert.equal(result.staleEntries[0].path, "public/images/published/covers/moved.png");

  // Neither the stale entry's target nor the co-batched valid entry's target
  // may have been touched -- proving no-partial-writes.
  const untouchedOriginal = await readFile(path.join(targetDir, "moved.png"));
  assert.equal(untouchedOriginal.toString(), "originally-this", "the stale entry's file must remain completely untouched");
  let otherExists = true;
  try { await readFile(path.join(targetDir, "valid-but-must-not-write.png")); } catch { otherExists = false; }
  assert.equal(otherExists, false, "an otherwise-valid writeset entry must NOT be written if ANY other entry in the same plan is stale");
});
console.log("D: one stale entry -> whole publish REFUSED, no partial writes, passed");

console.log("executePublishPlan.mjs regression tests passed (fixture-isolated, real repo never touched)");
