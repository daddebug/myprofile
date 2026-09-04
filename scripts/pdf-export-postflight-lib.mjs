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
    coverRendererGeometry: null,
    pageWidthUnification: null,
    issues: [],
    ok: false,
  };

  // Collection page geometry HARD INVARIANT: every physical page's real
  // MediaBox width, read straight off the actual merged PDF above (not
  // trusted from diagnostics bookkeeping alone), must be identical — this
  // is the ground-truth check for "left/right page edges align in
  // continuous viewing" (skills/portfolio-collection/SKILL.md). Superseded
  // rule: "different physical widths are expected" no longer applies to
  // the FINAL merged PDF (project CAPTURE width still varies, per
  // window.innerWidth — that is unchanged and is not what this checks).
  const distinctPageWidths = [...new Set(report.pages.map((page) => page.widthPt))];
  if (distinctPageWidths.length > 1) {
    report.issues.push({
      severity: "error",
      code: "COLLECTION_PAGE_WIDTH_NOT_UNIFORM",
      sourcePath: pdfPath,
      message: `Merged Collection PDF has ${distinctPageWidths.length} distinct physical page widths (${distinctPageWidths.join(", ")}pt) — every page must share one MediaBox width per the Collection page geometry invariant.`,
    });
  }

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
      // Measured from the chrome's own real rendered content
      // (label + summary + back-link) — never a fixed constant. See
      // scripts/portfolioCollectionExportPlugin.ts's
      // renderCollectionPageChrome.
      chromeHeight: entry.collectionPageChromeHeight ?? null,
      chromeOverflow: entry.collectionPageChromeOverflow ?? 0,
      finalPageHeight: entry.finalPageHeight ?? null,
      measuredContentBottom: entry.measuredContentBottom ?? null,
      finalMargin: entry.intendedBottomPadding ?? null,
      backLinkRect: entry.collectionBackLinkRect ?? null,
      exactWebPdfPages: entry.exactWebPdfPages ?? null,
    };
    report.collectionPageChrome.push(chrome);
    // chrome.width (exportRootWidth) is the exporting browser's own
    // window.innerWidth at capture time, not a fixed constant — a project
    // page reproduces whatever CSS viewport the browser that initiated the
    // Collection export was actually showing, so it is recorded for
    // diagnostics but is never itself a pass/fail condition here.
    //
    // chrome.chromeHeight is likewise no longer checked against a fixed
    // constant (there is no longer one to check against — it is measured
    // per-project from real content). Instead:
    //   1. arithmetic consistency: the reported finalPageHeight must equal
    //      measuredContentBottom + contentSeparation + the measured chrome
    //      height + the final margin — proving the measured chrome height
    //      is genuinely what was composited into the page, not just a
    //      number reported alongside a differently-sized real result.
    //   2. chromeOverflow must be 0 — the chrome's own re-check (done at
    //      the exact final canvas size, not assumed) found no content
    //      extending past what was actually printed; a non-zero value
    //      means the footer was truncated.
    //   3. the page's own trailing-blank-tail check (above, using
    //      collectionPageFinalMarginPx) already enforces that the bottom
    //      safe area stays a small, exact, expected amount — not
    //      duplicated here.
    if (chrome.contentSeparation !== 32 || chrome.exactWebPdfPages !== 1 || !chrome.backLinkRect) {
      report.issues.push({ severity: "error", code: "COLLECTION_PAGE_CHROME_INVALID", sourcePath: entry.file, message: `Project ${chrome.projectId ?? "unknown"} does not use the canonical 32px separation / one-page structure with a Back to Index link rectangle.` });
    }
    if (typeof chrome.chromeHeight === "number" && typeof chrome.finalPageHeight === "number" && typeof chrome.measuredContentBottom === "number" && typeof chrome.finalMargin === "number") {
      const expectedFinalPageHeight = chrome.measuredContentBottom + chrome.contentSeparation + chrome.chromeHeight + chrome.finalMargin;
      if (Math.abs(expectedFinalPageHeight - chrome.finalPageHeight) > 0.5) {
        report.issues.push({ severity: "error", code: "COLLECTION_PAGE_CHROME_HEIGHT_INCONSISTENT", sourcePath: entry.file, message: `Project ${chrome.projectId ?? "unknown"}: reported finalPageHeight (${chrome.finalPageHeight}px) does not equal measuredContentBottom + contentSeparation + chromeHeight + finalMargin (${expectedFinalPageHeight}px).` });
      }
    } else {
      report.issues.push({ severity: "error", code: "COLLECTION_PAGE_CHROME_HEIGHT_MISSING", sourcePath: entry.file, message: `Project ${chrome.projectId ?? "unknown"} is missing chromeHeight/finalPageHeight/measuredContentBottom/finalMargin diagnostics needed to verify the measured footer height.` });
    }
    if (chrome.chromeOverflow > 0) {
      report.issues.push({ severity: "error", code: "COLLECTION_PAGE_CHROME_TRUNCATED", sourcePath: entry.file, message: `Project ${chrome.projectId ?? "unknown"}: footer content overflowed its own measured canvas by ${chrome.chromeOverflow}px (truncated).` });
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

  // Cross-check mergeCollection's own bookkeeping (per-page target/original
  // width, translation, full-bleed handling) against the ground-truth check
  // above — and surface any full-bleed region that could not be losslessly
  // extended (background-image/gradient/backdrop-filter) as a WARNING, not
  // an error: per the invariant, this must never be silently approximated,
  // but it also must not silently block the export — a human decides.
  const unificationEntry = activeDiagnostics.find((entry) => entry.pageWidthUnification && !entry.parseError);
  if (unificationEntry) {
    report.pageWidthUnification = unificationEntry.pageWidthUnification;
    const { targetWidthPt, pages: unificationPages } = unificationEntry.pageWidthUnification;
    for (const page of unificationPages ?? []) {
      const actual = report.pages[page.pageIndex]?.widthPt;
      if (typeof actual === "number" && Math.abs(actual - page.finalWidthPt) > 0.5) {
        report.issues.push({ severity: "error", code: "COLLECTION_PAGE_WIDTH_BOOKKEEPING_MISMATCH", sourcePath: expectedDiagnosticsFile, message: `Page ${page.pageIndex}: mergeCollection recorded finalWidthPt=${page.finalWidthPt}pt but the real PDF page is ${actual}pt.` });
      }
      for (const unsafe of page.fullBleedUnsafeSkipped ?? []) {
        report.issues.push({
          severity: "warning",
          code: "FULL_BLEED_REGION_NOT_LOSSLESSLY_EXTENDED",
          sourcePath: expectedDiagnosticsFile,
          message: `Page ${page.pageIndex}, template "${unsafe.templateId ?? "unknown"}" (instance ${unsafe.templateInstanceId ?? "unknown"}): full-bleed region could not be losslessly extended (${unsafe.reason}) — it falls back to the plain page background instead of staying full-bleed. Needs a human decision.`,
        });
      }
    }
  } else if (distinctPageWidths.length > 1) {
    report.issues.push({ severity: "error", code: "COLLECTION_PAGE_WIDTH_UNIFICATION_DIAGNOSTICS_MISSING", sourcePath: expectedDiagnosticsFile, message: "Physical page widths differ but no pageWidthUnification diagnostics were found to explain why." });
  }

  const coverDiagnostics = activeDiagnostics
    .flatMap((entry) => Array.isArray(entry.projects) ? entry.projects : [])
    .find((entry) => entry?.sectionId === "cover");
  if (coverDiagnostics) {
    const expectedScale = coverDiagnostics.rendererTargetWidthPx / coverDiagnostics.rendererBaseWidthPx;
    const targetWidthPt = coverDiagnostics.rendererTargetWidthPx * PT_PER_PX;
    const coverPages = report.pageWidthUnification?.pages?.slice(0, 2) ?? [];
    const nativeAtTarget = coverPages.length === 2 && coverPages.every((page) => Math.abs(page.originalWidthPt - targetWidthPt) <= 0.5 && page.translatedByPt === 0);
    report.coverRendererGeometry = {
      baseWidthPx: coverDiagnostics.rendererBaseWidthPx,
      targetWidthPx: coverDiagnostics.rendererTargetWidthPx,
      scaleRatio: coverDiagnostics.rendererScaleRatio,
      expectedScaleRatio: expectedScale,
      targetWidthPt,
      nativeAtTarget,
    };
    if (!Number.isFinite(expectedScale) || Math.abs(coverDiagnostics.rendererScaleRatio - expectedScale) > 0.0001 || !nativeAtTarget) {
      report.issues.push({ severity: "error", code: "COVER_RENDERER_TARGET_GEOMETRY_MISMATCH", sourcePath: expectedDiagnosticsFile, message: "Cover/TOC were not generated natively at the final target width with one shared renderer scale." });
    }
  } else {
    report.issues.push({ severity: "error", code: "COVER_RENDERER_GEOMETRY_DIAGNOSTICS_MISSING", sourcePath: expectedDiagnosticsFile, message: "Cover/TOC renderer width and scale diagnostics are missing." });
  }

  report.ok = !report.issues.some((issue) => issue.severity === "error");
  return report;
}
