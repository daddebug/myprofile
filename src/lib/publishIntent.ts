// Wiring layer between real mutation entry points and the Dirty Intent
// Store (Publishing Architecture V2, Phase 3/7). Every real save path calls
// exactly one of the functions below instead of computing a baseline itself
// -- this is the single place that decides WHEN a mutation opens/reuses a
// dirty intent and WHAT kind it is; captureDirtyIntent() itself only knows
// how to store one.
import { captureDirtyIntent } from "./dirtyIntentStore";
import type { GameExperienceRecord, GameVisibility } from "./gameExperience";
import { getPublishedGameExperience, getPublishedProjectCover, getPublishedProjectDocuments, getPublishedProjectDraft, getPublishedPublicMetadata } from "./publishedPortfolio";

// A project's dirty-intent baseline snapshot spans everything the Edit
// Intent Model treats as one "project" entity: catalog metadata, body (a
// DynamicProjectDraft OR a legacy ProjectDocument -- a project has exactly
// one of the two, never both; ProjectDocument is folded in here rather than
// given its own entity type, since it is still the same "project" entity,
// just a different body representation depending on which editor authored
// it), and cover. The cover is wrapped in the same { projectCoverId,
// publicUrl } shape discoverReferences.mjs recognizes (Publishing
// Architecture V2, Pre-Cutover Closure) -- so buildPublishPlan.mjs discovers
// it as an ordinary single-file reference and resolves/writesets it through
// the existing resolveAsset.mjs path, with no project-cover-specific
// resolver or special-casing anywhere. Returns undefined (matching the
// Dirty Intent Store's own hashContent(undefined) convention for "never
// published") only when NONE of the three currently exist in production.
export function currentPublishedProjectSnapshot(projectId: string): { meta: unknown; body: unknown; cover: { projectCoverId: string; publicUrl: string } | undefined } | undefined {
  const meta = getPublishedPublicMetadata()[projectId];
  const body = getPublishedProjectDraft(projectId) ?? getPublishedProjectDocuments()[projectId];
  const coverPublicUrl = getPublishedProjectCover(projectId);
  const cover = coverPublicUrl ? { projectCoverId: projectId, publicUrl: coverPublicUrl } : undefined;
  if (meta === undefined && body === undefined && !cover) return undefined;
  return { meta, body, cover };
}

// Call this from every real project-mutation save path (body draft autosave,
// ProjectDocument save, EDIT PROJECT INFO save) -- NOT from a debounce
// timer's every tick, but from the point where a save actually commits.
// captureDirtyIntent() itself already reuses an existing baseline
// unconditionally, so calling this repeatedly across many saves of the same
// project (or across its different save surfaces) is safe and required
// (each call after the first is a guaranteed no-op on the baseline).
export function markProjectDirty(projectId: string): void {
  captureDirtyIntent(projectId, "project", "UPSERT", currentPublishedProjectSnapshot(projectId));
}

// Game Experience visibility transition -> intent kind. "Live" means
// actually visible to the public right now (visibility === "public" AND NOT
// archived) -- archived=true is publication-equivalent to being pulled from
// public view, exactly like visibility leaving "public", per Publishing
// Architecture V2's Edit Intent Model ("archived = true -> UNPUBLISH").
//
//   was live, still live      -> UPSERT (content edited while staying public)
//   was live, no longer live  -> UNPUBLISH (public -> draft/hidden, or archived)
//   was never live, now live  -> UPSERT (first-time publish)
//   was never live, still not -> null (nothing publish-relevant happened;
//                                 no dirty intent is opened at all -- an
//                                 always-draft record has nothing to publish)
export function deriveGameExperienceIntentKind(
  record: GameExperienceRecord,
  previouslyPublished: GameExperienceRecord | undefined,
): "UPSERT" | "UNPUBLISH" | null {
  const wasLive = isGameExperienceRecordLive(previouslyPublished);
  const isLiveNow = isGameExperienceRecordLive(record);
  if (isLiveNow) return "UPSERT";
  if (wasLive) return "UNPUBLISH";
  return null;
}

function isGameExperienceRecordLive(record: GameExperienceRecord | undefined): boolean {
  if (!record) return false;
  const live: GameVisibility = "public";
  return record.publication.visibility === live && !record.publication.archived;
}

// Call this from every real Game Experience save path (saveAll, deleteRecord
// before it removes the record) with the record as it will exist AFTER this
// save. A null-kind result deliberately opens no dirty intent -- see
// deriveGameExperienceIntentKind.
export function markGameExperienceDirty(record: GameExperienceRecord): void {
  const previouslyPublished = getPublishedGameExperience()?.records.find((published) => published.id === record.id);
  const kind = deriveGameExperienceIntentKind(record, previouslyPublished);
  if (!kind) return;
  captureDirtyIntent(record.id, "gameExperienceRecord", kind, previouslyPublished);
}

// Call this from a Game Experience record's actual deletion path, BEFORE the
// record is removed from storage -- passing the record as it existed prior
// to deletion. A record that was live opens a DELETE intent (mirroring
// project deletion's DELETE kind); a record that was never live has nothing
// to un-publish, so deletion opens no intent at all.
export function markGameExperienceDeleted(record: GameExperienceRecord): void {
  const previouslyPublished = getPublishedGameExperience()?.records.find((published) => published.id === record.id);
  if (!isGameExperienceRecordLive(previouslyPublished)) return;
  captureDirtyIntent(record.id, "gameExperienceRecord", "DELETE", previouslyPublished);
}
