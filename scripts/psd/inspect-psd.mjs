#!/usr/bin/env node
// DEPRECATED/LEGACY: PSD is no longer the visual source of truth for new
// work (see docs/design/FIGMA_TEMPLATE_WORKFLOW.md and
// skills/figma-template-sync/SKILL.md). Kept only for inspecting an old
// PSD file for historical reference.
//
// Read-only PSD layer-tree dump. Prints every layer -- visible AND hidden,
// per docs/design/PSD_TEMPLATE_WORKFLOW.md's "hidden != unused" rule --
// with its geometry, so a human or a later AI pass can see the PSD's real
// structure before deciding what to sync. Makes no file writes.
//
// Usage: node scripts/psd/inspect-psd.mjs "<path to .psd>" [--json]
import { readPsdFile } from "./lib.mjs";

const psdPath = process.argv[2];
const asJson = process.argv.includes("--json");

if (!psdPath) {
  console.error("Usage: node scripts/psd/inspect-psd.mjs \"<path to .psd>\" [--json]");
  process.exit(1);
}

const { psd, fileMtime, fileSize, fileHash } = await readPsdFile(psdPath);

function summarize(layer, depth) {
  const width = layer.right !== undefined && layer.left !== undefined ? layer.right - layer.left : undefined;
  const height = layer.bottom !== undefined && layer.top !== undefined ? layer.bottom - layer.top : undefined;
  const node = {
    name: layer.name?.trim(),
    hidden: layer.hidden ?? false,
    left: layer.left,
    top: layer.top,
    width,
    height,
    isText: Boolean(layer.text),
    isGroup: Boolean(layer.children),
  };
  if (layer.children) node.children = layer.children.map((child) => summarize(child, depth + 1));
  return node;
}

const tree = (psd.children ?? []).map((layer) => summarize(layer, 0));

if (asJson) {
  console.log(JSON.stringify({ canvas: { width: psd.width, height: psd.height }, fileMtime, fileSize, fileHash, layers: tree }, null, 2));
  process.exit(0);
}

console.log(`Canvas: ${psd.width} x ${psd.height}`);
console.log(`File: mtime=${fileMtime} size=${fileSize} sha256=${fileHash.slice(0, 12)}...`);
console.log("");

function printTree(nodes, depth) {
  for (const node of nodes) {
    const flag = node.hidden ? "[H]" : "[V]";
    const kind = node.isText ? "text " : node.isGroup ? "group" : "     ";
    const bounds = node.width !== undefined ? `(${node.left},${node.top}, ${node.width}x${node.height})` : "";
    console.log("  ".repeat(depth) + `${flag} ${kind} ${node.name} ${bounds}`);
    if (node.children) printTree(node.children, depth + 1);
  }
}
printTree(tree, 0);
