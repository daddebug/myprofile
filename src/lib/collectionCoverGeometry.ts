// Deterministic geometry for the Portfolio Collection cover and index
// pages — two separate, independently-sized pages, both 1440 wide (see
// scripts/collectionCoverRenderer.ts):
//   PAGE 1 (cover): identity graphic (panels+circles) + brand title +
//     footer only. No project content. Fixed compact height — cover
//     content never depends on the selection.
//   PAGE 2 (index): a compact contents page — one column per selected
//     project, side by side, each showing a number, title, small
//     category/duration metadata, and a wide thumbnail crop of that
//     project's cover image. No heading. Columns are equal-width and fill
//     the shared safe content rail, with a thin vertical separator between
//     them. Page height is derived directly from the actual row content
//     (computeIndexPageHeight) plus a modest bottom margin — never a fixed
//     canvas with leftover empty space.
// Both pages are shorter than the fixed 900px project-page viewport height
// and that's expected: project pages (scripts/exactWebExportPlugin.ts) are
// themselves already variable-height (one continuous page each, sized to
// real content) — the cover/index pages just apply that same "page height
// follows content" principle at the low end instead of always assuming a
// tall page.
//
// COVER_GEOMETRY's panels/circles/title numbers are pixel-measured against
// the original reference cover (see the git history of this file for the
// measurement scripts) and unchanged by the index-page split or the
// compact-height pass; only the page height and footer position moved to
// close up the empty space below the original fixed 900px canvas.
// INDEX_PAGE is new layout, tuned directly against real rendered output
// (scripts/collectionCoverRenderer.ts writes a debug PNG every export) —
// not measured against an external reference.
//
// This file is the single source of truth for both pages' geometry — both
// the client (src/lib/portfolioCollectionExport.ts, to cap/order entries)
// and the server (scripts/collectionCoverRenderer.ts, to build and measure
// the actual SVGs) import from here. Nothing here is computed via CSS
// flex/grid layout — every position is one of these fixed numbers or a
// small deterministic function of the selection count.

export const MAX_COLLECTION_PROJECTS = 4;

export type CoverPanel = {
  rect: { x: number; y: number; width: number; height: number };
  circles: Array<{ cx: number; cy: number; r: number }>;
};

export const COLLECTION_FIXED_PAGE_CONTENT = {
  left: 80,
  right: 1360,
  width: 1280,
} as const;

export const COVER_GEOMETRY = {
  width: 1440,
  // Compact height: ends shortly after the footer, not the old fixed
  // 900px canvas (which left a large empty area below the identity
  // graphic + title). 700 = graphic bottom (574) + title + a modest
  // bottom margin below the footer mark — see footer.baselineY below,
  // which keeps the same ~34px gap to the page's own bottom edge that it
  // had against the old 900px canvas (866 = 900-34), just against the new
  // shorter height.
  height: 700,
  background: "#181743",
  accentGreen: "#34F025",
  softWhite: "#F4F5FA",
  panelGradientFrom: "#2A43C7",
  panelGradientTo: "#181D46",
  safeLeft: COLLECTION_FIXED_PAGE_CONTENT.left,
  safeRight: COLLECTION_FIXED_PAGE_CONTENT.right,
  safeTop: 60,
  safeBottom: 670,
  // Overall bounding box of the graphic (panels ∪ circles), measured.
  graphic: { x: 180, y: 69, width: 976, height: 505 },
  // Painted back-to-front: panel, then the circle(s) that sit on it — a
  // later panel naturally overlaps/clips the previous panel's trailing
  // circle where they intersect, exactly like the reference (confirmed by
  // cropping the reference around circle 1: its right edge is clipped by
  // panel 2's left edge, not rendered as a full circle).
  panels: [
    { rect: { x: 180, y: 145, width: 246, height: 345 }, circles: [{ cx: 351, cy: 335, r: 103 }] },
    { rect: { x: 390, y: 113, width: 248, height: 337 }, circles: [{ cx: 562, cy: 208, r: 50 }, { cx: 565, cy: 335, r: 51 }] },
    { rect: { x: 598, y: 183, width: 246, height: 345 }, circles: [{ cx: 757, cy: 207, r: 50 }] },
    { rect: { x: 807, y: 69, width: 248, height: 345 }, circles: [{ cx: 978, cy: 260, r: 103 }] },
    { rect: { x: 1013, y: 183, width: 245, height: 345 }, circles: [{ cx: 1103, cy: 395, r: 51 }, { cx: 1103, cy: 523, r: 51 }] },
  ] satisfies CoverPanel[],
  // Measured text bounding box (x/y/width/height of the rendered glyphs);
  // centerX/baselineY below are derived from it for SVG <text text-anchor>.
  title: { measuredBox: { x: 514, y: 604, width: 410, height: 22 }, centerX: 720, baselineY: 622, fontSize: 21 },
  // Measured bounding box of "D.D / PORTFOLIO COLLECTION". baselineY keeps
  // the same ~34px gap to the page's bottom edge it had against the old
  // 900px-tall canvas (866 = 900-34), now applied to the new height above.
  footer: { rightX: 1360, baselineY: 666, fontSize: 9 },
} as const;

export type CoverTocEntry = {
  id: string;
  title: string;
  // Project entries only — absent for the UI Works/Game Experience/Contact
  // section entries, which have no single cover image or category/duration.
  coverUrl?: string;
  // Small index metadata line (e.g. "AI 产品设计 / 游戏 UX · 2026.7–至今") —
  // already locale-resolved and pre-joined client-side, same pattern as
  // `title`. Absent for non-project section entries.
  metaLabel?: string;
};

// --- Page 2: compact project index grid ---
//
// One column per selected entry, side by side, filling the same safe
// content rail the cover's identity graphic already respects
// (COLLECTION_FIXED_PAGE_CONTENT). No heading — the page is just the
// project entries. Column width is computed from the selection count, not
// fixed — "3 projects -> 3 equal columns, 4 -> 4 equal columns" etc. — so
// there is never leftover unused margin from a fixed card width. Tuned
// primarily for the common 3-column case; wraps to another row only once
// a row would exceed maxPerRow (not optimized for readability past that —
// revisit deliberately if a real selection ever needs it). Page height
// (computeIndexPageHeight below) is derived directly from the actual row
// content, not a fixed canvas — it grows/shrinks with the selection.
export const INDEX_PAGE = {
  width: 1440,
  safeTop: 70,
  safeBottom: 60,
  maxPerRow: 6,
  columnGap: 40,
  numberFontSize: 15,
  gapNumberToTitle: 24,
  titleFontSize: 22,
  titleLineHeight: 27,
  titleMaxLines: 2,
  gapTitleToMeta: 10,
  metaFontSize: 12,
  gapMetaToThumb: 18,
  // Wide but tall enough to actually read the cover, not a shallow strip —
  // 3:1 to 3.5:1 per spec (was 4.3:1). Width is always the column's own
  // width; height follows from this ratio, so it shrinks automatically as
  // more columns share the row.
  thumbAspect: 3.2,
  rowGapY: 40, // vertical gap between wrapped rows, if a selection ever exceeds maxPerRow
} as const;

export type IndexColumn = {
  x: number;
  y: number;
  width: number;
  numberBaselineY: number;
  titleTopY: number;
  metaBaselineY: number;
  thumbY: number;
  thumbHeight: number;
};

// Row-wrapping grid, equal-width columns per row (never a fixed card width
// with leftover margin — the gap is fixed, the column width is what's
// solved for from the selection count and the shared safe rail).
export function indexColumnPositions(count: number): IndexColumn[] {
  const p = INDEX_PAGE;
  if (count <= 0) return [];
  const rows: number[] = [];
  let remaining = count;
  while (remaining > 0) {
    const inRow = Math.min(p.maxPerRow, remaining);
    rows.push(inRow);
    remaining -= inRow;
  }
  const railLeft = COLLECTION_FIXED_PAGE_CONTENT.left;
  const railWidth = COLLECTION_FIXED_PAGE_CONTENT.width;
  const positions: IndexColumn[] = [];
  rows.forEach((inRow, rowIndex) => {
    const columnWidth = (railWidth - (inRow - 1) * p.columnGap) / inRow;
    const thumbHeight = columnWidth / p.thumbAspect;
    const rowContentHeight =
      p.numberFontSize + p.gapNumberToTitle + p.titleMaxLines * p.titleLineHeight + p.gapTitleToMeta + p.metaFontSize + p.gapMetaToThumb + thumbHeight;
    const rowTop = p.safeTop + rowIndex * (rowContentHeight + p.rowGapY);
    for (let column = 0; column < inRow; column += 1) {
      const x = railLeft + column * (columnWidth + p.columnGap);
      const numberBaselineY = rowTop + p.numberFontSize;
      const titleTopY = numberBaselineY + p.gapNumberToTitle;
      const titleBlockHeight = p.titleMaxLines * p.titleLineHeight;
      const metaBaselineY = titleTopY + titleBlockHeight + p.gapTitleToMeta;
      const thumbY = metaBaselineY + p.gapMetaToThumb;
      positions.push({ x: Math.round(x), y: rowTop, width: Math.round(columnWidth), numberBaselineY, titleTopY, metaBaselineY, thumbY, thumbHeight });
    }
  });
  return positions;
}

// The index page's real height: top margin, then the actual row content
// (reusing indexColumnPositions so this can never drift from what's
// actually drawn), then a modest bottom margin — never a fixed canvas
// with leftover empty space above or below.
export function computeIndexPageHeight(count: number): number {
  const positions = indexColumnPositions(count);
  if (!positions.length) return INDEX_PAGE.safeTop + INDEX_PAGE.safeBottom;
  const contentBottom = Math.max(...positions.map((pos) => pos.thumbY + pos.thumbHeight));
  return Math.round(contentBottom + INDEX_PAGE.safeBottom);
}

export type IndexNavRect = { sectionId: string; x: number; y: number; width: number; height: number };

// Each column's full clickable area — number through the bottom of its
// thumbnail — used to place one PDF link annotation per project, same
// mechanism as the old cover cards, just retargeted to the index page's
// own geometry (computed directly, no DOM query needed).
export function computeIndexNavRects(entries: CoverTocEntry[]): IndexNavRect[] {
  const positions = indexColumnPositions(entries.length);
  return entries.map((entry, index) => {
    const pos = positions[index];
    const top = pos.y;
    const bottom = pos.thumbY + pos.thumbHeight;
    return { sectionId: entry.id, x: pos.x, y: top, width: pos.width, height: bottom - top };
  });
}
