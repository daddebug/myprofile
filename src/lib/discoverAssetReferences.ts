// Browser-side mirror of scripts/publishing/discoverReferences.mjs's
// single-file "asset" reference table ONLY (not asset-tree, not external --
// neither needs browser-side byte collection: external references carry no
// bytes, and asset-tree/game-build content isn't edited through the browser
// at all). Never imported across the toolchain boundary for the same reason
// contentHash.ts/contentHash.mjs are hand-duplicated rather than shared (see
// that file's own comment) -- scripts/ runs raw under Node with no bundler
// and cannot import a Vite-compiled src/lib module, or vice versa.
//
// Used ONLY as a bandwidth optimization in productionBundleExportV2.ts, to
// decide which asset bytes are worth attempting to collect from local
// IndexedDB before export -- NEVER as the authoritative "is this reference
// actually changed" decision. That decision is buildPublishPlan.mjs's alone
// (Publishing Architecture V2, Browser Authority): if this mirror's table
// ever misses a real reference shape, the worst outcome is a missing byte
// that buildPublishPlan.mjs correctly BLOCKs on, never a silently wrong
// publish -- this module has no power to make anything look successful that
// isn't.
export type DiscoveredAssetReference = {
  sourceAdapterId: string;
  assetId: string;
  declaredPublicPath?: string;
  fieldPath: string;
};

const RESOURCE_KEYS = new Set([
  "assetId", "posterAssetId", "imageId", "localImageId", "coverAssetId", "detectedCoverAssetId", "coverId",
]);

export function discoverAssetReferences(value: unknown, context: { projectId?: string } = {}): DiscoveredAssetReference[] {
  const found: DiscoveredAssetReference[] = [];
  walk(value, { projectId: context.projectId, fieldPath: "" }, found);
  return found;
}

function walk(value: unknown, context: { projectId?: string; fieldPath: string }, found: DiscoveredAssetReference[]): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, { ...context, fieldPath: `${context.fieldPath}[${index}]` }, found));
    return;
  }
  const record = value as Record<string, unknown>;
  for (const [key, item] of Object.entries(record)) {
    const fieldPath = context.fieldPath ? `${context.fieldPath}.${key}` : key;
    if (typeof item === "string" && item.trim() && RESOURCE_KEYS.has(key)) {
      const descriptor = describeReference(key, item, record, fieldPath, context);
      if (descriptor) found.push(descriptor);
    }
    walk(item, { ...context, fieldPath }, found);
  }
}

function describeReference(
  key: string,
  item: string,
  record: Record<string, unknown>,
  fieldPath: string,
  context: { projectId?: string },
): DiscoveredAssetReference | null {
  const stringOrUndefined = (v: unknown) => (typeof v === "string" ? v : undefined);
  if (key === "coverId" && typeof record.publicUrl === "string") {
    return { sourceAdapterId: "playable-game-covers", assetId: item, declaredPublicPath: record.publicUrl, fieldPath };
  }
  if (key === "localImageId" || key === "assetId") {
    return { sourceAdapterId: "project-body-indexeddb-assets", assetId: item, declaredPublicPath: stringOrUndefined(record.publicPath), fieldPath };
  }
  if (key === "posterAssetId") {
    return { sourceAdapterId: "project-body-indexeddb-assets", assetId: item, declaredPublicPath: stringOrUndefined(record.posterPublicPath), fieldPath };
  }
  if (key === "coverAssetId" || key === "detectedCoverAssetId") {
    return { sourceAdapterId: "game-experience-covers", assetId: item, declaredPublicPath: stringOrUndefined(record.publicPath) ?? stringOrUndefined(record.publicUrl), fieldPath };
  }
  if (key === "imageId") {
    const adapterId = context.projectId === "ui-personal-practice" ? "ui-practice-images" : "dynamic-template-images";
    return { sourceAdapterId: adapterId, assetId: item, declaredPublicPath: stringOrUndefined(record.publicPath) ?? stringOrUndefined(record.publicUrl), fieldPath };
  }
  return null;
}
