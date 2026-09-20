import type { DynamicProjectImageMapping } from "./portfolioContentClient";
import { mergeTemplateInstances, type TemplateInstance } from "./projectTemplateInstances";
import { backfillMatchingTemplateImagePublicPaths } from "./templateImageReferences";
import { hydrateTranslations } from "./translationHydration";

export type DynamicProjectDraft = {
  version: 1;
  templateInstances: TemplateInstance[];
  updatedAt: string;
};

export type DraftLifecycle = "hydrating" | "ready-clean" | "ready-dirty";

export type DraftHydrationResult = {
  draft: DynamicProjectDraft;
  suspiciousLocalDraft: boolean;
  suspiciousReason: string;
  source: "local" | "published" | "empty";
};

export type OrphanedDiskMapping = {
  instanceId: string;
  templateId: string;
  missingItemIds: string[];
  reason: "missing-instance" | "missing-image-row-items";
};

export function emptyDynamicProjectDraft(): DynamicProjectDraft {
  return { version: 1, templateInstances: [], updatedAt: new Date(0).toISOString() };
}

export function normalizeDynamicProjectDraft(parsed: unknown): DynamicProjectDraft | null {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  if (record.version !== 1) return null;
  return {
    version: 1,
    templateInstances: mergeTemplateInstances(record.templateInstances),
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : emptyDynamicProjectDraft().updatedAt,
  };
}

// Surgical Fix: a local draft's template-instance STRUCTURE differing from
// published is not corruption -- it is exactly what every legitimate
// unpublished authoring edit looks like (adding, deleting, reordering, or
// replacing an instance all change the structure by construction). The
// previous version of this function flagged ANY structural difference as
// "suspiciousLocalDraft" and silently discarded the local draft in favor of
// published, which meant deleting a section (for example) never actually
// stuck: the very next time the project was opened, this function handed
// back the pre-deletion published draft. The only structural signal still
// worth treating as corruption is the one genuinely ambiguous-with-a-bug
// case: a local draft that is completely empty while published still has
// real content -- indistinguishable from a known accidental-empty-autosave
// artifact (see the Repair Phase A / "empty sentinel" incident). Every
// other structural difference -- fewer instances, more instances, a
// different order, a changed region/anchor -- is trusted local authoring
// and returned as-is.
export function resolveDevProjectDraft(
  stored: string | null,
  publishedValue: unknown,
): DraftHydrationResult {
  const publishedDraft = normalizeDynamicProjectDraft(publishedValue);
  if (stored === null) {
    return {
      draft: publishedDraft ?? emptyDynamicProjectDraft(),
      suspiciousLocalDraft: false,
      suspiciousReason: "",
      source: publishedDraft ? "published" : "empty",
    };
  }

  let localDraft: DynamicProjectDraft | null = null;
  try {
    localDraft = normalizeDynamicProjectDraft(JSON.parse(stored) as unknown);
  } catch {
    // A malformed local value is preserved in storage and surfaced as
    // suspicious. It is never replaced as a side effect of reading.
  }

  if (!localDraft) {
    // Genuinely malformed/unparsable/wrong-shape local draft -- safe
    // published fallback (never an empty draft, which would otherwise
    // silently wipe out real published content for no reason).
    return {
      draft: publishedDraft ?? emptyDynamicProjectDraft(),
      suspiciousLocalDraft: true,
      suspiciousReason: "The local draft exists but cannot be parsed as a version-1 project draft.",
      source: publishedDraft ? "published" : "empty",
    };
  }

  // Known empty-sentinel artifact: the ONLY structural signal treated as
  // corruption. A local draft with zero instances while published has real
  // content is indistinguishable from the known accidental-empty-autosave
  // bug -- never trusted as a deliberate "clear the whole project" edit.
  const isEmptySentinel = localDraft.templateInstances.length === 0
    && (publishedDraft?.templateInstances.length ?? 0) > 0;

  if (isEmptySentinel) {
    return {
      draft: publishedDraft!,
      suspiciousLocalDraft: true,
      suspiciousReason: "The local draft is empty while the published draft contains project sections.",
      source: "published",
    };
  }

  return {
    draft: publishedDraft
      ? {
          ...localDraft,
          templateInstances: backfillMatchingTemplateImagePublicPaths(
            hydrateTranslations(localDraft.templateInstances, publishedDraft.templateInstances),
            publishedDraft.templateInstances,
          ),
        }
      : localDraft,
    suspiciousLocalDraft: false,
    suspiciousReason: "",
    source: "local",
  };
}

function imageIdOf(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const imageId = (value as Record<string, unknown>).imageId;
  return typeof imageId === "string" ? imageId : "";
}

export function hydrateExistingDiskImageAssets(
  instances: TemplateInstance[],
  mapping: DynamicProjectImageMapping | null,
): { instances: TemplateInstance[]; orphanedMappings: OrphanedDiskMapping[] } {
  if (!mapping) return { instances, orphanedMappings: [] };
  const next = [...instances];
  const orphanedMappings: OrphanedDiskMapping[] = [];
  const diskInstances = Object.values(mapping.instances).sort((a, b) => a.order - b.order);

  for (const disk of diskInstances) {
    const existingIndex = next.findIndex((instance) => instance.instanceId === disk.instanceId);
    if (existingIndex < 0) {
      orphanedMappings.push({
        instanceId: disk.instanceId,
        templateId: disk.templateId,
        missingItemIds: [],
        reason: "missing-instance",
      });
      continue;
    }

    const existing = next[existingIndex];
    if (existing.templateId === "direction-compare" && disk.templateId === "direction-compare") {
      const restoredContent = { ...existing.content };
      for (const field of ["leftImage", "rightImage"] as const) {
        const diskImage = disk.content[field];
        const imageId = imageIdOf(diskImage);
        if (!imageId || !mapping.images[imageId]) continue;
        const localImage = existing.content[field];
        const diskImageRecord = diskImage as Record<string, unknown>;
        restoredContent[field] = localImage && typeof localImage === "object" && !Array.isArray(localImage)
          ? {
              ...diskImageRecord,
              ...(localImage as Record<string, unknown>),
              imageId,
              ...(typeof diskImageRecord.publicPath === "string"
                ? { publicPath: diskImageRecord.publicPath }
                : {}),
            }
          : structuredClone(diskImage);
      }
      next[existingIndex] = { ...existing, content: restoredContent };
      continue;
    }

    if (existing.templateId !== "image-row" || disk.templateId !== "image-row") continue;
    const localItems = Array.isArray(existing.content.items) ? existing.content.items : [];
    const diskItems = Array.isArray(disk.content.items) ? disk.content.items : [];
    const diskById = new Map<string, Record<string, unknown>>();
    for (const value of diskItems) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const record = value as Record<string, unknown>;
      const itemId = typeof record.id === "string" ? record.id : "";
      const imageId = imageIdOf(record.image);
      if (itemId && imageId && mapping.images[imageId]) diskById.set(itemId, record);
    }
    const localIds = new Set(localItems.flatMap((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return [];
      const id = (value as Record<string, unknown>).id;
      return typeof id === "string" ? [id] : [];
    }));
    const missingItemIds = [...diskById.keys()].filter((itemId) => !localIds.has(itemId));
    if (missingItemIds.length > 0) {
      orphanedMappings.push({
        instanceId: disk.instanceId,
        templateId: disk.templateId,
        missingItemIds,
        reason: "missing-image-row-items",
      });
    }
    const hydratedItems = localItems.map((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return value;
      const localItem = value as Record<string, unknown>;
      const itemId = typeof localItem.id === "string" ? localItem.id : "";
      const diskItem = diskById.get(itemId);
      if (!diskItem) return value;
      return { ...diskItem, ...localItem, image: structuredClone(diskItem.image) };
    });
    next[existingIndex] = { ...existing, content: { ...existing.content, items: hydratedItems } };
  }

  return { instances: next, orphanedMappings };
}
