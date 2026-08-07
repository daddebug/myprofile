import type { Locale } from "../locales/types";

export const PORTFOLIO_PDF_CONFIG_STORAGE_KEY = "dilida-portfolio:pdf-export-config:v1";

export type PdfPreset = "compact" | "standard" | "detailed";
export type PdfTheme = "website-dark" | "print-light";
export type PdfSectionId = "cover" | "profile" | "projects" | "ui-works" | "games" | "contact";
export type PdfDetailLevel = "compact" | "detailed";

export type PdfSectionConfig = {
  id: PdfSectionId;
  enabled: boolean;
  order: number;
};

export type PdfProjectItemConfig = {
  id: string;
  enabled: boolean;
  order: number;
  detailLevel: PdfDetailLevel;
  showCover: boolean;
  showRole: boolean;
  showTimeline: boolean;
  showSummary: boolean;
  selectedSectionIds: string[];
  selectedMediaIds: string[];
};

export type PdfUiItemConfig = { id: string; enabled: boolean; order: number };
export type PdfGameItemConfig = { id: string; enabled: boolean; order: number; detailLevel: "metadata" | "summary" | "detail" };

export type PortfolioPdfConfig = {
  version: 1;
  locale: Locale;
  documentTitle: string;
  filename: string;
  preset: PdfPreset;
  theme: PdfTheme;
  sections: PdfSectionConfig[];
  projects: PdfProjectItemConfig[];
  uiWorks: PdfUiItemConfig[];
  games: PdfGameItemConfig[];
  profile: { detailLevel: "concise" | "full"; showSkills: boolean; showExperience: boolean; showEducation: boolean };
  uiOptions: { density: 2 | 4 | 6; showCaptions: boolean; cropMode: "contain" | "cover" };
  gameOptions: { showAchievements: boolean; showTags: boolean };
};

type ConfigInputs = { locale: Locale; projectIds: string[]; uiIds: string[]; gameIds: string[] };

const sectionOrder: PdfSectionId[] = ["cover", "profile", "projects", "ui-works", "games", "contact"];

export function createPortfolioPdfConfig({ locale, projectIds, uiIds, gameIds }: ConfigInputs, preset: PdfPreset = "standard"): PortfolioPdfConfig {
  const limits = preset === "compact"
    ? { projects: 3, ui: 6, games: 3 }
    : preset === "standard"
      ? { projects: 3, ui: 12, games: 5 }
      : { projects: 5, ui: 18, games: 10 };
  const detailed = preset !== "compact";
  const year = new Date().getFullYear();
  return {
    version: 1,
    locale,
    documentTitle: locale === "zh" ? "Dilida Duman 作品集" : "Dilida Duman Portfolio",
    filename: `Dilida-Duman-Portfolio-${locale.toUpperCase()}-${year}.pdf`,
    preset,
    theme: "website-dark",
    sections: sectionOrder.map((id, order) => ({ id, enabled: true, order })),
    projects: projectIds.map((id, order) => ({
      id,
      enabled: order < limits.projects,
      order,
      detailLevel: detailed ? "detailed" : "compact",
      showCover: true,
      showRole: true,
      showTimeline: true,
      showSummary: true,
      selectedSectionIds: [],
      selectedMediaIds: [],
    })),
    uiWorks: uiIds.map((id, order) => ({ id, enabled: order < limits.ui, order })),
    games: gameIds.map((id, order) => ({ id, enabled: order < limits.games, order, detailLevel: preset === "detailed" ? "detail" : "summary" })),
    profile: { detailLevel: preset === "compact" ? "concise" : "full", showSkills: true, showExperience: true, showEducation: true },
    uiOptions: { density: preset === "compact" ? 6 : preset === "standard" ? 4 : 4, showCaptions: true, cropMode: "contain" },
    gameOptions: { showAchievements: true, showTags: true },
  };
}

function isConfig(value: unknown, locale: Locale): value is PortfolioPdfConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<PortfolioPdfConfig>;
  return candidate.version === 1 && candidate.locale === locale && Array.isArray(candidate.sections) && Array.isArray(candidate.projects) && Array.isArray(candidate.uiWorks) && Array.isArray(candidate.games);
}

export function loadPortfolioPdfConfig(inputs: ConfigInputs): PortfolioPdfConfig {
  if (typeof window === "undefined" || !import.meta.env.DEV) return createPortfolioPdfConfig(inputs);
  try {
    const store = JSON.parse(window.localStorage.getItem(PORTFOLIO_PDF_CONFIG_STORAGE_KEY) ?? "null") as { version?: number; configs?: Partial<Record<Locale, unknown>> } | null;
    const saved = store?.version === 1 ? store.configs?.[inputs.locale] : null;
    if (!isConfig(saved, inputs.locale)) return createPortfolioPdfConfig(inputs);
    const defaults = createPortfolioPdfConfig(inputs, saved.preset);
    const mergeItems = <T extends { id: string }>(current: T[], fallback: T[]) => {
      const byId = new Map(current.map((item) => [item.id, item]));
      return fallback.map((item) => ({ ...item, ...byId.get(item.id) })) as T[];
    };
    return {
      ...defaults,
      ...saved,
      sections: mergeItems(saved.sections, defaults.sections),
      projects: mergeItems(saved.projects, defaults.projects),
      uiWorks: mergeItems(saved.uiWorks, defaults.uiWorks),
      games: mergeItems(saved.games, defaults.games),
    };
  } catch {
    return createPortfolioPdfConfig(inputs);
  }
}

export function savePortfolioPdfConfig(config: PortfolioPdfConfig) {
  if (!import.meta.env.DEV) return;
  let configs: Partial<Record<Locale, PortfolioPdfConfig>> = {};
  try {
    const current = JSON.parse(window.localStorage.getItem(PORTFOLIO_PDF_CONFIG_STORAGE_KEY) ?? "null") as { version?: number; configs?: Partial<Record<Locale, PortfolioPdfConfig>> } | null;
    if (current?.version === 1 && current.configs) configs = current.configs;
  } catch {
    configs = {};
  }
  window.localStorage.setItem(PORTFOLIO_PDF_CONFIG_STORAGE_KEY, JSON.stringify({ version: 1, configs: { ...configs, [config.locale]: config } }));
}

export function moveOrderedItem<T extends { order: number }>(items: T[], index: number, direction: -1 | 1) {
  const ordered = [...items].sort((a, b) => a.order - b.order);
  const target = index + direction;
  if (target < 0 || target >= ordered.length) return items;
  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
  return ordered.map((item, order) => ({ ...item, order }));
}

export function sanitizePdfFilename(value: string) {
  const cleaned = value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-").replace(/\s+/g, " ").trim();
  const withExtension = cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned}.pdf`;
  return withExtension || "portfolio.pdf";
}
