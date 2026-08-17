// Asset-tree support (Publishing Architecture V2, Phase B): playable-game-builds
// and legacy-static-game-build are whole directories of files, not single
// images -- resolveAsset.mjs deliberately never handles them (per Phase A's
// discovery layer, a `gameId` reference is discovered as its own
// `kind: "asset-tree"` descriptor, never forced into the single-file
// resolver). This module is the one place a tree's identity, integrity, and
// writeset are decided, generalizing resolveAsset.mjs's two-candidate shape
// (bundle-provided vs. published-fallback) and buildPublishPlan.mjs's
// Writeset Rule to N files instead of one.
//
// These trees are not edited through the browser (there is no CaseStudyEditor
// flow that hand-authors a playable-game build) -- the disk IS the source of
// truth for "what does this tree currently look like," exactly as V1's
// addDiskManifests already treats it (see publishing-preflight-lib.mjs).
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

function hashBytes(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function walkFiles(directory, root = directory) {
  const output = [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return output;
  }
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await walkFiles(absolute, root));
    else if (entry.isFile()) output.push({ absolute, relative: path.relative(root, absolute).replaceAll("\\", "/") });
  }
  return output;
}

// Reads the CURRENT on-disk tree at publicDirectory (relative to root) --
// every file's relative path plus its content hash. Mirrors V1's
// addDiskManifests file-walk exactly (same source of truth: the disk).
export async function readPublishedTree(root, publicDirectory) {
  const files = await walkFiles(path.resolve(root, publicDirectory));
  const entries = await Promise.all(files.map(async (file) => ({
    relativePath: file.relative,
    hash: hashBytes(await readFile(file.absolute)),
  })));
  entries.sort((a, b) => (a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0));
  return entries;
}

/**
 * Resolves one asset-tree reference. `expectedFiles` is the tree's intended
 * final state: one entry per file, each either freshly provided bytes (a
 * "changed" file this cycle) or no bytes at all, meaning "must match
 * whatever's already published at this exact relative path" (an "inherited"
 * file) -- the tree-level equivalent of resolveAsset.mjs's bundle vs.
 * published-fallback candidates.
 *
 * @param {{ publicDirectory: string, expectedFiles: Array<{ relativePath: string, bytes?: Buffer }>, requiredRelativePaths?: string[] }} treeSpec
 *   requiredRelativePaths -- files that MUST resolve (e.g. the entry HTML)
 *   for the tree to be valid at all; a missing required file BLOCKS
 *   regardless of how many other files resolved fine.
 * @param {{ root: string }} options
 * @returns {Promise<
 *   | { status: "RESOLVED", files: Array<{ relativePath: string, bytes: Buffer, source: "provided" | "published", hash: string }> }
 *   | { status: "BLOCKED", reason: string }
 * >}
 */
export async function resolveAssetTree(treeSpec, options) {
  const { publicDirectory, expectedFiles, requiredRelativePaths = [] } = treeSpec;
  const root = options.root;
  const resolvedFiles = [];
  const missing = [];

  for (const expected of expectedFiles) {
    if (expected.bytes) {
      resolvedFiles.push({ relativePath: expected.relativePath, bytes: expected.bytes, source: "provided", hash: hashBytes(expected.bytes) });
      continue;
    }
    const absolute = path.resolve(root, publicDirectory, expected.relativePath);
    try {
      const bytes = await readFile(absolute);
      resolvedFiles.push({ relativePath: expected.relativePath, bytes, source: "published", hash: hashBytes(bytes) });
    } catch {
      missing.push(expected.relativePath);
    }
  }

  if (missing.length) {
    const requiredMissing = requiredRelativePaths.filter((relativePath) => missing.includes(relativePath));
    const reason = requiredMissing.length
      ? `Playable build tree is missing required file(s): ${requiredMissing.join(", ")}`
      : `Playable build tree is missing expected file(s): ${missing.join(", ")}`;
    return { status: "BLOCKED", reason };
  }

  return { status: "RESOLVED", files: resolvedFiles };
}

// Writeset Rule, generalized to N files: a file resolved via "published"
// (already on disk at this exact path, by construction) never enters the
// writeset. A "provided" file only enters if its bytes actually differ from
// what's currently on disk at that path (or the path doesn't exist yet) --
// so an inherited-unchanged tree produces an EMPTY writeset, and a
// one-file-changed tree produces exactly one entry.
export async function assessTreeWriteset(resolvedFiles, { root, publicDirectory }) {
  const writeset = [];
  for (const file of resolvedFiles) {
    if (file.source === "published") continue;
    const relativePath = path.posix.join(publicDirectory, file.relativePath);
    let onDiskHash = null;
    try {
      onDiskHash = hashBytes(await readFile(path.resolve(root, relativePath)));
    } catch {
      onDiskHash = null;
    }
    if (onDiskHash !== file.hash) {
      writeset.push({ path: relativePath, expectedPreviousHash: onDiskHash, nextHash: file.hash, content: file.bytes });
    }
  }
  return writeset;
}
