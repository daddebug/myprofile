// Let's Connect (Figma: OTHER_PROJECTS_FOOTER, node 70:111, "Let's connect"
// row) is a single SITE-WIDE section, not per-project -- unlike Other
// Projects (ProjectEndSections.tsx's auto-populated recommendation pool,
// derived live from the project catalog, not stored anywhere), this config
// is genuinely its own persisted state, not part of any one project's
// draft. It follows the same
// localStorage-draft-mirrors-published-JSON pattern as everything else in
// this app (see DynamicProjectPage.tsx's loadDraft / publishedPortfolio.ts),
// scoped to one global key instead of a per-project one.
//
// NOTE: only the local editing/read side lives here. Getting an owner's
// edits here through EXPORT FOR PUBLISH -> `pnpm portfolio:import` into
// publishedPortfolio.json's own `siteSettings.connectItems` still needs a
// small addition to productionBundleExportV2.ts and the import pipeline --
// not done yet, reported as a follow-up rather than guessed at.

import { getPublishedSiteConnectItems } from "./publishedPortfolio";

export type ConnectItemType = "email" | "cv" | "linkedin" | "github" | "xiaohongshu";

export type ConnectItem = {
  type: ConnectItemType;
  label: string;
  // For every type except "cv": a real URL (mailto:... for email, an
  // external profile URL otherwise). For "cv": unused for now -- CV needs
  // its own asset-reference + selection model (upload/select/download a
  // chosen file among several), which depends on a persisted file-asset
  // store this app doesn't have yet. See the blocker note in the final
  // report; this field is reserved, not wired to anything yet.
  url: string;
  enabled: boolean;
};

export type SiteConnectConfig = {
  version: 1;
  items: ConnectItem[];
  // Which entry in the local CV library (cvLibraryDb.ts) is the one shown
  // as the "cv" connect item's download target. null = none chosen yet.
  // This id only resolves to a real download on the live site once it has
  // a published public asset path -- see cvLibraryDb.ts's own note.
  selectedCvId: string | null;
  updatedAt: string;
};

const STORAGE_KEY = "dilida-portfolio:site-connect:v1";

// Figma (node 70:111, "Let's connect") draws a fixed 5-slot structure --
// this order and set is layout, not content: whether a slot has a working
// URL/resource only decides whether it's clickable, never whether it
// exists. Every read path below (normalizeConnectConfig) enforces exactly
// these 5 entries, in this order, regardless of what was ever stored.
export const CONNECT_ITEM_ORDER: ConnectItemType[] = ["email", "cv", "linkedin", "github", "xiaohongshu"];

const DEFAULT_CONNECT_LABELS: Record<ConnectItemType, string> = {
  email: "Email",
  cv: "CV",
  linkedin: "LinkedIn",
  github: "GitHub",
  xiaohongshu: "Xiaohongshu",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function defaultItem(type: ConnectItemType): ConnectItem {
  return { type, label: DEFAULT_CONNECT_LABELS[type], url: "", enabled: true };
}

export function emptyConnectConfig(): SiteConnectConfig {
  return {
    version: 1,
    items: CONNECT_ITEM_ORDER.map(defaultItem),
    selectedCvId: null,
    updatedAt: new Date(0).toISOString(),
  };
}

function normalizeItem(value: unknown, type: ConnectItemType): ConnectItem {
  if (!isRecord(value)) return defaultItem(type);
  return {
    type,
    label: typeof value.label === "string" && value.label.trim() ? value.label : DEFAULT_CONNECT_LABELS[type],
    url: typeof value.url === "string" ? value.url : "",
    enabled: value.enabled !== false,
  };
}

// Always returns exactly 5 items, one per CONNECT_ITEM_ORDER type, in that
// fixed order -- this is the single enforcement point for "layout is fixed,
// content is optional." A stored config from before this rule existed (a
// sparse/reordered/missing-type array) is reconciled here, not carried
// through verbatim.
export function normalizeConnectConfig(parsed: unknown): SiteConnectConfig | null {
  if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.items)) return null;
  const byType = new Map<ConnectItemType, unknown>();
  for (const entry of parsed.items) {
    if (isRecord(entry) && typeof entry.type === "string" && CONNECT_ITEM_ORDER.includes(entry.type as ConnectItemType)) {
      byType.set(entry.type as ConnectItemType, entry);
    }
  }
  return {
    version: 1,
    items: CONNECT_ITEM_ORDER.map((type) => normalizeItem(byType.get(type), type)),
    selectedCvId: typeof parsed.selectedCvId === "string" && parsed.selectedCvId.trim() ? parsed.selectedCvId.trim() : null,
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : emptyConnectConfig().updatedAt,
  };
}

export function loadSiteConnectConfig(): SiteConnectConfig {
  const published = normalizeConnectConfig({ version: 1, items: getPublishedSiteConnectItems(), updatedAt: new Date(0).toISOString() });
  if (typeof window === "undefined" || !import.meta.env.DEV) {
    return published ?? emptyConnectConfig();
  }
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return published ?? emptyConnectConfig();
    return normalizeConnectConfig(JSON.parse(stored) as unknown) ?? published ?? emptyConnectConfig();
  } catch {
    return published ?? emptyConnectConfig();
  }
}

export function saveSiteConnectConfig(config: SiteConnectConfig): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // best-effort, same as every other draft save path in this app
  }
}
