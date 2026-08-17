// The single place that knows the publish source registry and how a given
// adapter/project/asset id maps to its published disk location. V1 had this
// same logic (readPublishSourceRegistry, outputFor/getPublishedAssetLocation)
// living inside publishing-preflight-lib.mjs, imported separately by
// import-production-bundle.mjs -- moved here as its own small module so V2's
// resolveAsset.mjs and buildPublishPlan.mjs share one copy, not two.
import { readFile } from "node:fs/promises";
import path from "node:path";

const REGISTRY_PATH = path.join("src", "lib", "publishing", "publishSourceRegistry.json");

export async function readPublishSourceRegistry(root) {
  const registry = JSON.parse(await readFile(path.join(root, REGISTRY_PATH), "utf8"));
  if (registry?.version !== 1 || !Array.isArray(registry.sources)) throw new Error("Publishing source registry is invalid.");
  const ids = new Set();
  for (const source of registry.sources) {
    if (!source?.id || ids.has(source.id)) throw new Error(`Publishing source registry contains an invalid or duplicate ID: ${source?.id ?? "<missing>"}`);
    ids.add(source.id);
  }
  return registry;
}

const MIME_BY_EXTENSION = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".gif": "image/gif", ".avif": "image/avif", ".svg": "image/svg+xml", ".html": "text/html",
  ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".wasm": "application/wasm",
  ".data": "application/octet-stream", ".br": "application/octet-stream", ".unityweb": "application/octet-stream",
};

export function mimeFor(filePath, declared) {
  return declared || MIME_BY_EXTENSION[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

// Adapters that publish an actual image file to public/images/published/**,
// each with a distinct output-path shape. Every other adapter (project
// documents, playable game builds, external embeds, etc.) is out of scope
// for this specific published-image-path computation.
const PUBLISHED_IMAGE_PATH_BY_ADAPTER = {
  "project-covers-indexeddb": (id) => `public/images/published/covers/${id}`,
  "project-covers-disk": (id) => `public/images/published/covers/${id}`,
  "project-body-indexeddb-assets": (id, projectId) => `public/images/published/project-body/${projectId}/${id}`,
  "game-experience-covers": (id) => `public/images/published/game-covers/${id}`,
  "dynamic-template-images": (id, projectId) => `public/images/published/template-images/${projectId}/${id}`,
  "ui-practice-images": (id, projectId) => `public/images/published/template-images/${projectId}/${id}`,
  "playable-game-covers": (id, projectId) => `public/images/published/playable-game-covers/${projectId}/${id}`,
};

export function isPublishedImageAdapter(adapterId) {
  return adapterId in PUBLISHED_IMAGE_PATH_BY_ADAPTER;
}

// Computes the exact production location for an asset this run intends to
// (re-)write. sourcePath is used only for its extension; the id/projectId
// are sanitized the same way V1 did, to keep existing published filenames
// stable across the V1->V2 cutover (parity requires byte-identical paths,
// not just byte-identical content).
export function getPublishedAssetLocation(adapterId, projectId, id, sourcePath) {
  const strategy = PUBLISHED_IMAGE_PATH_BY_ADAPTER[adapterId];
  if (!strategy) throw new Error(`Source adapter ${adapterId} has no published-image output strategy.`);
  const extension = path.extname(sourcePath || "") || ".bin";
  const safeId = String(id || "asset").replace(/[^a-zA-Z0-9._-]+/g, "-");
  const safeProject = String(projectId || "shared").replace(/[^a-zA-Z0-9._-]+/g, "-");
  const relativePath = strategy(`${safeId}${extension}`, safeProject);
  return { relativePath, publicPath: `/${relativePath.replace(/^public\//, "")}` };
}

// The exact shape a declared publicPath must have to be trusted as "this
// reference's own already-published file," per adapter -- captured as two
// groups so the file's basename can be checked against the referenced asset
// id (see resolveAsset.mjs). Moved verbatim from V1's
// PUBLISHED_ASSET_PATH_BY_ADAPTER (publishing-preflight-lib.mjs).
//
// Originally scoped to exactly V1's disk-fallback adapter set --
// project-covers-indexeddb and game-experience-covers still have NO
// server-side disk-fallback in V1 (a known, separately-tracked gap; see
// TASKS.md). project-covers-disk was added deliberately in Publishing
// Architecture V2 (Pre-Cutover Closure) once discoverReferences.mjs gained
// a dedicated projectCoverId/publicUrl reference shape for it -- V1 itself
// discovers project-covers-disk from a separate on-disk manifest
// (content/projects/project-covers.json), never through this pattern, so
// this is a genuinely new V2 capability, not a copied V1 behavior; a real
// currently-published cover still resolves correctly through it either way,
// since the file it points at is the same file regardless of how it was
// discovered.
export const PUBLISHED_ASSET_PATH_PATTERN_BY_ADAPTER = {
  "project-body-indexeddb-assets": /^\/images\/published\/project-body\/([^/]+)\/([^/]+)$/,
  "project-covers-disk": /^\/images\/published\/covers\/([^/]+)$/,
  "dynamic-template-images": /^\/images\/published\/template-images\/([^/]+)\/([^/]+)$/,
  "ui-practice-images": /^\/images\/published\/template-images\/([^/]+)\/([^/]+)$/,
  "playable-game-covers": /^\/images\/published\/playable-game-covers\/([^/]+)\/([^/]+)$/,
};
