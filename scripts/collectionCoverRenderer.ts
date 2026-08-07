// Builds the Portfolio Collection cover as one fixed 1440x900 SVG
// composition — background, graphic (panels+circles), title, TOC line,
// nodes, labels, footer — all placed from the measured constants in
// src/lib/collectionCoverGeometry.ts. No HTML/CSS flex or grid is involved
// anywhere in this file; every coordinate is either a geometry constant or
// the output of the deterministic text-fit function below.
import type { Browser } from "playwright-core";
import fs from "node:fs/promises";
import path from "node:path";
import { COVER_GEOMETRY, TOC_SLOT_COUNT, tocSlotPositions, tocLabelSlotWidth, MAX_COLLECTION_PROJECTS, type CoverTocEntry } from "../src/lib/collectionCoverGeometry";

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

// Deterministic label fit: try the normal font size at 1 line, then 2 lines;
// if it still doesn't fit, step the font size down within the allowed
// range and retry; at the floor size, fall back to a measured ellipsis on
// the second line. Neighboring slots are never affected — every label is
// fit independently against its own fixed slotWidth.
async function fitTocLabel(measurePage: import("playwright-core").Page, text: string, slotIndex: number, slotWidth: number): Promise<LabelFitDiagnostics> {
  const { fontSizeNormal, fontSizeMin, labelMaxLines } = COVER_GEOMETRY.toc;
  for (let fontSize: number = fontSizeNormal; fontSize >= fontSizeMin; fontSize -= 1) {
    const oneLineWidth = await measureTextWidth(measurePage, text, FONT_SANS, fontSize, 500);
    if (oneLineWidth <= slotWidth) {
      return { title: text, slot: slotIndex, fontSize, lineCount: 1, truncated: false, lines: [text] };
    }
    const { lines, overflow } = await greedyWrap(measurePage, text, fontSize, slotWidth, labelMaxLines);
    if (!overflow) {
      return { title: text, slot: slotIndex, fontSize, lineCount: lines.length, truncated: false, lines };
    }
    if (fontSize === fontSizeMin) {
      // Floor reached and still too long even wrapped to labelMaxLines —
      // keep the first (labelMaxLines - 1) wrapped lines as-is and give the
      // last line a measured ellipsis rather than letting it overflow the
      // slot or push into the next one.
      const keep = lines.slice(0, labelMaxLines - 1);
      const remainderText = text.slice(keep.join("").length) || text;
      const truncatedLast = await ellipsisFit(measurePage, remainderText, fontSize, slotWidth);
      const finalLines = [...keep, truncatedLast];
      return { title: text, slot: slotIndex, fontSize, lineCount: finalLines.length, truncated: true, lines: finalLines };
    }
  }
  // Unreachable (loop always returns by the floor iteration), but keep
  // TypeScript happy with an exhaustive fallback.
  return { title: text, slot: slotIndex, fontSize: fontSizeMin, lineCount: 1, truncated: true, lines: [text] };
}

export async function fitTocLabels(browser: Browser, entries: CoverTocEntry[]): Promise<LabelFitDiagnostics[]> {
  const measurePage = await browser.newPage({ viewport: { width: 100, height: 100 } });
  try {
    await measurePage.setContent("<!doctype html><html><body></body></html>");
    await measurePage.evaluate(() => document.fonts.ready);
    const slotWidth = tocLabelSlotWidth(entries.length);
    const results: LabelFitDiagnostics[] = [];
    for (const [index, entry] of entries.entries()) {
      results.push(await fitTocLabel(measurePage, entry.title, index, slotWidth));
    }
    return results;
  } finally {
    await measurePage.close().catch(() => undefined);
  }
}

// --- SVG assembly (single source of truth for the cover's visual output) ---

export function buildCoverSvg(entries: CoverTocEntry[], fits: LabelFitDiagnostics[], brandLine: string, footerLabel: string): string {
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

  const slots = tocSlotPositions(entries.length);
  const lastSlotX = slots[slots.length - 1]?.x ?? slots[0]?.x ?? g.toc.startX;
  const tocLine = `<line x1="${slots[0]?.x ?? g.toc.startX}" y1="${g.toc.lineY}" x2="${lastSlotX}" y2="${g.toc.lineY}" stroke="${g.softWhite}" stroke-opacity="0.3" stroke-width="1" />`;

  const nodesAndLabels = entries.map((entry, index) => {
    const slot = slots[index];
    const fit = fits[index];
    const node = `<circle cx="${slot.x}" cy="${g.toc.lineY}" r="${g.toc.nodeRadius}" fill="${g.background}" stroke="${g.accentGreen}" stroke-width="2" />`;
    const number = `<text x="${slot.x}" y="${g.toc.lineY + g.toc.numberOffsetY}" font-family='${FONT_MONO}' font-size="10" font-weight="700" fill="${g.accentGreen}">${String(index + 1).padStart(2, "0")}</text>`;
    const labelLines = fit.lines.map((line, lineIndex) =>
      `<text x="${slot.x}" y="${g.toc.lineY + g.toc.labelFirstLineOffsetY + lineIndex * g.toc.labelLineHeight}" font-family='${FONT_SANS}' font-size="${fit.fontSize}" font-weight="500" fill="${g.softWhite}" fill-opacity="0.82">${escapeXml(line)}</text>`,
    ).join("\n");
    return `${node}\n${number}\n${labelLines}`;
  }).join("\n");

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
  ${tocLine}
  ${nodesAndLabels}
  ${footer}
</svg>`;
}

export type CoverNavRect = { sectionId: string; x: number; y: number; width: number; height: number };

// Computed directly from the selection-aware tocSlotPositions geometry — no
// DOM query needed (unlike the old HTML/CSS cover, which read live
// data-collection-nav-target rects off the rendered page). Each rect
// covers a slot's node + number + up to 2 label lines, used to place a
// clickable PDF link annotation from the cover to that section's page.
export function computeCoverNavRects(entries: CoverTocEntry[]): CoverNavRect[] {
  const g = COVER_GEOMETRY;
  const topPad = g.toc.nodeRadius + 6;
  const bottomY = g.toc.labelFirstLineOffsetY + g.toc.labelLineHeight * g.toc.labelMaxLines;
  const capped = entries.slice(0, TOC_SLOT_COUNT);
  const slots = tocSlotPositions(capped.length);
  const slotWidth = tocLabelSlotWidth(capped.length);
  return capped.map((entry, index) => {
    const slot = slots[index];
    return {
      sectionId: entry.id,
      x: slot.x - 8,
      y: g.toc.lineY - topPad,
      width: slotWidth,
      height: topPad + bottomY,
    };
  });
}

export type CoverRenderResult = {
  svg: string;
  png: Buffer;
  fits: LabelFitDiagnostics[];
  svgPath: string;
  pngPath: string;
};

// Renders the SVG to a real 1440x900 PNG via Playwright (not an arbitrary
// HTML page screenshot — the SVG element itself is screenshotted at its
// exact native size) and writes both debug artifacts to disk, per the
// requirement that the cover be directly inspectable outside the final PDF.
export async function renderCollectionCover(
  browser: Browser,
  entries: CoverTocEntry[],
  brandLine: string,
  footerLabel: string,
  debugDir: string,
): Promise<CoverRenderResult> {
  const cappedEntries = entries.slice(0, TOC_SLOT_COUNT);
  const fits = await fitTocLabels(browser, cappedEntries);
  const svg = buildCoverSvg(cappedEntries, fits, brandLine, footerLabel);

  const renderPage = await browser.newPage({ viewport: { width: COVER_GEOMETRY.width, height: COVER_GEOMETRY.height }, deviceScaleFactor: 1 });
  let png: Buffer;
  try {
    await renderPage.setContent(`<!doctype html><html><body style="margin:0;padding:0;">${svg}</body></html>`, { waitUntil: "load" });
    await renderPage.evaluate(() => document.fonts.ready);
    png = await renderPage.locator("svg").screenshot({ type: "png" });
  } finally {
    await renderPage.close().catch(() => undefined);
  }

  await fs.mkdir(debugDir, { recursive: true });
  const svgPath = path.join(debugDir, "cover.svg");
  const pngPath = path.join(debugDir, "cover.png");
  await fs.writeFile(svgPath, svg, "utf8");
  await fs.writeFile(pngPath, png);

  return { svg, png, fits, svgPath, pngPath };
}

export { MAX_COLLECTION_PROJECTS };
