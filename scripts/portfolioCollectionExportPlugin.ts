import type { IncomingMessage, ServerResponse } from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, rgb } from "pdf-lib";
import { chromium, type Browser } from "playwright-core";
import type { Plugin } from "vite";
import { findChrome, renderExactWebPdf } from "./exactWebExportPlugin";
import { renderCollectionCoverPages } from "./collectionCoverRenderer";
import { COVER_GEOMETRY, computeIndexNavRects, type CoverTocEntry, type IndexNavRect } from "../src/lib/collectionCoverGeometry";
import { extractTemplateImageReferences, extractProjectDocumentImageReferences, type MinimalTemplateInstance, type MinimalProjectDocument } from "../src/lib/templateImageReferences";
import { resizeOversizedExportImages } from "./exportImageResize";
import { optimizeCollectionPdfStreams } from "./pdfStreamEncodingOptimizer";

const stageEndpoint = "/__local-export/collection/stage";
const finalizeEndpoint = "/__local-export/collection/finalize";
const snapshotEndpoint = "/__local-export/collection/snapshot";
const openFileEndpoint = "/__local-export/collection/open-file";
const openFolderEndpoint = "/__local-export/collection/open-folder";
const createJobEndpoint = "/__local-export/collection/create-job";
const jobEndpointPrefix = "/__local-export/collection/job";
const reportErrorEndpoint = "/__local-export/collection/report-error";
const maximumBytes = 260 * 1024 * 1024;
const maximumJobBytes = 400 * 1024 * 1024;

// Project pages: THIS server drives its own headless Chromium directly to
// the project's real URL and waits for an explicit readiness marker
// (data-project-export-ready="true", set by ProjectPage.tsx once images
// have settled and layout height has stabilized above a trivial size) —
// not by opening a hidden iframe inside the owner's own tab and relying on
// requestAnimationFrame timing inside it, which proved unreliable (an
// invisible, near-zero-opacity iframe can have its animation frames
// throttled indefinitely by the browser, hanging the capture with no
// timeout). Once ready, rendering itself is handed off to the canonical
// exact-web exporter (see captureProjectPage below) — this file only
// navigates, audits, and assembles; it does not render. Each step below has
// its own explicit timeout, and a failure always names the project and the
// step it failed at instead of hanging. "render" covers more work than it
// used to: it now includes a full canonical exact-web PDF generation
// round-trip (renderExactWebPdf, its own browser page, poppler inspection,
// reference render) on top of this file's own live-DOM audits.
const projectCaptureTimeouts = { navigate: 6_000, ready: 20_000, render: 60_000 } as const;
// Sanity ceiling on the live page's own measured height, independent of the
// canonical exporter's own continuous/section-pages/slicing modes (which
// have no such ceiling) — guards against a genuinely runaway-height page
// rather than describing any rendering behavior.
const maximumContinuousProjectHeight = 30_000;
// Fallback capture viewport width, used only if the client somehow didn't
// send its own window.innerWidth (see the "project" stage handler below).
// The real, intended width always comes from the browser that initiated
// the Collection export — captureProjectPage's viewport must match it, or
// the responsive layout captured won't be the layout that browser was
// actually showing (see the layout-fidelity investigation this replaces
// the old hardcoded-1440 behavior for).
const fallbackProjectCaptureViewportWidth = 1440;
const minimumProjectCaptureViewportWidth = 320;
const maximumProjectCaptureViewportWidth = 4096;
// pdf-lib pages are sized in points (72pt = 1in); captures are measured in
// CSS px at the 96dpi the capture viewport renders at.
const cssPxToPdfPt = 72 / 96;
const collectionPageChromeHeightPx = 96;
const collectionPageFinalMarginPx = 24;
const collectionPageSafeMarginPx = 80;

type CollectionPageChrome = {
  label: string;
  sentence: string;
  backToIndexLabel: string;
  projectNumber: number;
  projectCount: number;
};

function escapePageChromeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

async function renderCollectionPageChrome(browser: Browser, widthPx: number, chrome: CollectionPageChrome) {
  const page = await browser.newPage({ viewport: { width: widthPx, height: collectionPageChromeHeightPx }, deviceScaleFactor: 1 });
  const pageIndicator = `${String(chrome.projectNumber).padStart(2, "0")} / ${String(chrome.projectCount).padStart(2, "0")}`;
  try {
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
      @page { size: ${widthPx}px ${collectionPageChromeHeightPx}px; margin: 0; }
      html, body { width: ${widthPx}px; height: ${collectionPageChromeHeightPx}px; margin: 0; overflow: hidden; background: #181743; }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .chrome { width: calc(100% - ${collectionPageSafeMarginPx * 2}px); height: 100%; margin: 0 ${collectionPageSafeMarginPx}px; padding-top: 15px; border-top: 1px solid rgba(244,245,250,.14); display: grid; grid-template-columns: minmax(0, 1fr) 240px; column-gap: 40px; color: #f4f5fa; }
      .label, .number { margin: 0; font: 700 11px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .12em; }
      .label { color: rgba(52,240,37,.72); }
      .summary { max-width: 820px; margin: 9px 0 0; font: 400 14px/1.45 system-ui, sans-serif; color: rgba(244,245,250,.62); }
      .right { text-align: right; }
      .number { color: rgba(244,245,250,.42); }
      .back { display: inline-block; margin-top: 17px; font: 600 12px/1.35 system-ui, sans-serif; color: rgba(52,240,37,.78); }
    </style></head><body><footer class="chrome"><div><p class="label">${escapePageChromeHtml(chrome.label)}</p><p class="summary">${escapePageChromeHtml(chrome.sentence)}</p></div><div class="right"><p class="number">${pageIndicator}</p><span class="back">${escapePageChromeHtml(chrome.backToIndexLabel)}</span></div></footer></body></html>`, { waitUntil: "load" });
    await page.evaluate(() => document.fonts?.ready);
    const bytes = await page.pdf({
      width: `${widthPx}px`,
      height: `${collectionPageChromeHeightPx}px`,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
      printBackground: true,
      displayHeaderFooter: false,
      preferCSSPageSize: true,
    });
    return new Uint8Array(bytes);
  } finally {
    await page.close();
  }
}

async function applyCollectionPageChrome(
  contentBytes: Uint8Array,
  browser: Browser,
  widthPx: number,
  contentPageHeightPx: number,
  chrome: CollectionPageChrome,
) {
  const document = await PDFDocument.load(contentBytes);
  if (document.getPageCount() !== 1) throw new Error("Collection project chrome requires one continuous project page.");
  const page = document.getPage(0);
  const pageWidth = page.getWidth();
  const pxToPageUnit = pageWidth / widthPx;
  const chromeHeight = collectionPageChromeHeightPx * pxToPageUnit;
  const finalMargin = collectionPageFinalMarginPx * pxToPageUnit;
  const addedHeight = chromeHeight + finalMargin;
  const originalHeight = page.getHeight();
  page.setSize(pageWidth, originalHeight + addedHeight);
  // pdf-lib's translateContent matrix also applies to drawing operators
  // appended after the call. Draw the new page furniture at negative Y
  // first, then translate the complete content stream once: canonical
  // project content moves up, while these negative coordinates land in the
  // newly-added bottom region instead of leaving a white tail.
  page.drawRectangle({ x: 0, y: -addedHeight, width: pageWidth, height: addedHeight, color: rgb(24 / 255, 23 / 255, 67 / 255) });
  const chromePdf = await PDFDocument.load(await renderCollectionPageChrome(browser, widthPx, chrome));
  const [embeddedChrome] = await document.embedPdf(chromePdf, [0]);
  page.drawPage(embeddedChrome, { x: 0, y: finalMargin - addedHeight, width: pageWidth, height: chromeHeight });
  page.translateContent(0, addedHeight);

  // Content translation does not move annotations. Preserve every existing
  // exact-web external/internal link by shifting its rectangle with the
  // project content; the Collection Back-to-Index annotation is added later
  // from the independent page-chrome rectangle.
  const annotations = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
  if (annotations) {
    for (let index = 0; index < annotations.size(); index += 1) {
      const annotation = annotations.lookup(index, PDFDict);
      const rect = annotation.lookupMaybe(PDFName.of("Rect"), PDFArray);
      if (!rect || rect.size() !== 4) continue;
      const bottom = rect.lookup(1, PDFNumber).asNumber();
      const top = rect.lookup(3, PDFNumber).asNumber();
      rect.set(1, PDFNumber.of(bottom + addedHeight));
      rect.set(3, PDFNumber.of(top + addedHeight));
    }
  }
  const linkWidthPx = 240;
  const linkTopWithinChromePx = 43;
  return {
    bytes: await document.save({ useObjectStreams: false }),
    finalPageHeightPx: contentPageHeightPx + collectionPageChromeHeightPx + collectionPageFinalMarginPx,
    backLinkRect: {
      x: widthPx - collectionPageSafeMarginPx - linkWidthPx,
      y: contentPageHeightPx + linkTopWithinChromePx,
      width: linkWidthPx,
      height: 28,
    },
  };
}

// Project pages are rendered by the canonical exact-web exporter
// (renderExactWebPdf, scripts/exactWebExportPlugin.ts) via a DOM snapshot
// built by the same buildExactSnapshotResult() the single-project "Export
// Exact Web PDF" button uses (exposed on window.__exactWebExport — see
// captureProjectPage below). Collection assembles that already-canonical
// PDF output; it must not maintain a second project rendering/pagination
// pipeline of its own. See docs/PDF_EXPORT_ARCHITECTURE.md.
let collectionBrowserPromise: Promise<Browser> | null = null;
async function getCollectionBrowser() {
  if (!collectionBrowserPromise) {
    collectionBrowserPromise = chromium.launch({ headless: true, executablePath: await findChrome() }).catch((error) => {
      collectionBrowserPromise = null;
      throw error;
    });
  }
  return collectionBrowserPromise;
}
async function closeCollectionBrowser() {
  const browser = await collectionBrowserPromise?.catch(() => null);
  collectionBrowserPromise = null;
  if (browser) await browser.close();
}

type ProjectCaptureStep = "navigate" | "ready" | "render";

function withStepTimeout<T>(promise: Promise<T>, ms: number, step: ProjectCaptureStep, projectId: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`"${projectId}" timed out at step "${step}" after ${ms}ms.`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function isLocalCollectionUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.origin === "http://localhost:5173";
  } catch {
    return false;
  }
}

// Raw-data ground truth for the media-slot diagnostics: reads the same
// staged draft.json / assets-manifest.json this job already wrote to disk
// (see createCollectionJob below) and runs the shared extractor against it
// — independent of whatever the rendered component managed to show, per
// the requirement that classification come from the raw template data,
// not the rendered component alone. Returns null for a static/non-staged
// project (no job, or no draft for this project in it) — nothing to
// cross-check in that case.
async function readTemplateImageAudit(outputRoot: string, jobId: string | null, projectId: string) {
  if (!jobId) return null;
  const projectDir = jobProjectDirectory(outputRoot, jobId, projectId);
  const draftRaw = await fs.readFile(path.join(projectDir, "draft.json"), "utf8").catch(() => null);
  const documentRaw = await fs.readFile(path.join(projectDir, "document.json"), "utf8").catch(() => null);
  if (!draftRaw && !documentRaw) return null;
  const draft = draftRaw ? (JSON.parse(draftRaw) as { templateInstances?: MinimalTemplateInstance[] } | null) : null;
  const templateInstances = Array.isArray(draft?.templateInstances) ? draft.templateInstances : [];
  const document = documentRaw ? (JSON.parse(documentRaw) as MinimalProjectDocument | null) : null;
  const manifestRaw = await fs.readFile(path.join(projectDir, "assets-manifest.json"), "utf8").catch(() => null);
  const manifest = manifestRaw ? (JSON.parse(manifestRaw) as Record<string, { mimeType: string }>) : {};
  // A project's body is exactly one content system, never both (see
  // buildDynamicProjectStagingPayload in collectionExportStaging.ts) — the
  // "scanned" count below is instances OR blocks depending on which is
  // actually present, not summed as if both contributed real content.
  const references = document
    ? extractProjectDocumentImageReferences(projectId, document)
    : extractTemplateImageReferences(projectId, templateInstances);
  const scannedCount = document
    ? document.sections.reduce((sum, section) => sum + section.blocks.length, 0)
    : templateInstances.length;
  const imageCapableInstanceIds = new Set(references.map((reference) => reference.templateInstanceId));
  const stagedCount = references.filter((reference) => {
    const assetId = reference.imageId || reference.localImageId;
    return Boolean(assetId && manifest[assetId]);
  }).length;
  return {
    templateInstancesScanned: scannedCount,
    imageCapableTemplateInstances: imageCapableInstanceIds.size,
    imageReferencesFound: references.length,
    imagesStaged: stagedCount,
    references,
  };
}

function jobIdFromCaptureUrl(url: string): string | null {
  try {
    return new URL(url).searchParams.get("collectionJob");
  } catch {
    return null;
  }
}

// The lazy-loaded bridge module (ProjectExactWebExportAction.tsx) may not
// have finished importing yet by the time data-project-export-ready flips —
// bound the wait explicitly rather than assuming it's already there.
const exactWebBridgeTimeoutMs = 10_000;

async function captureProjectPage(
  url: string,
  projectId: string,
  slug: string,
  locale: "zh" | "en",
  aborted: { value: boolean },
  outputRoot: string,
  captureWidthPx: number,
  pageChrome: CollectionPageChrome,
) {
  if (!isLocalCollectionUrl(url)) throw new Error(`Refusing to capture a non-local project URL for "${projectId}".`);
  const browser = await getCollectionBrowser();
  const page = await browser.newPage({ viewport: { width: captureWidthPx, height: 900 }, deviceScaleFactor: 1 });
  try {
    if (aborted.value) throw new Error("Collection export was cancelled.");
    await withStepTimeout(page.goto(url, { waitUntil: "domcontentloaded" }), projectCaptureTimeouts.navigate, "navigate", projectId);
    if (aborted.value) throw new Error("Collection export was cancelled.");
    try {
      await withStepTimeout(
        page.waitForSelector('[data-project-route-shell][data-project-export-ready="true"]', { state: "attached", timeout: projectCaptureTimeouts.ready }),
        projectCaptureTimeouts.ready,
        "ready",
        projectId,
      );
    } catch (error) {
      // The client-side readiness watcher (ProjectPage.tsx) writes a live
      // breakdown of why it hasn't marked ready yet onto the DOM
      // (data-project-export-diagnostics) — grab it on timeout so the
      // reported failure names the actual blocking condition instead of
      // just "still not ready". If the project's catalog entry never
      // resolved (e.g. a dynamic project whose data lives only in the
      // owner's own browser, not this capture browser's separate profile),
      // ProjectPage.tsx redirects to /work before any shell ever mounts —
      // there's no diagnostics attribute to read in that case, so report the
      // redirect itself instead of a bare "still not ready".
      const currentUrl = page.url();
      const shellExists = await page.evaluate(() => Boolean(document.querySelector("[data-project-route-shell]"))).catch(() => false);
      const diagnostics = await page.evaluate(() => document.querySelector("[data-project-route-shell]")?.getAttribute("data-project-export-diagnostics") ?? null).catch(() => null);
      const message = error instanceof Error ? error.message : String(error);
      console.warn("[collection export] ready-step failure", { projectId, currentUrl, shellExists, diagnostics });
      if (!shellExists) {
        throw new Error(`${message} The project route never mounted — current URL is "${currentUrl}" (likely redirected away because the project's catalog entry never resolved).`);
      }
      throw new Error(diagnostics ? `${message} Last known state: ${diagnostics}` : message);
    }
    if (aborted.value) throw new Error("Collection export was cancelled.");
    const rendered = await withStepTimeout((async () => {
      await page.emulateMedia({ media: "screen" });
      const diagnostics = await page.evaluate(() => {
        const root = document.querySelector<HTMLElement>("[data-project-route-shell]");
        const rect = root?.getBoundingClientRect();
        return {
          exportRootWidth: Math.round(rect?.width ?? 0),
          exportRootHeight: Math.round(rect?.height ?? 0),
          exportRootTextLength: root?.innerText.trim().length ?? 0,
          imageCount: root?.querySelectorAll("img").length ?? 0,
        };
      });
      if (diagnostics.exportRootHeight < 100) throw new Error(`"${projectId}" rendered an invalid export root height (${diagnostics.exportRootHeight}px).`);
      if (diagnostics.exportRootHeight > maximumContinuousProjectHeight) {
        throw new Error(`"${projectId}" is ${diagnostics.exportRootHeight}px tall, over the ${maximumContinuousProjectHeight}px single-page capture limit.`);
      }

      // Media-slot audit: every image slot that opts into the
      // data-media-slot-state convention (ThreeDCharacterUiDraftPage's
      // DraftImage, ImageRowTemplate's RowImage) reports whether it's
      // "empty" (no image was ever assigned — an intentional gap, fine to
      // ship) or "failed" (an image WAS referenced but didn't load — a real
      // missing asset). Only "failed" fails the capture; an empty slot is
      // never treated as an error.
      const mediaSlotAudit = await page.evaluate(() => {
        const root = document.querySelector<HTMLElement>("[data-project-route-shell]");
        const nodes = Array.from(root?.querySelectorAll<HTMLElement>("[data-media-slot-state]") ?? []);
        const counts = { filled: 0, failed: 0 };
        const failedSlotIds: string[] = [];
        const failedReferences: Array<{ slotId: string; src: string | null; complete: boolean | null; naturalWidth: number | null; naturalHeight: number | null; visible: boolean }> = [];
        const recoveredStaleFailedSlotIds: string[] = [];
        // By contract, an "empty" slot is never rendered at all in capture
        // mode — DraftImage/RowImage both fully remove the element rather
        // than leaving it blank (see collectionMediaDiagnostics.ts). So ANY
        // node still carrying data-media-slot-state="empty" here means that
        // contract was violated somewhere — a real regression to report,
        // not assumed away. This is a DOM-position check, not just text:
        // getBoundingClientRect confirms it's still occupying real layout
        // space (a genuine blank frame), not merely a stray attribute on an
        // otherwise-invisible node.
        let visibleEmptyPlaceholders = 0;
        let remainingBlankMediaFrames = 0;
        for (const node of nodes) {
          const state = node.getAttribute("data-media-slot-state");
          const slotId = node.getAttribute("data-media-slot-id") ?? "unknown";
          const image = node.querySelector<HTMLImageElement>("img");
          const imageRect = image?.getBoundingClientRect();
          const hasVisibleDecodedImage = Boolean(
            image
            && image.complete
            && image.naturalWidth > 0
            && image.naturalHeight > 0
            && imageRect
            && imageRect.width > 0
            && imageRect.height > 0,
          );
          // Component load state can be stale after the browser has decoded
          // the same canonical image. Shipping follows the literal rendered
          // result; a 404, decode failure, zero-size, or hidden image still
          // remains a hard failure.
          if (state === "failed" && hasVisibleDecodedImage) {
            counts.filled += 1;
            recoveredStaleFailedSlotIds.push(slotId);
          } else if (state === "filled" || state === "failed") {
            counts[state] += 1;
          }
          if (state === "failed" && !hasVisibleDecodedImage) {
            failedSlotIds.push(slotId);
            failedReferences.push({
              slotId,
              src: image?.currentSrc || image?.src || image?.getAttribute("src") || null,
              complete: image?.complete ?? null,
              naturalWidth: image?.naturalWidth ?? null,
              naturalHeight: image?.naturalHeight ?? null,
              visible: Boolean(imageRect && imageRect.width > 0 && imageRect.height > 0),
            });
          }
          if (state === "empty") {
            if ((node.textContent ?? "").trim().length > 0) visibleEmptyPlaceholders += 1;
            const rect = node.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) remainingBlankMediaFrames += 1;
          }
        }
        const structural = (window as unknown as {
          __collectionMediaDiagnostics?: { emptySlotsFound: Set<string>; emptySlotsCollapsed: Set<string>; modulesOmitted: Set<string>; textOnlyCards: Set<string> };
        }).__collectionMediaDiagnostics;
        return {
          totalSlots: nodes.length,
          ...counts,
          failedSlotIds,
          failedReferences,
          recoveredStaleFailedSlotIds,
          visibleEmptyPlaceholders,
          remainingBlankMediaFrames,
          emptySlotsFound: structural?.emptySlotsFound.size ?? 0,
          emptySlotsCollapsed: structural?.emptySlotsCollapsed.size ?? 0,
          modulesOmitted: structural?.modulesOmitted.size ?? 0,
          textOnlyCards: structural?.textOnlyCards.size ?? 0,
        };
      });
      const figmaAudit = await page.evaluate(() => {
        const root = document.querySelector<HTMLElement>("[data-project-route-shell]");
        const frames = Array.from(root?.querySelectorAll<HTMLElement>('[data-figma-prototype-frame="fallback"], [data-figma-prototype-block]') ?? []);
        const iframeCount = frames.reduce((sum, frame) => sum + frame.querySelectorAll("iframe").length, 0);
        const visibleFallbackCount = frames.filter((frame) => {
          const image = frame.querySelector<HTMLImageElement>('img[data-figma-prototype-fallback], img');
          if (!image) return false;
          const rect = image.getBoundingClientRect();
          return image.complete && image.naturalWidth > 0 && image.naturalHeight > 0 && rect.width > 0 && rect.height > 0;
        }).length;
        return { frameCount: frames.length, iframeCount, visibleFallbackCount };
      });
      if (figmaAudit.iframeCount > 0) {
        throw new Error(`"${projectId}" instantiated a Figma iframe in PDF export mode.`);
      }
      if (figmaAudit.visibleFallbackCount < figmaAudit.frameCount) {
        throw new Error(`"${projectId}" has a Figma export frame without a visibly decoded fallback image.`);
      }
      // Per-top-level-template-instance overflow-fit diagnostics — recorded
      // client-side by TemplateInstancesSection's InstanceBlock (see
      // collectionMediaDiagnostics.ts). A non-zero overflowAfterFit means a
      // template is still wider than its allotted space even after the
      // scoped zoom fit, which would still crop content — a real
      // regression to fail on, not silently ship.
      const templateFitAudit = await page.evaluate(() => {
        const store = (window as unknown as { __collectionTemplateFitDiagnostics?: Map<string, unknown> }).__collectionTemplateFitDiagnostics;
        return store ? Array.from(store.values()) : [];
      }) as Array<{ templateInstanceId: string; templateId: string; naturalWidth: number; availableWidth: number; fitScale: number; overflowAfterFit: number }>;
      const stillOverflowing = templateFitAudit.filter((entry) => entry.overflowAfterFit > 0);
      if (stillOverflowing.length > 0) {
        throw new Error(
          `"${projectId}" has ${stillOverflowing.length} template instance(s) still overflowing after the fit scale (${stillOverflowing.map((entry) => `${entry.templateId}:${entry.templateInstanceId} overflow=${entry.overflowAfterFit}px`).join(", ")}). Refusing to ship a project page with clipped content.`,
        );
      }

      const layoutAudit = await page.evaluate(() => {
        const root = document.querySelector<HTMLElement>("[data-project-route-shell]");
        if (!root) return { measuredContentBottom: 0, finalVisibleTemplateInstanceId: null, intendedBottomPadding: 0, emptyTemplateWrappers: [] as string[] };
        const rootRect = root.getBoundingClientRect();
        const candidates = Array.from(root.querySelectorAll<HTMLElement>("[data-template-instance-id], [data-document-section]"));
        const visible = candidates.filter((node) => {
          const style = window.getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        });
        const finalNode = visible.reduce<HTMLElement | null>((latest, node) => (
          !latest || node.getBoundingClientRect().bottom > latest.getBoundingClientRect().bottom ? node : latest
        ), null);
        const finalRect = finalNode?.getBoundingClientRect();
        const containingSection = finalNode?.closest<HTMLElement>("section");
        const intendedBottomPadding = containingSection ? Number.parseFloat(window.getComputedStyle(containingSection).paddingBottom) || 0 : 0;
        const emptyTemplateWrappers = candidates.flatMap((node) => {
          const rect = node.getBoundingClientRect();
          const hasVisibleContent = (node.innerText ?? "").trim().length > 0 || Boolean(node.querySelector("img,svg,canvas,iframe,[data-media-slot-state=filled]"));
          return rect.height > 1 && !hasVisibleContent ? [node.getAttribute("data-template-instance-id") ?? node.getAttribute("data-document-section") ?? "unknown"] : [];
        });
        return {
          measuredContentBottom: Math.round((finalRect?.bottom ?? rootRect.bottom) - rootRect.top),
          finalVisibleTemplateInstanceId: finalNode?.getAttribute("data-template-instance-id") ?? finalNode?.getAttribute("data-document-section") ?? null,
          intendedBottomPadding: Math.round(intendedBottomPadding),
          emptyTemplateWrappers,
        };
      });
      if (layoutAudit.emptyTemplateWrappers.length > 0) {
        throw new Error(`"${projectId}" has empty template wrapper(s) that still reserve height: ${layoutAudit.emptyTemplateWrappers.join(", ")}.`);
      }

      const jobId = jobIdFromCaptureUrl(url);
      const templateImageAudit = await readTemplateImageAudit(outputRoot, jobId, projectId);
      if (mediaSlotAudit.failed > 0) {
        throw new Error(
          `"${projectId}" has ${mediaSlotAudit.failed} referenced image(s) that failed to load (slot ids: ${mediaSlotAudit.failedSlotIds.join(", ")}; resources: ${JSON.stringify(mediaSlotAudit.failedReferences)}). Refusing to ship a project page with a missing real image.`,
        );
      }
      // Canonical rendering: hand off to the exact same DOM-snapshot builder
      // and PDF printer the single-project "Export Exact Web PDF" button
      // uses (window.__exactWebExport, exposed dev-only by
      // ProjectExactWebExportAction.tsx; renderExactWebPdf, defined in
      // exactWebExportPlugin.ts) instead of re-navigating/re-rendering the
      // project through a second, independently-drifting pipeline. This is
      // what makes a Collection project page identical — DOM, width,
      // typography, spacing, image handling, pagination — to the same
      // project's own exact-web export. Collection assembles that already-
      // canonical output; it must never maintain a second project renderer.
      await page.waitForFunction(
        () => Boolean((window as unknown as { __exactWebExport?: unknown }).__exactWebExport),
        { timeout: exactWebBridgeTimeoutMs },
      );
      const snapshot = await page.evaluate(() => {
        const bridge = (window as unknown as {
          __exactWebExport?: { buildSnapshot: (options: Record<string, unknown>) => Promise<{ html: string; captureWidth: number }> };
        }).__exactWebExport;
        if (!bridge) throw new Error("The canonical exact-web snapshot bridge was not found on the page.");
        return bridge.buildSnapshot({});
      });
      // Collection PDF rule: one project = one continuous page, page
      // boundaries only between projects — forced explicitly here so a
      // project taller than exactWebExportPlugin.ts's own
      // maximumContinuousHeight auto-switch doesn't get split into
      // multiple physical pages inside the merged collection PDF.
      // width comes from the snapshot itself (window.innerWidth measured
      // inside this same page, which was opened at captureWidthPx above) —
      // not a hardcoded constant, so the printed layout matches whatever
      // CSS viewport the snapshot's own HTML was actually built against.
      const exported = await renderExactWebPdf(
        { projectId, slug, locale, width: snapshot.captureWidth, html: snapshot.html, mode: "continuous" },
        outputRoot,
        "http://localhost:5173",
      );
      const contentTrailingBlankHeight = exported.report.trailingBlankHeight;
      if (contentTrailingBlankHeight > exported.report.intendedBottomPadding) {
        throw new Error(
          `"${projectId}" has ${contentTrailingBlankHeight}px of trailing blank space after ${layoutAudit.finalVisibleTemplateInstanceId ?? "the final visible module"}; expected ${exported.report.intendedBottomPadding}px before the shared page chrome.`,
        );
      }
      const composed = await applyCollectionPageChrome(
        exported.pdfBytes,
        browser,
        snapshot.captureWidth,
        exported.report.finalPageHeight,
        pageChrome,
      );
      const captureHeight = composed.finalPageHeightPx;

      // Mandatory media diagnostics: the first 8 fields are raw-data-driven
      // (templateImageAudit, read from the staged draft.json + assets
      // manifest — the ground truth, independent of what the component
      // rendered) or DOM-observed post-collapse (mediaSlotAudit). A static/
      // non-dynamic project (no job, or a legacy DraftImage-only page with
      // no TemplateInstance data at all) legitimately reports 0 template
      // instances — its own media slots still show up via mediaSlotAudit.
      const mediaAudit = {
        templateInstancesScanned: templateImageAudit?.templateInstancesScanned ?? 0,
        imageCapableTemplateInstances: templateImageAudit?.imageCapableTemplateInstances ?? 0,
        imageReferencesFound: templateImageAudit?.imageReferencesFound ?? 0,
        imagesStaged: templateImageAudit?.imagesStaged ?? 0,
        imagesDecoded: mediaSlotAudit.filled,
        genuinelyEmptySlots: mediaSlotAudit.emptySlotsFound,
        failedReferencedImages: mediaSlotAudit.failed,
        slotsCollapsed: mediaSlotAudit.emptySlotsCollapsed,
        modulesOmitted: mediaSlotAudit.modulesOmitted,
        textOnlyCardsReflowed: mediaSlotAudit.textOnlyCards,
        visibleEmptyPlaceholders: mediaSlotAudit.visibleEmptyPlaceholders,
        remainingBlankMediaFrames: mediaSlotAudit.remainingBlankMediaFrames,
      };
      return {
        bytes: composed.bytes,
        diagnostics: {
          ...diagnostics,
          measuredContentBottom: exported.report.measuredContentBottom,
          finalPageHeight: captureHeight,
          trailingBlankHeight: collectionPageFinalMarginPx,
          intendedBottomPadding: collectionPageFinalMarginPx,
          projectContentSeparation: exported.report.intendedBottomPadding,
          collectionPageChromeHeight: collectionPageChromeHeightPx,
          projectNumber: pageChrome.projectNumber,
          projectCount: pageChrome.projectCount,
          finalVisibleTemplateInstanceId: layoutAudit.finalVisibleTemplateInstanceId,
          mediaAudit,
          templateFit: templateFitAudit,
          exactWebMode: exported.report.mode,
          exactWebMeasuredHeight: exported.report.measuredHeight,
          exactWebPdfPages: exported.report.pdfAudit.pages,
          viewportWidth: exported.report.viewportWidth,
          collectionBackLinkRect: composed.backLinkRect,
          figmaAudit,
        },
        pdfHeight: captureHeight,
      };
    })(), projectCaptureTimeouts.render, "render", projectId);
    return rendered;
  } finally {
    await page.close().catch(() => undefined);
  }
}

function isSafeTocEntry(value: unknown): value is CoverTocEntry {
  const record = value as Record<string, unknown>;
  return !!value && typeof value === "object" && !Array.isArray(value)
    && safeId(record.id)
    && typeof record.title === "string"
    && record.title.length > 0
    && record.title.length <= 160
    && (record.metaLabel === undefined || (typeof record.metaLabel === "string" && record.metaLabel.length <= 160));
}

// Cover + index capture: builds the two deterministic SVG pages (see
// collectionCoverRenderer.ts) — a clean identity-only cover, then a
// separate compact project-index page — and rasterizes each via
// Playwright at its own exact, independently-compact native size,
// embedding both PNGs directly into a single 2-page pdf-lib document
// (page 1 = cover, page 2 = index). Each page's PDF height matches its
// own rendered pixel height, in points — they are shorter than (and
// intentionally different from) the project pages' own height, never
// forced to a shared/fixed page size. No Chromium page.pdf() print
// pipeline involved, same as project pages. navRects are computed
// straight from the index page's own column geometry (no DOM query
// needed) so the index's click-to-navigate links stay exact; they always
// refer to the LAST page of this section (see mergeCollection), which is
// the index page — its own pixel height (navRectsSourceHeightPx) travels
// with them so link-rect coordinates scale against the right canvas.
async function captureCoverPage(entries: CoverTocEntry[], brandLine: string, footerLabel: string, outputRoot: string, targetWidthPx: number) {
  const browser = await getCollectionBrowser();
  const debugDir = path.join(outputRoot, "output", "pdf", "collection", "debug");
  const result = await renderCollectionCoverPages(browser, entries, brandLine, footerLabel, debugDir);

  const document = await PDFDocument.create();
  const scale = targetWidthPx / COVER_GEOMETRY.width;
  const pageWidth = targetWidthPx * cssPxToPdfPt;
  const coverHeight = result.coverHeightPx * scale * cssPxToPdfPt;
  const indexHeight = result.indexHeightPx * scale * cssPxToPdfPt;
  const embeddedCover = await document.embedPng(result.coverPng);
  const coverPage = document.addPage([pageWidth, coverHeight]);
  coverPage.drawImage(embeddedCover, { x: 0, y: 0, width: pageWidth, height: coverHeight });
  const embeddedIndex = await document.embedPng(result.indexPng);
  const indexPage = document.addPage([pageWidth, indexHeight]);
  indexPage.drawImage(embeddedIndex, { x: 0, y: 0, width: pageWidth, height: indexHeight });
  const bytes = await document.save();

  const navRects: IndexNavRect[] = computeIndexNavRects(entries);
  return {
    bytes,
    navRects,
    navRectsSourceHeightPx: result.indexHeightPx,
    diagnostics: {
      entryCount: entries.length,
      coverHeightPx: result.coverHeightPx,
      indexHeightPx: result.indexHeightPx,
      fits: result.fits.map(({ title, slot, fontSize, lineCount, truncated }) => ({ title, slot, fontSize, lineCount, truncated })),
      coverSvgPath: result.coverSvgPath,
      coverPngPath: result.coverPngPath,
      indexSvgPath: result.indexSvgPath,
      indexPngPath: result.indexPngPath,
    },
  };
}

function isWithinCollectionOutput(root: string, candidate: string) {
  const resolved = path.resolve(candidate);
  const allowedRoot = path.resolve(root, "output", "pdf", "collection");
  return resolved === allowedRoot || resolved.startsWith(`${allowedRoot}${path.sep}`);
}

type NavigationRect = { sectionId: string; x: number; y: number; width: number; height: number };
// navRectsSourceHeightPx is the pixel height of the canvas navRects'
// coordinates were computed against — the cover/index pages are their own
// compact height (not the fixed 900px every HTML "section" capture still
// uses), so link-rect scaling needs to know which canvas a given record's
// rects came from. Defaults to 900 (addLinkAnnotations) when absent, which
// keeps the "section" kind's still-900-tall HTML captures unaffected.
type StageRecord = { bytes: Uint8Array; sectionId: string; label: string; navRects: NavigationRect[]; navRectsSourceHeightPx?: number; diagnostics?: Record<string, unknown>; createdAt: number };

function localRequest(req: IncomingMessage) {
  const address = req.socket.remoteAddress ?? "";
  return (address === "::1" || address === "127.0.0.1" || address === "::ffff:127.0.0.1")
    && /^localhost:5173$/i.test(req.headers.host ?? "")
    && req.headers.origin === "http://localhost:5173";
}

// Same loopback + Host check as localRequest(), but without requiring an
// Origin header — browsers routinely omit Origin on a same-origin, simple
// GET fetch (confirmed: every staged-project lookup below was silently
// getting 403'd because of this, which is why a dynamic project's staged
// catalog entry never reached the page — the fetch "succeeded" with a 403,
// so nothing hung, it just silently never picked up real data). Only used
// for read-only GET lookups; every state-changing endpoint keeps the
// stricter localRequest() check.
function localGetRequest(req: IncomingMessage) {
  const address = req.socket.remoteAddress ?? "";
  return (address === "::1" || address === "127.0.0.1" || address === "::ffff:127.0.0.1")
    && /^localhost:5173$/i.test(req.headers.host ?? "");
}

async function bodyWithLimit(req: IncomingMessage, limitBytes: number) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += value.length;
    if (size > limitBytes) throw new Error("Collection export payload is too large.");
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function body(req: IncomingMessage) {
  return bodyWithLimit(req, maximumBytes);
}

function safeId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]*$/i.test(value);
}

function json(res: ServerResponse, status: number, value: object) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(value));
}

// Section HTML is expected to already describe exactly one 1440x900 page,
// safe-margin padding included as real CSS padding on its own content (see
// buildCoverSectionsHtml in src/lib/portfolioCollectionExport.ts) — multi-
// page cover content is pre-split client-side into one stage() call per
// physical page, each of which lands here separately. That means this
// function never needs to invent its own pagination or page-break rules:
// no @page CSS, no forced break-after, no scaling — it renders the single
// page it's given at its natural 1:1 size, exactly like the (untouched)
// single-project Exact Web renderer does for "project" kind sections.
async function renderSectionPdf(html: string, snapshots: Map<string, string>) {
  if (!html.includes("data-collection-export-section")) throw new Error("Invalid collection section HTML.");
  const token = crypto.randomUUID();
  snapshots.set(token, html);
  const browser = await chromium.launch({ headless: true, executablePath: await findChrome() });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await page.emulateMedia({ media: "screen" });
    await page.goto(`http://localhost:5173${snapshotEndpoint}/${token}`, { waitUntil: "networkidle" });
    await page.evaluate(async () => {
      await document.fonts?.ready;
      await Promise.all(Array.from(document.images).map((image) => image.complete ? image.decode().catch(() => undefined) : new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      })));
    });
    if (!await page.locator("[data-collection-export-section]").count()) throw new Error("Collection section has no export content.");
    // Export-only, in-page right-sizing of oversized images before
    // Chromium prints — see exportImageResize.ts / exactWebExportPlugin.ts's
    // identical use for project pages.
    await page.evaluate(resizeOversizedExportImages);
    const navRects = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>("[data-collection-nav-target]")).map((node) => {
      const rect = node.getBoundingClientRect();
      return { sectionId: node.dataset.collectionNavTarget ?? "", x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }).filter((rect) => rect.sectionId));
    // preferCSSPageSize must be explicit false: the site's own global
    // stylesheet (loaded here via absoluteStylesheetMarkup(), since this
    // snapshot page needs the site's real CSS) declares an unrelated
    // @media print { @page { size: A4 portrait } } rule (src/styles.css,
    // for the single-project print feature) — Chromium's print-to-PDF
    // pipeline evaluates @media print regardless of the emulateMedia
    // "screen" call above (that call only affects on-screen rendering, not
    // what page.pdf() itself resolves media queries against), so without
    // this explicit false the page came out swapped to that stylesheet's
    // portrait orientation (900x1440) instead of the requested 1440x900 —
    // confirmed by reading the actual generated PDF's page boxes.
    const bytes = await page.pdf({ width: "1440px", height: "900px", margin: { top: "0", right: "0", bottom: "0", left: "0" }, printBackground: true, preferCSSPageSize: false });
    return { bytes: new Uint8Array(bytes), navRects };
  } finally {
    snapshots.delete(token);
    await browser.close();
  }
}

// sourceHeightPx is the pixel height of the canvas navRects' y/height
// coordinates were originally measured against — 900 for every HTML
// "section" capture (still a fixed 1440x900 viewport), but the cover
// section's index page now has its own compact, selection-dependent
// height (see captureCoverPage/navRectsSourceHeightPx), so it must be
// passed through rather than assumed.
function addLinkAnnotations(document: PDFDocument, coverPageIndex: number, navRects: NavigationRect[], starts: Map<string, number>, sourceHeightPx: number) {
  const page = document.getPage(coverPageIndex);
  const { width, height } = page.getSize();
  let annots = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
  if (!annots) {
    annots = document.context.obj([]);
    page.node.set(PDFName.of("Annots"), annots);
  }
  navRects.forEach((rect) => {
    const targetIndex = starts.get(rect.sectionId);
    if (targetIndex === undefined) return;
    const targetPage = document.getPage(targetIndex);
    const annotation = document.context.register(document.context.obj({
      Type: PDFName.of("Annot"),
      Subtype: PDFName.of("Link"),
      Rect: [PDFNumber.of((rect.x / 1440) * width), PDFNumber.of(height - ((rect.y + rect.height) / sourceHeightPx) * height), PDFNumber.of(((rect.x + rect.width) / 1440) * width), PDFNumber.of(height - (rect.y / sourceHeightPx) * height)],
      Border: [0, 0, 0],
      A: { S: PDFName.of("GoTo"), D: [targetPage.ref, PDFName.of("Fit")] },
    }));
    annots?.push(annotation);
  });
}

function addBackToIndexAnnotations(document: PDFDocument, records: StageRecord[], starts: Map<string, number>, indexPageIndex: number) {
  const indexPage = document.getPage(indexPageIndex);
  let count = 0;
  for (const record of records) {
    const diagnostics = record.diagnostics as {
      viewportWidth?: number;
      finalPageHeight?: number;
      collectionBackLinkRect?: { x: number; y: number; width: number; height: number } | null;
      exactWebPdfPages?: number;
    } | undefined;
    const rect = diagnostics?.collectionBackLinkRect;
    const sourceWidth = diagnostics?.viewportWidth;
    const sourceHeight = diagnostics?.finalPageHeight;
    const pageIndex = starts.get(record.sectionId);
    if (!rect || !sourceWidth || !sourceHeight || pageIndex === undefined || diagnostics?.exactWebPdfPages !== 1) continue;
    const page = document.getPage(pageIndex);
    const { width, height } = page.getSize();
    let annots = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
    if (!annots) {
      annots = document.context.obj([]);
      page.node.set(PDFName.of("Annots"), annots);
    }
    const annotation = document.context.register(document.context.obj({
      Type: PDFName.of("Annot"),
      Subtype: PDFName.of("Link"),
      Rect: [
        PDFNumber.of((rect.x / sourceWidth) * width),
        PDFNumber.of(height - ((rect.y + rect.height) / sourceHeight) * height),
        PDFNumber.of(((rect.x + rect.width) / sourceWidth) * width),
        PDFNumber.of(height - (rect.y / sourceHeight) * height),
      ],
      Border: [0, 0, 0],
      A: { S: PDFName.of("GoTo"), D: [indexPage.ref, PDFName.of("Fit")] },
    }));
    annots.push(annotation);
    count += 1;
  }
  return count;
}

function addOutlines(document: PDFDocument, entries: Array<{ label: string; pageIndex: number }>) {
  if (!entries.length) return;
  const context = document.context;
  const parentRef = context.nextRef();
  const itemRefs = entries.map(() => context.nextRef());
  entries.forEach((entry, index) => {
    const dictionary: Record<string, any> = {
      Title: PDFHexString.fromText(entry.label), Parent: parentRef, Dest: [document.getPage(entry.pageIndex).ref, PDFName.of("Fit")],
    };
    if (index > 0) dictionary.Prev = itemRefs[index - 1];
    if (index < entries.length - 1) dictionary.Next = itemRefs[index + 1];
    context.assign(itemRefs[index], context.obj(dictionary));
  });
  context.assign(parentRef, context.obj({ Type: PDFName.of("Outlines"), First: itemRefs[0], Last: itemRefs[itemRefs.length - 1], Count: PDFNumber.of(entries.length) }));
  document.catalog.set(PDFName.of("Outlines"), parentRef);
  document.catalog.set(PDFName.of("PageMode"), PDFName.of("UseOutlines"));
}

async function mergeCollection(records: StageRecord[], filename: string, outputRoot: string) {
  const merged = await PDFDocument.create();
  const starts = new Map<string, number>();
  const outlineEntries: Array<{ label: string; pageIndex: number }> = [];
  let coverPageIndex = -1;
  let navRects: NavigationRect[] = [];
  let navRectsSourceHeightPx = 900;
  const sources = await Promise.all(records.map((record) => PDFDocument.load(record.bytes)));
  const finalPageWidth = Math.max(...sources.flatMap((source) => source.getPages().map((page) => page.getWidth())));
  for (const [recordIndex, record] of records.entries()) {
    const source = sources[recordIndex];
    const start = merged.getPageCount();
    starts.set(record.sectionId, start);
    outlineEntries.push({ label: record.label, pageIndex: start });
    const pages = await merged.copyPages(source, source.getPageIndices());
    pages.forEach((page) => {
      const { width, height } = page.getSize();
      if (Math.abs(width - finalPageWidth) > 0.01) {
        const scale = finalPageWidth / width;
        page.scaleContent(scale, scale);
        page.setSize(finalPageWidth, height * scale);
      }
      merged.addPage(page);
    });
    // navRects always belong to the LAST page of whichever section produced
    // them — for the cover section that's the index page (page 2 of its
    // 2-page cover+index sub-document), not the cover page itself.
    if (record.navRects.length) {
      coverPageIndex = start + pages.length - 1;
      navRects = record.navRects;
      navRectsSourceHeightPx = record.navRectsSourceHeightPx ?? 900;
    }
  }
  if (coverPageIndex >= 0) addLinkAnnotations(merged, coverPageIndex, navRects, starts, navRectsSourceHeightPx);
  const backLinkCount = coverPageIndex >= 0 ? addBackToIndexAnnotations(merged, records, starts, coverPageIndex) : 0;
  addOutlines(merged, outlineEntries);
  merged.setTitle(filename.replace(/\.pdf$/i, ""));
  merged.setProducer("Dilida Portfolio Collection Builder");
  const canonicalBytes = await merged.save({ useObjectStreams: false });
  // Narrow final pass: Chromium's page.pdf() always writes raster images as
  // raw, unfiltered FlateDecode samples, never a real photo codec. This
  // re-filters every alpha-having image losslessly (real PNG-style
  // predictor, verified byte-for-byte before use) and, for every
  // non-alpha image, additionally computes a fixed-quality JPEG and keeps
  // whichever is genuinely smaller — a rule reverse-engineered from a real
  // Smallpdf-compressed reference of this portfolio, not a guessed
  // photo/UI classifier. Also removes exact-duplicate image objects. It
  // never resizes, never rasterizes pages, and never touches page content
  // streams — see scripts/pdfStreamEncodingOptimizer.ts and the "Fix
  // upstream root causes" rule in CLAUDE.md for why this stage exists at all.
  const { bytes, report: streamOptimizationReport } = await optimizeCollectionPdfStreams(canonicalBytes);
  const directory = path.join(outputRoot, "output", "pdf", "collection");
  await fs.mkdir(directory, { recursive: true });
  const outputPath = path.join(directory, filename);
  await fs.writeFile(outputPath, bytes);
  const diagnostics = records.flatMap((record) => record.diagnostics ? [{ sectionId: record.sectionId, label: record.label, ...record.diagnostics }] : []);
  const diagnosticPath = path.join(directory, filename.replace(/\.pdf$/i, "-diagnostics.json"));
  await fs.writeFile(diagnosticPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), totalBytes: bytes.byteLength, canonicalBytes: canonicalBytes.byteLength, streamOptimizationReport, pages: merged.getPageCount(), projects: diagnostics }, null, 2)}\n`, "utf8");
  return { bytes, outputPath, diagnosticPath, starts: Object.fromEntries(starts), pages: merged.getPageCount(), outlineCount: outlineEntries.length, linkCount: navRects.filter((rect) => starts.has(rect.sectionId)).length + backLinkCount, totalBytes: bytes.byteLength };
}

// --- Dynamic-project staging: makes this server's own headless Chromium
// (a separate browser profile with no access to the owner's real
// localStorage/IndexedDB) able to capture a dynamic project by writing that
// project's real catalog entry, draft, and referenced images to a temporary
// job directory on disk (never back into the owner's browser storage or any
// source-controlled file), and serving them back to the capture page over
// localhost. See src/lib/collectionExportStaging.ts for the client side. ---

function isSafeJobId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9-]{8,64}$/i.test(value);
}

function jobDirectory(root: string, jobId: string) {
  return path.join(root, "output", "tmp", "portfolio-collection", jobId);
}

function jobProjectDirectory(root: string, jobId: string, projectId: string) {
  return path.join(jobDirectory(root, jobId), "projects", projectId);
}

const dataUrlPattern = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([a-z0-9+/=]+)$/i;

function decodeDataUrl(value: string): { bytes: Buffer; mimeType: string } | null {
  const match = dataUrlPattern.exec(value.trim());
  if (!match) return null;
  try {
    return { mimeType: match[1], bytes: Buffer.from(match[2], "base64") };
  } catch {
    return null;
  }
}

type StagedImagePayload = { imageId: string; dataUrl: string };
type StagedProjectPayload = {
  projectId: string;
  publicMetaEntry: Record<string, unknown> | null;
  dynamicDraft: Record<string, unknown> | null;
  document: Record<string, unknown> | null;
  images: StagedImagePayload[];
};

function validatePublicMetaEntry(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid staged project metadata.");
  const record = value as Record<string, unknown>;
  if (typeof record.slug !== "string" || !record.slug) throw new Error("Staged project metadata is missing its slug.");
  if (typeof record.route !== "string" || !record.route) throw new Error("Staged project metadata is missing its route.");
  if (typeof record.titleZh !== "string" || !record.titleZh) throw new Error("Staged project metadata is missing its title.");
  if (typeof record.summaryZh !== "string") throw new Error("Staged project metadata is missing its summary.");
  return record;
}

function validateDynamicDraft(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid staged project draft.");
  const record = value as Record<string, unknown>;
  if (record.version !== 1 || !Array.isArray(record.templateInstances)) throw new Error("Invalid staged project draft shape.");
  return record;
}

// Loosely validated on purpose: this server only needs to know it's a real
// ProjectDocument-shaped object to store and serve it back — the full
// ProjectDocument type (and its own stricter validateProjectDocument) lives
// client-side in src/lib/projectDocuments.ts, which already validated this
// object before staging it.
function validateStagedDocument(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid staged project document.");
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 1 || !Array.isArray(record.sections)) throw new Error("Invalid staged project document shape.");
  return record;
}

function validateStagedProject(value: unknown): StagedProjectPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid staged project entry.");
  const record = value as Record<string, unknown>;
  if (!safeId(record.projectId)) throw new Error("Invalid staged project id.");
  const publicMetaEntry = validatePublicMetaEntry(record.publicMetaEntry);
  const dynamicDraft = validateDynamicDraft(record.dynamicDraft);
  const document = validateStagedDocument(record.document);
  // A project flagged dynamic in its own metadata must bring real content —
  // either a TemplateInstance draft or a ProjectDocument (see
  // collectionExportStaging.ts: a dynamic project's body is exactly one of
  // these two systems, never both) — never let an unreadable/missing
  // owner-browser draft silently pass through as "no content" (the fix
  // this whole staging system exists for).
  if (publicMetaEntry?.isDynamic && !dynamicDraft && !document) {
    throw new Error(`"${record.projectId}" is a dynamic project but no draft or document was staged for it — the owner browser could not read its own content.`);
  }
  const images = Array.isArray(record.images)
    ? record.images.flatMap((entry): StagedImagePayload[] => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
        const imageId = (entry as Record<string, unknown>).imageId;
        const dataUrl = (entry as Record<string, unknown>).dataUrl;
        return typeof imageId === "string" && imageId && typeof dataUrl === "string" ? [{ imageId, dataUrl }] : [];
      })
    : [];
  return { projectId: record.projectId, publicMetaEntry, dynamicDraft, document, images };
}

async function createCollectionJob(jobId: string, projects: unknown, outputRoot: string) {
  if (!Array.isArray(projects)) throw new Error("Invalid collection job payload.");
  const validated = projects.map(validateStagedProject);
  const directory = jobDirectory(outputRoot, jobId);
  await fs.mkdir(directory, { recursive: true });
  for (const project of validated) {
    const projectDir = jobProjectDirectory(outputRoot, jobId, project.projectId);
    await fs.mkdir(path.join(projectDir, "assets"), { recursive: true });
    await fs.writeFile(path.join(projectDir, "metadata.json"), JSON.stringify(project.publicMetaEntry), "utf8");
    await fs.writeFile(path.join(projectDir, "draft.json"), JSON.stringify(project.dynamicDraft), "utf8");
    await fs.writeFile(path.join(projectDir, "document.json"), JSON.stringify(project.document), "utf8");
    const manifest: Record<string, { mimeType: string }> = {};
    for (const image of project.images) {
      if (!safeId(image.imageId)) continue;
      const decoded = decodeDataUrl(image.dataUrl);
      if (!decoded) continue;
      await fs.writeFile(path.join(projectDir, "assets", image.imageId), decoded.bytes);
      manifest[image.imageId] = { mimeType: decoded.mimeType };
    }
    await fs.writeFile(path.join(projectDir, "assets-manifest.json"), JSON.stringify(manifest), "utf8");
  }
  await fs.writeFile(
    path.join(directory, "job.json"),
    JSON.stringify({ jobId, createdAt: new Date().toISOString(), projectIds: validated.map((project) => project.projectId) }),
    "utf8",
  );
  return { jobId, projects: validated.map((project) => project.projectId) };
}

async function deleteCollectionJobDirectory(outputRoot: string, jobId: string) {
  try {
    await fs.rm(jobDirectory(outputRoot, jobId), { recursive: true, force: true });
    return { ok: true as const };
  } catch (error) {
    console.warn(`[collection export] Unable to clean up job "${jobId}":`, error instanceof Error ? error.message : error);
    return { ok: false as const, warning: error instanceof Error ? error.message : String(error) };
  }
}

export function portfolioCollectionExportPlugin(): Plugin {
  const stages = new Map<string, StageRecord>();
  const snapshots = new Map<string, string>();
  return {
    name: "local-portfolio-collection-export",
    apply: "serve",
    configureServer(server) {
      server.httpServer?.once("close", () => { void closeCollectionBrowser(); });
      server.middlewares.use(snapshotEndpoint, (req, res, next) => {
        const token = new URL(req.url ?? "/", "http://localhost").pathname.split("/").filter(Boolean).at(-1);
        const html = token ? snapshots.get(token) : undefined;
        if (!html) return next();
        res.statusCode = 200; res.setHeader("Content-Type", "text/html; charset=utf-8"); res.setHeader("Cache-Control", "no-store"); res.end(html);
      });
      server.middlewares.use(stageEndpoint, async (req, res, next) => {
        if (req.method !== "POST") return next();
        if (!localRequest(req)) return json(res, 403, { error: "Local collection export only." });
        const aborted = { value: false };
        // res (not req) "close" firing while the response is still
        // unfinished (writableEnded === false) is the real signal that the
        // client disconnected before we responded — req's own "close" fires
        // as soon as its readable side is drained, which happens on every
        // normal request and would otherwise mark every capture "cancelled"
        // immediately after its (tiny) JSON body is read.
        res.on("close", () => { if (!res.writableEnded) aborted.value = true; });
        try {
          const value = await body(req) as Record<string, unknown>;
          if (!safeId(value.sectionId) || typeof value.label !== "string") throw new Error("Invalid collection section metadata.");
          let bytes: Uint8Array; let navRects: NavigationRect[] = []; let navRectsSourceHeightPx: number | undefined; let diagnostics: Record<string, unknown> | undefined;
          if (value.kind === "project") {
            const url = value.url; const projectId = value.projectId; const slug = value.slug; const locale = value.locale;
            if (typeof url !== "string" || !safeId(projectId)) throw new Error("Invalid project capture request.");
            if (!safeId(slug)) throw new Error("Invalid project slug for capture request.");
            if (locale !== "zh" && locale !== "en") throw new Error("Invalid locale for capture request.");
            if (typeof value.endingLabel !== "string" || !value.endingLabel.trim()) throw new Error("Missing project ending label.");
            if (typeof value.closingSentence !== "string" || !value.closingSentence.trim()) throw new Error("Missing project closing sentence.");
            if (typeof value.backToIndexLabel !== "string" || !value.backToIndexLabel.trim()) throw new Error("Missing project back-to-index label.");
            if (!Number.isInteger(value.projectNumber) || (value.projectNumber as number) < 1) throw new Error("Invalid project page number.");
            if (!Number.isInteger(value.projectCount) || (value.projectCount as number) < (value.projectNumber as number)) throw new Error("Invalid project page count.");
            // The browser that initiated this export sends its own current
            // window.innerWidth (src/lib/portfolioCollectionExport.ts) so
            // the capture reproduces the same responsive layout state it's
            // actually showing, rather than a hardcoded width. Falls back
            // only if that's somehow missing.
            const requestedWidth = value.captureWidthPx;
            const captureWidthPx = Number.isInteger(requestedWidth) && (requestedWidth as number) >= minimumProjectCaptureViewportWidth && (requestedWidth as number) <= maximumProjectCaptureViewportWidth
              ? (requestedWidth as number)
              : fallbackProjectCaptureViewportWidth;
            const started = Date.now();
            const result = await captureProjectPage(url, projectId, slug, locale, aborted, server.config.root, captureWidthPx, {
              label: value.endingLabel.slice(0, 80),
              sentence: value.closingSentence.slice(0, 500),
              backToIndexLabel: value.backToIndexLabel.slice(0, 80),
              projectNumber: value.projectNumber as number,
              projectCount: value.projectCount as number,
            });
            bytes = result.bytes;
            diagnostics = { ...result.diagnostics, captureMs: Date.now() - started, pdfHeight: result.pdfHeight, result: "passed" };
            console.info("[Collection export] captured project", projectId, diagnostics);
          } else if (value.kind === "cover") {
            const entries = value.entries;
            if (!Array.isArray(entries) || !entries.every(isSafeTocEntry) || typeof value.brandLine !== "string" || typeof value.footerLabel !== "string") {
              throw new Error("Invalid cover capture request.");
            }
            const requestedWidth = value.captureWidthPx;
            const targetWidthPx = Number.isInteger(requestedWidth) && (requestedWidth as number) >= minimumProjectCaptureViewportWidth && (requestedWidth as number) <= maximumProjectCaptureViewportWidth
              ? (requestedWidth as number)
              : fallbackProjectCaptureViewportWidth;
            const result = await captureCoverPage(entries, value.brandLine, value.footerLabel, server.config.root, targetWidthPx);
            bytes = result.bytes; navRects = result.navRects; navRectsSourceHeightPx = result.navRectsSourceHeightPx;
            diagnostics = result.diagnostics;
            console.info("[Collection export] captured cover", diagnostics);
          } else if (value.kind === "section" && typeof value.html === "string") {
            const rendered = await renderSectionPdf(value.html, snapshots); bytes = rendered.bytes; navRects = rendered.navRects;
          } else throw new Error("Unknown collection stage type.");
          if (aborted.value) throw new Error("Collection export was cancelled.");
          const token = crypto.randomUUID();
          stages.set(token, { bytes, sectionId: value.sectionId, label: value.label.slice(0, 160), navRects, navRectsSourceHeightPx, diagnostics, createdAt: Date.now() });
          json(res, 200, { token, pageCount: (await PDFDocument.load(bytes)).getPageCount() });
        } catch (error) { console.error("[collection export] stage failed", error); json(res, 500, { error: error instanceof Error ? error.message : "Unable to stage collection section." }); }
      });
      server.middlewares.use(createJobEndpoint, async (req, res, next) => {
        if (req.method !== "POST") return next();
        if (!localRequest(req)) return json(res, 403, { error: "Local collection export only." });
        try {
          const value = await bodyWithLimit(req, maximumJobBytes) as { jobId?: unknown; projects?: unknown };
          if (!isSafeJobId(value.jobId)) throw new Error("Invalid collection job id.");
          const result = await createCollectionJob(value.jobId, value.projects, server.config.root);
          json(res, 200, result);
        } catch (error) { json(res, 500, { error: error instanceof Error ? error.message : "Unable to stage the collection export job." }); }
      });
      server.middlewares.use(jobEndpointPrefix, async (req, res, next) => {
        const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
        const segments = pathname.replace(new RegExp(`^${jobEndpointPrefix}/?`), "").split("/").filter(Boolean);
        const [jobId, kind, ...rest] = segments;
        if (!isSafeJobId(jobId)) return next();
        if (req.method === "DELETE" && !kind) {
          if (!localRequest(req)) return json(res, 403, { error: "Local collection export only." });
          const result = await deleteCollectionJobDirectory(server.config.root, jobId);
          return json(res, 200, result);
        }
        if (req.method === "GET" && kind === "project" && safeId(rest[0])) {
          if (!localGetRequest(req)) return json(res, 403, { error: "Local collection export only." });
          const projectDir = jobProjectDirectory(server.config.root, jobId, rest[0]);
          const metadata = await fs.readFile(path.join(projectDir, "metadata.json"), "utf8").then((raw) => JSON.parse(raw)).catch(() => null);
          const draft = await fs.readFile(path.join(projectDir, "draft.json"), "utf8").then((raw) => JSON.parse(raw)).catch(() => null);
          const document = await fs.readFile(path.join(projectDir, "document.json"), "utf8").then((raw) => JSON.parse(raw)).catch(() => null);
          return json(res, 200, { projectId: rest[0], metadata, draft, document });
        }
        if (req.method === "GET" && kind === "assets" && safeId(rest[0])) {
          if (!localGetRequest(req)) return json(res, 403, { error: "Local collection export only." });
          // Assets are staged per project but this URL only carries the
          // asset id — search this job's project directories for it (a job
          // covers a handful of projects at most, so this stays cheap).
          const projectsRoot = path.join(jobDirectory(server.config.root, jobId), "projects");
          const projectIds = await fs.readdir(projectsRoot).catch(() => [] as string[]);
          for (const projectId of projectIds) {
            const projectDir = path.join(projectsRoot, projectId);
            const manifest = await fs.readFile(path.join(projectDir, "assets-manifest.json"), "utf8").then((raw) => JSON.parse(raw)).catch(() => null) as Record<string, { mimeType: string }> | null;
            const entry = manifest?.[rest[0]];
            if (!entry) continue;
            const bytes = await fs.readFile(path.join(projectDir, "assets", rest[0])).catch(() => null);
            if (!bytes) continue;
            res.statusCode = 200;
            res.setHeader("Content-Type", entry.mimeType);
            res.setHeader("Cache-Control", "no-store");
            res.end(bytes);
            return undefined;
          }
          return json(res, 404, { error: "Staged asset not found." });
        }
        return next();
      });
      server.middlewares.use(reportErrorEndpoint, async (req, res, next) => {
        if (req.method !== "POST") return next();
        if (!localRequest(req)) return json(res, 403, { error: "Local collection export only." });
        try {
          const value = await body(req);
          const directory = path.join(server.config.root, "output", "pdf", "collection");
          await fs.mkdir(directory, { recursive: true });
          await fs.writeFile(path.join(directory, "last-export-error.json"), `${JSON.stringify({ reportedAt: new Date().toISOString(), ...(value as object) }, null, 2)}\n`, "utf8");
          json(res, 200, { ok: true });
        } catch (error) { json(res, 500, { error: error instanceof Error ? error.message : "Unable to write the export error report." }); }
      });
      server.middlewares.use(finalizeEndpoint, async (req, res, next) => {
        if (req.method !== "POST") return next();
        if (!localRequest(req)) return json(res, 403, { error: "Local collection export only." });
        try {
          const value = await body(req) as { filename?: unknown; tokens?: unknown };
          const filename = typeof value.filename === "string" ? value.filename : "portfolio-collection.pdf";
          if (!/^[^<>:"/\\|?*\u0000-\u001f]+\.pdf$/i.test(filename) || !Array.isArray(value.tokens)) throw new Error("Invalid collection finalization request.");
          const records = value.tokens.map((token) => typeof token === "string" ? stages.get(token) : undefined);
          if (records.some((record) => !record)) throw new Error("A staged collection section is missing or expired.");
          const result = await mergeCollection(records as StageRecord[], filename, server.config.root);
          value.tokens.forEach((token) => { if (typeof token === "string") stages.delete(token); });
          res.statusCode = 200; res.setHeader("Content-Type", "application/pdf"); res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
          res.setHeader("X-Collection-Pages", String(result.pages)); res.setHeader("X-Collection-Links", String(result.linkCount)); res.setHeader("X-Collection-Outlines", String(result.outlineCount)); res.setHeader("X-Collection-Output", encodeURIComponent(result.outputPath)); res.setHeader("X-Collection-Bytes", String(result.totalBytes));
          res.end(Buffer.from(result.bytes));
        } catch (error) { json(res, 500, { error: error instanceof Error ? error.message : "Unable to finalize collection PDF." }); }
      });

      // Both endpoints only ever act on files already sitting inside this
      // project's own output/pdf/collection directory (the exact directory
      // mergeCollection() just wrote to) — never an arbitrary client-supplied
      // path — and, like every other endpoint in this plugin, only answer
      // requests that already passed the localhost:5173-only localRequest()
      // check.
      server.middlewares.use(openFileEndpoint, async (req, res, next) => {
        if (req.method !== "POST") return next();
        if (!localRequest(req)) return json(res, 403, { error: "Local collection export only." });
        try {
          const value = await body(req) as { path?: unknown };
          if (typeof value.path !== "string" || !value.path) throw new Error("Missing file path.");
          if (!isWithinCollectionOutput(server.config.root, value.path)) throw new Error("Refusing to open a path outside the collection output directory.");
          await fs.access(value.path);
          await new Promise<void>((resolve, reject) => {
            execFile("cmd.exe", ["/c", "start", "", value.path as string], (error) => (error ? reject(error) : resolve()));
          });
          json(res, 200, { ok: true });
        } catch (error) { json(res, 500, { error: error instanceof Error ? error.message : "Unable to open the file." }); }
      });

      server.middlewares.use(openFolderEndpoint, async (req, res, next) => {
        if (req.method !== "POST") return next();
        if (!localRequest(req)) return json(res, 403, { error: "Local collection export only." });
        try {
          const value = await body(req) as { path?: unknown };
          if (typeof value.path !== "string" || !value.path) throw new Error("Missing file path.");
          if (!isWithinCollectionOutput(server.config.root, value.path)) throw new Error("Refusing to open a path outside the collection output directory.");
          await fs.access(value.path);
          // explorer.exe frequently exits non-zero even when it opens the
          // window successfully (a long-standing Windows quirk) — a launch
          // attempt with a valid, access-checked path is treated as success.
          await new Promise<void>((resolve) => {
            execFile("explorer.exe", [`/select,${value.path}`], () => resolve());
          });
          json(res, 200, { ok: true });
        } catch (error) { json(res, 500, { error: error instanceof Error ? error.message : "Unable to open the folder." }); }
      });
    },
  };
}
