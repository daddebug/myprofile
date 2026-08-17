// Preflight CLI (Publishing Architecture V2, Cutover, Section C). Reduced to
// call buildPublishPlan.mjs -- the same sole authority the live import CLI
// uses -- via the same formal bundle compatibility adapter, then render/print
// the result. No second content-tree/asset/BLOCKED logic lives here; this is
// a read-only preview of exactly what `pnpm portfolio:import` would decide.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { bundleV1ToV2AllIntents, bundleV1ToV2BundleAssets } from "./publishing/bundleCompat.mjs";
import { buildPublishPlan } from "./publishing/buildPublishPlan.mjs";

const bundlePath = process.argv[2];
if (!bundlePath) {
  console.error("Usage: pnpm portfolio:preflight -- <production-export.json>");
  process.exit(1);
}

const root = process.cwd();
const bundle = JSON.parse(await readFile(path.resolve(bundlePath), "utf8"));
let currentPublished = {};
try {
  currentPublished = JSON.parse(await readFile(path.join(root, "src", "data", "publishedPortfolio.json"), "utf8"));
} catch {
  // No current published state yet -- every touched entity will report NEW.
}

const { projectIntents, projectCurrentEntities, gameExperienceIntents, gameExperienceCurrentEntities } = bundleV1ToV2AllIntents(bundle, currentPublished);
const bundleAssets = bundleV1ToV2BundleAssets(bundle);

const projectPlan = await buildPublishPlan({ root, entityType: "project", currentEntities: projectCurrentEntities, intents: projectIntents, bundleAssets });
const gameExperiencePlan = gameExperienceIntents.size
  ? await buildPublishPlan({ root, entityType: "gameExperienceRecord", currentEntities: gameExperienceCurrentEntities, intents: gameExperienceIntents, bundleAssets })
  : { items: [], writeset: [], counts: {}, blocked: false, assetIntegrity: { total: 0, valid: 0, invalid: 0, inherited: 0 } };

const manifest = {
  version: 2,
  ok: !projectPlan.blocked && !gameExperiencePlan.blocked,
  projectItems: projectPlan.items,
  gameExperienceItems: gameExperiencePlan.items,
  counts: { project: projectPlan.counts, gameExperience: gameExperiencePlan.counts },
  writesetSize: projectPlan.writeset.length + gameExperiencePlan.writeset.length,
  assetIntegrity: {
    total: projectPlan.assetIntegrity.total + gameExperiencePlan.assetIntegrity.total,
    valid: projectPlan.assetIntegrity.valid + gameExperiencePlan.assetIntegrity.valid,
    invalid: projectPlan.assetIntegrity.invalid + gameExperiencePlan.assetIntegrity.invalid,
    inherited: projectPlan.assetIntegrity.inherited + gameExperiencePlan.assetIntegrity.inherited,
  },
};
const outputPath = path.join(root, "output", "publishing-preflight-manifest.json");
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(`Publishing preflight (V2 plan): ${manifest.ok ? "passed" : "failed"}`);
console.log(`Project entities: ${projectPlan.items.length} (${JSON.stringify(projectPlan.counts)})`);
console.log(`Game Experience records: ${gameExperiencePlan.items.length} (${JSON.stringify(gameExperiencePlan.counts)})`);
console.log(`Writeset entries: ${manifest.writesetSize}`);
console.log(`Asset integrity: ${JSON.stringify(manifest.assetIntegrity)}`);
console.log(`Manifest: ${outputPath}`);
if (!manifest.ok) process.exit(1);
