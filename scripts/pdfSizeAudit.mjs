// Read-only audit of a generated Collection PDF's real size contributors —
// image objects (dimensions, filter, byte size, duplicates), font byte
// size, and (best-effort) whether an image is embedded at a resolution
// much higher than what its actual on-page display size needs. Never
// writes to the PDF; this is diagnostic only.
//
// Usage: node scripts/pdfSizeAudit.mjs <path-to-pdf> [--dom-check]
//
// --dom-check cross-references each embedded image against a fresh
// Playwright measurement of the real project pages' <img> elements
// (matched by exact naturalWidth/naturalHeight — Chromium's print-to-PDF
// embeds images at their natural decoded pixel size, so this is a reliable
// key) to compute each image's actual CSS-rendered display size and thus
// its effective DPI. Requires the dev server to be running at
// http://localhost:5173 with the same 3 projects capturable.
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { PDFDocument, PDFName, PDFRawStream, PDFDict, PDFNumber } from "pdf-lib";
import { measureProjectImages } from "./measureProjectImageSizes.mjs";

const cssPxToPdfPt = 0.75;

function readNum(dict, key) {
  const v = dict.lookup(PDFName.of(key));
  return v instanceof PDFNumber ? v.asNumber() : undefined;
}

function readName(dict, key) {
  const v = dict.lookup(PDFName.of(key));
  return v ? String(v).replace(/^\//, "") : undefined;
}

async function auditPdf(pdfPath) {
  const bytes = await fs.readFile(pdfPath);
  const totalFileBytes = bytes.length;
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const context = doc.context;

  const images = [];
  const fonts = [];
  const seenHashes = new Map(); // sha256 -> [ {objNum, ...} ]

  for (const [ref, obj] of context.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream) {
      const dict = obj.dict;
      const subtype = readName(dict, "Subtype");
      if (subtype === "Image") {
        const width = readNum(dict, "Width") ?? 0;
        const height = readNum(dict, "Height") ?? 0;
        const filterRaw = dict.lookup(PDFName.of("Filter"));
        const filter = Array.isArray(filterRaw?.asArray?.())
          ? filterRaw.asArray().map((f) => String(f).replace(/^\//, "")).join(",")
          : filterRaw
            ? String(filterRaw).replace(/^\//, "")
            : "none (raw samples)";
        const colorSpaceRaw = dict.lookup(PDFName.of("ColorSpace"));
        const colorSpace = colorSpaceRaw ? String(colorSpaceRaw).replace(/^\//, "") : "unknown";
        const bpc = readNum(dict, "BitsPerComponent");
        const hasSMask = Boolean(dict.lookup(PDFName.of("SMask")));
        const contents = obj.getContents();
        const byteLength = contents.length;
        const hash = crypto.createHash("sha256").update(contents).digest("hex");
        const record = {
          objNum: ref.objectNumber,
          gen: ref.generationNumber,
          width,
          height,
          megapixels: Math.round((width * height) / 1e6 * 100) / 100,
          filter,
          colorSpace,
          bitsPerComponent: bpc,
          hasAlpha: hasSMask,
          byteLength,
          hash,
        };
        images.push(record);
        const bucket = seenHashes.get(hash) ?? [];
        bucket.push(record);
        seenHashes.set(hash, bucket);
      }
      const isFontFile = dict.lookup(PDFName.of("Length1")) !== undefined
        || readName(dict, "Type") === "FontFile"
        || readName(dict, "Subtype") === "Type1C"
        || readName(dict, "Subtype") === "CIDFontType0C"
        || readName(dict, "Subtype") === "OpenType";
      if (isFontFile) {
        fonts.push({ objNum: ref.objectNumber, byteLength: obj.getContents().length, subtype: readName(dict, "Subtype") ?? "FontFile" });
      }
    }
  }

  // Font descriptor names, cross-referenced to the FontFile* byte sizes
  // above by following /FontDescriptor -> /FontFileN indirect refs, purely
  // for a readable label (BaseFont) in the report.
  const fontNames = new Map();
  for (const [, obj] of context.enumerateIndirectObjects()) {
    if (obj instanceof PDFDict && readName(obj, "Type") === "Font") {
      const baseFont = readName(obj, "BaseFont");
      const descriptorRef = obj.get(PDFName.of("FontDescriptor"));
      if (descriptorRef && baseFont) {
        const descriptor = context.lookup(descriptorRef);
        for (const key of ["FontFile", "FontFile2", "FontFile3"]) {
          const fileRef = descriptor?.get?.(PDFName.of(key));
          if (fileRef?.objectNumber !== undefined) fontNames.set(fileRef.objectNumber, baseFont);
        }
      }
    }
  }
  for (const font of fonts) font.baseFont = fontNames.get(font.objNum) ?? "(unknown)";

  const totalImageBytes = images.reduce((sum, i) => sum + i.byteLength, 0);
  const totalFontBytes = fonts.reduce((sum, f) => sum + f.byteLength, 0);
  const duplicateGroups = Array.from(seenHashes.values()).filter((g) => g.length > 1);
  const duplicateWastedBytes = duplicateGroups.reduce((sum, g) => sum + g[0].byteLength * (g.length - 1), 0);

  const top20 = [...images].sort((a, b) => b.byteLength - a.byteLength).slice(0, 20);

  return { pdfPath, totalFileBytes, images, fonts, totalImageBytes, totalFontBytes, duplicateGroups, duplicateWastedBytes, top20 };
}

function formatBytes(n) {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

async function main() {
  const pdfPath = process.argv[2];
  const domCheck = process.argv.includes("--dom-check");
  if (!pdfPath) {
    console.error("Usage: node scripts/pdfSizeAudit.mjs <path-to-pdf> [--dom-check]");
    process.exit(1);
  }
  const report = await auditPdf(path.resolve(pdfPath));

  console.log(`\n=== PDF SIZE AUDIT: ${path.basename(report.pdfPath)} ===`);
  console.log(`Final PDF size: ${formatBytes(report.totalFileBytes)} (${report.totalFileBytes} bytes)`);
  console.log(`Embedded image objects: ${report.images.length}`);
  console.log(`Total image bytes: ${formatBytes(report.totalImageBytes)} (${((report.totalImageBytes / report.totalFileBytes) * 100).toFixed(1)}% of file)`);
  console.log(`Total font bytes: ${formatBytes(report.totalFontBytes)} (${((report.totalFontBytes / report.totalFileBytes) * 100).toFixed(1)}% of file)`);
  console.log(`Duplicate image groups (identical bytes, embedded >1x): ${report.duplicateGroups.length}, wasted bytes: ${formatBytes(report.duplicateWastedBytes)}`);
  console.log(`\n--- Top 20 largest image objects ---`);
  for (const img of report.top20) {
    console.log(`obj ${img.objNum}: ${formatBytes(img.byteLength)} | ${img.width}x${img.height}px (${img.megapixels}MP) | ${img.filter} | ${img.colorSpace} | alpha=${img.hasAlpha}`);
  }
  console.log(`\n--- Fonts ---`);
  for (const font of report.fonts) {
    console.log(`obj ${font.objNum}: ${font.baseFont} | ${font.subtype} | ${formatBytes(font.byteLength)}`);
  }
  if (report.duplicateGroups.length) {
    console.log(`\n--- Duplicate groups ---`);
    for (const g of report.duplicateGroups) {
      console.log(`hash ${g[0].hash.slice(0, 12)}... x${g.length} copies, ${g[0].width}x${g[0].height}px, ${formatBytes(g[0].byteLength)} each -> obj#: ${g.map((x) => x.objNum).join(",")}`);
    }
  }

  const jsonPath = path.join(path.dirname(report.pdfPath), `${path.basename(report.pdfPath, ".pdf")}-size-audit.json`);
  let domReport = null;
  if (domCheck) {
    console.log(`\n--- DOM cross-reference (measuring real project pages at 1440px) ---`);
    const routes = ["/zh/work/interaction-intelligence-system", "/zh/work/ai-assisted-ui-environment-design", "/zh/work/3d-vdr4qg"];
    domReport = await measureProjectImages(routes, "http://localhost:5173");
    const byNatural = new Map();
    for (const { route, images: imgs } of domReport) {
      for (const img of imgs) {
        const key = `${img.naturalWidth}x${img.naturalHeight}`;
        const bucket = byNatural.get(key) ?? [];
        bucket.push({ ...img, route });
        byNatural.set(key, bucket);
      }
    }
    let matched = 0;
    const oversized = [];
    for (const pdfImg of report.images) {
      const key = `${pdfImg.width}x${pdfImg.height}`;
      const candidates = byNatural.get(key);
      if (candidates?.length) {
        matched += 1;
        const domMatch = candidates[0];
        const displayWidthPt = domMatch.cssWidth * cssPxToPdfPt;
        const effectiveDpi = Math.round((pdfImg.width * 72) / (displayWidthPt || 1));
        const entry = { objNum: pdfImg.objNum, pixelSize: key, cssRenderedWidth: domMatch.cssWidth, route: domMatch.route, effectiveDpi, byteLength: pdfImg.byteLength };
        if (effectiveDpi > 200) oversized.push(entry);
      }
    }
    console.log(`Matched ${matched}/${report.images.length} PDF image objects to a real rendered <img> by exact natural pixel size.`);
    console.log(`Images with effective DPI > 200 at their real display size (meaningfully oversized for screen viewing):`);
    for (const o of oversized.sort((a, b) => b.byteLength - a.byteLength)) {
      console.log(`  obj ${o.objNum}: ${o.pixelSize}px embedded, displayed at ${o.cssRenderedWidth}CSS-px (${o.route}) -> ${o.effectiveDpi} DPI, ${formatBytes(o.byteLength)}`);
    }
  }

  await fs.writeFile(jsonPath, JSON.stringify({ ...report, domReport }, null, 2));
  console.log(`\nFull JSON report written to: ${jsonPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
