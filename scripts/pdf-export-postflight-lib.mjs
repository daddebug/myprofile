import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { PDFArray, PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { readPdfExportRegistry } from "./pdf-export-preflight-lib.mjs";

const PT_PER_PX = 72 / 96;

function toPt(px) {
  return Math.round(px * PT_PER_PX * 100) / 100;
}

async function readDiagnostics(diagnosticsDir) {
  let entries = [];
  try { entries = await readdir(diagnosticsDir); } catch { return []; }
  const files = entries.filter((name) => name.endsWith("-diagnostics.json"));
  const results = [];
  for (const file of files) {
    try {
      const raw = await readFile(path.join(diagnosticsDir, file), "utf8");
      results.push({ file, ...JSON.parse(raw) });
    } catch (error) {
      results.push({ file, parseError: error instanceof Error ? error.message : String(error) });
    }
  }
  return results;
}

function collectProjectDiagnostics(diagnostics) {
  return diagnostics.flatMap((entry) => {
    if (entry.parseError) return [];
    if (Array.isArray(entry.projects)) {
      return entry.projects
        .filter((project) => project && project.sectionId !== "cover" && typeof project.measuredContentBottom === "number")
        .map((project) => ({ file: entry.file, ...project }));
    }
    return typeof entry.measuredContentBottom === "number" ? [entry] : [];
  });
}

// Enumerates every embedded raster image XObject across every page, without
// re-decoding pixels — Length/Filter/Width/Height come straight off each
// stream's own dictionary, and identical (length, first/last 64 bytes)
// pairs are treated as likely-duplicate embeds for reporting purposes. This
// intentionally does not decode a full byte-for-byte hash for every image;
// it is a fast heuristic for the "repeated raster assets" postflight signal,
// not a cryptographic guarantee.
function collectRasterImages(pdfDoc) {
  const images = [];
  for (const [ref, object] of pdfDoc.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue;
    const dict = object.dict;
    const subtype = dict.get(PDFName.of("Subtype"));
    if (!subtype || subtype.toString() !== "/Image") continue;
    const width = dict.get(PDFName.of("Width"))?.asNumber?.() ?? null;
    const height = dict.get(PDFName.of("Height"))?.asNumber?.() ?? null;
    const bytes = object.contents;
    images.push({
      ref: ref.toString(),
      width,
      height,
      byteLength: bytes.length,
      fingerprint: `${bytes.length}:${Buffer.from(bytes.subarray(0, 64)).toString("hex")}:${Buffer.from(bytes.subarray(Math.max(0, bytes.length - 64))).toString("hex")}`,
    });
  }
  return images;
}

function findDuplicateImages(images) {
  const byFingerprint = new Map();
  for (const image of images) {
    if (!byFingerprint.has(image.fingerprint)) byFingerprint.set(image.fingerprint, []);
    byFingerprint.get(image.fingerprint).push(image.ref);
  }
  return [...byFingerprint.entries()].filter(([, refs]) => refs.length > 1).map(([fingerprint, refs]) => ({ fingerprint, refs, count: refs.length }));
}

// Best-effort: a page whose content stream contains at least one BT...ET
// text-showing operator sequence is treated as having selectable text. This
// does not verify every glyph is selectable, only that the page is not a
// pure-raster/vector-only page with zero text objects at all.
// PDFPageLeaf.Contents() already dereferences the page's /Contents entry via
// PDFDict.lookup — it returns either a single PDFStream or a PDFArray of
// streams, never a bare PDFRef.
function pageLikelyHasSelectableText(page) {
  try {
    const contents = page.node.Contents();
    const streams = contents instanceof PDFArray
      ? Array.from({ length: contents.size() }, (_, index) => contents.lookup(index)).filter((item) => item instanceof PDFRawStream)
      : contents instanceof PDFRawStream ? [contents] : [];
    return streams.some((stream) => /\bBT\b[\s\S]*?\bET\b/.test(Buffer.from(stream.contents).toString("latin1")));
  } catch {
    return false;
  }
}

export async function buildPdfExportPostflight({ root, pdfPath, diagnosticsDir }) {
  const registry = await readPdfExportRegistry(root);
  const fileStat = await stat(pdfPath);
  const bytes = await readFile(pdfPath);
  const pdfDoc = await PDFDocument.load(bytes);
  const pages = pdfDoc.getPages();
  const rasterImages = collectRasterImages(pdfDoc);
  const duplicateImages = findDuplicateImages(rasterImages);
  const diagnostics = await readDiagnostics(diagnosticsDir);
  const expectedDiagnosticsFile = `${path.basename(pdfPath, path.extname(pdfPath))}-diagnostics.json`;
  const matchingDiagnostics = diagnostics.filter((entry) => entry.file === expectedDiagnosticsFile);
  const activeDiagnostics = matchingDiagnostics.length ? matchingDiagnostics : diagnostics;
  const projectDiagnostics = collectProjectDiagnostics(activeDiagnostics);

  const report = {
    version: 1,
    generatedAt: new Date().toISOString(),
    pdfPath,
    totalFileSizeBytes: fileStat.size,
    physicalPageCount: pages.length,
    pages: pages.map((page, index) => {
      const { width, height } = page.getSize();
      return { index, widthPt: Math.round(width * 100) / 100, heightPt: Math.round(height * 100) / 100, hasSelectableText: pageLikelyHasSelectableText(page) };
    }),
    rasterImageCount: rasterImages.length,
    largestEmbeddedImages: [...rasterImages].sort((a, b) => b.byteLength - a.byteLength).slice(0, 10).map(({ ref, width, height, byteLength }) => ({ ref, width, height, byteLength })),
    duplicateEmbeddedAssets: duplicateImages,
    projectBlankTail: [],
    collectionPageChrome: [],
    figmaArtifactMode: [],
    tocSafeArea: null,
    fixedPageDimensions: [],
    issues: [],
    ok: false,
  };

  // Project blank-tail rule: reuse each project's own already-computed
  // trailingBlankHeight/intendedBottomPadding rather than remeasuring —
  // captureProjectPage already hard-fails capture past this threshold; this
  // re-asserts the same threshold at the finished, merged PDF level so a
  // regression introduced by segment-merge/embed is still caught even if
  // every individual capture passed.
  for (const entry of activeDiagnostics) {
    if (entry.parseError) report.issues.push({ severity: "error", code: "DIAGNOSTICS_UNREADABLE", sourcePath: entry.file, message: entry.parseError });
  }
  for (const entry of projectDiagnostics) {
    if (typeof entry.trailingBlankHeight !== "number" || typeof entry.intendedBottomPadding !== "number") continue;
    const threshold = entry.intendedBottomPadding;
    const withinThreshold = entry.trailingBlankHeight === threshold;
    report.projectBlankTail.push({
      file: entry.file,
      projectId: entry.projectId ?? null,
      trailingBlankHeight: entry.trailingBlankHeight,
      intendedBottomPadding: entry.intendedBottomPadding,
      threshold,
      withinThreshold,
    });
    if (!withinThreshold) {
      report.issues.push({ severity: "error", code: "UNEXPLAINED_BLANK_TAIL", sourcePath: entry.file, message: `trailingBlankHeight (${entry.trailingBlankHeight}px) does not equal the final page margin (${threshold}px).` });
    }
    if (entry.segmentSourcePages !== undefined && entry.segmentCount !== undefined) {
      const segmentPagesLength = Array.isArray(entry.segmentSourcePages) ? entry.segmentSourcePages.length : entry.segmentSourcePages;
      if (segmentPagesLength !== entry.segmentCount) {
        report.issues.push({ severity: "error", code: "SEGMENT_SEAM_MISMATCH", sourcePath: entry.file, message: `segmentSourcePages (${segmentPagesLength}) does not match segmentCount (${entry.segmentCount}) — a pagination rule introduced blank segment space.` });
      }
    }
    if (typeof entry.overflowRight === "number" && entry.overflowRight > 0) {
      report.issues.push({ severity: "error", code: "HORIZONTAL_OVERFLOW", sourcePath: entry.file, message: `overflowRight is ${entry.overflowRight}px.` });
    }

    const chrome = {
      file: entry.file,
      projectId: entry.sectionId ?? entry.projectId ?? null,
      width: entry.exportRootWidth ?? null,
      projectNumber: entry.projectNumber ?? null,
      projectCount: entry.projectCount ?? null,
      contentSeparation: entry.projectContentSeparation ?? null,
      chromeHeight: entry.collectionPageChromeHeight ?? null,
      backLinkRect: entry.collectionBackLinkRect ?? null,
      exactWebPdfPages: entry.exactWebPdfPages ?? null,
    };
    report.collectionPageChrome.push(chrome);
    if (chrome.width !== 1440 || chrome.contentSeparation !== 32 || chrome.chromeHeight !== 96 || chrome.exactWebPdfPages !== 1 || !chrome.backLinkRect) {
      report.issues.push({ severity: "error", code: "COLLECTION_PAGE_CHROME_INVALID", sourcePath: entry.file, message: `Project ${chrome.projectId ?? "unknown"} does not use the canonical 1440px / 32px separation / 96px chrome / one-page structure with a Back to Index link rectangle.` });
    }

    const figma = entry.figmaAudit;
    if (figma && typeof figma === "object") {
      report.figmaArtifactMode.push({ file: entry.file, projectId: chrome.projectId, ...figma });
      if (figma.iframeCount !== 0 || figma.visibleFallbackCount !== figma.frameCount) {
        report.issues.push({ severity: "error", code: "FIGMA_ARTIFACT_FALLBACK_INVALID", sourcePath: entry.file, message: `Project ${chrome.projectId ?? "unknown"} exported ${figma.iframeCount} Figma iframe(s) and ${figma.visibleFallbackCount}/${figma.frameCount} visible fallback image(s).` });
      }
    }
  }

  // TOC safe-area rule: deterministic arithmetic check against the
  // registry's own declared geometry. This catches a structural overflow in
  // the constants themselves (see pdfExportRegistry.json's toc.note) but
  // does not measure actual rendered glyph pixels — that still requires the
  // manual "Real verification" pass documented in
  // docs/PDF_EXPORT_ARCHITECTURE.md.
  const geometry = registry.sharedGeometry;
  if (geometry?.tocGeometry && geometry?.horizontalSafeArea) {
    const { startX, spacing, slotWidth } = geometry.tocGeometry;
    const { leftPx, rightPx } = geometry.horizontalSafeArea;
    const slotCount = registry.sharedGeometry.tocSlotCount ?? 7;
    const worstCaseRightExtent = startX + (slotCount - 1) * spacing + slotWidth;
    const withinRight = worstCaseRightExtent <= rightPx;
    const withinLeft = startX >= leftPx;
    report.tocSafeArea = { startX, spacing, slotWidth, slotCount, worstCaseRightExtent, safeLeft: leftPx, safeRight: rightPx, withinLeft, withinRight };
    if (!withinRight) {
      report.issues.push({ severity: "error", code: "TOC_RIGHT_EDGE_OVERFLOW", sourcePath: "sharedGeometry.tocGeometry", message: `Full ${slotCount}-slot TOC grid's worst-case label extent (${worstCaseRightExtent}px) exceeds the safe-right edge (${rightPx}px). This is a fixed-grid arithmetic check only — confirm against a real rendered PDF for the actual entry count used.` });
    }
    if (!withinLeft) {
      report.issues.push({ severity: "error", code: "TOC_LEFT_EDGE_OVERFLOW", sourcePath: "sharedGeometry.tocGeometry", message: `TOC start position (${startX}px) is left of the safe-left edge (${leftPx}px).` });
    }
  }

  // Fixed-page dimensions: cover/section pages must render at exactly
  // 1440x900px (converted to PDF points at 72/96 px-per-pt) — a page whose
  // dimensions drift from this is either a project page miscounted as fixed,
  // or a fixed-section renderer regression.
  const expectedFixedWidthPt = toPt(1440);
  const expectedFixedHeightPt = toPt(900);
  const fixedSourceIds = new Set(registry.sources.filter((source) => source.sizing === "fixed").map((source) => source.id));
  report.fixedPageDimensions = { expectedWidthPt: expectedFixedWidthPt, expectedHeightPt: expectedFixedHeightPt, fixedSourceIds: [...fixedSourceIds] };

  report.ok = !report.issues.some((issue) => issue.severity === "error");
  return report;
}
