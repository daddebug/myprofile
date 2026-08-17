// Field-level publish allow-list for Game Experience records (Publishing
// Architecture V2, Phase 7). A field either belongs in the shape returned by
// toPublishableGameExperienceRecord() or it never crosses into an EditBundle
// -- deliberately NOT a forbidden-text/regex filter (a regex can only catch
// patterns it was written to expect; an allow-list can't leak a field nobody
// thought to name).
//
// GameExperienceRecord (see gameExperience.ts) does not currently carry any
// field literally named aiProposal/warnings/notes/transcriptionDiagnostics --
// gameExperienceAiImport.ts's GameExperienceAiPreview keeps those entirely
// component-local and only ever splices its already-sanitized `.result`
// (itself a real GameExperienceRecord) into storage. The two fields this
// allow-list DOES exclude are the closest real analogs that do exist on the
// stored record: `detectedCoverAssetId` (an auto-detected candidate, not the
// confirmed cover) and `coverSourceMetadata` (auto-fetch provenance -- a
// deliberate product decision to withhold for now, not obviously "content").
import type { GameExperienceRecord } from "./gameExperience";

export type PublishableGameExperienceRecord = {
  schemaVersion: 1;
  id: string;
  identity: GameExperienceRecord["identity"];
  stats: GameExperienceRecord["stats"];
  presentation: {
    coverAssetId?: string;
    coverPublicPath?: string;
    tags: GameExperienceRecord["presentation"]["tags"];
    homepageTagIds?: string[];
    shortSummaryZh?: string;
    shortSummaryEn?: string;
  };
  reflection: GameExperienceRecord["reflection"];
  detail: GameExperienceRecord["detail"];
  publication: {
    visibility: GameExperienceRecord["publication"]["visibility"];
    showOnHomepage: boolean;
    homepageOrder: number;
    libraryOrder: number;
    archived: boolean;
  };
  createdAt: string;
  updatedAt: string;
};

export function toPublishableGameExperienceRecord(record: GameExperienceRecord): PublishableGameExperienceRecord {
  return {
    schemaVersion: record.schemaVersion,
    id: record.id,
    identity: record.identity,
    stats: record.stats,
    presentation: {
      coverAssetId: record.presentation.coverAssetId,
      coverPublicPath: record.presentation.coverPublicPath,
      tags: record.presentation.tags,
      homepageTagIds: record.presentation.homepageTagIds,
      shortSummaryZh: record.presentation.shortSummaryZh,
      shortSummaryEn: record.presentation.shortSummaryEn,
    },
    reflection: record.reflection,
    detail: record.detail,
    publication: {
      visibility: record.publication.visibility,
      showOnHomepage: record.publication.showOnHomepage,
      homepageOrder: record.publication.homepageOrder,
      libraryOrder: record.publication.libraryOrder,
      archived: record.publication.archived,
    },
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
