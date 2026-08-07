// Project-level "template instance" data — the layer that lets a real
// project page hold one or more independent uses of a Template Library
// template (project-header, image-row, etc.), each with its own saved
// content, appended alongside that page's existing hand-authored content.
//
// This is deliberately just a plain array living on each page's own
// existing draft object (CrossPlatformDraft.templateInstances,
// ThreeDCharacterDraft.templateInstances) — saved through that page's own
// existing autosave-to-localStorage pipeline. It is not a new storage
// system: no new keys, no new database.
//
// Placement is anchor-based rather than index-based so a saved instance's
// position survives edits to the surrounding legacy content: each instance
// belongs to a "region" (one existing legacy content list — e.g. one
// intervention section, one chapter) and is anchored either to a specific
// legacy block's id (meaning "immediately before that block") or to the
// region-end sentinel (meaning "after all legacy content in this region").
// Multiple instances anchored to the same point keep their relative order
// via their position in this array.
// layoutSettings is a sibling of content, not part of it — it holds purely
// visual per-instance overrides (currently just horizontalInset) rather
// than authored content, so it's kept out of sampleContentFor/content
// diffing entirely. Absent means "use this template's current saved
// default" (see templateLayoutDefaults.ts) — it is only ever written once
// the owner explicitly edits this specific instance's own inset.
export type TemplateInstanceLayoutSettings = {
  horizontalInset?: number;
};

export type TemplateInstance = {
  instanceId: string;
  templateId: string;
  regionId: string;
  anchorId: string;
  content: Record<string, unknown>;
  layoutSettings?: TemplateInstanceLayoutSettings;
};

export const REGION_END_ANCHOR = "__end__";

export function legacyAnchor(blockId: string): string {
  return `legacy:${blockId}`;
}

export function createInstanceId(templateId: string): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${templateId}-${random}`;
}

function mergeLayoutSettings(value: unknown): TemplateInstanceLayoutSettings | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.horizontalInset !== "number" || !Number.isFinite(record.horizontalInset)) return undefined;
  return { horizontalInset: Math.max(0, record.horizontalInset) };
}

export function mergeTemplateInstances(value: unknown): TemplateInstance[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): TemplateInstance[] => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    if (
      typeof record.instanceId !== "string"
      || typeof record.templateId !== "string"
      || !record.content
      || typeof record.content !== "object"
    ) return [];
    const layoutSettings = mergeLayoutSettings(record.layoutSettings);
    return [{
      instanceId: record.instanceId,
      templateId: record.templateId,
      regionId: typeof record.regionId === "string" ? record.regionId : "",
      anchorId: typeof record.anchorId === "string" && record.anchorId ? record.anchorId : REGION_END_ANCHOR,
      content: record.content as Record<string, unknown>,
      ...(layoutSettings ? { layoutSettings } : {}),
    }];
  });
}

// --- Ordered-flow helpers shared by every region's insert / move / remove ---

export type FlowUnit =
  | { kind: "legacy"; id: string }
  | { kind: "instance"; instanceId: string };

export function buildFlowUnits(
  legacyBlockIds: string[],
  regionId: string,
  instances: TemplateInstance[],
): FlowUnit[] {
  const regionInstances = instances.filter((instance) => instance.regionId === regionId);
  const knownAnchors = new Set([
    ...legacyBlockIds.map(legacyAnchor),
    REGION_END_ANCHOR,
  ]);
  const bucket = (anchorId: string): FlowUnit[] =>
    regionInstances
      .filter((instance) => instance.anchorId === anchorId)
      .map((instance) => ({ kind: "instance", instanceId: instance.instanceId }));

  const units: FlowUnit[] = [];
  for (const blockId of legacyBlockIds) {
    units.push(...bucket(legacyAnchor(blockId)));
    units.push({ kind: "legacy", id: blockId });
  }
  units.push(...bucket(REGION_END_ANCHOR));
  // A removed legacy comparison must not make an attached direction compare
  // disappear. Keep only that template visible at the end until its next
  // explicit move assigns a current anchor.
  units.push(...regionInstances
    .filter((instance) => instance.templateId === "direction-compare" && !knownAnchors.has(instance.anchorId))
    .map((instance) => ({ kind: "instance" as const, instanceId: instance.instanceId })));
  return units;
}

// Given units in their desired final order, work out where each instance
// should be anchored (immediately before the next legacy block, or the
// region-end sentinel) and the new relative order of instances.
export function deriveFromUnits(units: FlowUnit[]): { anchors: Map<string, string>; order: string[] } {
  const anchors = new Map<string, string>();
  let nextLegacyId: string | null = null;
  for (let index = units.length - 1; index >= 0; index -= 1) {
    const unit = units[index];
    if (unit.kind === "legacy") {
      nextLegacyId = unit.id;
    } else {
      anchors.set(unit.instanceId, nextLegacyId ? legacyAnchor(nextLegacyId) : REGION_END_ANCHOR);
    }
  }
  const order = units
    .filter((unit): unit is { kind: "instance"; instanceId: string } => unit.kind === "instance")
    .map((unit) => unit.instanceId);
  return { anchors, order };
}

// Anchor + relative order that a NEW instance should get if inserted at
// flow position `index` (0..units.length, inclusive of the trailing end).
export function anchorForInsertPosition(units: FlowUnit[], index: number): string {
  for (let cursor = index; cursor < units.length; cursor += 1) {
    const unit = units[cursor];
    if (unit.kind === "legacy") return legacyAnchor(unit.id);
  }
  return REGION_END_ANCHOR;
}

// Applies a region's freshly-derived anchors + relative order back onto the
// full project-level instances array. Other regions are left untouched —
// their relative order among themselves never mattered to this region.
export function applyRegionOrder(
  allInstances: TemplateInstance[],
  regionId: string,
  anchors: Map<string, string>,
  order: string[],
): TemplateInstance[] {
  const others = allInstances.filter((instance) => instance.regionId !== regionId);
  const byId = new Map(allInstances.map((instance) => [instance.instanceId, instance] as const));
  const updatedRegion = order.flatMap((instanceId) => {
    const instance = byId.get(instanceId);
    if (!instance) return [];
    const anchorId = anchors.get(instanceId) ?? instance.anchorId;
    return [{ ...instance, anchorId }];
  });
  return [...others, ...updatedRegion];
}
