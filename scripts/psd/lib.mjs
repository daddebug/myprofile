// DEPRECATED/LEGACY: PSD is no longer the visual source of truth for new
// work (see docs/design/FIGMA_TEMPLATE_WORKFLOW.md and
// skills/figma-template-sync/SKILL.md). Kept only for inspecting an old
// PSD file for historical reference.
//
// Shared helpers for the PSD -> Web template workflow scripts
// (inspect-psd.mjs, diff-psd.mjs, extract-template-spec.mjs). See
// docs/design/PSD_TEMPLATE_WORKFLOW.md for the process this supports and
// docs/design/PSD_TEMPLATE_SPEC.md for what the spec file's fields mean.
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { readPsd } from "ag-psd";

const repoRoot = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
export const specPath = path.join(repoRoot, "docs", "design", "psd-template-spec.json");
export const cachePath = path.join(repoRoot, "docs", "design", "psd-spec-cache.json");

export async function readPsdFile(psdPath) {
  const buffer = await fs.readFile(psdPath);
  const stat = await fs.stat(psdPath);
  const psd = readPsd(buffer, {
    skipLayerImageData: true,
    skipCompositeImageData: true,
    skipThumbnail: true,
  });
  const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");
  return { psd, fileMtime: stat.mtime.toISOString(), fileSize: stat.size, fileHash };
}

export async function loadJsonIfExists(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export async function loadCache() {
  return (await loadJsonIfExists(cachePath)) ?? { psdPath: null, fileMtime: null, fileSize: null, fileHash: null, sections: {} };
}

export async function saveCache(cache) {
  await fs.writeFile(cachePath, JSON.stringify(cache, null, 2) + "\n", "utf8");
}

export async function loadSpec() {
  const spec = await loadJsonIfExists(specPath);
  if (!spec) throw new Error(`Spec file not found at ${specPath} -- create it first (see PSD_TEMPLATE_SPEC.md).`);
  return spec;
}

export async function saveSpec(spec) {
  await fs.writeFile(specPath, JSON.stringify(spec, null, 2) + "\n", "utf8");
}

// Builds { psdGroupName -> sectionId } from the spec's existing
// sourceLayerGroup fields, so the mapping lives in one place (the spec)
// instead of a second hardcoded table in this script. A PSD top-level
// group not present here is reported as unmapped, never guessed.
export function sectionMapFromSpec(spec) {
  const map = new Map();
  for (const frame of Object.values(spec.frames ?? {})) {
    for (const [sectionId, section] of Object.entries(frame.sections ?? {})) {
      if (section.sourceLayerGroup) map.set(section.sourceLayerGroup.trim(), sectionId);
    }
  }
  // Backward compatible with a flat (pre-Frame) sections map, if present.
  for (const [sectionId, section] of Object.entries(spec.sections ?? {})) {
    if (section.sourceLayerGroup) map.set(section.sourceLayerGroup.trim(), sectionId);
  }
  return map;
}

function textDescriptor(layer) {
  if (!layer.text) return null;
  const style = layer.text.style ?? {};
  const run = layer.text.styleRuns?.[0]?.style ?? {};
  const merged = { ...style, ...run };
  return {
    value: layer.text.text,
    fontName: merged.font?.name,
    fontSize: merged.fontSize,
    fillColor: merged.fillColor,
    transform: layer.text.transform,
  };
}

// A normalized, order-preserving descriptor of one layer subtree --
// deliberately excludes anything that isn't a real visual property (no
// internal PSD ids/offsets) so the fingerprint only changes when something
// a human would call "the design" actually changed.
function describeLayer(layer) {
  return {
    name: layer.name?.trim(),
    hidden: layer.hidden ?? false,
    left: layer.left,
    top: layer.top,
    right: layer.right,
    bottom: layer.bottom,
    opacity: layer.opacity,
    text: textDescriptor(layer),
    fillColor: layer.fillColor,
    vectorFill: layer.vectorFill,
    vectorStroke: layer.vectorStroke,
    effects: layer.effects,
    children: layer.children?.map(describeLayer),
  };
}

export function sectionFingerprint(layer) {
  const json = JSON.stringify(describeLayer(layer));
  return crypto.createHash("sha256").update(json).digest("hex");
}

export function collectLayerIds(layer, acc = []) {
  acc.push(layer.name?.trim());
  for (const child of layer.children ?? []) collectLayerIds(child, acc);
  return acc;
}

export function findByName(layers, predicate) {
  for (const layer of layers) {
    if (predicate(layer)) return layer;
    if (layer.children) {
      const found = findByName(layer.children, predicate);
      if (found) return found;
    }
  }
  return null;
}

export function flattenLayers(layers, acc = []) {
  for (const layer of layers) {
    acc.push(layer);
    if (layer.children) flattenLayers(layer.children, acc);
  }
  return acc;
}
