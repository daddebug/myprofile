// Migration-authored provenance. Every migration function records its own
// source-to-destination mapping AS IT BUILDS the document — this file does
// not discover mappings afterward by searching the finished document for
// matching strings. That is a deliberate replacement for the earlier
// value-based reconciliation, which could not distinguish two different
// source fields with identical text, and could not reliably match very
// short strings.

export type ManifestStatus = "exact" | "transformed" | "preserved-hidden" | "intentionally-obsolete" | "missing";
export type ManifestLanguage = "zh" | "en" | "neutral";

export type ManifestEntry = {
  sourcePath: string;
  destinationPath: string;
  sourceValue: string;
  destinationValue: string;
  language: ManifestLanguage;
  visibility: "visible" | "hidden";
  // `group` + indices exist so array/repeated content can be validated for
  // dropped items, duplicates, and reordering — independent of any text
  // comparison. Two entries sharing the same `group` are treated as
  // siblings in the same source array; `sourceIndex` is that array's
  // original position, `destinationIndex` is the position in the resulting
  // document array.
  group?: string;
  sourceIndex?: number;
  destinationIndex?: number;
  assetId?: string;
  link?: string;
  transformationRuleId?: string;
  status: ManifestStatus;
  reason?: string;
};

// Every `transformed` entry must cite one of these. Keeping the registry
// centralized means the set of "documented transformations" is closed and
// auditable — an entry with a transformationRuleId not in this map is a bug
// (validated by the dry-run's "undocumented transformation" check).
export const TRANSFORMATION_RULES: Record<string, string> = {
  "join-lines": "Multiple source list items were joined with newlines into one destination text field (no item was dropped).",
  "join-labelled": "Multiple source fields were combined into one destination field, each prefixed with a label so every value stays legible and distinct.",
  "chapter-title-superseded": "A linked timeline node's label replaced this field as the visible section title; the original value is preserved as a hidden field alongside it.",
  "shared-image-detached": "The source had one image shared across a multi-part block (not one per side); it became its own adjacent media block rather than being attached to a single arbitrary side.",
  "legacy-backup-relocated": "This field is never rendered on the live public page (only inside a collapsed developer-only backup panel) and was moved into a real, hidden block of the matching template inside a dedicated legacy-backup section.",
  "hardcoded-source-reproduced": "This value is not stored in the draft at all — it is hardcoded in the page component's source and reproduced verbatim here since it is genuine visible copy.",
  "folded-into-sibling": "This value is nested inside a different block's body in the live renderer (not shown as its own block) and was appended into that sibling block's body field instead of creating a duplicate block.",
  "english-overlay-default": "This project's live English rendering itself overlays a fixed default translation matched by chapter/block id, rather than a per-field English value stored in the draft — this migration reproduces that same overlay, which is exactly as accurate as what the live English page already shows.",
};

function isRealTransformationRule(id: string | undefined): id is string {
  return typeof id === "string" && id in TRANSFORMATION_RULES;
}

export class ManifestRecorder {
  readonly entries: ManifestEntry[] = [];

  private push(entry: ManifestEntry) {
    // A field with nothing on either side carries no information — skip it
    // rather than clutter the manifest with empty rows.
    if (!entry.sourceValue.trim() && !entry.destinationValue.trim()) return;
    this.entries.push(entry);
  }

  /**
   * Records a direct, authored source -> destination mapping for one text
   * field. Call this at the exact point in a migration function where a
   * source value is placed into the document — never after the fact.
   */
  field(params: {
    sourcePath: string;
    destinationPath: string;
    sourceValue: string;
    destinationValue?: string;
    language: ManifestLanguage;
    visibility?: "visible" | "hidden";
    group?: string;
    sourceIndex?: number;
    destinationIndex?: number;
    assetId?: string;
    link?: string;
    transformationRuleId?: string;
  }) {
    const destinationValue = params.destinationValue ?? params.sourceValue;
    const visibility = params.visibility ?? "visible";
    const transformationRuleId = params.transformationRuleId;
    if (transformationRuleId && !isRealTransformationRule(transformationRuleId)) {
      throw new Error(`Migration bug: transformationRuleId "${transformationRuleId}" is not in TRANSFORMATION_RULES.`);
    }
    const status: ManifestStatus = visibility === "hidden" ? "preserved-hidden" : transformationRuleId ? "transformed" : "exact";
    this.push({
      sourcePath: params.sourcePath, destinationPath: params.destinationPath,
      sourceValue: params.sourceValue, destinationValue,
      language: params.language, visibility,
      group: params.group, sourceIndex: params.sourceIndex, destinationIndex: params.destinationIndex,
      assetId: params.assetId, link: params.link, transformationRuleId,
      status,
    });
  }

  /** A source field that is confirmed non-content technical metadata (an id, a version marker, a slot key) — never rendered, never authored copy. */
  obsolete(sourcePath: string, sourceValue: string, language: ManifestLanguage, reason: string) {
    this.push({ sourcePath, destinationPath: "", sourceValue, destinationValue: "", language, visibility: "hidden", status: "intentionally-obsolete", reason });
  }

  /** A source field this migration could not place anywhere. Presence of any "missing" entry blocks Apply. */
  missing(sourcePath: string, sourceValue: string, language: ManifestLanguage, reason?: string) {
    this.push({ sourcePath, destinationPath: "", sourceValue, destinationValue: "", language, visibility: "visible", status: "missing", reason });
  }
}

export type OrderMismatch = { group: string; detail: string };

/** For every `group`, checks that destination order is a stable sort of source order — i.e. no reordering, and no duplicate/missing index within the group. */
export function computeOrderMismatches(entries: ManifestEntry[]): OrderMismatch[] {
  const groups = new Map<string, ManifestEntry[]>();
  for (const entry of entries) {
    if (!entry.group || entry.sourceIndex === undefined || entry.destinationIndex === undefined) continue;
    if (!groups.has(entry.group)) groups.set(entry.group, []);
    groups.get(entry.group)!.push(entry);
  }
  const mismatches: OrderMismatch[] = [];
  for (const [group, groupEntries] of groups) {
    const seenSource = new Map<number, number>();
    for (const entry of groupEntries) {
      const count = (seenSource.get(entry.sourceIndex!) ?? 0) + 1;
      seenSource.set(entry.sourceIndex!, count);
      if (count > 1) mismatches.push({ group, detail: `source index ${entry.sourceIndex} appears ${count} times (duplicate item / mapped to more than one destination).` });
    }
    const byDestination = [...groupEntries].sort((a, b) => a.destinationIndex! - b.destinationIndex!);
    for (let i = 1; i < byDestination.length; i += 1) {
      if (byDestination[i].sourceIndex! < byDestination[i - 1].sourceIndex!) {
        mismatches.push({ group, detail: `destination order places source index ${byDestination[i].sourceIndex} after source index ${byDestination[i - 1].sourceIndex} — original order was not preserved.` });
      }
    }
  }
  return mismatches;
}

const URL_PATTERN = /https?:\/\/[^\s"'<>]+/g;

function collectUrls(value: unknown, out: Set<string>) {
  if (typeof value === "string") {
    const matches = value.match(URL_PATTERN);
    if (matches) for (const match of matches) out.add(match);
    return;
  }
  if (Array.isArray(value)) { for (const item of value) collectUrls(item, out); return; }
  if (value && typeof value === "object") { for (const v of Object.values(value as Record<string, unknown>)) collectUrls(v, out); }
}

/** Links found in the raw source draft that do not appear anywhere in the migrated document. */
export function computeLinkMismatches(raw: unknown, document: unknown): string[] {
  const sourceLinks = new Set<string>();
  collectUrls(raw, sourceLinks);
  const destinationLinks = new Set<string>();
  collectUrls(document, destinationLinks);
  return [...sourceLinks].filter((link) => !destinationLinks.has(link));
}

export type AssetMismatch = { assetId: string; detail: string };

/** Asset IDs the migration recorded provenance for for, but that never actually landed in the finished document's media. A self-consistency check, independent of whether the legacy IndexedDB blob exists (that is checked separately, against the real browser store). */
export function computeAssetMismatches(entries: ManifestEntry[], documentAssetIds: Set<string>): AssetMismatch[] {
  const mismatches: AssetMismatch[] = [];
  for (const entry of entries) {
    if (!entry.assetId) continue;
    if (!documentAssetIds.has(entry.assetId)) mismatches.push({ assetId: entry.assetId, detail: `recorded at ${entry.sourcePath} -> ${entry.destinationPath}, but "${entry.assetId}" is not attached to any media in the finished document.` });
  }
  return mismatches;
}
