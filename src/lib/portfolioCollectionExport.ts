// Client-side orchestration for the "PORTFOLIO COLLECTION" export button.
//
// Project pages are captured server-side: this module only sends each
// project's real URL to the collection dev-server plugin
// (scripts/portfolioCollectionExportPlugin.ts), which drives its own
// headless Chromium directly to that URL and renders the PDF there. Earlier
// this used a hidden iframe inside the current tab plus a postMessage
// round-trip to ProjectExactWebExportBridge — that relied on
// requestAnimationFrame timing inside an invisible, near-zero-opacity
// iframe, which could hang indefinitely with no timeout (confirmed: it
// stalled even in a normal, focused browser). Server-side Playwright
// navigation has no such visibility-throttling problem, and every step here
// (stage, finalize) is a single bounded fetch — the server enforces its own
// per-step timeouts (navigate/ready/render) and always resolves or rejects.
//
// This still doesn't touch the single-project "Export Exact Web PDF" button
// (ProjectExactWebExportAction.tsx) — that path is unrelated and unchanged.

import { localizePath } from "../locales/LocaleContext";
import type { Locale } from "../locales/types";
import type { ResolvedProjectMetadata } from "./projectMetadata";
import { buildDynamicProjectStagingPayload, createCollectionJob, deleteCollectionJob, reportCollectionExportError, type StagedProjectPayload } from "./collectionExportStaging";
import { portfolioProfile } from "../data/portfolioProfile";
import { getUiPracticeCatalog, type UiPracticeCatalogItem } from "./uiPracticeCatalog";
import { formatAchievement, formatPlaytime, gameTitle, getGameExperienceStore, type GameExperienceRecord } from "./gameExperience";
import { getGameCoverRecord } from "./gameCoverDb";
import { MAX_COLLECTION_PROJECTS, type CoverTocEntry } from "./collectionCoverGeometry";

const stageEndpoint = "/__local-export/collection/stage";
const finalizeEndpoint = "/__local-export/collection/finalize";
const openFileEndpoint = "/__local-export/collection/open-file";
const openFolderEndpoint = "/__local-export/collection/open-folder";

// Matches the 1440x900 canvas every staged section/project page already
// renders at (see portfolioCollectionExportPlugin.ts / exactWebExportPlugin.ts).
const PAGE_WIDTH = 1440;
const PAGE_HEIGHT = 900;
// ~16mm safe margin, applied as real CSS padding on the content we compose
// ourselves (never as page-level scaling) so text and cards never sit flush
// against the page edge.
const MM_TO_PX = 96 / 25.4;
const SAFE_MARGIN_PX = Math.round(16 * MM_TO_PX);

export type CollectionExportPhase = "idle" | "staging" | "finalizing" | "done" | "error";

export type CollectionExportProgress = {
  phase: CollectionExportPhase;
  completed: number;
  total: number;
  currentLabel?: string;
};

export type CollectionExportResult = {
  outputPath: string;
  pages: number;
  links: number;
  outlines: number;
  bytes: number;
  selectedProjectIds: string[];
  excludedProjectIds: string[];
};

// Explicit selection contract from the collection editor (/:locale/export,
// PortfolioPdfBuilderPage's existing Outline/Projects/UI/Games panels) to
// this pipeline. The editor owns choosing and ordering; this module owns
// capturing and composing. project order, section order, and which UI
// Works/games are included all come from here — never re-decided or
// silently re-sliced inside this function once a selection exists.
export type PortfolioCollectionSectionId = "cover" | "projects" | "ui-works" | "game-experience" | "contact";

export type PortfolioCollectionSelection = {
  projectIds: string[];
  sectionOrder: PortfolioCollectionSectionId[];
  includeUiWorks: boolean;
  selectedUiWorkIds: string[];
  includeGameExperience: boolean;
  selectedGameIds: string[];
  includeContact: boolean;
};

type StagedToken = { sectionId: string; label: string; token: string };

function absoluteStylesheetMarkup() {
  return Array.from(document.head.querySelectorAll<HTMLLinkElement | HTMLStyleElement>('link[rel="stylesheet"], style'))
    .map((element) => {
      const clone = element.cloneNode(true) as HTMLLinkElement | HTMLStyleElement;
      if (clone instanceof HTMLLinkElement) clone.href = new URL(clone.href, document.baseURI).href;
      return clone.outerHTML;
    })
    .join("\n");
}

// --- Cover / index section, composed by this module (the only HTML we
// author ourselves) ---

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] as string));
}

const coverPageCss = `
  html, body { margin: 0; width: ${PAGE_WIDTH}px; background: #181743; color: #f4f5fa; }
  * { box-sizing: border-box; }
  .cx-page {
    width: ${PAGE_WIDTH}px;
    height: ${PAGE_HEIGHT}px;
    padding: ${SAFE_MARGIN_PX}px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .cx-eyebrow { font: 700 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 0.16em; text-transform: uppercase; color: #34f025; margin: 0 0 10px; }
  .cx-title { font: 650 34px/1.25 system-ui, sans-serif; margin: 0 0 6px; color: #f4f5fa; }
`;

// Brand footer shown bottom-right on every composed section page (cover,
// UI Works, Game Experience, Contact) — matches the reference collection
// PDF's "D.D / PORTFOLIO COLLECTION" mark on every non-project page.
const brandFooterHtml = `<div class="cx-brand">D.D / PORTFOLIO COLLECTION</div>`;

// The cover is no longer HTML/CSS built here — it's a deterministic SVG
// composed server-side from fixed geometry constants (see
// src/lib/collectionCoverGeometry.ts and scripts/collectionCoverRenderer.ts)
// with real Playwright text measurement for every TOC label. This module
// only builds the small JSON payload (TOC entries + brand/footer strings)
// that the server needs.
function buildCoverBrandLine(locale: Locale) {
  return `${portfolioProfile.name} | ${portfolioProfile.positioning[locale]}`;
}

function buildCoverFooterLabel() {
  return "D.D / PORTFOLIO COLLECTION";
}

// Emergency website-slice export's own cover: a plain HTML/CSS page (same
// renderSectionPdf path as Contact/UI Works, not the SVG dot-timeline
// renderer above) — explicitly no TOC, no project-navigation dots/lines,
// per that mode's own spec. Entries are listed as plain numbered text only.
const simpleCoverPageCss = `${coverPageCss}
  .cx-page { justify-content: center; }
  .cx-brand { position: absolute; right: ${SAFE_MARGIN_PX}px; bottom: ${Math.round(SAFE_MARGIN_PX * 0.6)}px; font: 700 9px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 0.08em; color: rgba(244,245,250,0.34); }
  .cx-simple-subtitle { font: 500 14px/1.6 system-ui, sans-serif; color: rgba(244,245,250,0.6); margin: 0 0 40px; }
  .cx-simple-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  .cx-simple-list li { font: 600 15px/1.4 system-ui, sans-serif; color: rgba(244,245,250,0.85); }
  .cx-simple-list li span { color: #34f025; font: 700 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace; margin-right: 10px; }
`;

function buildSimpleCoverHtml(entries: CoverTocEntry[], locale: Locale) {
  const items = entries.map((entry, index) => `<li><span>${String(index + 1).padStart(2, "0")}</span>${escapeHtml(entry.title)}</li>`).join("");
  const body = `<p class="cx-eyebrow">${escapeHtml(locale === "zh" ? "作品集合集" : "PORTFOLIO COLLECTION")}</p>
    <h1 class="cx-title">${escapeHtml(portfolioProfile.name)}</h1>
    <p class="cx-simple-subtitle">${escapeHtml(portfolioProfile.positioning[locale])}</p>
    <ul class="cx-simple-list">${items}</ul>
    ${brandFooterHtml}`;
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8">${absoluteStylesheetMarkup()}<style>${simpleCoverPageCss}</style></head>
    <body><div data-collection-export-section><div class="cx-page" style="position:relative;">${body}</div></div></body></html>`;
}

// --- Image downscale before embedding into a section's HTML ---
//
// UI Works / Game Experience sections are still rendered via Chromium's
// page.pdf() (unchanged, per scope) — but that print pipeline re-rasterizes
// every <img> as raw pixel data rather than reusing its original compressed
// bytes, so a handful of already-web-optimized images can still balloon the
// final PDF by many megabytes if embedded at their original resolution.
// Downscaling to roughly the size they're actually displayed at (2x for a
// crisp print) before they ever reach that HTML fixes this at the source —
// an encoding step, not a layout change; the cards render at the exact same
// CSS size either way.
function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load image "${src}".`));
    image.src = src;
  });
}

async function downscaleToJpegDataUrl(src: string, maxWidth: number, maxHeight: number, quality = 0.82): Promise<string> {
  if (!src) return src;
  try {
    const image = await loadImageElement(src);
    const scale = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
    const targetWidth = Math.max(1, Math.round(image.naturalWidth * scale));
    const targetHeight = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext("2d");
    if (!context) return src;
    context.drawImage(image, 0, 0, targetWidth, targetHeight);
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return src;
  }
}

// --- UI Works page(s) ---

const uiWorksPageCss = `${coverPageCss}
  .cx-brand { position: absolute; right: ${SAFE_MARGIN_PX}px; bottom: ${Math.round(SAFE_MARGIN_PX * 0.6)}px; font: 700 9px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 0.08em; color: rgba(244,245,250,0.34); }
  .cx-ui-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 8px; }
  .cx-ui-card { border: 1px solid rgba(133,165,255,0.22); border-radius: 12px; overflow: hidden; background: rgba(10,14,40,0.5); aspect-ratio: 4 / 3; }
  .cx-ui-card img { width: 100%; height: 100%; object-fit: cover; display: block; }
`;

const UI_WORKS_PER_PAGE = 6;

// Cards render at roughly 400x300 CSS px (3-column grid inside the
// 1440px page minus safe margins) — 880x660 is a comfortable 2x for a
// sharp print without embedding each source image at full original size.
const UI_WORKS_CARD_MAX_WIDTH = 880;
const UI_WORKS_CARD_MAX_HEIGHT = 660;

async function buildUiWorksSectionsHtml(items: UiPracticeCatalogItem[], locale: Locale) {
  if (!items.length) return [];
  const pages: UiPracticeCatalogItem[][] = [];
  for (let index = 0; index < items.length; index += UI_WORKS_PER_PAGE) pages.push(items.slice(index, index + UI_WORKS_PER_PAGE));
  const title = locale === "zh" ? "UI 作品" : "UI Works";
  const downscaled = await Promise.all(pages.map((pageItems) => Promise.all(
    pageItems.map((item) => downscaleToJpegDataUrl(item.src, UI_WORKS_CARD_MAX_WIDTH, UI_WORKS_CARD_MAX_HEIGHT)),
  )));
  return pages.map((pageItems, pageIndex) => {
    const eyebrow = `${locale === "zh" ? "UI 作品" : "UI WORKS"} / ${String(pageIndex + 1).padStart(2, "0")}`;
    const grid = pageItems.map((_item, itemIndex) => `<div class="cx-ui-card"><img src="${escapeHtml(downscaled[pageIndex][itemIndex])}" alt="" /></div>`).join("");
    const body = `<p class="cx-eyebrow">${escapeHtml(eyebrow)}</p>
      <h1 class="cx-title">${escapeHtml(title)}</h1>
      <div class="cx-ui-grid">${grid}</div>
      ${brandFooterHtml}`;
    return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8">${absoluteStylesheetMarkup()}<style>${uiWorksPageCss}</style></head>
      <body><div data-collection-export-section><div class="cx-page" style="position:relative;">${body}</div></div></body></html>`;
  });
}

// --- Game Experience page(s) ---

const gamesPageCss = `${coverPageCss}
  .cx-brand { position: absolute; right: ${SAFE_MARGIN_PX}px; bottom: ${Math.round(SAFE_MARGIN_PX * 0.6)}px; font: 700 9px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 0.08em; color: rgba(244,245,250,0.34); }
  .cx-game-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px 32px; margin-top: 10px; }
  .cx-game-row { display: flex; gap: 12px; }
  .cx-game-cover { flex: none; width: 64px; height: 64px; border-radius: 8px; object-fit: cover; background: rgba(133,165,255,0.14); }
  .cx-game-title { font: 650 15px/1.3 system-ui, sans-serif; color: #f4f5fa; margin: 0 0 4px; }
  .cx-game-meta { font: 400 10.5px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; color: rgba(244,245,250,0.5); margin: 0 0 6px; }
  .cx-game-tags { display: flex; flex-wrap: wrap; gap: 6px; }
  .cx-game-tag { font: 600 9px/1.6 system-ui, sans-serif; padding: 2px 8px; border-radius: 999px; background: rgba(52,240,37,0.12); color: #34f025; }
`;

const GAMES_PER_PAGE = 5;

async function resolveGameCoverSrc(record: GameExperienceRecord): Promise<string> {
  const assetId = record.presentation.coverAssetId;
  if (assetId) {
    const cover = await getGameCoverRecord(assetId).catch(() => undefined);
    if (cover?.blob) return blobToDataUrl(cover.blob);
  }
  return record.presentation.coverPublicPath ?? "";
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)), { once: true });
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Unable to read a game cover image.")), { once: true });
    reader.readAsDataURL(blob);
  });
}

async function buildGameExperienceSectionsHtml(records: GameExperienceRecord[], locale: Locale): Promise<string[]> {
  if (!records.length) return [];
  const withCovers = await Promise.all(records.map(async (record) => {
    const rawCover = await resolveGameCoverSrc(record).catch(() => "");
    // Displayed at 64x64 CSS px — 160x160 is a comfortable 2.5x for a
    // sharp print without embedding an arbitrarily large source cover.
    const cover = rawCover ? await downscaleToJpegDataUrl(rawCover, 160, 160) : "";
    return { record, cover };
  }));
  const pages: (typeof withCovers)[] = [];
  for (let index = 0; index < withCovers.length; index += GAMES_PER_PAGE) pages.push(withCovers.slice(index, index + GAMES_PER_PAGE));
  const title = locale === "zh" ? "游戏经历" : "Game Experience";
  return pages.map((pageRecords, pageIndex) => {
    const eyebrow = `${locale === "zh" ? "游戏经历" : "GAME EXPERIENCE"} / ${String(pageIndex + 1).padStart(2, "0")}`;
    const rows = pageRecords.map(({ record, cover }) => {
      const tags = record.presentation.tags.map((tag) => locale === "zh" ? (tag.zh || tag.en) : (tag.en || tag.zh)).filter(Boolean).slice(0, 4);
      return `<div class="cx-game-row">
        ${cover ? `<img class="cx-game-cover" src="${escapeHtml(cover)}" alt="" />` : `<div class="cx-game-cover"></div>`}
        <div style="min-width:0;">
          <p class="cx-game-title">${escapeHtml(gameTitle(record, locale))}</p>
          <p class="cx-game-meta">${escapeHtml(formatPlaytime(record, locale))} · ${escapeHtml(formatAchievement(record, locale))}</p>
          <div class="cx-game-tags">${tags.map((tag) => `<span class="cx-game-tag">${escapeHtml(tag)}</span>`).join("")}</div>
        </div>
      </div>`;
    }).join("");
    const body = `<p class="cx-eyebrow">${escapeHtml(eyebrow)}</p>
      <h1 class="cx-title">${escapeHtml(title)}</h1>
      <div class="cx-game-grid">${rows}</div>
      ${brandFooterHtml}`;
    return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8">${absoluteStylesheetMarkup()}<style>${gamesPageCss}</style></head>
      <body><div data-collection-export-section><div class="cx-page" style="position:relative;">${body}</div></div></body></html>`;
  });
}

// --- Contact page ---

const contactPageCss = `${coverPageCss}
  .cx-page { justify-content: center; align-items: center; text-align: center; }
  .cx-brand { position: absolute; right: ${SAFE_MARGIN_PX}px; bottom: ${Math.round(SAFE_MARGIN_PX * 0.6)}px; font: 700 9px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 0.08em; color: rgba(244,245,250,0.34); }
  .cx-contact-eyebrow { font: 700 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 0.24em; color: rgba(244,245,250,0.5); margin: 0 0 18px; }
  .cx-contact-title { font: 700 34px/1.3 system-ui, sans-serif; color: #f4f5fa; margin: 0 0 14px; }
  .cx-contact-subtitle { font: 400 13px/1.7 system-ui, sans-serif; color: rgba(244,245,250,0.64); max-width: 480px; margin: 0 auto 26px; }
  .cx-contact-divider { width: 220px; height: 1px; background: rgba(244,245,250,0.22); margin: 0 auto 18px; }
  .cx-contact-line { font: 600 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; color: #34f025; }
`;

function buildContactSectionHtml(locale: Locale) {
  const eyebrow = locale === "zh" ? "END / 联系方式" : "END / CONTACT";
  const title = locale === "zh" ? "感谢阅读" : "Thank You for Reading";
  const subtitle = locale === "zh"
    ? "期待继续讨论游戏体验、交互系统与可落地的界面方向。"
    : "Happy to keep talking about game experience, interaction systems, and shippable interface direction.";
  const contactLine = [portfolioProfile.contact.email, portfolioProfile.contact.location].filter(Boolean).join(" · ");
  const body = `<p class="cx-contact-eyebrow">${escapeHtml(eyebrow)}</p>
    <h1 class="cx-contact-title">${escapeHtml(title)}</h1>
    <p class="cx-contact-subtitle">${escapeHtml(subtitle)}</p>
    <div class="cx-contact-divider"></div>
    <p class="cx-contact-line">${escapeHtml(contactLine)}</p>
    ${brandFooterHtml}`;
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8">${absoluteStylesheetMarkup()}<style>${contactPageCss}</style></head>
    <body><div data-collection-export-section><div class="cx-page" style="position:relative;">${body}</div></div></body></html>`;
}

// --- Stage / finalize calls against the existing collection plugin ---

async function stageSection(payload: Record<string, unknown>, signal?: AbortSignal): Promise<{ token: string }> {
  const response = await fetch(stageEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  const body = await response.json().catch(() => ({})) as { token?: string; error?: string };
  if (!response.ok || !body.token) throw new Error(body.error || "Unable to stage a collection page.");
  return { token: body.token };
}

const DEFAULT_SECTION_ORDER: PortfolioCollectionSectionId[] = ["cover", "projects", "ui-works", "game-experience", "contact"];


export async function runPortfolioCollectionExport(
  projects: ResolvedProjectMetadata[],
  locale: Locale,
  selection: PortfolioCollectionSelection,
  // Explicit, caller-supplied override — real React state from the /export
  // editor's own "Emergency export" checkbox (PortfolioPdfBuilderPage.tsx),
  // not parsed from window.location. When true, the server keeps whatever
  // PDF segments Chromium actually generated for a project instead of
  // hard-failing on a segment-count mismatch (see captureProjectPage in
  // scripts/portfolioCollectionExportPlugin.ts). Every other export-
  // blocking check (missing draft, missing images, clipped content, failed
  // rendering, empty body) is unaffected. Defaults to false.
  emergencyPdfExport = false,
  // Separate, independent emergency mode: renders each project's REAL
  // website layout and slices it into landscape-A4-ratio physical PDF
  // pages via manual clip+shift, never Chromium's print auto-pagination
  // (see captureProjectPageWebsiteSlice in
  // scripts/portfolioCollectionExportPlugin.ts). Uses a plain-text cover
  // (no TOC/dots) and suppresses live Figma iframes. Independent of
  // emergencyPdfExport — the two are not meant to be combined.
  websiteSlice = false,
  onProgress?: (progress: CollectionExportProgress) => void,
  signal?: AbortSignal,
): Promise<CollectionExportResult> {
  const eligible = projects.filter((project) => project.visibility === "public");
  if (!eligible.length) throw new Error(locale === "zh" ? "没有可导出的公开项目。" : "No public projects to export.");

  // Project order comes from the editor's selection, not re-decided here —
  // an id the editor didn't select never appears, and an id it did select
  // but that's no longer a real public project (deleted/unpublished since
  // the selection was made) is silently dropped rather than crashing the
  // export. The MAX_COLLECTION_PROJECTS cap is enforced again here as a
  // hard backstop even though the editor is also expected to enforce it.
  const eligibleById = new Map(eligible.map((project) => [project.id, project]));
  const visible = selection.projectIds
    .map((id) => eligibleById.get(id))
    .filter((project): project is ResolvedProjectMetadata => Boolean(project))
    .slice(0, MAX_COLLECTION_PROJECTS);
  const visibleIds = new Set(visible.map((project) => project.id));
  const excludedProjectIds = eligible.filter((project) => !visibleIds.has(project.id)).map((project) => project.id);
  if (!visible.length) throw new Error(locale === "zh" ? "没有选中任何项目。" : "No projects selected.");

  // Same pattern for UI Works / Game Experience: the editor's explicit
  // include flag + ordered id list wins outright — never silently padded
  // back out to "first N" once an explicit (possibly empty) selection
  // exists, per the editor's own enabled/disabled + order controls.
  const uiCatalogById = new Map(getUiPracticeCatalog().map((item) => [item.id, item]));
  const uiWorks = selection.includeUiWorks
    ? selection.selectedUiWorkIds.map((id) => uiCatalogById.get(id)).filter((item): item is UiPracticeCatalogItem => Boolean(item))
    : [];
  const gameById = new Map(getGameExperienceStore().records.map((record) => [record.id, record]));
  const games = selection.includeGameExperience
    ? selection.selectedGameIds.map((id) => gameById.get(id)).filter((record): record is GameExperienceRecord => Boolean(record))
    : [];
  const includeContact = selection.includeContact;
  const sectionOrder = selection.sectionOrder.length ? selection.sectionOrder : DEFAULT_SECTION_ORDER;

  // The cover/index and Contact are each always exactly one capture unit;
  // UI Works and Game Experience may each paginate into more than one
  // physical page, but that's still one "capture" step in the visible
  // progress count — same treatment the cover already had. Only real
  // projects are ever labeled/counted as project captures.
  const total = sectionOrder.reduce((sum, section) => {
    if (section === "cover") return sum + 1;
    if (section === "projects") return sum + visible.length;
    if (section === "ui-works") return sum + (uiWorks.length ? 1 : 0);
    if (section === "game-experience") return sum + (games.length ? 1 : 0);
    if (section === "contact") return sum + (includeContact ? 1 : 0);
    return sum;
  }, 0);
  let completed = 0;
  const report = (phase: CollectionExportPhase, currentLabel?: string) => onProgress?.({ phase, completed, total, currentLabel });
  const checkCancelled = () => { if (signal?.aborted) throw new Error(locale === "zh" ? "已取消。" : "Cancelled."); };

  // Any project whose real content only exists in THIS browser's own
  // storage (a dynamic project's catalog entry, draft, or not-yet-disk-
  // committed images) is staged to a temporary job directory on disk before
  // capture starts — the server's headless Chromium runs a separate browser
  // profile and can't see this browser's localStorage/IndexedDB otherwise.
  // See collectionExportStaging.ts. jobId is only actually used (passed to
  // each project's capture URL) if staging finds something to stage.
  const jobId = crypto.randomUUID();
  let jobCreated = false;
  try {
    const stagingPayloads = (await Promise.all(visible.map((project) => buildDynamicProjectStagingPayload(project.id, jobId))))
      .filter((payload): payload is StagedProjectPayload => payload !== null);
    if (stagingPayloads.length) {
      await createCollectionJob(jobId, stagingPayloads);
      jobCreated = true;
    }

    report("staging");
    const staged: StagedToken[] = [];

    // The cover's own table of contents follows the same sectionOrder the
    // rest of this loop stages in — TOC and generated pages always reflect
    // the exact same selection, never two independently-decided lists.
    const coverEntries: CoverTocEntry[] = sectionOrder.flatMap((section): CoverTocEntry[] => {
      if (section === "projects") return visible.map((project) => ({ id: project.id, title: project.title }));
      if (section === "ui-works") return uiWorks.length ? [{ id: "ui-works", title: locale === "zh" ? "UI 作品" : "UI Works" }] : [];
      if (section === "game-experience") return games.length ? [{ id: "games", title: locale === "zh" ? "游戏经历" : "Game Experience" }] : [];
      if (section === "contact") return includeContact ? [{ id: "contact", title: locale === "zh" ? "联系方式" : "Contact" }] : [];
      return [];
    });

    for (const section of sectionOrder) {
      checkCancelled();
      if (section === "cover") {
        const { token } = websiteSlice
          ? await stageSection({ sectionId: "cover", label: "Cover", kind: "section", html: buildSimpleCoverHtml(coverEntries, locale) }, signal)
          : await stageSection({
            sectionId: "cover", label: "Cover", kind: "cover",
            entries: coverEntries, brandLine: buildCoverBrandLine(locale), footerLabel: buildCoverFooterLabel(),
          }, signal);
        staged.push({ sectionId: "cover", label: "Cover", token });
        completed += 1;
        report("staging");
      } else if (section === "projects") {
        for (const project of visible) {
          checkCancelled();
          report("staging", project.title);
          const path = `${localizePath(project.route ?? `/work/${project.slug}`, locale)}?collectionExport=1${websiteSlice ? "&websiteSliceExport=1" : ""}${jobCreated ? `&collectionJob=${jobId}` : ""}`;
          const url = `${window.location.origin}${path}`;
          console.info("[collection export] staging project", project.id, "emergencyPdfExport =", emergencyPdfExport, "websiteSlice =", websiteSlice);
          const { token } = await stageSection({ sectionId: project.id, label: project.title, kind: "project", url, projectId: project.id, emergencyPdfExport, websiteSlice }, signal);
          staged.push({ sectionId: project.id, label: project.title, token });
          completed += 1;
          report("staging", project.title);
        }
      } else if (section === "ui-works" && uiWorks.length) {
        report("staging", locale === "zh" ? "UI 作品" : "UI Works");
        const uiPages = await buildUiWorksSectionsHtml(uiWorks, locale);
        for (const [index, html] of uiPages.entries()) {
          checkCancelled();
          const sectionId = index === 0 ? "ui-works" : `ui-works-${index}`;
          const { token } = await stageSection({ sectionId, label: "UI Works", kind: "section", html }, signal);
          staged.push({ sectionId, label: "UI Works", token });
        }
        completed += 1;
        report("staging");
      } else if (section === "game-experience" && games.length) {
        report("staging", locale === "zh" ? "游戏经历" : "Game Experience");
        const gamePages = await buildGameExperienceSectionsHtml(games, locale);
        for (const [index, html] of gamePages.entries()) {
          checkCancelled();
          const sectionId = index === 0 ? "games" : `games-${index}`;
          const { token } = await stageSection({ sectionId, label: "Game Experience", kind: "section", html }, signal);
          staged.push({ sectionId, label: "Game Experience", token });
        }
        completed += 1;
        report("staging");
      } else if (section === "contact" && includeContact) {
        report("staging", locale === "zh" ? "联系方式" : "Contact");
        const html = buildContactSectionHtml(locale);
        const { token } = await stageSection({ sectionId: "contact", label: "Contact", kind: "section", html }, signal);
        staged.push({ sectionId: "contact", label: "Contact", token });
        completed += 1;
        report("staging");
      }
    }

    checkCancelled();
    report("finalizing");
    const filename = `portfolio-collection-${locale}-${new Date().toISOString().replace(/[:.]/g, "-")}.pdf`;
    const response = await fetch(finalizeEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, tokens: staged.map((entry) => entry.token) }),
      signal,
    });
    if (!response.ok) {
      const failure = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(failure.error || "Unable to finalize the collection PDF.");
    }
    const outputPath = decodeURIComponent(response.headers.get("X-Collection-Output") ?? "");
    const pages = Number(response.headers.get("X-Collection-Pages") ?? "0");
    const links = Number(response.headers.get("X-Collection-Links") ?? "0");
    const outlines = Number(response.headers.get("X-Collection-Outlines") ?? "0");
    const bytes = Number(response.headers.get("X-Collection-Bytes") ?? "0");
    // The finalize response also carries the PDF bytes (for a browser
    // download), but the file already exists on disk at outputPath — that's
    // what "open file" / "open folder" act on, so the bytes aren't read here.
    await response.arrayBuffer();

    return { outputPath, pages, links, outlines, bytes, selectedProjectIds: visible.map((project) => project.id), excludedProjectIds };
  } catch (error) {
    await reportCollectionExportError({
      message: error instanceof Error ? error.message : String(error),
      locale,
      jobId: jobCreated ? jobId : null,
      projectIds: visible.map((project) => project.id),
    });
    throw error;
  } finally {
    if (jobCreated) await deleteCollectionJob(jobId);
  }
}

export async function openCollectionFile(path: string) {
  const response = await fetch(openFileEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
  if (!response.ok) {
    const failure = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(failure.error || "Unable to open the file.");
  }
}

export async function openCollectionFolder(path: string) {
  const response = await fetch(openFolderEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
  if (!response.ok) {
    const failure = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(failure.error || "Unable to open the folder.");
  }
}
