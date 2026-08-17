// The shared test-isolation harness (Publishing Architecture V2, Phase 8).
// Hard rule: no publishing test may ever read or write the real repo's
// src/data/publishedPortfolio.json or public/images/published -- proven
// necessary by a real incident this week where a test reconstructing bundle
// images from every real published asset (with placeholder bytes) ran a
// real --confirm against the real repo and corrupted ~34 files that its
// `finally` block never repaired. Every V2 publishing test must go through
// withFixtureRepo() instead of touching process.cwd().
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const REAL_REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
const IMPORT_SCRIPT_PATH = path.join(REAL_REPO_ROOT, "scripts", "import-production-bundle.mjs");

const DEFAULT_REGISTRY = {
  version: 1,
  excludedLocalRoots: ["local-deliverables/"],
  sources: [
    { id: "project-catalog", sourceType: "content" },
    { id: "dynamic-project-drafts", sourceType: "content" },
    { id: "project-documents", sourceType: "content" },
    { id: "ui-practice-metadata", sourceType: "content" },
    { id: "game-experience-records", sourceType: "content" },
    { id: "project-covers-indexeddb", sourceType: "asset", storage: { database: "dilida-portfolio-public-project-assets", store: "projectCovers" } },
    { id: "project-covers-disk", sourceType: "asset" },
    { id: "project-body-indexeddb-assets", sourceType: "asset", storage: { database: "dilida-portfolio-project-body-assets", store: "assets" } },
    { id: "dynamic-template-images", sourceType: "asset", storage: { database: "dilida-portfolio-template-images", store: "images" } },
    { id: "ui-practice-images", sourceType: "asset", storage: { database: "dilida-portfolio-ui-practice-images", store: "images" } },
    { id: "game-experience-covers", sourceType: "asset", storage: { database: "dilida-portfolio-game-assets", store: "covers" } },
    { id: "playable-game-builds", sourceType: "asset-tree" },
    { id: "playable-game-covers", sourceType: "asset" },
    { id: "ui-practice-bundled-images", sourceType: "asset" },
    { id: "legacy-static-game-build", sourceType: "asset-tree" },
    { id: "external-embeds", sourceType: "external" },
    { id: "published-assets", sourceType: "destination" },
  ],
};

// A real, valid 1x1 transparent PNG -- reused across V2 tests exactly as the
// V1 test suite already established this pattern this week (placeholder
// text/near-empty bytes must never stand in for a published image again).
export const VALID_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAIAAAUAAen63NgAAAAASUVORK5CYII=";
export const VALID_PNG_BYTES = Buffer.from(VALID_PNG_BASE64, "base64");

/**
 * Creates an isolated temp directory shaped like the repo root (registry +
 * empty publishedPortfolio.json + public/images/published), runs `fn(dir)`
 * against it, and always removes it afterward -- regardless of pass/fail,
 * and never touching REAL_REPO_ROOT for anything but a one-time registry
 * copy (read-only).
 * @param {(root: string) => Promise<void> | void} fn
 * @param {{ publishedPortfolio?: object, registry?: object }} [seed]
 */
export async function withFixtureRepo(fn, seed = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "portfolio-publish-fixture-"));
  try {
    await mkdir(path.join(root, "src", "data"), { recursive: true });
    await mkdir(path.join(root, "src", "lib", "publishing"), { recursive: true });
    await mkdir(path.join(root, "public", "images", "published"), { recursive: true });
    await writeFile(
      path.join(root, "src", "lib", "publishing", "publishSourceRegistry.json"),
      JSON.stringify(seed.registry ?? DEFAULT_REGISTRY),
      "utf8",
    );
    // Pretty-printed with a trailing newline, matching exactly how
    // import-production-bundle.mjs itself writes this file in real
    // production -- a fixture seeded with different byte formatting than the
    // CLI's own output would make every real write look like a spurious
    // content change under the Writeset Rule's byte-hash comparison, even
    // when nothing in the DATA actually changed. A real currentPublished file
    // always carries a generatedAt key too (every prior write, V1 or V2,
    // always set one) -- defaulting it here keeps a genuinely untouched
    // fixture run's re-assembled output structurally identical to what's
    // already on disk, not merely value-identical.
    await writeFile(
      path.join(root, "src", "data", "publishedPortfolio.json"),
      `${JSON.stringify(seed.publishedPortfolio ?? { version: 1, generatedAt: "2020-01-01T00:00:00.000Z", drafts: {}, projectCatalog: {}, projectDocuments: { version: 1, documents: {} }, covers: {}, assets: [] }, null, 2)}\n`,
      "utf8",
    );
    // uiPracticeMetadata.json, seeded to match the { version: 1, items: [] }
    // default nearly every fixture bundle's own bundle.uiPractice uses --
    // without this, a fixture run that never touches UI Practice would still
    // look like a first-time file creation (no file on disk yet) and produce
    // a spurious writeset entry.
    await writeFile(
      path.join(root, "src", "data", "uiPracticeMetadata.json"),
      `${JSON.stringify(seed.uiPracticeMetadata ?? { version: 1, items: [] }, null, 2)}\n`,
      "utf8",
    );
    return await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

// Explicit guard usable in any test that also needs the real repo path for
// something unrelated (e.g. reading assetIntegrity.mjs itself) -- asserts a
// given path is NOT inside the real repo's protected data locations.
export function assertNotRealPublishedData(candidatePath) {
  const resolved = path.resolve(candidatePath);
  const forbidden = [
    path.join(REAL_REPO_ROOT, "src", "data", "publishedPortfolio.json"),
    path.join(REAL_REPO_ROOT, "src", "data", "uiPracticeMetadata.json"),
    path.join(REAL_REPO_ROOT, "public", "images", "published"),
  ];
  if (forbidden.some((f) => resolved === f || resolved.startsWith(`${f}${path.sep}`))) {
    throw new Error(`Refusing to touch real published data in a test: ${resolved}`);
  }
}

// Runs the real, still-frozen V1 import-production-bundle.mjs CLI against a
// fixture root instead of the real repository -- the ONLY way any publishing
// test may exercise that script from now on (Publishing Architecture V2,
// Test Isolation Order). Depends on the gated PORTFOLIO_TEST_ROOT mechanism
// added to import-production-bundle.mjs itself: NODE_ENV=test AND
// PORTFOLIO_TEST_ROOT=root together redirect the script's required working
// root to the fixture directory; either alone (or NODE_ENV != "test") leaves
// it hard-locked to the real repository, so this helper cannot silently
// start writing to real data even if `root` were ever passed incorrectly.
// A defensive assertion below still refuses outright if `root` somehow
// resolves to the real repo or falls outside the OS temp directory.
export function runImportProductionBundle(root, args = []) {
  const resolvedRoot = path.resolve(root);
  const tempDirRoot = path.resolve(os.tmpdir());
  if (resolvedRoot === REAL_REPO_ROOT || !resolvedRoot.toLowerCase().startsWith(tempDirRoot.toLowerCase())) {
    throw new Error(`Refusing to run import-production-bundle.mjs against a non-fixture root: ${resolvedRoot}`);
  }
  return spawnSync(process.execPath, [IMPORT_SCRIPT_PATH, ...args], {
    cwd: resolvedRoot,
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "test", PORTFOLIO_TEST_ROOT: resolvedRoot },
  });
}
