// One-off measurement tool (not part of the app runtime). Reads the
// reference collection PDF's page-1 cover, rendered to a 1440x900 PNG via
// poppler's pdftoppm, and extracts real pixel bounding boxes for each
// graphic element by color-thresholded scanning — not eyeballed. Prints
// JSON that becomes src/lib/collectionCoverGeometry.ts's constants.
//
// Usage: node scripts/measureCoverReference.mjs <path-to-reference-cover.png>
import sharp from "sharp";

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: node scripts/measureCoverReference.mjs <reference-cover.png>");
  process.exit(1);
}

const { data, info } = await sharp(inputPath).raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;

function pixelAt(x, y) {
  const idx = (y * width + x) * channels;
  return { r: data[idx], g: data[idx + 1], b: data[idx + 2] };
}

const bg = pixelAt(4, 4);
console.error("background sample", bg);

function colorDistance(a, b) {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

// Bright acid-green (circles, TOC nodes, title text, active labels): high G,
// low-ish R, low B, clearly saturated green — distinguishes from the blue
// panels and the near-white/gray label text.
function isAcidGreen(p) {
  return p.g > 140 && p.g - p.r > 40 && p.g - p.b > 60;
}

// Blue panel gradient: brighter/more saturated blue than the deep-navy
// background, but not green and not white/gray text.
function isPanelBlue(p) {
  return p.b > 90 && p.b - p.g > 15 && colorDistance(p, bg) > 40 && p.g < 140;
}

// Near-white/gray UI text (TOC labels, footer brand): all channels high and
// close together.
function isLightText(p) {
  return p.r > 150 && p.g > 150 && p.b > 150 && Math.abs(p.r - p.b) < 30;
}

function scanBoundingBox(predicate, xRange, yRange) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let count = 0;
  for (let y = yRange[0]; y < yRange[1]; y++) {
    for (let x = xRange[0]; x < xRange[1]; x++) {
      if (predicate(pixelAt(x, y))) {
        count++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (count === 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, count };
}

// --- Whole-graphic bounding box (panels ∪ circles), upper region only ---
const graphicRegionY = [0, 600];
const panelBox = scanBoundingBox(isPanelBlue, [0, width], graphicRegionY);
const greenBoxUpper = scanBoundingBox(isAcidGreen, [0, width], graphicRegionY);
const graphicBox = {
  x: Math.min(panelBox.x, greenBoxUpper.x),
  y: Math.min(panelBox.y, greenBoxUpper.y),
  width: 0,
  height: 0,
};
graphicBox.width = Math.max(panelBox.x + panelBox.width, greenBoxUpper.x + greenBoxUpper.width) - graphicBox.x;
graphicBox.height = Math.max(panelBox.y + panelBox.height, greenBoxUpper.y + greenBoxUpper.height) - graphicBox.y;

// --- Title text ("Dilida Duman | Game UX/UI Portfolio") ---
// Isolated vertically: below the graphic, above the TOC line. Visually
// around y=595-630; scan a generous band and rely on color+region to avoid
// picking up graphic pixels above it.
const titleBox = scanBoundingBox(isAcidGreen, [0, width], [590, 640]);

// --- TOC horizontal line y: a thin panel-blue line spanning most of the
// width at a fixed row. Find the row in the TOC band with the most
// panel-blue pixels (the line itself, not the circular nodes). ---
let tocLineY = null;
let bestRowCount = 0;
for (let y = 700; y < 725; y++) {
  let rowCount = 0;
  for (let x = 60; x < width - 60; x++) {
    if (isPanelBlue(pixelAt(x, y)) || isAcidGreen(pixelAt(x, y))) rowCount++;
  }
  if (rowCount > bestRowCount) { bestRowCount = rowCount; tocLineY = y; }
}

// --- TOC nodes: small green circles centered on the line. Scan the line's
// row band for contiguous green-pixel runs -> node centers. ---
const nodeBandY = [tocLineY - 8, tocLineY + 8];
const nodeRuns = [];
let runStart = null;
for (let x = 0; x < width; x++) {
  let hasGreen = false;
  for (let y = nodeBandY[0]; y < nodeBandY[1]; y++) {
    if (isAcidGreen(pixelAt(x, y))) { hasGreen = true; break; }
  }
  if (hasGreen && runStart === null) runStart = x;
  if (!hasGreen && runStart !== null) { nodeRuns.push([runStart, x - 1]); runStart = null; }
}
if (runStart !== null) nodeRuns.push([runStart, width - 1]);
const nodeCenters = nodeRuns.filter(([a, b]) => b - a >= 2).map(([a, b]) => Math.round((a + b) / 2));

// --- TOC label band (number + title lines under each node) ---
const labelBox = scanBoundingBox((p) => isLightText(p) || isAcidGreen(p), [0, width], [735, 800]);

// --- Footer brand text, bottom-right (dimmer than isLightText's threshold —
// low-opacity gray-on-navy, so use a lower color-distance-from-background
// threshold scoped to this corner instead). ---
const footerBox = scanBoundingBox((p) => colorDistance(p, bg) > 45, [width - 440, width], [height - 60, height - 20]);

// --- Safe margins: leftmost/topmost/rightmost/bottommost content pixel
// across the whole page (any non-background pixel). ---
function isContent(p) { return colorDistance(p, bg) > 24; }
const fullBox = scanBoundingBox(isContent, [0, width], [0, height]);

const result = {
  canvas: { width, height },
  background: bg,
  graphic: graphicBox,
  title: titleBox,
  toc: { lineY: tocLineY, nodeCenters, labelBox },
  footer: footerBox,
  contentBounds: fullBox,
};

console.log(JSON.stringify(result, null, 2));
