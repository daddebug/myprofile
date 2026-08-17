// ============================================================================
// EXPERIMENTAL / UNUSED — NOT PART OF THE LIVE EXPORT PIPELINE.
// ============================================================================
// Standalone test harness for pdfImageOptimizer.mjs, which is itself unused
// and superseded — see the header comment in that file. The live pipeline
// does NOT call optimizeCollectionPdf() or this script for real exports; the
// actual fix is upstream image right-sizing in scripts/exportImageResize.ts.
// Kept only so the earlier exploratory work remains inspectable. Do not wire
// this into the live pipeline; do not build on it further.
// ============================================================================
//
// Usage: node scripts/pdfSizeOptimizeCli.mjs <input.pdf> <output.pdf> [--dom-check]
import fs from "node:fs/promises";
import { optimizeCollectionPdf } from "./pdfImageOptimizer.mjs";
import { measureProjectImages, buildDomSizeMap } from "./measureProjectImageSizes.mjs";

function formatBytes(n) {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

async function main() {
  const [inputPath, outputPath] = process.argv.slice(2);
  const domCheck = process.argv.includes("--dom-check");
  if (!inputPath || !outputPath) {
    console.error("Usage: node scripts/pdfSizeOptimizeCli.mjs <input.pdf> <output.pdf> [--dom-check]");
    process.exit(1);
  }
  const inputBytes = await fs.readFile(inputPath);
  console.log(`Input: ${formatBytes(inputBytes.length)}`);

  let domSizeMap = new Map();
  if (domCheck) {
    const routes = ["/zh/work/interaction-intelligence-system", "/zh/work/ai-assisted-ui-environment-design", "/zh/work/3d-vdr4qg"];
    console.log("Measuring real project pages for display-aware sizing...");
    const domReport = await measureProjectImages(routes, "http://localhost:5173");
    domSizeMap = buildDomSizeMap(domReport);
    console.log(`Measured ${domSizeMap.size} distinct image sizes across ${routes.length} routes.`);
  }

  const started = Date.now();
  const { bytes, report } = await optimizeCollectionPdf(inputBytes, {
    domSizeMap,
    onProgress: (done, total) => process.stdout.write(`\rOptimizing images: ${done}/${total}`),
  });
  console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(1)}s`);

  await fs.writeFile(outputPath, bytes);
  console.log(`\nOutput: ${formatBytes(bytes.length)} -> ${outputPath}`);
  console.log(`Reduction: ${(100 - (bytes.length / inputBytes.length) * 100).toFixed(1)}%`);
  console.log(`\nImages processed: ${report.imageCount}`);
  console.log(`Image bytes: ${formatBytes(report.beforeTotalImageBytes)} -> ${formatBytes(report.afterTotalImageBytes)}`);
  const skipped = report.results.filter((r) => r.skipped);
  if (skipped.length) console.log(`Skipped (left unchanged): ${skipped.length}`);
  const matched = report.results.filter((r) => r.matchedDisplaySize);
  console.log(`Resized based on real display size: ${matched.length}/${report.results.length}`);

  const topWins = [...report.results].filter((r) => !r.skipped).sort((a, b) => (b.beforeBytes - b.afterBytes) - (a.beforeBytes - a.afterBytes)).slice(0, 20);
  console.log(`\n--- Top 20 optimizations ---`);
  for (const r of topWins) {
    console.log(`obj ${r.objNum}: ${formatBytes(r.beforeBytes)} -> ${formatBytes(r.afterBytes)} | ${r.method}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
