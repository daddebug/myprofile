import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildPublishingPreflight } from "./publishing-preflight-lib.mjs";

const repositoryRoot = process.cwd();
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "portfolio-publishing-preflight-"));

try {
  const registryDirectory = path.join(temporaryRoot, "src", "lib", "publishing");
  await mkdir(registryDirectory, { recursive: true });
  await cp(path.join(repositoryRoot, "src", "lib", "publishing", "publishSourceRegistry.json"), path.join(registryDirectory, "publishSourceRegistry.json"));

  const baseBundle = {
    version: 1,
    publishingRegistryVersion: 1,
    projectCatalog: { version: 1, projectIds: ["fixture"], projects: { fixture: { isDynamic: true } } },
    drafts: { fixture: { version: 1, templateInstances: [] } },
    projectDocuments: { version: 1, documents: {} },
    uiPractice: { version: 1, items: [] },
    gameExperience: { schemaVersion: 1, records: [] },
    images: [],
  };

  const valid = await buildPublishingPreflight({ root: temporaryRoot, bundle: baseBundle, rewrittenOutput: {} });
  assert.equal(valid.ok, true);
  assert.equal(valid.projects.length, 1);

  const unknown = await buildPublishingPreflight({ root: temporaryRoot, bundle: { ...baseBundle, images: [{ sourceAdapterId: "unknown-source", database: "x", store: "y", id: "z", dataBase64: "" }] } });
  assert.equal(unknown.ok, false);
  assert(unknown.issues.some((issue) => issue.code === "UNREGISTERED_BUNDLE_ASSET"));

  const missingGameCover = await buildPublishingPreflight({
    root: temporaryRoot,
    bundle: { ...baseBundle, gameExperience: { schemaVersion: 1, records: [{ id: "game", presentation: { coverAssetId: "missing-cover" } }] } },
  });
  assert.equal(missingGameCover.ok, false);
  assert(missingGameCover.issues.some((issue) => issue.code === "MISSING_REFERENCED_ASSET" && issue.sourceAdapterId === "game-experience-covers"));

  const forbidden = await buildPublishingPreflight({ root: temporaryRoot, bundle: baseBundle, rewrittenOutput: { image: "/portfolio-assets/project-images/fixture/image.png" } });
  assert.equal(forbidden.ok, false);
  assert(forbidden.issues.some((issue) => issue.code === "FORBIDDEN_PUBLISHED_REFERENCE"));

  const absentOutput = await buildPublishingPreflight({ root: temporaryRoot, bundle: baseBundle, rewrittenOutput: { image: "/images/published/not-collected.png" } });
  assert.equal(absentOutput.ok, false);
  assert(absentOutput.issues.some((issue) => issue.code === "PUBLISHED_FILE_NOT_IN_OUTPUT"));

  const playableDirectory = path.join(temporaryRoot, "public", "portfolio-assets", "playable-games", "fixture", "game-fixture");
  await mkdir(playableDirectory, { recursive: true });
  await writeFile(path.join(playableDirectory, "index.html"), "<!doctype html>", "utf8");
  const manifestDirectory = path.join(temporaryRoot, "content", "projects", "fixture");
  await mkdir(manifestDirectory, { recursive: true });
  await writeFile(path.join(manifestDirectory, "playable-games.json"), JSON.stringify({ version: 1, games: [{ gameId: "game-fixture", entryPublicPath: "/portfolio-assets/playable-games/fixture/game-fixture/index.html", publicDirectory: "public/portfolio-assets/playable-games/fixture/game-fixture" }], covers: [] }), "utf8");
  const playable = await buildPublishingPreflight({ root: temporaryRoot, bundle: baseBundle });
  assert(playable.assets.some((asset) => asset.sourceAdapterId === "playable-game-builds" && asset.sourcePath.endsWith("index.html")));

  console.log("publishing preflight focused tests passed");
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
