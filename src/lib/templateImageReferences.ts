// Single shared image-reference extractor for TemplateInstance content —
// used instead of separate, incomplete image-detection logic inside each
// template component. Pure data-in/data-out (no DOM, no fetch), so it can
// run both client-side and server-side (scripts/portfolioCollectionExportPlugin.ts
// reads a dynamic project's staged draft.json and runs this same function
// against it, in Node, over the plain JSON — no React/browser needed).
//
// Audited every registered template contract (src/lib/templateLibrary.ts's
// getRegisteredTemplates()) for image-carrying fields:
//   project-header, statement-longform, xmind-breakdown, supporting-note,
//   phase-milestones, circle-summary, decision-table, process-flow
//     -> no image fields (confirmed: no `type: "image"` schema entries).
//   image-row       -> content.items[].image: { publicPath }
//   figma-prototype -> content.fallbackImage: { publicPath }
//   playable-game   -> content.cover: { coverId, publicUrl }
//   direction-compare -> content.leftImage / content.rightImage: { imageId, publicPath }
// Four different field-naming conventions across four templates is exactly
// why this walks generically instead of hardcoding one shape per template:
// a future template only needs to use one of the field names below (or
// nest an object that does) and it's picked up automatically, with no
// changes needed here.

export type CollectedTemplateImageReference = {
  projectId: string;
  templateInstanceId: string;
  templateId: string;
  slotId: string;
  imageId?: string;
  localImageId?: string;
  publicPath?: string;
  src?: string;
  coverId?: string;
  publicUrl?: string;
};

export type MinimalTemplateInstance = {
  instanceId: string;
  templateId: string;
  content: Record<string, unknown>;
};

const TEMPLATE_IMAGE_IDENTITY_FIELDS = ["imageId", "localImageId"] as const;

function collectPublishedPathsByIdentity(value: unknown, paths: Map<string, string>) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectPublishedPathsByIdentity(item, paths));
    return;
  }
  if (!isPlainObject(value)) return;
  const publicPath = typeof value.publicPath === "string" && value.publicPath.trim()
    ? value.publicPath
    : null;
  if (publicPath) {
    for (const field of TEMPLATE_IMAGE_IDENTITY_FIELDS) {
      const identity = value[field];
      if (typeof identity === "string" && identity) paths.set(`${field}:${identity}`, publicPath);
    }
  }
  for (const nested of Object.values(value)) collectPublishedPathsByIdentity(nested, paths);
}

function backfillPublicPaths(value: unknown, paths: Map<string, string>): unknown {
  if (Array.isArray(value)) return value.map((item) => backfillPublicPaths(item, paths));
  if (!isPlainObject(value)) return value;
  const next = Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [key, backfillPublicPaths(nested, paths)]),
  );
  if (typeof value.publicPath === "string" && value.publicPath.trim()) return next;
  const matchingPaths = TEMPLATE_IMAGE_IDENTITY_FIELDS.flatMap((field) => {
    const identity = value[field];
    if (typeof identity !== "string" || !identity) return [];
    const publicPath = paths.get(`${field}:${identity}`);
    return publicPath ? [publicPath] : [];
  });
  if (matchingPaths.length > 0 && matchingPaths.every((path) => path === matchingPaths[0])) {
    next.publicPath = matchingPaths[0];
  }
  return next;
}

// A legacy browser draft may retain a stable image identity while lacking
// the canonical publicPath already present in the published copy of that
// same template instance. Backfill only that missing path, only inside the
// same instance/template, and only when the image identity matches exactly.
// This is a read-time normalization: it never mutates either input.
export function backfillMatchingTemplateImagePublicPaths<T extends MinimalTemplateInstance>(
  draftInstances: T[],
  publishedInstances: MinimalTemplateInstance[],
): T[] {
  const publishedByInstance = new Map(
    publishedInstances.map((instance) => [`${instance.templateId}:${instance.instanceId}`, instance] as const),
  );
  return draftInstances.map((instance) => {
    const published = publishedByInstance.get(`${instance.templateId}:${instance.instanceId}`);
    if (!published) return instance;
    const paths = new Map<string, string>();
    collectPublishedPathsByIdentity(published.content, paths);
    if (paths.size === 0) return instance;
    return { ...instance, content: backfillPublicPaths(instance.content, paths) as Record<string, unknown> };
  });
}

// Every field name any audited template (or the legacy DraftImage slot
// shape) uses to reference an image. A raw-data object counts as an
// "image reference" the moment it carries ANY of these, even if every
// other expected field on it is missing — never require all of them.
const IMAGE_REFERENCE_FIELDS = ["imageId", "localImageId", "publicPath", "src", "coverId", "publicUrl"] as const;
type ImageReferenceField = (typeof IMAGE_REFERENCE_FIELDS)[number];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function referenceFieldsOf(value: Record<string, unknown>): Partial<Record<ImageReferenceField, string>> {
  const fields: Partial<Record<ImageReferenceField, string>> = {};
  for (const field of IMAGE_REFERENCE_FIELDS) {
    const raw = value[field];
    if (typeof raw === "string" && raw.length > 0) fields[field] = raw;
  }
  return fields;
}

function looksLikeImageReferenceObject(value: Record<string, unknown>): boolean {
  return IMAGE_REFERENCE_FIELDS.some((field) => field in value);
}

function walk(
  value: unknown,
  path: string,
  base: { projectId: string; templateInstanceId: string; templateId: string },
  collected: CollectedTemplateImageReference[],
  depth: number,
) {
  if (depth > 12) return; // defensive bound against pathological/cyclical content
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, `${path}[${index}]`, base, collected, depth + 1));
    return;
  }
  if (!isPlainObject(value)) return;
  if (looksLikeImageReferenceObject(value)) {
    collected.push({ ...base, slotId: path || "content", ...referenceFieldsOf(value) });
    // Don't also recurse into a matched reference object's own children —
    // none of the audited schemas nest a second reference inside one
    // (e.g. image.thumbnail.publicPath), and stopping here keeps one raw
    // reference from ever being reported as two slots.
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    walk(nested, path ? `${path}.${key}` : key, base, collected, depth + 1);
  }
}

// Extracts every image reference across a project's whole set of template
// instances — the ground truth for "what images does this project's raw
// data actually claim to have", independent of whether any component
// managed to render them.
export function extractTemplateImageReferences(
  projectId: string,
  templateInstances: MinimalTemplateInstance[],
): CollectedTemplateImageReference[] {
  const collected: CollectedTemplateImageReference[] = [];
  for (const instance of templateInstances) {
    walk(instance.content, "", { projectId, templateInstanceId: instance.instanceId, templateId: instance.templateId }, collected, 0);
  }
  return collected;
}

export function hasAnyImageReferenceField(reference: CollectedTemplateImageReference): boolean {
  return IMAGE_REFERENCE_FIELDS.some((field) => Boolean(reference[field]));
}

// ProjectDocument's own asset fields (assetId/publicPath, posterAssetId/
// posterPublicPath — see collectionExportStaging.ts's documentAssetFields)
// aren't in IMAGE_REFERENCE_FIELDS above (that list is scoped to
// TemplateInstance template contracts) — walk() still matches them fine
// since it only needs ANY of its own known field names present, and
// assetId/posterAssetId aren't among them, so a document-only reference
// with just {assetId, publicPath} would already be caught via publicPath.
// This dedicated entry point exists for the two things a generic walk over
// TemplateInstance content can't give: a ProjectDocument's block id/type as
// the reference's identity (not an instanceId/templateId), and coverage of
// posterAssetId-only references before any publicPath is resolved.
export type MinimalDocumentSection = { blocks: Array<{ id: string; type: string; content: Record<string, unknown> }> };
export type MinimalProjectDocument = { sections: MinimalDocumentSection[] };
const DOCUMENT_ONLY_ID_FIELDS = ["assetId", "posterAssetId"] as const;

function looksLikeDocumentImageReferenceObject(value: Record<string, unknown>): boolean {
  return looksLikeImageReferenceObject(value) || DOCUMENT_ONLY_ID_FIELDS.some((field) => field in value);
}

function walkDocument(
  value: unknown,
  path: string,
  base: { projectId: string; templateInstanceId: string; templateId: string },
  collected: CollectedTemplateImageReference[],
  depth: number,
) {
  if (depth > 12) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkDocument(item, `${path}[${index}]`, base, collected, depth + 1));
    return;
  }
  if (!isPlainObject(value)) return;
  if (looksLikeDocumentImageReferenceObject(value)) {
    const assetId = typeof value.assetId === "string" ? value.assetId : undefined;
    const posterAssetId = typeof value.posterAssetId === "string" ? value.posterAssetId : undefined;
    const publicPath = typeof value.publicPath === "string" ? value.publicPath : undefined;
    const posterPublicPath = typeof value.posterPublicPath === "string" ? value.posterPublicPath : undefined;
    collected.push({
      ...base,
      slotId: path || "content",
      ...referenceFieldsOf(value),
      // assetId/posterAssetId key into the same projectBodyAssetDb store as
      // imageId/localImageId (see collectionExportStaging.ts) — reused here
      // as imageId/localImageId respectively so downstream staged-asset
      // lookups (which only check those two fields) still find them.
      imageId: assetId ?? undefined,
      localImageId: posterAssetId ?? undefined,
      publicPath: publicPath ?? posterPublicPath,
    });
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    walkDocument(nested, path ? `${path}.${key}` : key, base, collected, depth + 1);
  }
}

// Same ground-truth extraction as extractTemplateImageReferences, but for a
// ProjectDocument's block tree instead of a TemplateInstance array.
// templateInstanceId/templateId are reused to carry the block's id/type (no
// separate field added) since both are just "id of the content-bearing
// unit" / "its kind" for reporting purposes.
export function extractProjectDocumentImageReferences(
  projectId: string,
  document: MinimalProjectDocument,
): CollectedTemplateImageReference[] {
  const collected: CollectedTemplateImageReference[] = [];
  for (const section of document.sections ?? []) {
    for (const block of section.blocks ?? []) {
      walkDocument(block.content, "", { projectId, templateInstanceId: block.id, templateId: block.type }, collected, 0);
    }
  }
  return collected;
}
