// Dev-only pixel comparison tool: reference cover vs. the SVG cover this
// pipeline actually generated. Not part of the runtime export path — run
// manually after an export to verify the cover visually, per the project's
// "do not claim visual completion without reviewing these files" rule.
//
// Usage:
//   node scripts/compareCoverToReference.mjs <reference.png> <generated.png> <outDir>
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const [referencePath, generatedPath, outDir] = process.argv.slice(2);
if (!referencePath || !generatedPath || !outDir) {
  console.error("Usage: node scripts/compareCoverToReference.mjs <reference.png> <generated.png> <outDir>");
  process.exit(1);
}

async function loadRaw(filePath) {
  const { data, info } = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

function pixelAt(img, x, y) {
  const idx = (y * img.width + x) * img.channels;
  return { r: img.data[idx], g: img.data[idx + 1], b: img.data[idx + 2] };
}

function colorDistance(a, b) {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

function isAcidGreen(p) { return p.g > 140 && p.g - p.r > 40 && p.g - p.b > 60; }
function isPanelBlue(p, bg) { return p.b > 90 && p.b - p.g > 15 && colorDistance(p, bg) > 40 && p.g < 140; }

function scanBoundingBox(img, predicate, xRange, yRange) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, count = 0;
  for (let y = yRange[0]; y < yRange[1]; y++) {
    for (let x = xRange[0]; x < xRange[1]; x++) {
      if (predicate(pixelAt(img, x, y))) {
        count++;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (count === 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, count };
}

function measureKeyRegions(img) {
  const bg = pixelAt(img, 4, 4);
  const graphicRegionY = [0, 600];
  const panelBox = scanBoundingBox(img, (p) => isPanelBlue(p, bg), [0, img.width], graphicRegionY);
  const greenBoxUpper = scanBoundingBox(img, isAcidGreen, [0, img.width], graphicRegionY);
  const graphic = panelBox && greenBoxUpper ? {
    x: Math.min(panelBox.x, greenBoxUpper.x),
    y: Math.min(panelBox.y, greenBoxUpper.y),
    width: Math.max(panelBox.x + panelBox.width, greenBoxUpper.x + greenBoxUpper.width) - Math.min(panelBox.x, greenBoxUpper.x),
    height: Math.max(panelBox.y + panelBox.height, greenBoxUpper.y + greenBoxUpper.height) - Math.min(panelBox.y, greenBoxUpper.y),
  } : (panelBox ?? greenBoxUpper);
  const title = scanBoundingBox(img, isAcidGreen, [0, img.width], [590, 645]);

  let tocLineY = null, bestRowCount = 0;
  for (let y = 700; y < 725; y++) {
    let rowCount = 0;
    for (let x = 60; x < img.width - 60; x++) {
      const p = pixelAt(img, x, y);
      if (isPanelBlue(p, bg) || isAcidGreen(p)) rowCount++;
    }
    if (rowCount > bestRowCount) { bestRowCount = rowCount; tocLineY = y; }
  }
  const footer = scanBoundingBox(img, (p) => colorDistance(p, bg) > 45, [img.width - 440, img.width], [img.height - 60, img.height - 20]);
  return { background: bg, graphic, title, tocLineY, footer };
}

function diffMetric(regionA, regionB) {
  if (!regionA || !regionB) return null;
  return { dx: regionB.x - regionA.x, dy: regionB.y - regionA.y, dWidth: regionB.width - regionA.width, dHeight: regionB.height - regionA.height };
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  const reference = await loadRaw(referencePath);
  const generated = await loadRaw(generatedPath);

  if (reference.width !== generated.width || reference.height !== generated.height) {
    console.error(`Size mismatch: reference ${reference.width}x${reference.height} vs generated ${generated.width}x${generated.height} — cannot pixel-diff.`);
    process.exit(1);
  }
  const { width, height, channels } = reference;

  // Per-pixel diff heatmap (grayscale->red intensity by magnitude) + count.
  const diffBuffer = Buffer.alloc(width * height * 3);
  let differingPixels = 0;
  const DIFF_THRESHOLD = 24;
  for (let i = 0; i < width * height; i++) {
    const rOff = i * channels;
    const dr = Math.abs(reference.data[rOff] - generated.data[rOff]);
    const dg = Math.abs(reference.data[rOff + 1] - generated.data[rOff + 1]);
    const db = Math.abs(reference.data[rOff + 2] - generated.data[rOff + 2]);
    const magnitude = (dr + dg + db) / 3;
    if (magnitude > DIFF_THRESHOLD) differingPixels++;
    const outOff = i * 3;
    diffBuffer[outOff] = Math.min(255, magnitude * 3);
    diffBuffer[outOff + 1] = 0;
    diffBuffer[outOff + 2] = Math.min(255, 40 + magnitude);
  }
  const differingPixelPercent = Math.round((differingPixels / (width * height)) * 10000) / 100;

  const diffPath = path.join(outDir, "cover-diff.png");
  await sharp(diffBuffer, { raw: { width, height, channels: 3 } }).png().toFile(diffPath);

  const sideBySidePath = path.join(outDir, "cover-side-by-side.png");
  await sharp({ create: { width: width * 2 + 20, height, channels: 3, background: "#000000" } })
    .composite([
      { input: referencePath, left: 0, top: 0 },
      { input: generatedPath, left: width + 20, top: 0 },
    ])
    .png()
    .toFile(sideBySidePath);

  const overlayPath = path.join(outDir, "cover-overlay.png");
  const generatedHalfAlpha = await sharp(generatedPath).ensureAlpha(0.5).toBuffer();
  await sharp(referencePath).composite([{ input: generatedHalfAlpha, left: 0, top: 0 }]).png().toFile(overlayPath);

  const refMeasured = measureKeyRegions(reference);
  const genMeasured = measureKeyRegions(generated);

  const comparison = {
    generatedAt: new Date().toISOString(),
    canvas: { width, height },
    differingPixelPercent,
    differingPixels,
    totalPixels: width * height,
    reference: refMeasured,
    generated: genMeasured,
    deviations: {
      graphicBoundingBox: diffMetric(refMeasured.graphic, genMeasured.graphic),
      titlePosition: diffMetric(refMeasured.title, genMeasured.title),
      tocBaselineDelta: (refMeasured.tocLineY !== null && genMeasured.tocLineY !== null) ? genMeasured.tocLineY - refMeasured.tocLineY : null,
      footerBoundingBox: diffMetric(refMeasured.footer, genMeasured.footer),
    },
    outputFiles: {
      referenceCover: referencePath,
      generatedCover: generatedPath,
      sideBySide: sideBySidePath,
      overlay: overlayPath,
      diff: diffPath,
    },
  };

  const comparisonPath = path.join(outDir, "cover-comparison.json");
  await fs.writeFile(comparisonPath, `${JSON.stringify(comparison, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(comparison, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
