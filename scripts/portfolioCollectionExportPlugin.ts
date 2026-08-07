import type { IncomingMessage, ServerResponse } from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { PDFArray, PDFDocument, PDFHexString, PDFName, PDFNumber, type PDFPage, PDFRawStream, rgb } from "pdf-lib";
import { chromium, type Browser } from "playwright-core";
import sharp from "sharp";
import type { Plugin } from "vite";
import { findChrome } from "./exactWebExportPlugin";
import { renderCollectionCover, computeCoverNavRects, type CoverNavRect } from "./collectionCoverRenderer";
import { COVER_GEOMETRY, type CoverTocEntry } from "../src/lib/collectionCoverGeometry";
import { extractTemplateImageReferences, extractProjectDocumentImageReferences, type MinimalTemplateInstance, type MinimalProjectDocument } from "../src/lib/templateImageReferences";

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

// Project pages are captured by having THIS server drive its own headless
// Chromium directly to the project's real URL and wait for an explicit
// readiness marker (data-project-export-ready="true", set by ProjectPage.tsx
// once images have settled and layout height has stabilized above a trivial
// size) — not by opening a hidden iframe inside the owner's own tab and
// relying on requestAnimationFrame timing inside it, which proved unreliable
// (an invisible, near-zero-opacity iframe can have its animation frames
// throttled indefinitely by the browser, hanging the capture with no
// timeout). Each step below has its own explicit timeout, and a failure
// always names the project and the step it failed at instead of hanging.
const projectCaptureTimeouts = { navigate: 6_000, ready: 20_000, render: 25_000 } as const;
const maximumContinuousProjectHeight = 30_000;
// The reference collection PDF's own page boxes are hybrid, not one fixed
// size: cover/UI-Works/Game-Experience/Contact are a fixed 1440x900, but
// every project page is full-width (1440px) and variable-height, matching
// that project's own natural Exact-Web page height — confirmed directly by
// inspecting the reference file's per-page PDF dimensions. Project pages are
// never scaled down to fit a height budget: the captured screenshot is
// embedded into its own PDF page at true 1:1 scale via pdf-lib (see
// captureProjectPage below), which has no page-height ceiling to work
// around — only maximumContinuousProjectHeight above still applies, as a
// hard error rather than a silent shrink.
const collectionCanvasBackground = "#181743";
// Fixed capture viewport width for every project — also the deterministic
// alignment contract's required content width (see captureProjectPage).
const projectCaptureViewportWidth = 1440;
// pdf-lib pages are sized in points (72pt = 1in); captures are measured in
// CSS px at the 96dpi the capture viewport renders at.
const cssPxToPdfPt = 72 / 96;

function hexToPdfColor(hex: string) {
  const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) throw new Error(`Invalid hex color "${hex}".`);
  const [, r, g, b] = match;
  return rgb(parseInt(r, 16) / 255, parseInt(g, 16) / 255, parseInt(b, 16) / 255);
}

// Project pages are no longer rasterized: see captureProjectPage below for
// the vector page.pdf() + embedPage pipeline. The glow now lives as a real
// CSS background behind the project content (src/styles.css, gated by
// [data-collection-export-capture]), captured as part of that same vector
// print pass via printBackground: true — never drawn as PDF-compositor
// shapes on top of a screenshot, which used to visibly tint text/images
// sitting on top of it.
// Maximum height, in CSS px, of a single page.pdf() segment — comfortably
// inside Chromium's reliably-supported custom page height (well-tested up
// to roughly 200in/19200px; this stays well under that with margin).
//
// EMERGENCY FIX (2026-08-07, real repro: project-1ua2677 "4 segments for 3
// planned", then interaction-intelligence-system "5 for 4"): the original
// 3000px value assumed break-inside: avoid on top-level modules would keep
// Chromium's auto-pagination exactly matching Math.ceil(captureHeight /
// maxSegmentHeightPx). Tested against real generated PDFs with (a) no
// break-inside rule at all, and (b) break-inside: avoid restored on every
// [data-template-instance-id]/[data-document-section] module — both
// produced the identical extra-segment mismatch. break-inside CSS is not
// the actual lever; the true cause (page.pdf()'s print layout pass
// reflowing slightly differently than the on-screen measurement that
// produced captureHeight) is not yet root-caused. Raising this value so
// most real projects need only a single segment (segmentCount === 1, no
// internal auto-pagination at all — the entire bug class requires at least
// 2 requested segments) sidesteps the mismatch for typical content today.
// Projects tall enough to still need multiple segments remain exposed to
// the underlying bug — see TASKS.md; this is not the root-cause fix.
const maxSegmentHeightPx = 16000;

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

type ImageOptimizationStat = {
  url: string;
  originalBytes: number;
  optimizedBytes: number;
  originalDimensions: string;
  renderedDimensions: string;
  encoding: string;
  hasAlpha: boolean;
};

// Now that project pages capture as real vector PDF (page.pdf()), any <img>
// asset is embedded by Chromium at its DECODED intrinsic pixel size,
// regardless of how small it's actually displayed via CSS — the old
// whole-page JPEG screenshot pipeline coincidentally hid this (the entire
// page was already re-rasterized and compressed at CSS/viewport
// resolution), but the vector pipeline does not. A single oversized source
// photo can now balloon the PDF by tens of megabytes on its own (confirmed:
// one project's images alone added 51MB before this existed). Intercepting
// each image response and, only when its real pixel dimensions
// substantially exceed a generous on-page ceiling, re-encoding a downscaled
// copy IN MEMORY for this one response — never written to disk, never
// touching the real staged copy or the user's real source file/blob — is
// the fix. Applies uniformly to staged (temporary job) assets and
// already-published (/portfolio-assets/...) assets alike, since both are
// fetched over HTTP by this same page and neither's real file is ever
// modified.
const imageOptimizationMaxDimensionPx = 1440;
const imageOptimizationQuality = 82;
// Below this, an image's own bytes are already a trivial contribution to
// the final PDF (icons, small UI chrome) — skip the decode/re-encode round
// trip entirely rather than spend time on it for no real size benefit.
const imageOptimizationMinSourceBytes = 100 * 1024;

async function installImageOptimizationRoute(page: import("playwright-core").Page, projectId: string, stats: ImageOptimizationStat[]) {
  await page.route(/\.(png|jpe?g|webp)(\?.*)?$/i, async (route) => {
    const request = route.request();
    try {
      const response = await route.fetch();
      const contentType = response.headers()["content-type"] ?? "";
      if (!/^image\/(png|jpe?g|webp)/i.test(contentType)) {
        await route.fulfill({ response });
        return;
      }
      const original = await response.body();
      if (original.byteLength < imageOptimizationMinSourceBytes) {
        await route.fulfill({ response, body: original });
        return;
      }
      const image = sharp(original);
      const metadata = await image.metadata();
      const width = metadata.width ?? 0;
      const height = metadata.height ?? 0;
      // Re-encode to JPEG unconditionally past the size floor above, not
      // only when the pixel dimensions exceed a ceiling: Chromium's
      // page.pdf() print pipeline re-encodes WebP/PNG source images for PDF
      // embedding, and that internal re-encode is not guaranteed to be as
      // size-efficient as the original web-optimized file — confirmed by a
      // real run where 21 already reasonably-sized (under 2400px) webp
      // images alone still produced a 51MB PDF. Forcing a known, controlled
      // mozjpeg encoding here (still resized down if it's also oversized in
      // pixels) is what actually keeps the final embedded size predictable.
      const hasAlpha = metadata.hasAlpha === true;
      const needsResize = width > imageOptimizationMaxDimensionPx || height > imageOptimizationMaxDimensionPx;
      const pipeline = needsResize
        ? image.resize({ width: imageOptimizationMaxDimensionPx, height: imageOptimizationMaxDimensionPx, fit: "inside", withoutEnlargement: true })
        : image;
      const resized = hasAlpha
        ? await pipeline.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer()
        : await pipeline.jpeg({ quality: imageOptimizationQuality, mozjpeg: true, chromaSubsampling: "4:4:4" }).toBuffer();
      const resizedMetadata = await sharp(resized).metadata();
      stats.push({
        url: request.url(),
        originalBytes: original.byteLength,
        optimizedBytes: resized.byteLength,
        originalDimensions: `${width}x${height}`,
        renderedDimensions: `${resizedMetadata.width ?? "?"}x${resizedMetadata.height ?? "?"}`,
        encoding: hasAlpha ? "png-alpha" : "mozjpeg",
        hasAlpha,
      });
      console.info(`[collection export] optimized image for "${projectId}"`, {
        url: request.url(), originalBytes: original.byteLength, optimizedBytes: resized.byteLength,
      });
      await route.fulfill({ response, contentType: "image/jpeg", body: resized });
    } catch (error) {
      // Any failure here (decode error, unsupported format, network hiccup
      // on route.fetch()) falls back to letting the real request through
      // unmodified — an optimization failure must never turn into a
      // missing-image failure.
      console.warn(`[collection export] image optimization skipped for "${projectId}"`, request.url(), error instanceof Error ? error.message : error);
      await route.continue().catch(() => undefined);
    }
  });
}

// Used only by the emergencyPdfExport override, to decide whether a
// trailing segment beyond the planned count is safe to drop. A page whose
// content stream(s) total well under what a plain background-fill (the one
// operator sequence every segment always emits via printBackground) would
// need real drawn content — text, images, vector shapes — to exceed. Errs
// toward "has content" (keeps it) whenever unsure; only an unambiguously
// tiny stream is trimmed, matching "trim only a completely blank trailing
// segment."
function isBlankSegmentPage(page: PDFPage): boolean {
  try {
    const contents = page.node.Contents();
    const streams = contents instanceof PDFArray
      ? Array.from({ length: contents.size() }, (_, index) => contents.lookup(index)).filter((item): item is PDFRawStream => item instanceof PDFRawStream)
      : contents instanceof PDFRawStream ? [contents] : [];
    const totalBytes = streams.reduce((sum, stream) => sum + stream.contents.length, 0);
    return totalBytes < 600;
  } catch {
    return false;
  }
}

async function captureProjectPage(url: string, projectId: string, aborted: { value: boolean }, outputRoot: string, emergencyPdfExport = false) {
  if (!isLocalCollectionUrl(url)) throw new Error(`Refusing to capture a non-local project URL for "${projectId}".`);
  const browser = await getCollectionBrowser();
  const page = await browser.newPage({ viewport: { width: projectCaptureViewportWidth, height: 900 }, deviceScaleFactor: 1 });
  const imageOptimizationStats: ImageOptimizationStat[] = [];
  try {
    await installImageOptimizationRoute(page, projectId, imageOptimizationStats);
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
          if (state === "filled" || state === "failed") counts[state] += 1;
          if (state === "failed") failedSlotIds.push(node.getAttribute("data-media-slot-id") ?? "unknown");
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
          visibleEmptyPlaceholders,
          remainingBlankMediaFrames,
          emptySlotsFound: structural?.emptySlotsFound.size ?? 0,
          emptySlotsCollapsed: structural?.emptySlotsCollapsed.size ?? 0,
          modulesOmitted: structural?.modulesOmitted.size ?? 0,
          textOnlyCards: structural?.textOnlyCards.size ?? 0,
        };
      });
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
          `"${projectId}" has ${mediaSlotAudit.failed} referenced image(s) that failed to load (slot ids: ${mediaSlotAudit.failedSlotIds.join(", ")}). Refusing to ship a project page with a missing real image.`,
        );
      }
      // Trim the DOM to just the project's own subtree (drops fixed docks,
      // the ambient background, router chrome — none of it visible, but
      // page.pdf() on the untrimmed page silently doubled the page count;
      // confirmed by isolated testing) before capturing a full-resolution
      // screenshot of exactly the project content.
      await page.evaluate(() => {
        const root = document.querySelector<HTMLElement>("[data-project-route-shell]");
        if (!root) return;
        document.body.replaceChildren(root);
        document.body.style.margin = "0";
      });
      const trimmed = await page.evaluate(() => {
        const root = document.querySelector<HTMLElement>("[data-project-route-shell]");
        const rect = root?.getBoundingClientRect();
        return { width: Math.round(rect?.width ?? 0), height: Math.round(rect?.height ?? 0), scrollWidth: document.documentElement.scrollWidth };
      });
      const captureWidth = trimmed.width || diagnostics.exportRootWidth;
      const captureHeight = trimmed.height || diagnostics.exportRootHeight;
      const trailingBlankHeight = Math.max(0, captureHeight - layoutAudit.measuredContentBottom);
      const maximumExpectedTrailingBlank = layoutAudit.intendedBottomPadding + 32;
      if (trailingBlankHeight > maximumExpectedTrailingBlank) {
        throw new Error(
          `"${projectId}" has ${trailingBlankHeight}px of trailing blank space after ${layoutAudit.finalVisibleTemplateInstanceId ?? "the final visible module"}; expected at most ${maximumExpectedTrailingBlank}px including bottom padding.`,
        );
      }

      // Deterministic alignment contract: every project is captured at a
      // fixed 1440px viewport width, so its content width must always come
      // out to exactly 1440px. Anything else means real horizontal overflow
      // (content wider than the viewport) — fail loudly here instead of
      // silently embedding a misaligned page; page.screenshot({fullPage})
      // follows document.documentElement.scrollWidth, so that's the
      // authoritative overflow signal, not just the trimmed root's own rect.
      const overflowRight = Math.max(0, trimmed.scrollWidth - projectCaptureViewportWidth);
      if (captureWidth !== projectCaptureViewportWidth || overflowRight > 0) {
        throw new Error(
          `"${projectId}" content width is ${captureWidth}px (scrollWidth ${trimmed.scrollWidth}px), not the required ${projectCaptureViewportWidth}px — overflowRight=${overflowRight}px. Refusing to embed a misaligned project page.`,
        );
      }

      // Vector-preserving capture: Chromium's own page.pdf() print pipeline
      // (not a screenshot) keeps body text as real, selectable/searchable
      // PDF text and vector shapes as real vector paths — only actual
      // <img> assets rasterize, which is correct (they already are raster
      // images). page.pdf() auto-paginates when content is taller than the
      // requested page height, and break-inside: avoid on every top-level
      // module (styles.css, [data-collection-export-capture] only) tells
      // it to prefer breaking between modules rather than through one — a
      // single module taller than a whole segment is the only case that
      // still gets split, exactly as a page break inside overflowing
      // content would be. printBackground: true captures the export-only
      // glow (a real CSS background, not PDF-compositor shapes drawn after
      // the fact) as part of this same pass. preferCSSPageSize: false is
      // required — see the note on the "section" pages' page.pdf() call
      // above for why (the site's own @media print { @page } rule would
      // otherwise win).
      const segmentCount = Math.max(1, Math.ceil(captureHeight / maxSegmentHeightPx));
      const segmentHeightPx = Math.ceil(captureHeight / segmentCount);
      const vectorPdfBytes = await page.pdf({
        width: `${projectCaptureViewportWidth}px`,
        height: `${segmentHeightPx}px`,
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
        printBackground: true,
        preferCSSPageSize: false,
      });

      // Merge every auto-paginated segment from that one vector PDF into a
      // single tall project page, stacked top-to-bottom at each segment's
      // own real height — PDFDocument.embedPage() embeds each source page
      // as a Form XObject (its text/vector content stream referenced, not
      // rasterized), so text stays selectable in the merged page too. This
      // is why the final project "page" in the collection is still exactly
      // one PDF page per project, matching the pre-existing contract, even
      // though Chromium generated several segments to get here.
      const segmentSourceDocument = await PDFDocument.load(vectorPdfBytes);
      let segmentSourcePages = segmentSourceDocument.getPages();
      const segmentCountMismatch = segmentSourcePages.length !== segmentCount;
      if (segmentCountMismatch && !emergencyPdfExport) {
        throw new Error(
          `"${projectId}" generated ${segmentSourcePages.length} PDF segments for ${segmentCount} planned slices. A pagination rule introduced blank segment space.`,
        );
      }
      if (segmentCountMismatch) {
        // Explicit, opt-in-only override — driven by real React state from
        // the /export editor's "Emergency export" checkbox
        // (PortfolioPdfBuilderPage.tsx → runPortfolioCollectionExport →
        // stageSection's emergencyPdfExport field), never a URL query param.
        // Every other export-blocking check above (missing draft, missing
        // images, clipped/overflowing content, empty template wrappers) has
        // already run and would still throw normally — only this specific
        // segment-count mismatch is downgraded to a warning, and only for
        // this request. Normal exports (checkbox off) keep the strict check
        // unchanged; there is no other way to reach this branch.
        console.warn(
          `[collection export] EMERGENCY OVERRIDE: "${projectId}" generated ${segmentSourcePages.length} PDF segments for ${segmentCount} planned slices; keeping the generated segments instead of failing (emergencyPdfExport=true).`,
        );
        // Trim only a genuinely blank trailing segment (beyond the planned
        // count): its content stream is checked for any real drawing
        // operator beyond the plain background-fill Chromium always emits.
        // Any segment with real content is always kept, in full, uncropped.
        while (segmentSourcePages.length > segmentCount && isBlankSegmentPage(segmentSourcePages[segmentSourcePages.length - 1])) {
          const dropped = segmentSourcePages.length;
          segmentSourcePages = segmentSourcePages.slice(0, -1);
          console.warn(`[collection export] EMERGENCY OVERRIDE: "${projectId}" trimmed a completely blank trailing segment (was segment ${dropped}).`);
        }
      }
      const pageWidthPt = projectCaptureViewportWidth * cssPxToPdfPt;
      const segmentScale = segmentSourcePages[0].getHeight() / segmentHeightPx;

      // Per-segment used height: segments within the originally planned
      // count use the pre-existing remaining-height math unchanged. Any
      // segment beyond that (only possible under the emergency override) is
      // real overflow content Chromium's print layout produced beyond the
      // measured captureHeight — embedded at its own full native height
      // rather than cropped, so no visible content is clipped. This is the
      // one deliberately relaxed rule; every other guard above still applies.
      const usedHeightsPt = segmentSourcePages.map((sourcePage, index) => {
        if (index < segmentCount) {
          const remainingHeightPx = captureHeight - index * segmentHeightPx;
          const usedHeightPx = Math.max(0, Math.min(segmentHeightPx, remainingHeightPx));
          return Math.min(sourcePage.getHeight(), usedHeightPx * segmentScale);
        }
        return sourcePage.getHeight();
      });
      const totalHeightPt = usedHeightsPt.reduce((sum, height) => sum + height, 0);

      const contentWidth = captureWidth;
      const contentHeight = captureHeight;
      const contentX = 0;
      const canvasWidth = contentWidth;
      const canvasHeight = contentHeight;

      const projectDocument = await PDFDocument.create();
      const projectPdfPage = projectDocument.addPage([pageWidthPt, totalHeightPt]);
      // Base fill only guards against any transparent gap at the very
      // bottom of the last segment (Chromium always emits a full
      // segmentHeightPx-tall page even if that segment's real content ends
      // partway through it) — every segment already paints its own real
      // background via printBackground, so this is never visible except in
      // that one trailing sliver.
      projectPdfPage.drawRectangle({
        x: 0, y: 0, width: pageWidthPt, height: totalHeightPt,
        color: hexToPdfColor(collectionCanvasBackground),
      });
      let cursorFromTopPt = 0;
      for (const [index, sourcePage] of segmentSourcePages.entries()) {
        const usedHeightPt = usedHeightsPt[index];
        const embeddedSegment = await projectDocument.embedPage(sourcePage, {
          left: 0,
          bottom: sourcePage.getHeight() - usedHeightPt,
          right: sourcePage.getWidth(),
          top: sourcePage.getHeight(),
        });
        const segmentHeightPt = embeddedSegment.height;
        const y = totalHeightPt - cursorFromTopPt - segmentHeightPt;
        projectPdfPage.drawPage(embeddedSegment, { x: 0, y, width: embeddedSegment.width, height: segmentHeightPt });
        cursorFromTopPt += segmentHeightPt;
      }
      const bytes = await projectDocument.save();

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
        bytes,
        diagnostics: {
          ...diagnostics, scalePercent: 100, contentWidth, contentHeight, contentX, canvasWidth, canvasHeight,
          overflowLeft: 0, overflowRight,
          segments: segmentSourcePages.length, segmentHeightPx, vectorPdfBytes: vectorPdfBytes.byteLength,
          plannedSegments: segmentCount, segmentCountMismatch, emergencyPdfExportApplied: segmentCountMismatch && emergencyPdfExport,
          measuredContentBottom: layoutAudit.measuredContentBottom,
          finalPageHeight: captureHeight,
          trailingBlankHeight,
          intendedBottomPadding: layoutAudit.intendedBottomPadding,
          finalVisibleTemplateInstanceId: layoutAudit.finalVisibleTemplateInstanceId,
          mediaAudit,
          templateFit: templateFitAudit,
          imageOptimization: imageOptimizationStats,
        },
        pdfHeight: canvasHeight,
      };
    })(), projectCaptureTimeouts.render, "render", projectId);
    return rendered;
  } finally {
    await page.close().catch(() => undefined);
  }
}

// Emergency "website-slice" export mode (2026-08-07): a deliberately
// separate, narrow capture path that never lets Chromium's print
// pagination decide where a page breaks — see docs discussion in this
// session for why captureProjectPage's approach (ask page.pdf() for N
// auto-paginated segments, expect exactly N back) kept mismatching in ways
// that resisted every CSS-level fix. Instead of asking Chromium to
// paginate, this renders the project's REAL on-screen layout once, then
// manually shifts the rendered content up by one slice height at a time
// inside a hard-clipped (overflow: hidden) wrapper before each individual
// page.pdf() call — so at the moment each call runs, there is physically
// no content beyond the requested single-page height for Chromium's
// fragmentation logic to react to. Structurally cannot produce more or
// fewer pages than planned. Each slice becomes its own physical PDF page
// (not merged into one continuous page like captureProjectPage) — the
// final collection's project section is however many A4-landscape-ratio
// pages that project's real content needs, mergeCollection() already
// copies every page from a stage's bytes, so multi-page project records
// need no change there.
const a4LandscapeAspectRatio = 297 / 210; // ISO 216 A4, landscape (width:height)

async function captureProjectPageWebsiteSlice(url: string, projectId: string, aborted: { value: boolean }) {
  if (!isLocalCollectionUrl(url)) throw new Error(`Refusing to capture a non-local project URL for "${projectId}".`);
  const browser = await getCollectionBrowser();
  const page = await browser.newPage({ viewport: { width: projectCaptureViewportWidth, height: 900 }, deviceScaleFactor: 1 });
  const imageOptimizationStats: ImageOptimizationStat[] = [];
  try {
    await installImageOptimizationRoute(page, projectId, imageOptimizationStats);
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
      const currentUrl = page.url();
      const shellExists = await page.evaluate(() => Boolean(document.querySelector("[data-project-route-shell]"))).catch(() => false);
      const message = error instanceof Error ? error.message : String(error);
      if (!shellExists) throw new Error(`${message} The project route never mounted — current URL is "${currentUrl}".`);
      throw error;
    }
    if (aborted.value) throw new Error("Collection export was cancelled.");
    const rendered = await withStepTimeout((async () => {
      await page.emulateMedia({ media: "screen" });
      // Same trim as captureProjectPage — drops fixed docks/nav chrome
      // (never visible, real website content underneath is untouched), not
      // a print redesign.
      await page.evaluate(() => {
        const root = document.querySelector<HTMLElement>("[data-project-route-shell]");
        if (!root) return;
        document.body.replaceChildren(root);
        document.body.style.margin = "0";
      });
      const trimmed = await page.evaluate(() => {
        const root = document.querySelector<HTMLElement>("[data-project-route-shell]");
        const rect = root?.getBoundingClientRect();
        return { width: Math.round(rect?.width ?? 0), height: Math.round(rect?.height ?? 0) };
      });
      const captureWidth = trimmed.width || projectCaptureViewportWidth;
      const captureHeight = trimmed.height;
      if (captureHeight < 100) throw new Error(`"${projectId}" rendered an invalid height (${captureHeight}px).`);
      if (captureHeight > maximumContinuousProjectHeight) {
        throw new Error(`"${projectId}" is ${captureHeight}px tall, over the ${maximumContinuousProjectHeight}px capture limit.`);
      }

      const sliceHeightPx = Math.round(captureWidth / a4LandscapeAspectRatio);
      const sliceCount = Math.max(1, Math.ceil(captureHeight / sliceHeightPx));

      const projectDocument = await PDFDocument.create();
      for (let index = 0; index < sliceCount; index += 1) {
        if (aborted.value) throw new Error("Collection export was cancelled.");
        const offsetPx = index * sliceHeightPx;
        const thisSliceHeightPx = Math.min(sliceHeightPx, captureHeight - offsetPx);
        // Hard-clip the content to exactly this slice's height BEFORE
        // asking Chromium to print it — overflow: hidden genuinely removes
        // anything past the box from layout/paint (including print
        // layout), so there is nothing left for auto-pagination to react
        // to. transform: translateY shifts the desired slice up to y=0
        // without altering any element's own layout/measurements (unlike
        // scrollTop, which page.pdf() does not respect anyway).
        await page.evaluate(({ offsetPx, heightPx, widthPx }) => {
          const root = document.querySelector<HTMLElement>("[data-project-route-shell]");
          if (!root) return;
          let clip = document.getElementById("__website-slice-clip__");
          if (!clip) {
            clip = document.createElement("div");
            clip.id = "__website-slice-clip__";
            clip.style.overflow = "hidden";
            clip.style.position = "relative";
            clip.style.width = `${widthPx}px`;
            root.parentElement?.insertBefore(clip, root);
            clip.appendChild(root);
          }
          clip.style.height = `${heightPx}px`;
          root.style.transform = `translateY(-${offsetPx}px)`;
        }, { offsetPx, heightPx: thisSliceHeightPx, widthPx: captureWidth });
        const sliceBytes = await page.pdf({
          width: `${captureWidth}px`,
          height: `${thisSliceHeightPx}px`,
          margin: { top: "0", right: "0", bottom: "0", left: "0" },
          printBackground: true,
          preferCSSPageSize: false,
        });
        const sliceDocument = await PDFDocument.load(sliceBytes);
        const [copiedPage] = await projectDocument.copyPages(sliceDocument, [0]);
        projectDocument.addPage(copiedPage);
      }
      const bytes = await projectDocument.save();
      return {
        bytes,
        diagnostics: {
          mode: "website-slice", captureWidth, captureHeight, sliceHeightPx, sliceCount,
          pages: projectDocument.getPageCount(),
          imageOptimization: imageOptimizationStats,
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
  return !!value && typeof value === "object" && !Array.isArray(value)
    && safeId((value as Record<string, unknown>).id)
    && typeof (value as Record<string, unknown>).title === "string"
    && ((value as Record<string, unknown>).title as string).length > 0
    && ((value as Record<string, unknown>).title as string).length <= 160;
}

// Cover/TOC capture: builds the deterministic SVG cover (see
// collectionCoverRenderer.ts), rasterizes it via Playwright at its exact
// 1440x900 native size, and embeds that PNG directly into its own pdf-lib
// page — no Chromium page.pdf() print pipeline involved, same as project
// pages. navRects are computed straight from the fixed TOC_SLOTS geometry
// (no DOM query needed, unlike the old HTML/CSS cover) so the cover's
// click-to-navigate links stay exact.
async function captureCoverPage(entries: CoverTocEntry[], brandLine: string, footerLabel: string, outputRoot: string) {
  const browser = await getCollectionBrowser();
  const debugDir = path.join(outputRoot, "output", "pdf", "collection", "debug");
  const result = await renderCollectionCover(browser, entries, brandLine, footerLabel, debugDir);

  const coverDocument = await PDFDocument.create();
  const embeddedCover = await coverDocument.embedPng(result.png);
  const coverPage = coverDocument.addPage([COVER_GEOMETRY.width * cssPxToPdfPt, COVER_GEOMETRY.height * cssPxToPdfPt]);
  coverPage.drawImage(embeddedCover, { x: 0, y: 0, width: COVER_GEOMETRY.width * cssPxToPdfPt, height: COVER_GEOMETRY.height * cssPxToPdfPt });
  const bytes = await coverDocument.save();

  const navRects: CoverNavRect[] = computeCoverNavRects(entries);
  return {
    bytes,
    navRects,
    diagnostics: {
      entryCount: entries.length,
      fits: result.fits.map(({ title, slot, fontSize, lineCount, truncated }) => ({ title, slot, fontSize, lineCount, truncated })),
      svgPath: result.svgPath,
      pngPath: result.pngPath,
    },
  };
}

function isWithinCollectionOutput(root: string, candidate: string) {
  const resolved = path.resolve(candidate);
  const allowedRoot = path.resolve(root, "output", "pdf", "collection");
  return resolved === allowedRoot || resolved.startsWith(`${allowedRoot}${path.sep}`);
}

type NavigationRect = { sectionId: string; x: number; y: number; width: number; height: number };
type StageRecord = { bytes: Uint8Array; sectionId: string; label: string; navRects: NavigationRect[]; diagnostics?: Record<string, unknown>; createdAt: number };

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

function addLinkAnnotations(document: PDFDocument, coverPageIndex: number, navRects: NavigationRect[], starts: Map<string, number>) {
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
      Rect: [PDFNumber.of((rect.x / 1440) * width), PDFNumber.of(height - ((rect.y + rect.height) / 900) * height), PDFNumber.of(((rect.x + rect.width) / 1440) * width), PDFNumber.of(height - (rect.y / 900) * height)],
      Border: [0, 0, 0],
      A: { S: PDFName.of("GoTo"), D: [targetPage.ref, PDFName.of("Fit")] },
    }));
    annots?.push(annotation);
  });
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
  for (const record of records) {
    const source = await PDFDocument.load(record.bytes);
    const start = merged.getPageCount();
    starts.set(record.sectionId, start);
    outlineEntries.push({ label: record.label, pageIndex: start });
    if (record.navRects.length) { coverPageIndex = start; navRects = record.navRects; }
    const pages = await merged.copyPages(source, source.getPageIndices());
    pages.forEach((page) => merged.addPage(page));
  }
  if (coverPageIndex >= 0) addLinkAnnotations(merged, coverPageIndex, navRects, starts);
  addOutlines(merged, outlineEntries);
  merged.setTitle(filename.replace(/\.pdf$/i, ""));
  merged.setProducer("Dilida Portfolio Collection Builder");
  const bytes = await merged.save({ useObjectStreams: false });
  const directory = path.join(outputRoot, "output", "pdf", "collection");
  await fs.mkdir(directory, { recursive: true });
  const outputPath = path.join(directory, filename);
  await fs.writeFile(outputPath, bytes);
  const diagnostics = records.flatMap((record) => record.diagnostics ? [{ sectionId: record.sectionId, label: record.label, ...record.diagnostics }] : []);
  const diagnosticPath = path.join(directory, filename.replace(/\.pdf$/i, "-diagnostics.json"));
  await fs.writeFile(diagnosticPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), totalBytes: bytes.byteLength, pages: merged.getPageCount(), projects: diagnostics }, null, 2)}\n`, "utf8");
  return { bytes, outputPath, diagnosticPath, starts: Object.fromEntries(starts), pages: merged.getPageCount(), outlineCount: outlineEntries.length, linkCount: navRects.filter((rect) => starts.has(rect.sectionId)).length, totalBytes: bytes.byteLength };
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
          let bytes: Uint8Array; let navRects: NavigationRect[] = []; let diagnostics: Record<string, unknown> | undefined;
          if (value.kind === "project") {
            const url = value.url; const projectId = value.projectId;
            if (typeof url !== "string" || !safeId(projectId)) throw new Error("Invalid project capture request.");
            const websiteSlice = value.websiteSlice === true;
            const started = Date.now();
            if (websiteSlice) {
              console.info(`[collection export] "${projectId}" websiteSlice (server, received) = true — using captureProjectPageWebsiteSlice, no print-pagination path.`);
              const result = await captureProjectPageWebsiteSlice(url, projectId, aborted);
              bytes = result.bytes;
              diagnostics = { ...result.diagnostics, captureMs: Date.now() - started, pdfHeight: result.pdfHeight, result: "passed" };
              console.info("[Collection export] captured project (website-slice)", projectId, diagnostics);
            } else {
              const emergencyPdfExport = value.emergencyPdfExport === true;
              console.info(`[collection export] "${projectId}" emergencyPdfExport (server, received) =`, emergencyPdfExport, "raw value.emergencyPdfExport =", value.emergencyPdfExport);
              const result = await captureProjectPage(url, projectId, aborted, server.config.root, emergencyPdfExport);
              bytes = result.bytes;
              diagnostics = { ...result.diagnostics, captureMs: Date.now() - started, pdfHeight: result.pdfHeight, result: "passed" };
              console.info("[Collection export] captured project", projectId, diagnostics);
            }
          } else if (value.kind === "cover") {
            const entries = value.entries;
            if (!Array.isArray(entries) || !entries.every(isSafeTocEntry) || typeof value.brandLine !== "string" || typeof value.footerLabel !== "string") {
              throw new Error("Invalid cover capture request.");
            }
            const result = await captureCoverPage(entries, value.brandLine, value.footerLabel, server.config.root);
            bytes = result.bytes; navRects = result.navRects;
            diagnostics = result.diagnostics;
            console.info("[Collection export] captured cover", diagnostics);
          } else if (value.kind === "section" && typeof value.html === "string") {
            const rendered = await renderSectionPdf(value.html, snapshots); bytes = rendered.bytes; navRects = rendered.navRects;
          } else throw new Error("Unknown collection stage type.");
          if (aborted.value) throw new Error("Collection export was cancelled.");
          const token = crypto.randomUUID();
          stages.set(token, { bytes, sectionId: value.sectionId, label: value.label.slice(0, 160), navRects, diagnostics, createdAt: Date.now() });
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
