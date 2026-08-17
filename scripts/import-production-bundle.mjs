// Live publish CLI (Publishing Architecture V2, Cutover). This is the ONLY
// place that may write production files (src/data/publishedPortfolio.json,
// src/data/uiPracticeMetadata.json, public/images/published/**), and it does
// so by delegating ALL judgment to buildPublishPlan.mjs / executePublishPlan.mjs:
//   - buildPublishPlan.mjs is the sole merge/conflict/status/BLOCKED authority
//   - executePublishPlan.mjs is the sole writeset-precondition-check + write authority
// This file itself does none of that anymore -- it only (1) reads inputs,
// (2) translates the still-V1-shaped export bundle into V2 entities/intents
// via the one formal compatibility adapter (bundleCompat.mjs), (3) assembles
// the final whole-file output from already-decided plan results (a pure
// structural merge, not judgment -- see assemblePublishedOutput.mjs), and
// (4) renders/executes. V1's preflight -> inline-merge -> rewritten-preflight
// -> report-re-diff pipeline is retired from this path (see
// publishing-preflight-lib.mjs and publishing-report-lib.mjs's own retirement
// comments) -- their functions are no longer imported here.
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import process from "node:process";
import { bundleV1ToV2AllIntents, bundleV1ToV2BundleAssets } from "./publishing/bundleCompat.mjs";
import { buildPublishPlan } from "./publishing/buildPublishPlan.mjs";
import { assemblePublishedOutput } from "./publishing/assemblePublishedOutput.mjs";
import { hashContent } from "./publishing/contentHash.mjs";
import { executePublishPlan } from "./publishing/executePublishPlan.mjs";
import { readPublishSourceRegistry } from "./publishing/registry.mjs";
import { LAUNCHER_REPORT_PATH, renderPublishPlanReportV2 } from "./publishing-report-lib.mjs";

const OFFICIAL_ROOT = path.resolve("D:/myprofilegit/myprofile");
// Test-only root override (Publishing Architecture V2, Test Isolation
// Order): requires BOTH NODE_ENV=test AND an explicit PORTFOLIO_TEST_ROOT.
// Any other combination -- including PORTFOLIO_TEST_ROOT set without
// NODE_ENV=test -- is ignored outright and production stays locked to
// OFFICIAL_ROOT. Deliberately not a general-purpose --root flag: that would
// let anything redirect where "production" writes go.
const TEST_ROOT_OVERRIDE = process.env.NODE_ENV === "test" && process.env.PORTFOLIO_TEST_ROOT
  ? path.resolve(process.env.PORTFOLIO_TEST_ROOT)
  : null;
const REQUIRED_ROOT = TEST_ROOT_OVERRIDE || OFFICIAL_ROOT;
const OUTPUT_DATA = path.join("src", "data", "publishedPortfolio.json");
const OUTPUT_UI_PRACTICE_DATA = path.join("src", "data", "uiPracticeMetadata.json");
const OUTPUT_ASSET_ROOT = path.join("public", "images", "published");
const CONFIRM_FLAG = "--confirm";
const PRODUCTION_URL = "https://myprofile-teal.vercel.app/zh/";

// Permanently retired legacy project ids -- must never republish even if a
// stale browser session's export still carries them. Preserved verbatim from
// V1 (see publishing-preflight-lib.mjs history); folded into excludeProjectIds
// below rather than kept as separate judgment, since "never touch this id" is
// exactly what excludeProjectIds already means.
const RETIRED_PROJECT_IDS = new Set([
  "game-ux-case-study",
  "ktv-tablet-interface",
  "playable-web-game-prototype",
  "visual-system-ui-art",
]);

function fail(message) {
  console.error(`\nERROR: ${message}\n`);
  process.exit(1);
}

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

const EXCLUDE_PROJECT_PREFIX = "--exclude-project=";

const args = process.argv.slice(2);
const confirm = args.includes(CONFIRM_FLAG);
const bundleArgument = args.find((argument) => argument !== CONFIRM_FLAG && argument !== "--" && !argument.startsWith(EXCLUDE_PROJECT_PREFIX));
if (!bundleArgument) {
  fail("Provide the downloaded export JSON path. Example: pnpm portfolio:import -- C:\\Users\\you\\Downloads\\portfolio-production-export.json");
}
const explicitExcludeProjectIds = new Set(
  args.filter((argument) => argument.startsWith(EXCLUDE_PROJECT_PREFIX))
    .flatMap((argument) => argument.slice(EXCLUDE_PROJECT_PREFIX.length).split(",").map((id) => id.trim()).filter(Boolean)),
);
const excludeProjectIds = new Set([...explicitExcludeProjectIds, ...RETIRED_PROJECT_IDS]);

const cwd = path.resolve(process.cwd());
if (cwd.toLowerCase() !== REQUIRED_ROOT.toLowerCase()) {
  fail(`Run this command from ${REQUIRED_ROOT}. Current directory: ${cwd}`);
}

let bundle;
try {
  bundle = JSON.parse(await readFile(path.resolve(bundleArgument), "utf8"));
} catch (error) {
  fail(`Cannot read export bundle: ${error instanceof Error ? error.message : String(error)}`);
}

if (!bundle || bundle.version !== 1 || typeof bundle.drafts !== "object" || !Array.isArray(bundle.images)) {
  fail("The selected file is not a supported version-1 portfolio production export.");
}

// Basic bundle SHAPE validation only (malformed input, not content judgment)
// -- registry version/adapter-id checks belong here because an unregistered
// adapter id or a stale registry version means the bundle cannot be
// interpreted at all, before buildPublishPlan.mjs ever sees it.
const registry = await readPublishSourceRegistry(cwd);
if (bundle.publishingRegistryVersion !== registry.version) {
  fail(`The export was not generated with publishing registry version ${registry.version}. Create a fresh browser export before publishing.`);
}
const registeredAdapterIds = new Set(registry.sources.map((source) => source.id));
for (const image of bundle.images) {
  if (!image || typeof image.id !== "string" || typeof image.dataBase64 !== "string") {
    fail("The export contains an invalid image record.");
  }
  if (typeof image.sourceAdapterId !== "string" || !registeredAdapterIds.has(image.sourceAdapterId)) {
    fail(`Unknown or missing source adapter for image ${image.id}.`);
  }
}

let currentPublished = {};
try {
  currentPublished = JSON.parse(await readFile(path.join(cwd, OUTPUT_DATA), "utf8"));
} catch (error) {
  fail(`Cannot read the current ${OUTPUT_DATA}: ${error instanceof Error ? error.message : String(error)}`);
}

const {
  projectIntents, projectCurrentEntities, projectBodyTarget,
  gameExperienceIntents, gameExperienceCurrentEntities,
  touchedProjectIds,
} = bundleV1ToV2AllIntents(bundle, currentPublished, { excludeProjectIds });

const missingFromBundle = [...explicitExcludeProjectIds].filter((id) => !touchedProjectIds.has(id));
if (missingFromBundle.length) fail(`--exclude-project referenced a project not present in this export: ${missingFromBundle.join(", ")}`);
if (explicitExcludeProjectIds.size) console.log(`Excluding from this publish (explicit --exclude-project): ${[...explicitExcludeProjectIds].join(", ")}`);

const bundleAssets = bundleV1ToV2BundleAssets(bundle);

// ---- The ONLY merge/conflict/status/BLOCKED authority in this CLI. ----
const projectPlan = await buildPublishPlan({ root: cwd, entityType: "project", currentEntities: projectCurrentEntities, intents: projectIntents, bundleAssets });
const gameExperiencePlan = gameExperienceIntents.size
  ? await buildPublishPlan({ root: cwd, entityType: "gameExperienceRecord", currentEntities: gameExperienceCurrentEntities, intents: gameExperienceIntents, bundleAssets })
  : { items: [], writeset: [], counts: {}, blocked: false, assetIntegrity: { total: 0, valid: 0, invalid: 0, inherited: 0 } };

const catalogForTitles = {
  ...currentPublished.projectCatalog,
  ...Object.fromEntries(projectPlan.items.filter((item) => item.value?.meta).map((item) => [item.entityId, item.value.meta])),
};

// ---- Report: a PURE VIEW over the two plans above, nothing re-derived. ----
const report = await renderPublishPlanReportV2({ root: cwd, plans: [projectPlan, gameExperiencePlan], catalogForTitles, productionUrl: PRODUCTION_URL });

console.log("\nPortfolio production import review (Publishing Architecture V2)");
console.log(`  Project entities touched: ${projectPlan.items.length}`);
console.log(`  Game Experience records touched: ${gameExperiencePlan.items.length}`);
console.log(`  Counts: ${JSON.stringify(report.counts)}`);
console.log(`  Asset references resolved: ${report.assetIntegrity.total} (valid ${report.assetIntegrity.valid}, inherited ${report.assetIntegrity.inherited}, invalid ${report.assetIntegrity.invalid})`);
console.log(`  Writeset entries (asset bytes that will actually change): ${report.writesetSize}`);
console.log(`  Output data: ${OUTPUT_DATA}`);
console.log(`  Asset root: ${OUTPUT_ASSET_ROOT}`);
console.log(`  Report: ${LAUNCHER_REPORT_PATH}`);

// A BLOCKED plan fails the run whether or not --confirm was passed -- a dry
// run must surface the exact same verdict a confirm would refuse on, not
// silently report "DRY RUN ONLY" over a plan that could never actually
// publish. plan.blocked is consulted directly here (also re-checked inside
// executePublishPlan itself on a confirmed run, which refuses unconditionally
// on a blocked plan) so "what the report says" and "what this CLI allows" can
// never drift apart -- not a second, independently-maintained BLOCKED
// judgment.
if (projectPlan.blocked || gameExperiencePlan.blocked) {
  const blockedReasons = report.items.filter((item) => item.status === "BLOCKED").map((item) => `${item.category}${item.projectId ? ` (${item.projectId})` : ""}: ${item.reason}`);
  fail(`Publish plan is BLOCKED. No production files were changed, no backup was created, no assets were copied.\nReport: ${LAUNCHER_REPORT_PATH}\n- ${blockedReasons.join("\n- ")}`);
}

if (!confirm) {
  console.log("\nDRY RUN ONLY. Review the summary, then repeat with --confirm to write version-controlled files.");
  process.exit(0);
}

// ---- Final assembly: pure structural merge of already-decided values into
// the whole-file output shape (see assemblePublishedOutput.mjs). No judgment
// happens here -- every status was already decided by buildPublishPlan.mjs.
// generatedAt is compared using the CURRENT file's own timestamp first --
// otherwise a fresh timestamp on every run would make even a fully no-op
// publish (nothing touched, nothing changed) look like a real content change,
// defeating the Writeset Rule for the one field that would otherwise change
// unconditionally on every run. A fresh timestamp is only stamped once a REAL
// content change has already been detected below. The DECISION of whether a
// real change occurred is made with hashContent() (key-order-independent
// structural comparison, see contentHash.mjs) rather than a raw byte-hash of
// the re-serialized JSON -- object key insertion order is not semantically
// meaningful here, and a naive byte comparison would spuriously flag "changed"
// for a file whose content is identical but was hand-authored (or by any
// other writer) with different key ordering. The actual writeset entry's
// expectedPreviousHash/nextHash still use real byte hashes, since
// executePublishPlan's Window-2 check re-hashes the literal file on disk.
const outputWithStableTimestamp = assemblePublishedOutput({
  currentPublished,
  projectPlan,
  gameExperiencePlan,
  projectBodyTarget,
  generatedAt: currentPublished.generatedAt || "",
});

const combinedWriteset = [...projectPlan.writeset, ...gameExperiencePlan.writeset];

// Whole-file writes (publishedPortfolio.json / uiPracticeMetadata.json)
// follow the identical Writeset Rule as every asset above: only enter the
// writeset if the newly-assembled content actually differs from what is
// currently on disk.
const currentDataHash = await currentFileHashOrNull(cwd, OUTPUT_DATA);
const contentChanged = hashContent(outputWithStableTimestamp) !== hashContent({ ...currentPublished, generatedAt: currentPublished.generatedAt || "" });
if (contentChanged) {
  const output = { ...outputWithStableTimestamp, generatedAt: bundle.exportedAt || new Date().toISOString() };
  const nextDataContent = `${JSON.stringify(output, null, 2)}\n`;
  combinedWriteset.push({ path: OUTPUT_DATA, expectedPreviousHash: currentDataHash, nextHash: hashBytes(Buffer.from(nextDataContent, "utf8")), content: nextDataContent });
}

if (bundle.uiPractice?.version === 1 && Array.isArray(bundle.uiPractice.items)) {
  let currentUiPractice = null;
  try {
    currentUiPractice = JSON.parse(await readFile(path.join(cwd, OUTPUT_UI_PRACTICE_DATA), "utf8"));
  } catch {
    // No current file yet -- any bundle.uiPractice content is a real, first-time change.
  }
  if (hashContent(bundle.uiPractice) !== hashContent(currentUiPractice)) {
    const nextUiPracticeContent = `${JSON.stringify(bundle.uiPractice, null, 2)}\n`;
    const currentUiPracticeHash = await currentFileHashOrNull(cwd, OUTPUT_UI_PRACTICE_DATA);
    combinedWriteset.push({ path: OUTPUT_UI_PRACTICE_DATA, expectedPreviousHash: currentUiPracticeHash, nextHash: hashBytes(Buffer.from(nextUiPracticeContent, "utf8")), content: nextUiPracticeContent });
  }
}

const backupTimestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupRoot = path.join(cwd, ".local-backups", `production-import-${backupTimestamp}`);

// ---- The ONLY writeset-precondition-check + write authority. ----
const result = await executePublishPlan({ root: cwd, plan: { blocked: false, writeset: combinedWriteset }, backupRoot });

if (result.status === "REFUSED") {
  fail(`${result.reason}\n${result.staleEntries.map((entry) => `- ${entry.path}: expected ${entry.expected}, found ${entry.actual}`).join("\n")}`);
}

console.log(`\nImported safely via Publishing Architecture V2. Backup snapshot: ${backupRoot}`);
console.log(`Files written (${result.writtenPaths.length}): ${result.writtenPaths.slice(0, 10).join(", ")}${result.writtenPaths.length > 10 ? ", ..." : ""}`);
console.log("Run pnpm portfolio:check before publishing.");
