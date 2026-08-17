// The Execution Transaction (Publishing Architecture V2, Phase 6). Confirm's
// entire job and nothing more: re-verify every writeset path's on-disk hash
// still matches what the plan assumed (Window 2 -- the short but real gap
// between when a plan was built and when it's actually confirmed), then
// write every entry verbatim. Never re-enumerates content, never calls
// resolveAsset, never re-reads currentPublished for merge purposes -- those
// are buildPublishPlan's job, already done by the time a plan reaches here.
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

function hashBytes(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function currentFileHashOrNull(root, relativePath) {
  try {
    return hashBytes(await readFile(path.join(root, relativePath)));
  } catch {
    return null;
  }
}

async function backupIfPresent(root, relativePath, backupRoot) {
  const source = path.join(root, relativePath);
  try {
    const info = await stat(source);
    if (!info.isFile()) return;
  } catch {
    return;
  }
  const destination = path.join(backupRoot, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

/**
 * @param {{ root: string, plan: import("./buildPublishPlan.mjs"), backupRoot: string }} options
 *   `plan` is whatever buildPublishPlan() returned -- `blocked`/`writeset`
 *   consumed directly, never re-derived.
 * @returns {Promise<
 *   | { status: "REFUSED", reason: string, staleEntries: { path: string, expected: string|null, actual: string|null }[] }
 *   | { status: "WRITTEN", writtenPaths: string[] }
 * >}
 */
export async function executePublishPlan({ root, plan, backupRoot }) {
  // The ONLY blocked computation this function ever consults -- plan.blocked
  // itself, never re-derived here.
  if (plan.blocked) {
    return { status: "REFUSED", reason: "Plan is BLOCKED (Window-1 conflicts or asset resolution failures) -- refusing to execute.", staleEntries: [] };
  }

  // Window 2: re-hash every writeset path immediately before writing. ANY
  // mismatch vs. expectedPreviousHash refuses the ENTIRE publish -- no
  // partial writes, no re-merge/re-diff/re-resolve. The caller must rebuild
  // a fresh plan and try again.
  const staleEntries = [];
  for (const entry of plan.writeset) {
    const actualHash = await currentFileHashOrNull(root, entry.path);
    if (actualHash !== entry.expectedPreviousHash) {
      staleEntries.push({ path: entry.path, expected: entry.expectedPreviousHash, actual: actualHash });
    }
  }
  if (staleEntries.length) {
    return {
      status: "REFUSED",
      reason: "STALE PLAN: one or more writeset paths changed on disk since this plan was built. No files were written. Rebuild a fresh plan and try again.",
      staleEntries,
    };
  }

  for (const entry of plan.writeset) {
    await backupIfPresent(root, entry.path, backupRoot);
  }
  for (const entry of plan.writeset) {
    const destination = path.join(root, entry.path);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, entry.content);
  }

  return { status: "WRITTEN", writtenPaths: plan.writeset.map((entry) => entry.path) };
}
