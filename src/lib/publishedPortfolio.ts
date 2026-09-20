import publishedPortfolio from "../data/publishedPortfolio.json";
import type { ProjectPublicMetaOverride } from "./projectMetadata";
import type { ProjectDocument, ProjectDocumentStore } from "./projectDocuments";
import type { GameExperienceStore } from "./gameExperience";

type PublishedAsset = {
  sourceDatabase: string;
  sourceStore: string;
  sourceId: string;
  publicPath: string;
};

type PublishedPortfolio = {
  version: 1;
  generatedAt: string;
  drafts: Record<string, unknown>;
  projectCatalog?: Record<string, Omit<ProjectPublicMetaOverride, "projectId">>;
  publicMetadata?: Record<string, Omit<ProjectPublicMetaOverride, "projectId">>;
  projectDocuments?: ProjectDocumentStore | Record<string, ProjectDocument>;
  gameExperience?: GameExperienceStore;
  // Site-wide (not per-project) settings -- Let's Connect's item list and
  // CV library (see siteConnectConfig.ts / cvLibraryDb.ts). Optional/absent
  // is a valid, "nothing configured/published yet" state, not an error.
  // `cv` does not exist in this file yet as of this comment -- it is only
  // written once the export/import pipeline is extended to materialize a
  // selected CV as a real public asset (not done yet, see session report);
  // the accessor below is forward-compatible plumbing for that, not a claim
  // that it is populated today.
  siteSettings?: {
    connectItems?: unknown;
    cv?: { assets?: Array<{ id?: unknown; label?: unknown; publicPath?: unknown }>; selectedCvId?: unknown };
    homeContent?: unknown;
    homeProjectSlots?: unknown;
    homeExplorationSlots?: unknown;
  };
  covers: Record<string, string>;
  assets: PublishedAsset[];
};

const data = publishedPortfolio as PublishedPortfolio;

export function getPublishedProjectDraft(projectId: string): unknown {
  return data.drafts[projectId];
}

export function getPublishedPublicMetadata(): Record<string, ProjectPublicMetaOverride> {
  const projectCatalog = data.projectCatalog ?? data.publicMetadata ?? {};
  return Object.fromEntries(
    Object.entries(projectCatalog).map(([projectId, value]) => [
      projectId,
      { ...value, projectId },
    ]),
  );
}

export function getPublishedProjectCover(projectId: string): string {
  return data.covers[projectId] ?? "";
}

export function getPublishedProjectDocuments(): Record<string, ProjectDocument> {
  const documents = data.projectDocuments;
  if (!documents) return {};
  const store = documents as ProjectDocumentStore;
  if (store.version === 1 && store.documents) {
    return store.documents;
  }
  return documents as Record<string, ProjectDocument>;
}

export function getPublishedGameExperience(): GameExperienceStore | null {
  const store = data.gameExperience;
  return store?.schemaVersion === 1 && Array.isArray(store.records) ? store : null;
}

export function getPublishedSiteConnectItems(): unknown[] {
  const items = data.siteSettings?.connectItems;
  return Array.isArray(items) ? items : [];
}

// Returns the selected CV's real public asset path, or null when none is
// published yet (always null today -- see the siteSettings field comment).
export function getPublishedSelectedCvPublicPath(): string | null {
  const cv = data.siteSettings?.cv;
  if (!cv || typeof cv.selectedCvId !== "string" || !Array.isArray(cv.assets)) return null;
  const selected = cv.assets.find((asset) => asset && asset.id === cv.selectedCvId);
  return selected && typeof selected.publicPath === "string" ? selected.publicPath : null;
}

export function getPublishedHomeContent(): unknown {
  return data.siteSettings?.homeContent;
}

export function getPublishedHomeProjectSlots(): unknown {
  return data.siteSettings?.homeProjectSlots;
}

export function getPublishedHomeExplorationSlots(): unknown {
  return data.siteSettings?.homeExplorationSlots;
}

// The whole published bundle's own last-real-publish timestamp (stamped by
// scripts/import-production-bundle.mjs only when a REAL EXPORT FOR PUBLISH
// -> portfolio:import actually changed something -- see that script's own
// Writeset Rule comment). Homepage's "Last update" uses this directly
// (site-wide semantics: "when was this site as a whole last published"),
// unlike a single project's own lastPublishedAt. Never touched by local
// draft autosave, since drafts never reach this file at all until a real
// publish writes it.
export function getPublishedGeneratedAt(): string {
  return data.generatedAt || "";
}
