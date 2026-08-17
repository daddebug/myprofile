import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { assessTreeWriteset, readPublishedTree, resolveAssetTree } from "../resolveAssetTree.mjs";
import { withFixtureRepo } from "./fixtureRepo.mjs";

function treeDir(root, projectId, gameId) {
  return path.join(root, "public", "playable-games", projectId, gameId);
}

// 4. inherited tree, unchanged -> RESOLVED, writeset stays empty.
await withFixtureRepo(async (root) => {
  const publicDirectory = "public/playable-games/p1/game-1";
  const dir = treeDir(root, "p1", "game-1");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "index.html"), "<html>game</html>");
  await writeFile(path.join(dir, "game.js"), "console.log('game');");

  const published = await readPublishedTree(root, publicDirectory);
  assert.equal(published.length, 2);

  // expectedFiles with no bytes -- every file must come from the existing
  // published tree, exactly like resolveAsset's inherited/published-fallback case.
  const expectedFiles = published.map((entry) => ({ relativePath: entry.relativePath }));
  const resolved = await resolveAssetTree({ publicDirectory, expectedFiles, requiredRelativePaths: ["index.html"] }, { root });
  assert.equal(resolved.status, "RESOLVED", JSON.stringify(resolved));
  assert(resolved.files.every((file) => file.source === "published"));

  const writeset = await assessTreeWriteset(resolved.files, { root, publicDirectory });
  assert.equal(writeset.length, 0, "an inherited, unchanged tree must produce an empty writeset");
});
console.log("4. inherited tree unchanged -> RESOLVED, empty writeset, passed");

// 5. one file in the tree changed -> writeset contains exactly that one file.
await withFixtureRepo(async (root) => {
  const publicDirectory = "public/playable-games/p2/game-2";
  const dir = treeDir(root, "p2", "game-2");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "index.html"), "<html>original</html>");
  await writeFile(path.join(dir, "game.js"), "console.log('original');");

  const expectedFiles = [
    { relativePath: "index.html" }, // inherited, unchanged
    { relativePath: "game.js", bytes: Buffer.from("console.log('updated');") }, // changed
  ];
  const resolved = await resolveAssetTree({ publicDirectory, expectedFiles, requiredRelativePaths: ["index.html"] }, { root });
  assert.equal(resolved.status, "RESOLVED", JSON.stringify(resolved));

  const writeset = await assessTreeWriteset(resolved.files, { root, publicDirectory });
  assert.equal(writeset.length, 1, `expected exactly one changed file in the writeset, got: ${JSON.stringify(writeset)}`);
  assert.equal(writeset[0].path, "public/playable-games/p2/game-2/game.js");
  assert.equal(writeset[0].content.toString(), "console.log('updated');");
});
console.log("5. one file changed -> writeset has exactly one real change, passed");

// 6. a required file is missing entirely -> BLOCKED, no writeset computed at all.
await withFixtureRepo(async (root) => {
  const publicDirectory = "public/playable-games/p3/game-3";
  const dir = treeDir(root, "p3", "game-3");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "game.js"), "console.log('no index.html here');");
  // index.html deliberately never written.

  const expectedFiles = [{ relativePath: "index.html" }, { relativePath: "game.js" }];
  const resolved = await resolveAssetTree({ publicDirectory, expectedFiles, requiredRelativePaths: ["index.html"] }, { root });
  assert.equal(resolved.status, "BLOCKED", JSON.stringify(resolved));
  assert.match(resolved.reason, /required/i);
  assert.match(resolved.reason, /index\.html/);
});
console.log("6. missing required tree file -> BLOCKED, passed");

// A non-required missing file still BLOCKs (the whole tree fails closed --
// there is no partial-tree publish), but with a different message.
await withFixtureRepo(async (root) => {
  const publicDirectory = "public/playable-games/p4/game-4";
  const dir = treeDir(root, "p4", "game-4");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "index.html"), "<html></html>");

  const expectedFiles = [{ relativePath: "index.html" }, { relativePath: "extra-asset.png" }];
  const resolved = await resolveAssetTree({ publicDirectory, expectedFiles, requiredRelativePaths: ["index.html"] }, { root });
  assert.equal(resolved.status, "BLOCKED");
  assert.match(resolved.reason, /expected file/i);
});
console.log("non-required missing file still BLOCKs the whole tree, passed");

console.log("resolveAssetTree.mjs coverage tests passed");
