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
