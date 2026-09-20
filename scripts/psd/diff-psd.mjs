#!/usr/bin/env node
// DEPRECATED/LEGACY: PSD is no longer the visual source of truth for new
// work (see docs/design/FIGMA_TEMPLATE_WORKFLOW.md and
// skills/figma-template-sync/SKILL.md). Kept only for inspecting an old
// PSD file for historical reference.
//
// Reports which known sections changed since the last sync, without
// re-extracting or writing the spec file (read-only against the spec;
// only writes the cache when --update-cache is passed). This is the tool
// for "did anything change" -- see docs/design/PSD_TEMPLATE_WORKFLOW.md's
// per-template sync procedure, step 1-2, and PSD_TEMPLATE_SPEC.md's
// fingerprint section.
//
// Usage: node scripts/psd/diff-psd.mjs "<path to .psd>" [--update-cache]
import { readPsdFile, loadCache, saveCache, loadSpec, sectionMapFromSpec, sectionFingerprint, collectLayerIds } from "./lib.mjs";

const psdPath = process.argv[2];
const updateCache = process.argv.includes("--update-cache");

if (!psdPath) {
  console.error("Usage: node scripts/psd/diff-psd.mjs \"<path to .psd>\" [--update-cache]");
  process.exit(1);
}

const { psd, fileMtime, fileSize, fileHash } = await readPsdFile(psdPath);
const spec = await loadSpec();
const sectionMap = sectionMapFromSpec(spec);
const cache = await loadCache();

const results = [];
const unmapped = [];

for (const layer of psd.children ?? []) {
  const name = layer.name?.trim();
  const sectionId = sectionMap.get(name);
  if (!sectionId) {
    unmapped.push(name);
    continue;
  }
  const fingerprint = sectionFingerprint(layer);
  const cached = cache.sections?.[sectionId];
  const status = !cached ? "new" : cached.fingerprint === fingerprint ? "unchanged" : "changed";
  results.push({ sectionId, sourceLayerGroup: name, status, fingerprint, layerCount: collectLayerIds(layer).length });
  if (updateCache) {
    cache.sections = cache.sections ?? {};
    cache.sections[sectionId] = { layerIds: collectLayerIds(layer), fingerprint, lastParsedAt: new Date().toISOString() };
  }
}

if (updateCache) {
  cache.psdPath = psdPath;
  cache.fileMtime = fileMtime;
  cache.fileSize = fileSize;
  cache.fileHash = fileHash;
  await saveCache(cache);
}

console.log(`Canvas: ${psd.width} x ${psd.height}`);
console.log(`File: mtime=${fileMtime} size=${fileSize}`);
console.log("");
for (const r of results) {
  console.log(`${r.status.toUpperCase().padEnd(9)} ${r.sectionId}  (PSD group "${r.sourceLayerGroup}", ${r.layerCount} layers)`);
}
if (unmapped.length) {
  console.log("");
  console.log(`UNMAPPED top-level PSD groups (no sourceLayerGroup in the spec points at these -- name/confirm before they can be synced):`);
  for (const name of unmapped) console.log(`  - "${name}"`);
}
if (updateCache) console.log("\nCache updated.");
else console.log("\n(dry run -- pass --update-cache to persist these fingerprints)");
