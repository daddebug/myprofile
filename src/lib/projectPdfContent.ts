import type { Locale } from "../locales/types";
import type { ProjectDocument, ProjectDocumentBlock } from "./projectDocuments";

export type PdfProjectSourceType = "project-document" | "custom-legacy" | "custom-legacy-partial" | "metadata-fallback";
export type PdfProjectMedia = {
  id: string;
  projectId: string;
  publicPath?: string;
  localImageId?: string;
  title?: string;
  caption?: string;
  cropMode?: "contain" | "cover";
  assetSource?: "project-document" | "legacy";
};
export type PdfProjectGridItem = { id: string; title: string; description: string; value?: string };
export type PdfProjectBlock = {
  id: string;
  type: "text" | "media" | "comparison" | "flow" | "grid" | "matrix" | "quote" | "fallback";
  eyebrow?: string;
  title?: string;
  body?: string;
  secondaryBody?: string;
  items?: PdfProjectGridItem[];
  steps?: string[];
  columns?: string[];
  rows?: string[][];
  media?: PdfProjectMedia[];
  unsupportedType?: string;
  linkUrl?: string;
  linkLabel?: string;
};
export type PdfProjectSection = { id: string; title: string; heading?: string; body?: string; blocks: PdfProjectBlock[] };
export type PdfProjectContent = {
  projectId: string;
  sourceType: PdfProjectSourceType;
  sections: PdfProjectSection[];
  blockTypesEncountered: string[];
  blockTypesRendered: string[];
  fallbackTypes: string[];
};

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function buildContent(projectId: string, sourceType: PdfProjectSourceType, sections: PdfProjectSection[], fallbackTypes: string[] = []): PdfProjectContent {
  const encountered = sections.flatMap((section) => section.blocks.map((block) => block.unsupportedType || block.type));
  return {
    projectId,
    sourceType,
    sections: sections.filter((section) => section.title || section.heading || section.body || section.blocks.length),
    blockTypesEncountered: unique(encountered),
    blockTypesRendered: unique(sections.flatMap((section) => section.blocks.map((block) => block.type))),
    fallbackTypes: unique(fallbackTypes),
  };
}

function localized(value: { zh?: string; en?: string; useZhAsEnglishFallback?: boolean } | undefined, locale: Locale) {
  if (!value) return "";
  return locale === "zh" ? value.zh || "" : value.en || (value.useZhAsEnglishFallback ? value.zh || "" : "");
}

function fromProjectDocument(projectId: string, document: ProjectDocument, locale: Locale) {
  const fallbackTypes: string[] = [];
  const sections = document.sections.filter((section) => section.visibility === "visible").map((section) => ({
    id: section.id,
    title: localized(section.title, locale),
    blocks: section.blocks.flatMap((block) => mapDocumentBlock(projectId, block, locale, fallbackTypes)),
  }));
  return buildContent(projectId, "project-document", sections, fallbackTypes);
}

function mapDocumentBlock(projectId: string, block: ProjectDocumentBlock, locale: Locale, fallbackTypes: string[]): PdfProjectBlock[] {
  const content = block.content;
  const result: PdfProjectBlock[] = [];
  const text = {
    eyebrow: localized(content.eyebrow, locale), title: localized(content.title, locale), body: localized(content.body, locale), secondaryBody: localized(content.secondaryBody, locale),
  };
  if (!content.figmaPrototype && (text.eyebrow || text.title || text.body || text.secondaryBody)) result.push({ id: `${block.id}-text`, type: "text", ...text });
  if (content.items?.length) result.push({ id: `${block.id}-items`, type: "grid", title: text.title, items: content.items.map((item) => ({ id: item.id, title: localized(item.title, locale), description: localized(item.description, locale), value: item.value })) });
  if (content.nodes?.length) result.push({ id: `${block.id}-nodes`, type: "flow", steps: content.nodes.sort((a, b) => a.order - b.order).map((node) => `${localized(node.title, locale)}${localized(node.description, locale) ? ` — ${localized(node.description, locale)}` : ""}`) });
  if (content.media?.length) result.push({ id: `${block.id}-media`, type: "media", media: content.media.map((item) => ({ id: item.id, projectId, publicPath: item.publicPath, localImageId: item.assetId, title: localized(item.alt, locale), caption: localized(item.caption, locale), cropMode: item.cropMode, assetSource: "project-document" })) });
  if (content.figmaPrototype?.sourceUrl) {
    result.push({
      id: `${block.id}-figma`,
      type: "media",
      title: text.title,
      body: text.body,
      media: content.figmaPrototype.posterAssetId
        ? [{ id: `${block.id}-figma-poster`, projectId, localImageId: content.figmaPrototype.posterAssetId, title: text.title, caption: text.body, cropMode: "cover", assetSource: "project-document" }]
        : [],
      linkUrl: content.figmaPrototype.sourceUrl,
      linkLabel: "Open interactive prototype in Figma",
    });
  }
  if (!result.length) {
    fallbackTypes.push(`${block.type}:${block.layout}`);
    result.push({ id: block.id, type: "fallback", title: text.title || block.layout, body: text.body, unsupportedType: `${block.type}:${block.layout}` });
  }
  return result;
}

export function getPdfProjectContent(projectId: string, locale: Locale, document?: ProjectDocument): PdfProjectContent | undefined {
  if (document) return fromProjectDocument(projectId, document, locale);
  return undefined;
}

export function getPdfProjectContents(projectIds: string[], locale: Locale, documents: Record<string, ProjectDocument>) {
  return Object.fromEntries(projectIds.flatMap((id) => {
    const content = getPdfProjectContent(id, locale, documents[id]);
    return content ? [[id, content]] : [];
  }));
}
