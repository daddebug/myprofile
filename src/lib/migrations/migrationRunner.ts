// Real, in-browser migration runner. This file runs entirely in the
// owner's own browser — it reads the actual localStorage draft and actual
// IndexedDB image blobs for one bespoke project, and (only when explicitly
// confirmed after a passing dry run) writes a ProjectDocument through the
// same `saveProjectDocument` / `putProjectBodyAsset` paths the unified
// editor itself uses. It cannot be exercised against real data from this
// development environment — Claude's sandbox has no access to the owner's
// browser profile — so it must be run and verified by the owner directly.

import { getProjectBodyAsset, putProjectBodyAsset } from "../projectBodyAssetDb";
import { setProjectPublicMetaOverride, type ProjectPublicMetaOverride } from "../projectMetadata";
import { getProjectDocument, saveProjectDocument, validateProjectDocument, type ProjectDocument } from "../projectDocuments";
import { computeAssetMismatches, computeLinkMismatches, computeOrderMismatches, TRANSFORMATION_RULES, type AssetMismatch, type ManifestEntry, type OrderMismatch } from "./manifestRecorder";

export type { ManifestEntry, AssetMismatch, OrderMismatch } from "./manifestRecorder";

export type LegacyImageRecord = { id: string; blob: Blob; fileName: string; mimeType: string; size: number; updatedAt: string };
type MetaPatch = Omit<ProjectPublicMetaOverride, "projectId" | "updatedAt">;

export type MigrationAdapter = {
  projectId: string;
  labelZh: string;
  labelEn: string;
  storageKey: string;
  dbName: string;
  storeName: string;
  loadRawDraft: () => unknown;
  runMigration: (rawDraft: unknown) => { document: ProjectDocument; metaOverride: MetaPatch; warnings: string[]; manifest: ManifestEntry[] };
  // Fields that are genuinely unmappable — no destination exists anywhere in
  // the migrated document, not even the hidden "Unplaced migrated content"
  // section (e.g. fixed source-controlled data that was never part of the
  // draft to begin with). See each migration file's header comment for why.
  // Content that WAS in the draft but isn't rendered publicly is not listed
  // here — it has a real destination in the unplaced section instead.
  knownUnmappedFields: string[];
  getAllLegacyImages: () => Promise<LegacyImageRecord[]>;
  getLegacyImage: (id: string) => Promise<LegacyImageRecord | undefined>;
};

export const migrationAdapters: MigrationAdapter[] = [];

const NON_CONTENT_KEYS = new Set([
  "id", "type", "layout", "variant", "cropMode", "focalPosition", "aspectRatio", "nodeType", "order", "emphasis",
  "visibility", "schemaVersion", "templateId", "templateVersionUsed", "localeStrategy", "version", "updatedAt",
  "projectId", "status", "isIntervention", "targetSectionId", "assetId", "localImageId", "publicPath",
  "imageSlotKey", "demoImageSlotKey", "slotKey",
]);

function collectSourceStats(value: unknown, imageIds: Set<string>, links: Set<string>): number {
  let count = 0;
  if (Array.isArray(value)) {
    for (const item of value) count += collectSourceStats(item, imageIds, links);
    return count;
  }
  if (value && typeof value === "object") {
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      if (key === "localImageId" && typeof raw === "string" && raw) imageIds.add(raw);
      if (typeof raw === "string") {
        if (/^https?:\/\//.test(raw)) links.add(raw);
        if (!NON_CONTENT_KEYS.has(key) && raw.trim()) count += 1;
        continue;
      }
      count += collectSourceStats(raw, imageIds, links);
    }
  }
  return count;
}

function collectDocumentStats(document: ProjectDocument) {
  let zh = 0;
  let en = 0;
  let hiddenBlocks = 0;
  let hiddenSections = 0;
  const imageIds = new Set<string>();
  const addText = (value?: { zh: string; en: string }) => {
    if (!value) return;
    if (value.zh.trim()) zh += 1;
    if (value.en.trim()) en += 1;
  };
  const addMedia = (media?: { alt: { zh: string; en: string }; caption: { zh: string; en: string }; assetId?: string }) => {
    if (!media) return;
    addText(media.alt);
    addText(media.caption);
    if (media.assetId) imageIds.add(media.assetId);
  };
  for (const section of document.sections) {
    addText(section.title);
    if (section.visibility === "hidden") hiddenSections += 1;
    for (const block of section.blocks) {
      const content = block.content;
      if (block.visibility === "hidden") hiddenBlocks += 1;
      addText(content.eyebrow);
      addText(content.title);
      addText(content.body);
      addText(content.secondaryBody);
      addText(content.footnote);
      addText(content.quoteAttribution);
      for (const item of content.items ?? []) { addText(item.title); addText(item.description); addText(item.date); }
      for (const media of content.media ?? []) addMedia(media);
      for (const node of content.nodes ?? []) { addText(node.title); addText(node.description); }
      for (const column of content.comparisonColumns ?? []) { addText(column.title); addText(column.description); addMedia(column.media); }
      for (const column of content.matrixColumns ?? []) addText(column);
      for (const row of content.matrixRows ?? []) for (const cell of row.cells) addText(cell);
      for (const item of content.timelineItems ?? []) { addText(item.date); addText(item.label); addText(item.description); }
      for (const item of content.annotatedImages ?? []) { addText(item.title); addText(item.description); addMedia(item.media); }
      for (const list of content.boundaryLists ?? []) { addText(list.label); for (const li of list.items) addText(li); }
      for (const card of content.groupedCards ?? []) { addText(card.title); addText(card.meta); for (const sub of card.subItems) { addText(sub.title); addText(sub.description); } }
      for (const item of content.imageSlotItems ?? []) { addText(item.label); addMedia(item.media); }
      for (const node of content.thinkingMapNodes ?? []) { addText(node.label); addText(node.body); }
      for (const tab of content.tabs ?? []) { addText(tab.label); addText(tab.body); }
    }
  }
  return { zh, en, imageIds, hiddenBlocks, hiddenSections };
}

// Every migration function now records its own source -> destination
// mapping AS IT BUILDS the document (see manifestRecorder.ts) — this file
// only consumes that authored `manifest`, plus three independent
// self-consistency checks on top of it (order, asset, link). It no longer
// discovers mappings after the fact by matching string values, which could
// not distinguish two different source fields with identical text and could
// not reliably match very short strings.
function computeUndocumentedTransformations(entries: ManifestEntry[]): ManifestEntry[] {
  return entries.filter((entry) => entry.status === "transformed" && (!entry.transformationRuleId || !(entry.transformationRuleId in TRANSFORMATION_RULES)));
}

export type DryRunReport = {
  adapter: MigrationAdapter;
  document: ProjectDocument;
  metaOverride: MetaPatch;
  resultingSectionCount: number;
  resultingBlockCount: number;
  hiddenSectionCount: number;
  hiddenBlockCount: number;
  sourceTextFieldCount: number;
  migratedTextFieldCountZh: number;
  migratedTextFieldCountEn: number;
  imageIdsFound: string[];
  imageIdsMissing: string[];
  links: string[];
  warnings: string[];
  unmappedFields: string[];
  documentValid: boolean;
  manifest: ManifestEntry[];
  manifestExactCount: number;
  manifestTransformedCount: number;
  manifestPreservedHiddenCount: number;
  manifestIntentionallyObsoleteCount: number;
  manifestMissingCount: number;
  orderMismatches: OrderMismatch[];
  assetMismatches: AssetMismatch[];
  linkMismatches: string[];
  undocumentedTransformations: ManifestEntry[];
  blockingReasons: string[];
};

export async function runDryRun(adapter: MigrationAdapter): Promise<DryRunReport> {
  const raw = adapter.loadRawDraft();
  const imageIds = new Set<string>();
  const links = new Set<string>();
  const sourceTextFieldCount = collectSourceStats(raw, imageIds, links);

  const { document, metaOverride, warnings, manifest } = adapter.runMigration(raw);
  const docStats = collectDocumentStats(document);
  const manifestExact = manifest.filter((entry) => entry.status === "exact");
  const manifestTransformed = manifest.filter((entry) => entry.status === "transformed");
  const manifestPreservedHidden = manifest.filter((entry) => entry.status === "preserved-hidden");
  const manifestIntentionallyObsolete = manifest.filter((entry) => entry.status === "intentionally-obsolete");
  const manifestMissing = manifest.filter((entry) => entry.status === "missing");
  const orderMismatches = computeOrderMismatches(manifest);
  const linkMismatches = computeLinkMismatches(raw, document);
  const assetMismatches = computeAssetMismatches(manifest, docStats.imageIds);
  const undocumentedTransformations = computeUndocumentedTransformations(manifest);

  const legacyImages = await adapter.getAllLegacyImages();
  const availableIds = new Set(legacyImages.map((record) => record.id));
  const imageIdsMissing = [...imageIds].filter((id) => !availableIds.has(id));

  const validated = validateProjectDocument(document);
  const blockingReasons: string[] = [];
  if (imageIdsMissing.length) blockingReasons.push(`${imageIdsMissing.length} referenced image ID(s) have no matching blob in the source image store: ${imageIdsMissing.join(", ")}.`);
  if (!validated) blockingReasons.push("The generated document did not pass validateProjectDocument (the same check the real save path uses).");
  if (sourceTextFieldCount > 0 && docStats.zh === 0 && docStats.en === 0) blockingReasons.push("The generated document has no migrated text at all, but the source draft has text — refusing to continue.");
  if (manifestMissing.length) blockingReasons.push(`${manifestMissing.length} source field(s) the migration itself could not place anywhere: ${manifestMissing.slice(0, 5).map((entry) => entry.sourcePath).join(", ")}${manifestMissing.length > 5 ? ", …" : ""}.`);
  if (orderMismatches.length) blockingReasons.push(`${orderMismatches.length} order mismatch(es) in repeated/array content: ${orderMismatches.slice(0, 3).map((m) => `[${m.group}] ${m.detail}`).join(" ")}${orderMismatches.length > 3 ? " …" : ""}`);
  if (assetMismatches.length) blockingReasons.push(`${assetMismatches.length} asset mismatch(es) — an image ID was recorded in the manifest but never attached to any media in the finished document: ${assetMismatches.slice(0, 3).map((m) => m.assetId).join(", ")}${assetMismatches.length > 3 ? ", …" : ""}.`);
  if (linkMismatches.length) blockingReasons.push(`${linkMismatches.length} link(s) found in the source draft that do not appear anywhere in the migrated document: ${linkMismatches.slice(0, 3).join(", ")}${linkMismatches.length > 3 ? ", …" : ""}.`);
  if (undocumentedTransformations.length) blockingReasons.push(`${undocumentedTransformations.length} manifest entry(ies) are marked "transformed" without a valid, registered transformation rule: ${undocumentedTransformations.slice(0, 3).map((entry) => entry.sourcePath).join(", ")}${undocumentedTransformations.length > 3 ? ", …" : ""}.`);

  return {
    adapter, document, metaOverride,
    resultingSectionCount: document.sections.length,
    resultingBlockCount: document.sections.reduce((sum, section) => sum + section.blocks.length, 0),
    hiddenSectionCount: docStats.hiddenSections,
    hiddenBlockCount: docStats.hiddenBlocks,
    sourceTextFieldCount,
    migratedTextFieldCountZh: docStats.zh,
    migratedTextFieldCountEn: docStats.en,
    imageIdsFound: [...imageIds],
    imageIdsMissing,
    links: [...links],
    warnings,
    unmappedFields: adapter.knownUnmappedFields,
    documentValid: validated !== null,
    manifest,
    manifestExactCount: manifestExact.length,
    manifestTransformedCount: manifestTransformed.length,
    manifestPreservedHiddenCount: manifestPreservedHidden.length,
    manifestIntentionallyObsoleteCount: manifestIntentionallyObsolete.length,
    manifestMissingCount: manifestMissing.length,
    orderMismatches,
    assetMismatches,
    linkMismatches,
    undocumentedTransformations,
    blockingReasons,
  };
}

export type MigrationBackup = {
  createdAt: string;
  projectId: string;
  storageKey: string;
  originalDraftJson: unknown;
  imageManifest: Array<{ id: string; dbName: string; storeName: string; fileName: string; mimeType: string; size: number; updatedAt: string; projectId: string }>;
  fieldManifest: ManifestEntry[];
};

export async function buildBackup(adapter: MigrationAdapter, report?: DryRunReport): Promise<MigrationBackup> {
  const originalDraftJson = typeof window === "undefined" ? null : JSON.parse(window.localStorage.getItem(adapter.storageKey) ?? "null");
  const images = await adapter.getAllLegacyImages();
  return {
    createdAt: new Date().toISOString(),
    projectId: adapter.projectId,
    storageKey: adapter.storageKey,
    originalDraftJson,
    imageManifest: images.map((record) => ({
      id: record.id, dbName: adapter.dbName, storeName: adapter.storeName,
      fileName: record.fileName, mimeType: record.mimeType, size: record.size, updatedAt: record.updatedAt,
      projectId: adapter.projectId,
    })),
    fieldManifest: report?.manifest ?? [],
  };
}

export function downloadBackup(backup: MigrationBackup) {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${backup.projectId}-migration-backup-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export type ApplyResult = { success: true; verified: boolean } | { success: false; error: string };

export async function applyMigration(report: DryRunReport): Promise<ApplyResult> {
  if (report.blockingReasons.length) {
    return { success: false, error: `Migration blocked: ${report.blockingReasons.join(" ")}` };
  }
  try {
    const legacyImages = await report.adapter.getAllLegacyImages();
    const byId = new Map(legacyImages.map((record) => [record.id, record]));
    for (const id of report.imageIdsFound) {
      const existing = await getProjectBodyAsset(id);
      if (existing) continue; // never duplicate an already-copied blob
      const record = byId.get(id);
      if (!record) continue; // already reported as missing by the dry run; apply() is blocked in that case
      const file = new File([record.blob], record.fileName || `${id}.bin`, { type: record.mimeType || record.blob.type });
      await putProjectBodyAsset(report.adapter.projectId, id, file);
    }

    saveProjectDocument(report.document);
    setProjectPublicMetaOverride(report.adapter.projectId, report.metaOverride);

    const reread = getProjectDocument(report.adapter.projectId);
    const verified = Boolean(reread)
      && reread!.sections.length === report.document.sections.length
      && reread!.sections.reduce((sum, section) => sum + section.blocks.length, 0) === report.resultingBlockCount;

    return { success: true, verified };
  } catch (reason) {
    return { success: false, error: reason instanceof Error ? reason.message : "Unknown error while applying the migration." };
  }
}
