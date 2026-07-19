import publishedPortfolio from "../data/publishedPortfolio.json";
import type { ProjectPublicMetaOverride } from "./projectMetadata";

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
  publicMetadata: Record<string, Omit<ProjectPublicMetaOverride, "projectId">>;
  covers: Record<string, string>;
  assets: PublishedAsset[];
};

const data = publishedPortfolio as PublishedPortfolio;

export function getPublishedProjectDraft(projectId: string): unknown {
  return data.drafts[projectId];
}

export function getPublishedPublicMetadata(): Record<string, ProjectPublicMetaOverride> {
  return Object.fromEntries(
    Object.entries(data.publicMetadata).map(([projectId, value]) => [
      projectId,
      { ...value, projectId },
    ]),
  );
}

export function getPublishedProjectCover(projectId: string): string {
  return data.covers[projectId] ?? "";
}
