// Builds the Portfolio Collection's cover (page 1) and index (page 2) as
// two separate SVG compositions, each sized to its own actual content
// (both 1440 wide, independently short/compact heights — never a fixed
// tall canvas with leftover empty space):
//   - the cover is identity only — background, graphic (panels+circles),
//     brand title, footer. No project content, no heading.
//   - the index is just the project entries — no heading — one column per
//     selected entry, side by side, each with a number, title, small
//     category/duration metadata, and a wide thumbnail crop of that
//     project's cover image.
// All geometry comes from src/lib/collectionCoverGeometry.ts. No HTML/CSS
// flex or grid is involved anywhere in this file; every coordinate is
// either a geometry constant or the output of the deterministic text-fit
// function below.
import type { Browser } from "playwright-core";
import fs from "node:fs/promises";
import path from "node:path";
import { COVER_GEOMETRY, INDEX_PAGE, indexColumnPositions, computeIndexPageHeight, MAX_COLLECTION_PROJECTS, type CoverTocEntry } from "../src/lib/collectionCoverGeometry";

const FONT_SANS = `"Inter","Avenir Next","Segoe UI",Arial,sans-serif`;
const FONT_MONO = `"IBM Plex Mono",SFMono-Regular,Consolas,"Liberation Mono",monospace`;

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] as string));
}

export type LabelFitDiagnostics = {
  title: string;
  slot: number;
  fontSize: number;
  lineCount: number;
  truncated: boolean;
  lines: string[];
};

// --- Real font measurement (Playwright, the exact font stack the site's
// own CSS declares — no bundled/redistributed font file, same system-
// fallback behavior a real visitor's browser resolves) ---

async function measureTextWidth(measurePage: import("playwright-core").Page, text: string, fontFamily: string, fontSize: number, fontWeight: number): Promise<number> {
  return measurePage.evaluate(
    ({ text, fontFamily, fontSize, fontWeight }) => {
      const svgNS = "http://www.w3.org/2000/svg";
      let svg = document.getElementById("__measure_svg__") as SVGSVGElement | null;
      if (!svg) {
        svg = document.createElementNS(svgNS, "svg") as SVGSVGElement;
        svg.setAttribute("id", "__measure_svg__");
        svg.setAttribute("style", "position:absolute;visibility:hidden;width:0;height:0;");
        document.body.appendChild(svg);
      }
      const textEl = document.createElementNS(svgNS, "text");
      textEl.setAttribute("font-family", fontFamily);
      textEl.setAttribute("font-size", String(fontSize));
      textEl.setAttribute("font-weight", String(fontWeight));
      textEl.textContent = text;
      svg.appendChild(textEl);
      const width = (textEl as SVGTextElement).getComputedTextLength();
      svg.removeChild(textEl);
      return width;
    },
    { text, fontFamily, fontSize, fontWeight },
  );
}

function tokenize(text: string): string[] {
  // Latin/space-separated text wraps on word boundaries; CJK (no spaces)
  // wraps per-character, matching how the reference's own TOC labels break.
  return /\s/.test(text) ? text.split(/(\s+)/).filter((token) => token.length > 0) : Array.from(text);
}

async function greedyWrap(measurePage: import("playwright-core").Page, text: string, fontSize: number, maxWidth: number, maxLines: number): Promise<{ lines: string[]; overflow: boolean }> {
  const tokens = tokenize(text);
  const lines: string[] = [];
  let current = "";
  for (const token of tokens) {
    const candidate = current + token;
    const width = await measureTextWidth(measurePage, candidate.trim(), FONT_SANS, fontSize, 500);
    if (width <= maxWidth || !current.trim()) {
      current = candidate;
    } else {
      lines.push(current.trim());
      current = token;
      if (lines.length >= maxLines) break;
    }
  }
  if (lines.length < maxLines && current.trim()) lines.push(current.trim());
  const consumedText = lines.join("");
  const overflow = consumedText.replace(/\s+/g, "") !== text.replace(/\s+/g, "");
  return { lines: lines.slice(0, maxLines), overflow };
}

async function ellipsisFit(measurePage: import("playwright-core").Page, text: string, fontSize: number, maxWidth: number): Promise<string> {
  const full = await measureTextWidth(measurePage, text, FONT_SANS, fontSize, 500);
  if (full <= maxWidth) return text;
  const chars = Array.from(text);
  let low = 0, high = chars.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = `${chars.slice(0, mid).join("")}…`;
    const width = await measureTextWidth(measurePage, candidate, FONT_SANS, fontSize, 500);
    if (width <= maxWidth) low = mid; else high = mid - 1;
  }
  return `${chars.slice(0, low).join("")}…`;
}

// Deterministic index-column title fit: try the normal font size at 1
// line, then wrapped to titleMaxLines; if it still doesn't fit, fall back
// to a measured ellipsis on the last line. Every column's title is fit
// independently against its own column width — neighboring columns are
// never affected.
async function fitIndexTitle(measurePage: import("playwright-core").Page, text: string, index: number, maxWidth: number): Promise<LabelFitDiagnostics> {
  const { titleFontSize, titleMaxLines } = INDEX_PAGE;
  const oneLineWidth = await measureTextWidth(measurePage, text, FONT_SANS, titleFontSize, 600);
  if (oneLineWidth <= maxWidth) {
    return { title: text, slot: index, fontSize: titleFontSize, lineCount: 1, truncated: false, lines: [text] };
  }
  const { lines, overflow } = await greedyWrap(measurePage, text, titleFontSize, maxWidth, titleMaxLines);
  if (!overflow) {
    return { title: text, slot: index, fontSize: titleFontSize, lineCount: lines.length, truncated: false, lines };
  }
  const keep = lines.slice(0, titleMaxLines - 1);
  const remainderText = text.slice(keep.join("").length) || text;
  const truncatedLast = await ellipsisFit(measurePage, remainderText, titleFontSize, maxWidth);
  const finalLines = [...keep, truncatedLast];
  return { title: text, slot: index, fontSize: titleFontSize, lineCount: finalLines.length, truncated: true, lines: finalLines };
}

export async function fitIndexTitles(browser: Browser, entries: CoverTocEntry[]): Promise<LabelFitDiagnostics[]> {
  const measurePage = await browser.newPage({ viewport: { width: 100, height: 100 } });
  try {
    await measurePage.setContent("<!doctype html><html><body></body></html>");
    await measurePage.evaluate(() => document.fonts.ready);
    const positions = indexColumnPositions(entries.length);
    const results: LabelFitDiagnostics[] = [];
    for (const [index, entry] of entries.entries()) {
      const textWidth = positions[index].width - 4; // negligible inset, columns already have their own gap
      results.push(await fitIndexTitle(measurePage, entry.title, index, textWidth));
    }
    return results;
  } finally {
    await measurePage.close().catch(() => undefined);
  }
}

// --- SVG assembly (single source of truth for each page's visual output) ---

// Page 1: identity only — background, graphic (panels+circles), brand
// title, footer. No project content, no TOC/index elements.
export function buildCoverPageSvg(brandLine: string, footerLabel: string): string {
  const g = COVER_GEOMETRY;

  const panelsAndCircles = g.panels.map((panel, panelIndex) => {
    // The reference's rightmost panel dissolves into the background near
    // the page edge rather than ending on a hard rect edge (confirmed by
    // sampling its own pixels: color fades gradually from ~x1015 to
    // background by ~x1250) — every other panel has a clean edge. Matching
    // just that one fade closes most of the measured graphic-bounding-box
    // deviation against the reference.
    const isLastPanel = panelIndex === g.panels.length - 1;
    const fill = isLastPanel ? "url(#panelGradientFade)" : "url(#panelGradient)";
    const rect = `<rect x="${panel.rect.x}" y="${panel.rect.y}" width="${panel.rect.width}" height="${panel.rect.height}" rx="22" fill="${fill}" />`;
    const circles = panel.circles.map((circle) => `<circle cx="${circle.cx}" cy="${circle.cy}" r="${circle.r}" fill="${g.accentGreen}" />`).join("\n");
    return `${rect}\n${circles}`;
  }).join("\n");

  const title = `<text x="${g.title.centerX}" y="${g.title.baselineY}" text-anchor="middle" font-family='${FONT_MONO}' font-size="${g.title.fontSize}" font-weight="700" letter-spacing="0.3" fill="${g.accentGreen}">${escapeXml(brandLine)}</text>`;

  // letter-spacing widened from 0.7 to 2.2: the reference's own footer mark
  // measures ~189px wide for this text; Chromium's font-fallback rendering
  // of the same string came out narrower (~146px) at the original spacing,
  // so widening the tracking closes most of that gap without changing the
  // text, position anchor, or font size.
  const footer = `<text x="${g.footer.rightX}" y="${g.footer.baselineY}" text-anchor="end" font-family='${FONT_MONO}' font-size="${g.footer.fontSize}" font-weight="700" letter-spacing="2.2" fill="${g.softWhite}" fill-opacity="0.34">${escapeXml(footerLabel)}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${g.width}" height="${g.height}" viewBox="0 0 ${g.width} ${g.height}">
  <defs>
    <linearGradient id="panelGradient" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${g.panelGradientFrom}" />
      <stop offset="100%" stop-color="${g.panelGradientTo}" />
    </linearGradient>
    <linearGradient id="panelGradientFade" x1="0" y1="0" x2="1" y2="0.55">
      <stop offset="0%" stop-color="${g.panelGradientFrom}" />
      <stop offset="55%" stop-color="${g.panelGradientTo}" />
      <stop offset="100%" stop-color="${g.panelGradientTo}" stop-opacity="0" />
    </linearGradient>
  </defs>
  <rect width="${g.width}" height="${g.height}" fill="${g.background}" />
  ${panelsAndCircles}
  ${title}
  ${footer}
</svg>`;
}

// Page 2: editorial index. Same dark-navy + fluorescent-green language as
// the cover (same background/accent colors), but a fully separate
// composition — number -> title -> small metadata -> shallow wide
// thumbnail, in equal-width side-by-side columns with a thin vertical
// separator between them. An entry with no coverUrl (non-project section
// entries) falls back to a plain panel-toned rect instead of a
// placeholder/X — the column, its title, and its click target still work.
export function buildIndexPageSvg(entries: CoverTocEntry[], fits: LabelFitDiagnostics[]): string {
  const g = COVER_GEOMETRY;
  const p = INDEX_PAGE;
  const positions = indexColumnPositions(entries.length);
  const height = computeIndexPageHeight(entries.length);

  const columns = entries.map((entry, index) => {
    const pos = positions[index];
    const fit = fits[index];
    const number = String(index + 1).padStart(2, "0");
    const numberEl = `<text x="${pos.x}" y="${pos.numberBaselineY}" font-family='${FONT_MONO}' font-size="${p.numberFontSize}" font-weight="700" fill="${g.accentGreen}">${escapeXml(number)}</text>`;
    const titleLines = fit.lines.map((line, lineIndex) =>
      `<text x="${pos.x}" y="${pos.titleTopY + (lineIndex + 1) * p.titleLineHeight - 6}" font-family='${FONT_SANS}' font-size="${fit.fontSize}" font-weight="600" fill="${g.softWhite}">${escapeXml(line)}</text>`,
    ).join("\n");
    const metaEl = entry.metaLabel
      ? `<text x="${pos.x}" y="${pos.metaBaselineY}" font-family='${FONT_SANS}' font-size="${p.metaFontSize}" font-weight="500" fill="${g.softWhite}" fill-opacity="0.5">${escapeXml(entry.metaLabel)}</text>`
      : "";
    const image = entry.coverUrl
      ? `<image href="${escapeXml(entry.coverUrl)}" x="${pos.x}" y="${pos.thumbY}" width="${pos.width}" height="${pos.thumbHeight}" preserveAspectRatio="xMidYMid slice" />`
      : `<rect x="${pos.x}" y="${pos.thumbY}" width="${pos.width}" height="${pos.thumbHeight}" fill="${g.panelGradientTo}" />`;
    const thumbOutline = `<rect x="${pos.x}" y="${pos.thumbY}" width="${pos.width}" height="${pos.thumbHeight}" fill="none" stroke="${g.softWhite}" stroke-opacity="0.16" stroke-width="1" />`;
    return `${numberEl}\n${titleLines}\n${metaEl}\n${image}\n${thumbOutline}`;
  }).join("\n");

  // Thin vertical separators between columns that share the same row
  // (grouped by identical row-top y, since indexColumnPositions lays out
  // full rows before wrapping) — centered in the fixed gap, spanning that
  // row's own content height (number through thumbnail bottom).
  const rows = new Map<number, typeof positions>();
  positions.forEach((pos) => {
    const row = rows.get(pos.y) ?? [];
    row.push(pos);
    rows.set(pos.y, row);
  });
  const separators = [...rows.values()].flatMap((row) => {
    const top = row[0].y;
    const bottom = row[0].thumbY + row[0].thumbHeight;
    return row.slice(0, -1).map((pos) => {
      const sepX = pos.x + pos.width + p.columnGap / 2;
      return `<line x1="${sepX}" y1="${top}" x2="${sepX}" y2="${bottom}" stroke="${g.softWhite}" stroke-opacity="0.16" stroke-width="1" />`;
    });
  }).join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${g.width}" height="${height}" viewBox="0 0 ${g.width} ${height}">
  <rect width="${g.width}" height="${height}" fill="${g.background}" />
  ${columns}
  ${separators}
</svg>`;
}

export type CoverRenderResult = {
  coverSvg: string;
  coverPng: Buffer;
  coverHeightPx: number;
  indexSvg: string;
  indexPng: Buffer;
  indexHeightPx: number;
  fits: LabelFitDiagnostics[];
  coverSvgPath: string;
  coverPngPath: string;
  indexSvgPath: string;
  indexPngPath: string;
};

async function screenshotSvg(browser: Browser, svg: string, heightPx: number): Promise<Buffer> {
  const renderPage = await browser.newPage({ viewport: { width: COVER_GEOMETRY.width, height: heightPx }, deviceScaleFactor: 1 });
  try {
    await renderPage.setContent(`<!doctype html><html><body style="margin:0;padding:0;">${svg}</body></html>`, { waitUntil: "load" });
    await renderPage.evaluate(() => document.fonts.ready);
    return await renderPage.locator("svg").screenshot({ type: "png" });
  } finally {
    await renderPage.close().catch(() => undefined);
  }
}

// Renders both pages to real PNGs via Playwright (not an arbitrary HTML
// page screenshot — the SVG element itself is screenshotted at its exact
// native size) and writes all four debug artifacts to disk, per the
// requirement that both pages be directly inspectable outside the final
// PDF. Each page gets its own compact height — the cover's is a fixed
// constant (its content never depends on the selection), the index's is
// computed directly from the actual entries (computeIndexPageHeight) —
// never a shared fixed tall canvas.
export async function renderCollectionCoverPages(
  browser: Browser,
  entries: CoverTocEntry[],
  brandLine: string,
  footerLabel: string,
  debugDir: string,
): Promise<CoverRenderResult> {
  const cappedEntries = entries.slice(0, MAX_COLLECTION_PROJECTS + 3); // generous cap; MAX_COLLECTION_PROJECTS already bounds real project entries upstream
  const fits = await fitIndexTitles(browser, cappedEntries);
  const coverSvg = buildCoverPageSvg(brandLine, footerLabel);
  const indexSvg = buildIndexPageSvg(cappedEntries, fits);
  const indexHeight = computeIndexPageHeight(cappedEntries.length);

  const [coverPng, indexPng] = await Promise.all([
    screenshotSvg(browser, coverSvg, COVER_GEOMETRY.height),
    screenshotSvg(browser, indexSvg, indexHeight),
  ]);

  await fs.mkdir(debugDir, { recursive: true });
  const coverSvgPath = path.join(debugDir, "cover.svg");
  const coverPngPath = path.join(debugDir, "cover.png");
  const indexSvgPath = path.join(debugDir, "index.svg");
  const indexPngPath = path.join(debugDir, "index.png");
  await Promise.all([
    fs.writeFile(coverSvgPath, coverSvg, "utf8"),
    fs.writeFile(coverPngPath, coverPng),
    fs.writeFile(indexSvgPath, indexSvg, "utf8"),
    fs.writeFile(indexPngPath, indexPng),
  ]);

  return {
    coverSvg, coverPng, coverHeightPx: COVER_GEOMETRY.height,
    indexSvg, indexPng, indexHeightPx: indexHeight,
    fits, coverSvgPath, coverPngPath, indexSvgPath, indexPngPath,
  };
}

export { MAX_COLLECTION_PROJECTS };
