import type { Locale } from "../locales/types";
import type { PdfProjectContent, PdfProjectMedia } from "./projectPdfContent";

export const PROJECT_PDF_COMPOSITIONS_STORAGE_KEY = "dilida-portfolio:pdf-compositions:v1";

export type ProjectPdfLayoutMode = "designed" | "auto";
export type ProjectPdfTemplate = "project-hero" | "text-media" | "media-text" | "four-screen-grid" | "comparison" | "process-flow" | "full-visual" | "structured-overview";
export type ProjectPdfThemeId = "portfolio-indigo" | "game-electric-blue" | "project-green" | "neutral-dark";

export type ProjectPdfPage = {
  id: string;
  template: ProjectPdfTemplate;
  sectionIds: string[];
  blockIds: string[];
  mediaIds: string[];
  showCaptions: boolean;
};

export type ProjectPdfComposition = {
  projectId: string;
  themeId: ProjectPdfThemeId;
  pages: ProjectPdfPage[];
};

export type ProjectPdfCompositionConfig = {
  version: 1;
  locale: Locale;
  layoutMode: ProjectPdfLayoutMode;
  projects: Record<string, ProjectPdfComposition>;
};

export type ProjectPdfTheme = {
  id: ProjectPdfThemeId;
  label: { zh: string; en: string };
  background: string;
  panel: string;
  primaryText: string;
  secondaryText: string;
  accent: string;
  secondaryAccent: string;
  mediaBorder: string;
};

export const projectPdfThemes: Record<ProjectPdfThemeId, ProjectPdfTheme> = {
  "portfolio-indigo": { id: "portfolio-indigo", label: { zh: "作品集靛蓝", en: "Portfolio Indigo" }, background: "#111038", panel: "#1a1c55", primaryText: "#f4f5fa", secondaryText: "rgba(244,245,250,.68)", accent: "#34f025", secondaryAccent: "#819dff", mediaBorder: "rgba(129,157,255,.30)" },
  "game-electric-blue": { id: "game-electric-blue", label: { zh: "游戏电光蓝", en: "Game Electric Blue" }, background: "#07162f", panel: "#0d2850", primaryText: "#f5f8ff", secondaryText: "rgba(225,237,255,.70)", accent: "#46d9ff", secondaryAccent: "#89a7ff", mediaBorder: "rgba(70,217,255,.32)" },
  "project-green": { id: "project-green", label: { zh: "项目荧光绿", en: "Project Green" }, background: "#081c27", panel: "#103344", primaryText: "#f4fff8", secondaryText: "rgba(224,242,235,.70)", accent: "#55f078", secondaryAccent: "#73b9ff", mediaBorder: "rgba(85,240,120,.30)" },
  "neutral-dark": { id: "neutral-dark", label: { zh: "中性深色", en: "Neutral Dark" }, background: "#151820", panel: "#232732", primaryText: "#f7f7f5", secondaryText: "rgba(247,247,245,.66)", accent: "#b8ff60", secondaryAccent: "#aab8d8", mediaBorder: "rgba(210,220,240,.22)" },
};

export const projectPdfTemplateLabels: Record<ProjectPdfTemplate, { zh: string; en: string }> = {
  "project-hero": { zh: "项目开场", en: "Project Hero" },
  "text-media": { zh: "文字 + 主视觉", en: "Text + Media" },
  "media-text": { zh: "主视觉 + 文字", en: "Media + Text" },
  "four-screen-grid": { zh: "四屏展示", en: "Four-Screen Grid" },
  comparison: { zh: "对比关系", en: "Comparison" },
  "process-flow": { zh: "流程与决策", en: "Process Flow" },
  "full-visual": { zh: "全幅视觉", en: "Full Visual" },
  "structured-overview": { zh: "结构化总览", en: "Structured Overview" },
};

function page(id: string, template: ProjectPdfTemplate, sectionIds: string[] = [], blockIds: string[] = [], mediaIds: string[] = [], showCaptions = true): ProjectPdfPage {
  return { id, template, sectionIds, blockIds, mediaIds, showCaptions };
}

function existingMedia(content: PdfProjectContent | undefined, ids: string[]) {
  const available = new Set(content?.sections.flatMap((section) => section.blocks.flatMap((block) => block.media ?? [])).map((item) => item.id) ?? []);
  return ids.filter((id) => available.has(id));
}

function existingSections(content: PdfProjectContent | undefined, ids: string[]) {
  const available = new Set(content?.sections.map((section) => section.id) ?? []);
  return ids.filter((id) => available.has(id));
}

function existingBlocks(content: PdfProjectContent | undefined, ids: string[]) {
  const available = new Set(content?.sections.flatMap((section) => section.blocks.map((block) => block.id)) ?? []);
  return ids.filter((id) => available.has(id));
}

function p(content: PdfProjectContent | undefined, value: ProjectPdfPage): ProjectPdfPage {
  return { ...value, sectionIds: existingSections(content, value.sectionIds), blockIds: existingBlocks(content, value.blockIds), mediaIds: existingMedia(content, value.mediaIds) };
}

function genericDefaults(projectId: string, content?: PdfProjectContent): ProjectPdfComposition {
  const first = content?.sections[0];
  const media = content?.sections.flatMap((section) => section.blocks.flatMap((block) => block.media ?? [])) ?? [];
  return { projectId, themeId: "neutral-dark", pages: [
    page(`${projectId}-hero`, "project-hero", first ? [first.id] : []),
    ...(first ? [page(`${projectId}-overview`, media.length ? "text-media" : "structured-overview", [first.id], first.blocks.map((block) => block.id), media.slice(0, 2).map((item) => item.id))] : []),
  ] };
}

export function createDefaultProjectPdfComposition(projectId: string, content?: PdfProjectContent): ProjectPdfComposition {
  return genericDefaults(projectId, content);
}

export function createProjectPdfCompositionConfig(locale: Locale, projectIds: string[], contents: Record<string, PdfProjectContent>): ProjectPdfCompositionConfig {
  return { version: 1, locale, layoutMode: "designed", projects: Object.fromEntries(projectIds.map((id) => [id, createDefaultProjectPdfComposition(id, contents[id])])) };
}

function isConfig(value: unknown, locale: Locale): value is ProjectPdfCompositionConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<ProjectPdfCompositionConfig>;
  return candidate.version === 1 && candidate.locale === locale && (candidate.layoutMode === "designed" || candidate.layoutMode === "auto") && Boolean(candidate.projects && typeof candidate.projects === "object");
}

export function loadProjectPdfCompositionConfig(locale: Locale, projectIds: string[], contents: Record<string, PdfProjectContent>) {
  const defaults = createProjectPdfCompositionConfig(locale, projectIds, contents);
  if (typeof window === "undefined" || !import.meta.env.DEV) return defaults;
  try {
    const store = JSON.parse(window.localStorage.getItem(PROJECT_PDF_COMPOSITIONS_STORAGE_KEY) ?? "null") as { version?: number; configs?: Partial<Record<Locale, unknown>> } | null;
    const saved = store?.version === 1 ? store.configs?.[locale] : null;
    if (!isConfig(saved, locale)) return defaults;
    return { ...defaults, ...saved, projects: Object.fromEntries(projectIds.map((id) => [id, saved.projects[id] ?? defaults.projects[id]])) };
  } catch {
    return defaults;
  }
}

export function saveProjectPdfCompositionConfig(config: ProjectPdfCompositionConfig) {
  if (typeof window === "undefined" || !import.meta.env.DEV) return;
  let configs: Partial<Record<Locale, ProjectPdfCompositionConfig>> = {};
  try {
    const current = JSON.parse(window.localStorage.getItem(PROJECT_PDF_COMPOSITIONS_STORAGE_KEY) ?? "null") as { version?: number; configs?: Partial<Record<Locale, ProjectPdfCompositionConfig>> } | null;
    if (current?.version === 1 && current.configs) configs = current.configs;
  } catch {
    configs = {};
  }
  window.localStorage.setItem(PROJECT_PDF_COMPOSITIONS_STORAGE_KEY, JSON.stringify({ version: 1, configs: { ...configs, [config.locale]: config } }));
}

export function getProjectPdfMedia(content: PdfProjectContent | undefined): PdfProjectMedia[] {
  return content?.sections.flatMap((section) => section.blocks.flatMap((block) => block.media ?? [])) ?? [];
}
