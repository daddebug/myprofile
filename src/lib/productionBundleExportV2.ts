// EditBundle V2 exporter (Publishing Architecture V2, Phase 7/D). Parallel
// to, and independent of, the real V1 exportProductionBundle()
// (productionBundleExport.ts) -- V1 stays frozen and fully usable for
// parity; this file is not wired into the live launcher/publish flow yet.
//
// This exporter's ENTIRE job is to package what the Dirty Intent Store
// already knows into an EditBundle. It deliberately:
//   - only READS from the Dirty Intent Store, never writes to it
//   - never invents or re-captures a baseContentHash (that happens once, at
//     first-dirty-mutation time -- see publishIntent.ts / dirtyIntentStore.ts)
//   - never decides final UPDATED/UNCHANGED status (buildPublishPlan.mjs's job)
//   - never sends the whole Game Experience store -- only records that
//     actually have an open dirty intent
//   - never dumps every historical asset into newAssets -- only bytes for
//     references discovered inside a currently-dirty entity's edited
//     content, and even then only as a best-effort optimization: which of
//     those references are truly "changed" vs. "inherited" is still decided
//     server-side by buildPublishPlan.mjs alone (Browser Authority), not
//     here -- a byte collected here that turns out to be for an unchanged
//     reference is simply ignored there, never trusted as the deciding signal
import { collectChangedAsset, collectChangedProjectCover } from "./collectChangedAsset";
import { discoverAssetReferences } from "./discoverAssetReferences";
import { listDirtyIntents, type DirtyIntentEntry } from "./dirtyIntentStore";
import { getGameExperienceStore } from "./gameExperience";
import { toPublishableGameExperienceRecord, type PublishableGameExperienceRecord } from "./gameExperiencePublishSchema";
import { getProjectDocument, type ProjectDocument } from "./projectDocuments";
import { readProjectPublicMetaOverrides } from "./projectMetadata";
import { getPublishedProjectCover } from "./publishedPortfolio";

export type EntityIntentV2<T> =
  | { kind: "UPSERT"; baseContentHash: string; value: T }
  | { kind: "UNPUBLISH"; baseContentHash: string }
  | { kind: "DELETE"; baseContentHash: string };

// A project's body is EITHER a DynamicProjectDraft (TemplateInstance-based
// pages) OR a legacy ProjectDocument (bespoke pages) -- never both. Folding
// ProjectDocument in here, rather than giving it a separate entity type, is
// deliberate: it is still the SAME "project" entity (Phase A -- "no longer a
// side-channel outside of projects"), just a different body representation
// depending on which editor authored it.
// The cover is shaped as { projectCoverId, publicUrl } -- the exact shape
// discoverReferences.mjs recognizes as a project-covers-disk reference
// (Publishing Architecture V2, Pre-Cutover Closure) -- so buildPublishPlan.mjs
// discovers and resolves it through the same generic path as every other
// single-file reference, with no project-cover-specific handling anywhere
// downstream of this shape.
export type ProjectEditValue = {
  meta: unknown;
  body: unknown;
  cover: { projectCoverId: string; publicUrl: string } | undefined;
};

export type EditBundleAsset = {
  sourceAdapterId: string;
  assetId: string;
  fileName: string;
  mimeType: string;
  dataBase64: string;
};

export type EditBundleV2 = {
  version: 2;
  // Whole-state fast-path conflict-check optimization -- deliberately not
  // implemented yet (buildPublishPlan.mjs's Window-1 check works correctly,
  // if less cheaply, on a per-entity basis alone; see its own comments).
  baseRevision: null;
  exportedAt: string;
  publishingRegistryVersion: number;
  projects: Record<string, EntityIntentV2<ProjectEditValue>>;
  gameExperienceRecords: Record<string, EntityIntentV2<PublishableGameExperienceRecord>>;
  // UI Practice has no real browser mutation path in the current app (its
  // metadata is a static, source-controlled JSON file -- see
  // uiPracticeCatalog.ts) -- structurally supported (buildPublishPlan.mjs
  // can process a uiPractice intent generically, same as any other entity)
  // but never actually populated by this exporter today, since nothing ever
  // opens a dirty intent for it. Kept as an explicit, always-empty field
  // rather than omitted, so its absence is visibly "nothing to report," not
  // "forgotten."
  uiPractice: Record<string, EntityIntentV2<unknown>>;
  newAssets: EditBundleAsset[];
  diagnostics: { browserObservations: string[] };
};

// Pure assembly: takes already-read local state in, produces the bundle out.
// No localStorage/IndexedDB access of its own -- directly unit-testable
// without a browser (see scripts/publishing/__tests__/intentIntegration.test.ts).
export function assembleEditBundleV2(input: {
  exportedAt: string;
  publishingRegistryVersion: number;
  dirtyProjectIntents: DirtyIntentEntry[];
  dirtyGameExperienceIntents: DirtyIntentEntry[];
  dirtyUiPracticeIntents?: DirtyIntentEntry[];
  readLocalProjectMeta: (projectId: string) => unknown;
  readLocalProjectBody: (projectId: string) => unknown;
  readLocalProjectCover: (projectId: string) => { projectCoverId: string; publicUrl: string } | undefined;
  readLocalGameExperienceRecord: (recordId: string) => PublishableGameExperienceRecord | undefined;
  readLocalUiPractice?: (entityId: string) => unknown;
  newAssets: EditBundleAsset[];
  browserObservations: string[];
}): EditBundleV2 {
  const projects: EditBundleV2["projects"] = {};
  for (const entry of input.dirtyProjectIntents) {
    if (entry.kind === "UPSERT") {
      projects[entry.entityId] = {
        kind: "UPSERT",
        baseContentHash: entry.baseContentHash,
        value: {
          meta: input.readLocalProjectMeta(entry.entityId),
          body: input.readLocalProjectBody(entry.entityId),
          cover: input.readLocalProjectCover(entry.entityId),
        },
      };
    } else {
      projects[entry.entityId] = { kind: entry.kind, baseContentHash: entry.baseContentHash };
    }
  }

  const gameExperienceRecords: EditBundleV2["gameExperienceRecords"] = {};
  for (const entry of input.dirtyGameExperienceIntents) {
    if (entry.kind === "UPSERT") {
      const record = input.readLocalGameExperienceRecord(entry.entityId);
      // The record vanished locally between when the intent was captured and
      // now (should not normally happen -- deleting a record clears its
      // UPSERT intent via markGameExperienceDeleted opening a DELETE intent
      // instead) -- fail closed by omitting it rather than sending a
      // fabricated value; buildPublishPlan.mjs will simply never see it.
      if (!record) continue;
      gameExperienceRecords[entry.entityId] = { kind: "UPSERT", baseContentHash: entry.baseContentHash, value: record };
    } else {
      gameExperienceRecords[entry.entityId] = { kind: entry.kind, baseContentHash: entry.baseContentHash };
    }
  }

  const uiPractice: EditBundleV2["uiPractice"] = {};
  for (const entry of input.dirtyUiPracticeIntents ?? []) {
    if (entry.kind === "UPSERT") {
      const value = input.readLocalUiPractice?.(entry.entityId);
      if (value === undefined) continue;
      uiPractice[entry.entityId] = { kind: "UPSERT", baseContentHash: entry.baseContentHash, value };
    } else {
      uiPractice[entry.entityId] = { kind: entry.kind, baseContentHash: entry.baseContentHash };
    }
  }

  return {
    version: 2,
    baseRevision: null,
    exportedAt: input.exportedAt,
    publishingRegistryVersion: input.publishingRegistryVersion,
    projects,
    gameExperienceRecords,
    uiPractice,
    newAssets: input.newAssets,
    diagnostics: { browserObservations: input.browserObservations },
  };
}

function dynamicProjectDraftStorageKey(projectId: string) {
  // Deliberately duplicated, not imported -- every file in this codebase
  // that needs this exact key re-derives it locally rather than crossing a
  // lib/page dependency boundary (see DynamicProjectPage.tsx's own
  // draftStorageKey comment). Keep in sync if the key format ever changes.
  return `dilida-portfolio:dynamic-project:${projectId}:draft:v1`;
}

function readLocalDynamicDraft(projectId: string): unknown {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(dynamicProjectDraftStorageKey(projectId));
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

// A project's body is a DynamicProjectDraft OR a legacy ProjectDocument --
// whichever this project actually has locally. Both are read; at most one
// should ever be present for a given real project.
function readLocalProjectBody(projectId: string): unknown {
  const draft = readLocalDynamicDraft(projectId);
  if (draft !== undefined) return draft;
  const document: ProjectDocument | undefined = getProjectDocument(projectId);
  return document ?? undefined;
}

function bytesToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return window.btoa(binary);
}

// Real browser wiring. Not called from any live export/launcher entry point
// yet -- exists so this assembly logic can be exercised end-to-end (real
// Dirty Intent Store + real local storage + real IndexedDB/dev-server) ahead
// of the parity harness.
export async function exportProductionBundleV2(publishingRegistryVersion: number): Promise<EditBundleV2> {
  const localOverrides = readProjectPublicMetaOverrides();
  const gameStore = getGameExperienceStore();
  const gameRecordsById = new Map(gameStore.records.map((record) => [record.id, record]));
  const browserObservations: string[] = [];

  const dirtyProjectIntents = listDirtyIntents("project");
  const dirtyGameExperienceIntents = listDirtyIntents("gameExperienceRecord");
  const dirtyUiPracticeIntents = listDirtyIntents("uiPractice");

  // Best-effort byte collection, scoped to references discovered inside
  // currently-dirty entities only -- never a whole-history sweep. Covers all
  // 4 single-file adapters discoverable from content
  // (project-body-indexeddb-assets, dynamic-template-images,
  // ui-practice-images, game-experience-covers via collectChangedAsset's
  // IndexedDB + dev-server-fetch paths) plus playable-game-covers
  // (also dev-server-fetch, via the same discoverAssetReferences coverId shape).
  const newAssets: EditBundleAsset[] = [];
  const seenAssetKeys = new Set<string>();
  const collect = async (value: unknown, projectId?: string) => {
    for (const reference of discoverAssetReferences(value, { projectId })) {
      const key = `${reference.sourceAdapterId} ${reference.assetId}`;
      if (seenAssetKeys.has(key)) continue;
      seenAssetKeys.add(key);
      const acquired = await collectChangedAsset(reference);
      if (acquired) {
        newAssets.push({ sourceAdapterId: reference.sourceAdapterId, assetId: reference.assetId, fileName: acquired.fileName, mimeType: acquired.mimeType, dataBase64: bytesToBase64(acquired.bytes) });
      } else {
        browserObservations.push(`Could not acquire local bytes for ${reference.sourceAdapterId}:${reference.assetId} (referenced at ${reference.fieldPath}).`);
      }
    }
  };

  // Project covers are keyed by the PROJECT's own id (not a fresh per-upload
  // id like template images get), so referenceIntent for this adapter is
  // always "inherited" by identity -- a re-upload replaces the same id, it
  // never becomes a new one. That's fine: resolveAsset.mjs always tries the
  // bundle-provided candidate FIRST regardless of referenceIntent, so a
  // freshly collected cover in newAssets still wins over the published
  // fallback; referenceIntent only ever gates whether candidate 2 (fallback)
  // is allowed to run, and a genuinely unchanged cover correctly has no
  // bundle-provided bytes at all, so it falls through to the fallback and
  // never touches the writeset.
  const projectCoverField = new Map<string, { projectCoverId: string; publicUrl: string } | undefined>();
  for (const entry of dirtyProjectIntents) {
    if (entry.kind !== "UPSERT") continue;
    await collect(readLocalProjectBody(entry.entityId), entry.entityId);

    // project-covers-disk is not discoverable via content-tree walking (a
    // cover is a separate per-project field, never embedded in body
    // content) -- acquired directly by projectId, then represented in the
    // exact { projectCoverId, publicUrl } shape discoverReferences.mjs
    // recognizes, so it flows through the SAME discovery -> resolution ->
    // writeset path as every other single-file reference.
    const publishedPublicUrl = getPublishedProjectCover(entry.entityId);
    const acquiredCover = await collectChangedProjectCover(entry.entityId);
    if (acquiredCover) {
      newAssets.push({ sourceAdapterId: "project-covers-disk", assetId: entry.entityId, fileName: acquiredCover.fileName, mimeType: acquiredCover.mimeType, dataBase64: bytesToBase64(acquiredCover.bytes) });
    } else if (!publishedPublicUrl) {
      browserObservations.push(`Could not acquire a local cover for project ${entry.entityId}, and no published cover exists to inherit.`);
    }
    // A cover reference exists in the edited value whenever there's either a
    // freshly acquired local cover OR an already-published one to inherit --
    // absent only when genuinely neither exists (never had a cover at all).
    if (acquiredCover || publishedPublicUrl) {
      projectCoverField.set(entry.entityId, { projectCoverId: entry.entityId, publicUrl: publishedPublicUrl || `/images/published/covers/${entry.entityId}` });
    }
  }
  for (const entry of dirtyGameExperienceIntents) {
    if (entry.kind !== "UPSERT") continue;
    const record = gameRecordsById.get(entry.entityId);
    if (record) await collect(toPublishableGameExperienceRecord(record));
  }

  return assembleEditBundleV2({
    exportedAt: new Date().toISOString(),
    publishingRegistryVersion,
    dirtyProjectIntents,
    dirtyGameExperienceIntents,
    dirtyUiPracticeIntents,
    readLocalProjectMeta: (projectId) => localOverrides[projectId],
    readLocalProjectBody,
    readLocalProjectCover: (projectId) => projectCoverField.get(projectId),
    readLocalGameExperienceRecord: (recordId) => {
      const record = gameRecordsById.get(recordId);
      return record ? toPublishableGameExperienceRecord(record) : undefined;
    },
    // No real local store to read UI Practice edits from -- see the
    // EditBundleV2.uiPractice field comment above.
    readLocalUiPractice: () => undefined,
    newAssets,
    browserObservations,
  });
}
