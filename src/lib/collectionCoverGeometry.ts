// Deterministic geometry for the Portfolio Collection cover/TOC page.
//
// These are not eyeballed. They come from scripts/measureCoverReference.ts
// and scripts/measureCoverCircles.ts, run against the reference file's page
// 1 rendered to a 1440x900 PNG (poppler's pdftoppm at the exact page size):
//   node scripts/measureCoverReference.mjs output/pdf/collection/debug/reference-cover.png
//   node scripts/measureCoverCircles.mjs output/pdf/collection/debug/reference-cover.png
// title/toc/footer/graphic bounding boxes and all 7 circle centers+radii are
// pixel-measured (color-threshold scanning + connected-component blobs on
// the acid-green mask). The 5 panel rects are the one part that couldn't be
// fully separated by pixel scanning alone — they're overlapping same-color
// gradients with no hard edge where they overlap — so their left edges are
// measured (brightness-transition scan across several rows) and their
// widths/heights/tops are read off the rendered reference image, cross-
// checked against the measured overall graphic bounding box and circle
// positions. See the design chat for the full measurement log.
//
// This file is the single source of truth for the cover's geometry — both
// the client (src/lib/portfolioCollectionExport.ts, to cap/order the TOC
// entries) and the server (scripts/collectionCoverRenderer.ts, to build and
// measure the actual SVG) import from here. Nothing about this cover is
// computed via CSS flex/grid layout or auto-measured text pushing neighbors
// — every position is one of these fixed numbers.

export const MAX_COLLECTION_PROJECTS = 4;

export type CoverPanel = {
  rect: { x: number; y: number; width: number; height: number };
  circles: Array<{ cx: number; cy: number; r: number }>;
};

export const COVER_GEOMETRY = {
  width: 1440,
  height: 900,
  background: "#181743",
  accentGreen: "#34F025",
  softWhite: "#F4F5FA",
  panelGradientFrom: "#2A43C7",
  panelGradientTo: "#181D46",
  safeLeft: 80,
  safeRight: 1360,
  safeTop: 60,
  safeBottom: 870,
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
  toc: {
    lineY: 716,
    // Measured node centers were [87, 300, 514, 727, 940, 1154] — spacing
    // ~213.33px, which is (safeRight - safeLeft) / 6, i.e. the reference's 6
    // nodes already sit on what is structurally a 7-slot grid (7 slots = 6
    // gaps across the safe width) with the 7th slot simply unused. Extending
    // the same spacing to a real 7th slot is not a new layout — it's
    // completing the grid the reference itself is built on.
    startX: 87,
    spacing: 213.33,
    nodeRadius: 5,
    numberOffsetY: 22,
    labelFirstLineOffsetY: 40,
    labelLineHeight: 15,
    labelMaxLines: 2,
    // Usable label width per slot — intentionally less than the 213px slot
    // spacing so two neighboring (max 2-line) labels never visually touch.
    slotWidth: 190,
    fontSizeNormal: 11,
    fontSizeMin: 9,
  },
  // Measured bounding box of "D.D / PORTFOLIO COLLECTION".
  footer: { rightX: 1360, baselineY: 866, fontSize: 9 },
} as const;

export const TOC_SLOT_COUNT = 7;

// Reference-measured, left-anchored fixed grid (exact pixel match only when
// a selection fills every slot — see tocSlotPositions below for the general
// case).
export const TOC_SLOTS: Array<{ x: number }> = Array.from({ length: TOC_SLOT_COUNT }, (_, index) => ({
  x: Math.round(COVER_GEOMETRY.toc.startX + index * COVER_GEOMETRY.toc.spacing),
}));

const TOC_FULL_SPAN_END_X = COVER_GEOMETRY.toc.startX + (TOC_SLOT_COUNT - 1) * COVER_GEOMETRY.toc.spacing;

// Distributes however many TOC entries the editor's selection actually
// produced evenly across the SAME full usable span the fixed 7-slot grid
// covers (COVER_GEOMETRY.toc.startX .. TOC_FULL_SPAN_END_X) — never just the
// first N of the 7 fixed left-anchored positions, which clusters a small
// selection (e.g. 3 projects, no UI Works/Games/Contact) in the left third
// of the page and reads as an unfinished layout rather than an intentional
// one. At exactly TOC_SLOT_COUNT entries this reduces to the pixel-measured
// reference grid exactly; for fewer entries the spacing between nodes
// widens so the line and nodes still span the full page width.
export function tocSlotPositions(entryCount: number): Array<{ x: number }> {
  const count = Math.min(Math.max(entryCount, 0), TOC_SLOT_COUNT);
  if (count === 0) return [];
  if (count === 1) {
    return [{ x: Math.round(COVER_GEOMETRY.toc.startX + (TOC_FULL_SPAN_END_X - COVER_GEOMETRY.toc.startX) / 2) }];
  }
  const spacing = (TOC_FULL_SPAN_END_X - COVER_GEOMETRY.toc.startX) / (count - 1);
  return Array.from({ length: count }, (_, index) => ({
    x: Math.round(COVER_GEOMETRY.toc.startX + index * spacing),
  }));
}

// The reference's tuned slotWidth (190px) assumes the fixed ~213px spacing;
// when a smaller selection spreads nodes further apart, labels get more
// breathing room too — proportional to the actual spacing used, capped so a
// lone, very wide slot still reads as a compact label rather than a
// full-width banner.
export function tocLabelSlotWidth(entryCount: number): number {
  const positions = tocSlotPositions(Math.max(entryCount, 2));
  const spacing = positions.length > 1 ? positions[1].x - positions[0].x : COVER_GEOMETRY.toc.spacing;
  return Math.min(320, Math.round(spacing * 0.88));
}

export type CoverTocEntry = { id: string; title: string };
