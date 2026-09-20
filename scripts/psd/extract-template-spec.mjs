#!/usr/bin/env node
// DEPRECATED/LEGACY: PSD is no longer the visual source of truth for new
// work (see docs/design/FIGMA_TEMPLATE_WORKFLOW.md and
// skills/figma-template-sync/SKILL.md). Kept only for inspecting an old
// PSD file for historical reference.
//
// Patches ONE section's raw measurements into docs/design/psd-template-spec.json,
// without touching that section's curated fields (elements/, variants/,
// status, note, ...) -- see PSD_TEMPLATE_SPEC.md's extracted/confirmed/
// manual distinction. This script only ever writes the `rawExtraction`
// key on the target section, plus `lastExtractedAt`, plus the fingerprint
// cache. Turning a raw layer measurement into a named ELEMENT (NODE_NUMBER,
// TITLE_MAIN, ...) with role/state/variant reasoning is a separate,
// judgment-driven step -- this script deliberately does not attempt it, so
// it can never silently clobber a human's already-reasoned-through mapping.
//
// Usage:
//   node scripts/psd/extract-template-spec.mjs "<path to .psd>" --section SECTION_02_PHASE_MILESTONES [--force]
import {
  readPsdFile,
  loadCache,
  saveCache,
  loadSpec,
  saveSpec,
  sectionMapFromSpec,
  sectionFingerprint,
  collectLayerIds,
  flattenLayers,
} from "./lib.mjs";

const psdPath = process.argv[2];
const sectionArgIndex = process.argv.indexOf("--section");
const sectionId = sectionArgIndex !== -1 ? process.argv[sectionArgIndex + 1] : null;
const force = process.argv.includes("--force");

if (!psdPath || !sectionId) {
  console.error("Usage: node scripts/psd/extract-template-spec.mjs \"<path to .psd>\" --section <SECTION_ID> [--force]");
  process.exit(1);
}

const { psd, fileMtime, fileSize, fileHash } = await readPsdFile(psdPath);
const spec = await loadSpec();
const sectionMap = sectionMapFromSpec(spec);

const sourceLayerGroup = [...sectionMap.entries()].find(([, id]) => id === sectionId)?.[0];
if (!sourceLayerGroup) {
  console.error(`"${sectionId}" has no sourceLayerGroup recorded in the spec yet -- add the section entry (even an empty one with sourceLayerGroup set) before extracting into it.`);
  process.exit(1);
}

const layer = (psd.children ?? []).find((l) => l.name?.trim() === sourceLayerGroup);
if (!layer) {
  console.error(`PSD group "${sourceLayerGroup}" (mapped from ${sectionId}) was not found at the top level of this PSD.`);
  process.exit(1);
}

const fingerprint = sectionFingerprint(layer);
const cache = await loadCache();
cache.sections = cache.sections ?? {};
const cached = cache.sections[sectionId];

if (cached && cached.fingerprint === fingerprint && !force) {
  console.log(`${sectionId}: unchanged since the last extraction (fingerprint match) -- skipped. Pass --force to re-extract anyway.`);
  process.exit(0);
}

function effectiveFontSize(textLayer) {
  const nominal = textLayer.text?.style?.fontSize;
  const transform = textLayer.text?.transform;
  if (nominal === undefined || !transform) return { nominal, effective: nominal, scale: 1 };
  const scaleX = Math.hypot(transform[0], transform[1]);
  const scaleY = Math.hypot(transform[2], transform[3]);
  const scale = (scaleX + scaleY) / 2;
  return { nominal, effective: +(nominal * scale).toFixed(2), scale: +scale.toFixed(4) };
}

function rawLayer(l) {
  const width = l.right !== undefined && l.left !== undefined ? l.right - l.left : undefined;
  const height = l.bottom !== undefined && l.top !== undefined ? l.bottom - l.top : undefined;
  const entry = {
    name: l.name?.trim(),
    hidden: l.hidden ?? false,
    left: l.left,
    top: l.top,
    width,
    height,
    leftRatio: l.left !== undefined ? +(l.left / psd.width).toFixed(4) : undefined,
    topRatio: l.top !== undefined ? +(l.top / psd.height).toFixed(4) : undefined,
    widthRatio: width !== undefined ? +(width / psd.width).toFixed(4) : undefined,
    heightRatio: height !== undefined ? +(height / psd.height).toFixed(4) : undefined,
  };
  if (l.text) {
    const size = effectiveFontSize(l);
    entry.text = {
      value: l.text.text,
      fontName: l.text.style?.font?.name,
      nominalFontSize: size.nominal,
      transformScale: size.scale,
      effectiveFontSize: size.effective,
      fillColor: l.text.style?.fillColor,
      letterSpacing: l.text.style?.paragraphStyle?.letterSpacing,
      leading: l.text.style?.leading,
    };
  }
  if (l.vectorFill) entry.vectorFill = l.vectorFill;
  if (l.fillColor) entry.fillColor = l.fillColor;
  if (l.effects?.gradientOverlay) entry.gradientOverlay = l.effects.gradientOverlay;
  return entry;
}

const rawExtraction = {
  extractedAt: new Date().toISOString(),
  sourcePsd: { fileMtime, fileSize, fileHash },
  layers: flattenLayers([layer]).map(rawLayer),
};

// Patch only this section's rawExtraction + lastExtractedAt. Every other
// key already on this section (elements, variants, status, note, ...) is
// left exactly as it was -- this is the "patch, don't overwrite" rule from
// PSD_TEMPLATE_SPEC.md.
function findSectionContainer(specDoc, id) {
  for (const frame of Object.values(specDoc.frames ?? {})) {
    if (frame.sections?.[id]) return frame.sections;
  }
  if (specDoc.sections?.[id]) return specDoc.sections;
  return null;
}

const container = findSectionContainer(spec, sectionId);
if (!container) {
  console.error(`${sectionId} not found under spec.frames.*.sections or spec.sections -- add its entry (with sourceLayerGroup) before extracting.`);
  process.exit(1);
}

container[sectionId].rawExtraction = rawExtraction;
container[sectionId].lastExtractedAt = rawExtraction.extractedAt;

await saveSpec(spec);

cache.psdPath = psdPath;
cache.fileMtime = fileMtime;
cache.fileSize = fileSize;
cache.fileHash = fileHash;
cache.sections[sectionId] = {
  layerIds: collectLayerIds(layer),
  fingerprint,
  lastParsedAt: rawExtraction.extractedAt,
};
await saveCache(cache);

console.log(`${sectionId}: extracted ${rawExtraction.layers.length} layers from PSD group "${sourceLayerGroup}" into rawExtraction.`);
console.log(`Curated fields (elements/variants/status/note) on this section were left untouched.`);
console.log(`Next step is a reasoned pass over rawExtraction to update the curated elements -- see PSD_TEMPLATE_WORKFLOW.md's per-template sync procedure, steps 4-6.`);
