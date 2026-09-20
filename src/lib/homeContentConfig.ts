// Homepage 2.0 editable text (Figma node 86:37 "主界面" + 112:72). Same
// site-wide localStorage-draft-mirrors-published-JSON pattern as
// siteConnectConfig.ts, reusing that module's existing publish-bundle
// plumbing (see productionBundleExport.ts / import-production-bundle.mjs's
// site-settings block) rather than building a second one -- this data is
// nested inside the SAME published siteSettings.homeContent field.
//
// v2: locale-aware. The site still ships zh/en (see LocaleContext.tsx), so
// every visible field is a LocalizedText -- the same type ProjectDocumentPage
// content already uses, reused here rather than inventing a second
// localization shape. v1 (a single unlocalized string per field, no
// roleLine) is still readable: normalizeHomeContent migrates it in place.

import { getPublishedHomeContent } from "./publishedPortfolio";
import type { LocalizedText } from "./projectDocuments";

export type { LocalizedText };

export type HomeContent = {
  version: 2;
  name: LocalizedText;
  intro: LocalizedText;
  // Short role/capability line (Figma node 88:101, between intro and the
  // decorative icon) -- present in the current Figma but had no schema
  // field yet, so it was dropped during the v1 migration. Independent data,
  // not derived from intro/longDescription.
  roleLine: LocalizedText;
  // Independent from `intro` going forward -- earlier migrations seeded it
  // with the same old single-language string (no distinct old long-form
  // text existed to draw from), but that was a one-time migration value,
  // never a standing "intro mirrors longDescription" rule. Do not add logic
  // here that copies one into the other.
  longDescription: LocalizedText;
  // Footer credit line -- a real editable site setting, not renderer-
  // hardcoded text. The schema's own default is "" like every other field
  // here; the CURRENT PUBLISHED value happens to read "Designed and built
  // by Delda Duman" because that is what the current Figma source actually
  // shows verbatim (including its own "Delda" vs "Dilida" spelling) -- that
  // is real content carried in data, not a value baked into this schema,
  // and is flagged pending a Figma-side correction, not corrected here.
  footerCredit: LocalizedText;
  // Legacy/inert as of Homepage 3.0 Modular Interaction Redesign Phase B --
  // HomeProjectFlow.tsx renders one continuous, catalog-driven flow with no
  // PROJECT/EXPLORE categorization left to toggle, so nothing reads these
  // fields anymore. Left in the schema rather than deleted (non-destructive
  // migration -- see CLAUDE.md); a dedicated schema cleanup can remove them
  // later if desired. Do not wire new logic to these without first checking
  // whether the PROJECT/EXPLORE distinction they gated still exists at all.
  showProjectSection: boolean;
  showExploreSection: boolean;
  updatedAt: string;
};

const STORAGE_KEY = "dilida-portfolio:home-content:v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function emptyLocalizedText(): LocalizedText {
  return { zh: "", en: "" };
}

function normalizeLocalizedText(value: unknown): LocalizedText {
  if (!isRecord(value)) return emptyLocalizedText();
  return {
    zh: typeof value.zh === "string" ? value.zh : "",
    en: typeof value.en === "string" ? value.en : "",
    ...(value.useZhAsEnglishFallback === true ? { useZhAsEnglishFallback: true } : {}),
  };
}

// Migrates one v1 (plain string) field into LocalizedText. The old string is
// real content in whichever language it was actually authored in -- every
// field this app has ever populated through this schema so far is Chinese
// (see CHANGELOG), so it lands in `zh`; `en` is left genuinely empty rather
// than guessing a translation ("不要猜"). `useZhAsEnglishFallback: true` is
// set so the English homepage still shows this real content (via the same
// fallback flag/convention ProjectDocumentPage and projectPdfContent.ts
// already use for untranslated fields) instead of regressing to blank until
// a real translation is entered.
function migrateLegacyField(value: unknown): LocalizedText {
  const str = typeof value === "string" ? value : "";
  return { zh: str, en: "", useZhAsEnglishFallback: true };
}

export function emptyHomeContent(): HomeContent {
  return {
    version: 2,
    name: emptyLocalizedText(),
    intro: emptyLocalizedText(),
    roleLine: emptyLocalizedText(),
    longDescription: emptyLocalizedText(),
    footerCredit: emptyLocalizedText(),
    showProjectSection: true,
    showExploreSection: true,
    updatedAt: new Date(0).toISOString(),
  };
}

export function normalizeHomeContent(parsed: unknown): HomeContent | null {
  if (!isRecord(parsed)) return null;
  const updatedAt = typeof parsed.updatedAt === "string" ? parsed.updatedAt : emptyHomeContent().updatedAt;

  if (parsed.version === 2) {
    return {
      version: 2,
      name: normalizeLocalizedText(parsed.name),
      intro: normalizeLocalizedText(parsed.intro),
      roleLine: normalizeLocalizedText(parsed.roleLine),
      longDescription: normalizeLocalizedText(parsed.longDescription),
      footerCredit: normalizeLocalizedText(parsed.footerCredit),
      // Missing on any stored/published value written before this field
      // existed -- defaults true, matching "both sections visible" (the
      // only behavior that ever actually shipped before this setting did).
      showProjectSection: typeof parsed.showProjectSection === "boolean" ? parsed.showProjectSection : true,
      showExploreSection: typeof parsed.showExploreSection === "boolean" ? parsed.showExploreSection : true,
      updatedAt,
    };
  }

  if (parsed.version === 1) {
    return {
      version: 2,
      name: migrateLegacyField(parsed.name),
      intro: migrateLegacyField(parsed.intro),
      roleLine: emptyLocalizedText(),
      longDescription: migrateLegacyField(parsed.longDescription),
      footerCredit: migrateLegacyField(parsed.footerCredit),
      showProjectSection: true,
      showExploreSection: true,
      updatedAt,
    };
  }

  return null;
}

export function loadHomeContent(): HomeContent {
  const published = normalizeHomeContent(getPublishedHomeContent());
  if (typeof window === "undefined" || !import.meta.env.DEV) {
    return published ?? emptyHomeContent();
  }
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return published ?? emptyHomeContent();
    return normalizeHomeContent(JSON.parse(stored) as unknown) ?? published ?? emptyHomeContent();
  } catch {
    return published ?? emptyHomeContent();
  }
}

export function saveHomeContent(content: HomeContent): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(content));
  } catch {
    // best-effort, same as every other draft save path in this app
  }
}

// Same locale-resolution convention as ProjectDocumentPage.tsx's textFor /
// projectPdfContent.ts's localized: zh always shown as-is; en falls back to
// zh only when useZhAsEnglishFallback is explicitly set (legacy-migrated
// fields), otherwise an untranslated en field is shown as empty, never
// silently substituted.
export function textForLocale(value: LocalizedText, locale: "zh" | "en"): string {
  if (locale === "zh") return value.zh;
  return value.en || (value.useZhAsEnglishFallback ? value.zh : "");
}
