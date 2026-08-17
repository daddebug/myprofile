import type { IncomingMessage, ServerResponse } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { chromium, type Browser, type Page } from "playwright-core";
import type { Plugin, ViteDevServer } from "vite";
import { resizeOversizedExportImages } from "./exportImageResize";

const execFileAsync = promisify(execFile);
const endpoint = "/__local-export/exact-project-pdf";
const snapshotEndpoint = "/__local-export/exact-project-snapshot";
const maximumRequestBytes = 240 * 1024 * 1024;
const maximumContinuousHeight = 7_100;
let exportBrowserPromise: Promise<Browser> | null = null;
let exportPagePromise: Promise<Page> | null = null;
let exportQueue: Promise<unknown> = Promise.resolve();

// width is the CSS viewport width the snapshot's own HTML was built
// against (see ProjectExactWebExportAction.tsx's captureWidth — the real
// browser's window.innerWidth at export time, not a fixed constant). The
// capture viewport here must match it exactly, or the responsive layout
// baked into the snapshot HTML won't be the layout actually printed.
export type SnapshotPayload = {
  projectId: string;
  slug: string;
  locale: "zh" | "en";
  width: number;
  html: string;
  mode?: "continuous" | "section-pages";
};

const minimumCaptureWidth = 320;
const maximumCaptureWidth = 4096;

export type SnapshotRecord = { html: string; createdAt: number };
const sharedSnapshots = new Map<string, SnapshotRecord>();

async function getExportBrowser() {
  if (!exportBrowserPromise) {
    exportBrowserPromise = chromium.launch({ headless: true, executablePath: await findChrome() }).catch((error) => {
      exportBrowserPromise = null;
      throw error;
    });
  }
  return exportBrowserPromise;
}

function queueExport<T>(task: () => Promise<T>) {
  const result = exportQueue.then(task, task);
  exportQueue = result.then(() => undefined, () => undefined);
  return result;
}

async function getExportPage(browser: Browser, width: number) {
  const current = await exportPagePromise?.catch(() => null);
  if (!current || current.isClosed()) {
    exportPagePromise = browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 }).catch((error) => {
      exportPagePromise = null;
      throw error;
    });
  }
  const pendingPage = exportPagePromise;
  if (!pendingPage) throw new Error("Unable to initialize the Exact Web export page.");
  const page = await pendingPage;
  await page.setViewportSize({ width, height: 900 });
  return page;
}

async function closeExportBrowser() {
  const page = await exportPagePromise?.catch(() => null);
  const browser = await exportBrowserPromise?.catch(() => null);
  exportPagePromise = null;
  exportBrowserPromise = null;
  if (page && !page.isClosed()) await page.close();
  if (browser) await browser.close();
}

function safeName(value: string) {
  return /^[a-z0-9][a-z0-9-]*$/i.test(value);
}

function isLocalRequest(req: IncomingMessage) {
  const address = req.socket.remoteAddress ?? "";
  const host = req.headers.host ?? "";
  const origin = req.headers.origin ?? "";
  return (address === "::1" || address === "127.0.0.1" || address === "::ffff:127.0.0.1")
    && /^localhost:5173$/i.test(host)
    && origin === "http://localhost:5173";
}

function sendJson(res: ServerResponse, status: number, payload: object) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += value.length;
    if (total > maximumRequestBytes) throw new Error("Snapshot exceeds the local export size limit.");
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function validatePayload(value: unknown): SnapshotPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid snapshot payload.");
  const candidate = value as Partial<SnapshotPayload>;
  if (!candidate.projectId || !safeName(candidate.projectId)) throw new Error("Invalid project ID.");
  if (!candidate.slug || !safeName(candidate.slug)) throw new Error("Invalid project slug.");
  if (candidate.locale !== "zh" && candidate.locale !== "en") throw new Error("Invalid locale.");
  if (!Number.isInteger(candidate.width) || candidate.width! < minimumCaptureWidth || candidate.width! > maximumCaptureWidth) {
    throw new Error(`Exact Web PDF requires an export width between ${minimumCaptureWidth} and ${maximumCaptureWidth}px.`);
  }
  if (candidate.mode !== undefined && candidate.mode !== "continuous" && candidate.mode !== "section-pages") throw new Error("Invalid Exact Web PDF mode.");
  if (typeof candidate.html !== "string" || !candidate.html.includes("data-exact-web-export")) throw new Error("Invalid exact-web snapshot HTML.");
  return candidate as SnapshotPayload;
}

export async function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe") : undefined,
  ].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try the next standard Chrome location.
    }
  }
  throw new Error("Google Chrome was not found in a standard Windows installation path.");
}

async function waitForSnapshot(page: Page) {
  await page.waitForFunction(() => {
    const exportRoot = document.querySelector("[data-exact-web-export]");
    return Boolean(exportRoot) && document.documentElement.dataset.exactHorizontalReady === "true";
  }, { timeout: 20_000 });
  await page.evaluate(async () => {
    await document.fonts?.ready;
    await Promise.all(Array.from(document.images).map(async (image) => {
      if (!image.complete) {
        await new Promise<void>((resolve) => {
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => resolve(), { once: true });
        });
      }
      await image.decode?.().catch(() => undefined);
    }));
    document.getAnimations().forEach((animation) => {
      const timing = animation.effect?.getComputedTiming();
      if (Number.isFinite(timing?.endTime)) animation.finish();
      else animation.pause();
    });
    const root = document.querySelector<HTMLElement>("[data-exact-web-export]");
    if (!root) throw new Error("Missing rendered export root.");
    let previousHeight = -1;
    let stableFrames = 0;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const height = root.getBoundingClientRect().height;
      stableFrames = Math.abs(height - previousHeight) < 0.5 ? stableFrames + 1 : 0;
      previousHeight = height;
      if (stableFrames >= 2) break;
    }
    const rect = root.getBoundingClientRect();
    const textLength = root.innerText.trim().length;
    const mediaCount = root.querySelectorAll("img,svg,canvas,video").length;
    if (rect.width < 100 || rect.height < 100) throw new Error(`Rendered export root has invalid dimensions (${Math.round(rect.width)}x${Math.round(rect.height)}).`);
    if (textLength < 50 && mediaCount === 0) throw new Error("Rendered export root appears empty.");
  });
}

const exactProjectBottomPaddingPx = 32;

async function measureAndConstrainVisibleContent(page: Page) {
  return page.evaluate((bottomPadding) => {
    const root = document.querySelector<HTMLElement>("[data-exact-web-export]");
    if (!root) throw new Error("Missing rendered export root.");
    const rootRect = root.getBoundingClientRect();
    const visibleBottoms: number[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (!(node.textContent ?? "").trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of Array.from(range.getClientRects())) {
        if (rect.width > 0 && rect.height > 0) visibleBottoms.push(rect.bottom - rootRect.top);
      }
    }
    for (const element of Array.from(root.querySelectorAll<HTMLElement>("img, svg, canvas, video, iframe"))) {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0) {
        visibleBottoms.push(rect.bottom - rootRect.top);
      }
    }
    const measuredContentBottom = Math.ceil(Math.max(0, ...visibleBottoms));
    if (measuredContentBottom < 100) throw new Error(`Rendered export content has an invalid visible bottom (${measuredContentBottom}px).`);
    const finalPageHeight = measuredContentBottom + bottomPadding;
    // Constrain only the disposable export snapshot. This removes empty
    // wrapper/min-height tails from Chromium's print layout without changing
    // the live project DOM or spacing inside a visible module.
    document.documentElement.style.height = `${finalPageHeight}px`;
    document.documentElement.style.minHeight = "0";
    document.documentElement.style.overflow = "hidden";
    document.body.style.height = `${finalPageHeight}px`;
    document.body.style.minHeight = "0";
    document.body.style.overflow = "hidden";
    const appRoot = document.getElementById("root");
    if (appRoot) {
      appRoot.style.height = `${finalPageHeight}px`;
      appRoot.style.minHeight = "0";
      appRoot.style.overflow = "hidden";
    }
    root.style.height = `${finalPageHeight}px`;
    root.style.minHeight = "0";
    root.style.maxHeight = `${finalPageHeight}px`;
    root.style.overflow = "hidden";
    return {
      measuredContentBottom,
      finalPageHeight,
      intendedBottomPadding: bottomPadding,
      trailingBlankHeight: finalPageHeight - measuredContentBottom,
    };
  }, exactProjectBottomPaddingPx);
}

async function addSectionPageRules(page: Page, width: number) {
  return page.evaluate((width) => {
    const exportRoot = document.querySelector<HTMLElement>("[data-exact-web-export]");
    const main = exportRoot?.querySelector<HTMLElement>("main");
    const contentRoot = main?.querySelector<HTMLElement>(":scope > article")
      ?? main?.querySelector<HTMLElement>(":scope > div > article")
      ?? exportRoot?.querySelector<HTMLElement>("article")
      ?? main;
    if (!contentRoot) return { count: 0, heights: [] as number[] };
    const sections = Array.from(contentRoot.children).filter((element): element is HTMLElement => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      return style.display !== "none" && element.getBoundingClientRect().height > 1;
    });
    const projectHeader = exportRoot?.querySelector<HTMLElement>(":scope > .exact-export-project-header");
    if (projectHeader && sections[0]) sections[0].prepend(projectHeader);
    const rules: string[] = [];
    const heights: number[] = [];
    sections.forEach((section, index) => {
      const height = Math.max(1, Math.ceil(section.getBoundingClientRect().height));
      const name = `exactSection${index}`;
      section.dataset.exactPdfSection = String(index);
      heights.push(height);
      rules.push(`@page ${name} { size: ${width}px ${height}px; margin: 0; }`);
      rules.push(`[data-exact-pdf-section="${index}"] { page: ${name}; break-before: page; break-after: page; }`);
    });
    const style = document.createElement("style");
    style.dataset.exactSectionPages = "true";
    style.textContent = rules.join("\n");
    document.head.append(style);
    return { count: sections.length, heights };
  }, width);
}

async function findPopplerTool(name: "pdfinfo" | "pdftoppm" | "pdftotext") {
  const executable = `${name}.exe`;
  const candidates = [
    process.env[name === "pdfinfo" ? "PDFINFO_PATH" : name === "pdftoppm" ? "PDFTOPPM_PATH" : "PDFTOTEXT_PATH"],
    path.join(os.homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "native", "poppler", "Library", "bin", executable),
    executable,
  ].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    try {
      if (path.isAbsolute(candidate)) await fs.access(candidate);
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

async function inspectPdf(pdfPath: string) {
  const pdfinfo = await findPopplerTool("pdfinfo");
  const pdftotext = await findPopplerTool("pdftotext");
  if (!pdfinfo) return { pages: null, pageSize: null, textLength: null };
  try {
    const { stdout } = await execFileAsync(pdfinfo, [pdfPath], { windowsHide: true });
    const extracted = pdftotext
      ? await execFileAsync(pdftotext, ["-enc", "UTF-8", pdfPath, "-"], { windowsHide: true, maxBuffer: 20 * 1024 * 1024 }).then((result) => result.stdout).catch(() => "")
      : "";
    return {
      pages: Number(stdout.match(/^Pages:\s+(\d+)/m)?.[1] ?? 0) || null,
      pageSize: stdout.match(/^Page size:\s+(.+)$/m)?.[1]?.trim() ?? null,
      textLength: extracted.replace(/\s+/g, "").length || null,
    };
  } catch {
    return { pages: null, pageSize: null, textLength: null };
  }
}

async function renderPdfReference(browser: Browser, pdfPath: string, outputPath: string, tempDir: string, origin: string, snapshots: Map<string, SnapshotRecord>, width: number) {
  const pdftoppm = await findPopplerTool("pdftoppm");
  if (!pdftoppm) throw new Error("pdftoppm is required to render the PDF verification reference.");
  const prefix = path.join(tempDir, "pdf-page");
  await execFileAsync(pdftoppm, ["-png", "-scale-to-x", String(width), "-scale-to-y", "-1", pdfPath, prefix], { windowsHide: true, maxBuffer: 20 * 1024 * 1024 });
  const files = (await fs.readdir(tempDir))
    .filter((name) => /^pdf-page-\d+\.png$/i.test(name))
    .sort((a, b) => Number(a.match(/(\d+)/)?.[1]) - Number(b.match(/(\d+)/)?.[1]));
  if (!files.length) throw new Error("The generated PDF could not be rendered for comparison.");
  const images = await Promise.all(files.map(async (file) => {
    const bytes = await fs.readFile(path.join(tempDir, file));
    return `<img src="data:image/png;base64,${bytes.toString("base64")}" alt="" />`;
  }));
  const token = crypto.randomUUID();
  snapshots.set(token, {
    createdAt: Date.now(),
    html: `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#181743}img{display:block;width:${width}px;height:auto}</style></head><body>${images.join("")}</body></html>`,
  });
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  try {
    await page.goto(`${origin}${snapshotEndpoint}/${token}`, { waitUntil: "networkidle" });
    const nonUniformRatios = await page.evaluate(() => Array.from(document.images).map((image) => {
      const canvas = document.createElement("canvas");
      canvas.width = 72;
      canvas.height = 72;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return 0;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const red = pixels[0];
      const green = pixels[1];
      const blue = pixels[2];
      let different = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        if (Math.abs(pixels[index] - red) + Math.abs(pixels[index + 1] - green) + Math.abs(pixels[index + 2] - blue) > 30) different += 1;
      }
      return different / (pixels.length / 4);
    }));
    await page.screenshot({ path: outputPath, fullPage: false, animations: "disabled" });
    return nonUniformRatios;
  } finally {
    snapshots.delete(token);
    await page.close();
  }
}

function validateProjectPdf(projectId: string, byteLength: number, pdfAudit: Awaited<ReturnType<typeof inspectPdf>>, nonUniformRatios: number[]) {
  if (byteLength < 25 * 1024) throw new Error(`${projectId} generated an implausibly small PDF (${byteLength} bytes).`);
  if (!pdfAudit.pages || pdfAudit.pages < 1) throw new Error(`${projectId} generated no physical PDF pages.`);
  if (pdfAudit.textLength !== null && pdfAudit.textLength < 50) throw new Error(`${projectId} generated a PDF with too little extractable text (${pdfAudit.textLength} characters).`);
  if (nonUniformRatios.length && Math.max(...nonUniformRatios) < 0.012) throw new Error(`${projectId} generated a nearly uniform blank PDF.`);
}

async function createExactWebPdf(payload: SnapshotPayload, root: string, origin: string, snapshots: Map<string, SnapshotRecord>) {
  const outputDir = path.join(root, "output", "pdf", "exact-web");
  const tempDir = path.join(root, "output", "temp", "exact-web", crypto.randomUUID());
  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(tempDir, { recursive: true });
  const localeLabel = payload.locale.toUpperCase();
  const baseName = `${payload.slug}-${localeLabel}-exact-web`;
  const pdfPath = path.join(outputDir, `${baseName}.pdf`);
  const screenReferencePath = path.join(outputDir, `${payload.slug}-screen-reference.png`);
  const pdfReferencePath = path.join(outputDir, `${payload.slug}-pdf-reference.png`);
  const reportPath = path.join(outputDir, `${baseName}-report.json`);
  const browser = await getExportBrowser();
  const page = await getExportPage(browser, payload.width);
  try {
    await page.emulateMedia({ media: "screen" });
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await page.setContent(payload.html, { waitUntil: "networkidle" });
    await waitForSnapshot(page);
    // Export-only, in-page right-sizing of oversized images before
    // Chromium prints — see exportImageResize.ts. Runs after layout has
    // settled (waitForSnapshot already waited for stable height) so each
    // image's measured CSS box reflects its real, final rendered size.
    await page.evaluate(resizeOversizedExportImages);
    const contentBounds = await measureAndConstrainVisibleContent(page);
    const renderDiagnostics = await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>("[data-exact-web-export]")!;
      const rect = root.getBoundingClientRect();
      return {
        exportRootWidth: Math.round(rect.width),
        exportRootHeight: Math.round(rect.height),
        exportRootTextLength: root.innerText.trim().length,
        documentScrollHeight: document.documentElement.scrollHeight,
        imageCount: root.querySelectorAll("img").length,
      };
    });
    const measuredHeight = contentBounds.finalPageHeight;
    let mode: "continuous" | "section-pages" = "continuous";
    let sectionHeights: number[] = [];
    // `payload.mode` is an explicit override in either direction: forcing
    // "section-pages" always splits regardless of height (existing
    // behavior); forcing "continuous" always keeps one page regardless of
    // height (new — previously height alone could push a request past this
    // cap even when the caller asked for one page). Omitting `mode` keeps
    // the auto height-based default unchanged.
    if (payload.mode === "continuous" || (payload.mode !== "section-pages" && measuredHeight <= maximumContinuousHeight)) {
      const pdfHeight = measuredHeight + 1;
      await page.addStyleTag({ content: `@page { size: ${payload.width}px ${pdfHeight}px; margin: 0; }` });
      await page.pdf({
        path: pdfPath,
        width: `${payload.width}px`,
        height: `${pdfHeight}px`,
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
        scale: 1,
        printBackground: true,
        displayHeaderFooter: false,
        preferCSSPageSize: true,
      });
    } else {
      const sections = await addSectionPageRules(page, payload.width);
      if (!sections.count) throw new Error("The project is too tall for one page and has no safe top-level section boundaries.");
      mode = "section-pages";
      sectionHeights = sections.heights;
      await page.pdf({
        path: pdfPath,
        width: `${payload.width}px`,
        height: "900px",
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
        scale: 1,
        printBackground: true,
        displayHeaderFooter: false,
        preferCSSPageSize: true,
      });
    }

    await page.screenshot({ path: screenReferencePath, fullPage: false });

    const pdfBytes = await fs.readFile(pdfPath);
    const pdfAudit = await inspectPdf(pdfPath);
    const nonUniformRatios = await renderPdfReference(browser, pdfPath, pdfReferencePath, tempDir, origin, snapshots, payload.width);
    validateProjectPdf(payload.projectId, pdfBytes.length, pdfAudit, nonUniformRatios);
    const report = {
      version: 1,
      projectId: payload.projectId,
      slug: payload.slug,
      locale: payload.locale,
      viewportWidth: payload.width,
      measuredHeight,
      mode,
      sectionHeights,
      pdfHeight: mode === "continuous" ? measuredHeight + 1 : null,
      pdfAudit,
      pdfBytes: pdfBytes.length,
      nonUniformRatios,
      renderDiagnostics,
      ...contentBounds,
      generatedAt: new Date().toISOString(),
    };
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    return { pdfPath, pdfBytes, report };
  } finally {
    await page.goto("about:blank", { waitUntil: "load" }).catch(() => undefined);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

export function renderExactWebPdf(payload: SnapshotPayload, root: string, origin = "http://localhost:5173") {
  return queueExport(() => createExactWebPdf(payload, root, origin, sharedSnapshots));
}

export function exactWebExportPlugin(): Plugin {
  const snapshots = sharedSnapshots;
  let root = process.cwd();
  return {
    name: "local-exact-web-project-export",
    apply: "serve",
    configResolved(config) {
      root = config.root;
    },
    configureServer(server: ViteDevServer) {
      server.httpServer?.once("close", () => { void closeExportBrowser(); });
      server.middlewares.use(snapshotEndpoint, (req, res, next) => {
        if (req.method !== "GET") return next();
        const token = (req.url ?? "").replace(/^\//, "").split(/[?#]/)[0];
        const record = snapshots.get(token);
        if (!record || Date.now() - record.createdAt > 5 * 60_000) {
          sendJson(res, 404, { error: "Snapshot not found or expired." });
          return;
        }
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.end(record.html);
      });

      server.middlewares.use(endpoint, async (req, res, next) => {
        if (req.method !== "POST") return next();
        if (!isLocalRequest(req)) {
          sendJson(res, 403, { error: "Exact Web PDF export is available only from localhost:5173 in development." });
          return;
        }
        try {
          const payload = validatePayload(await readJsonBody(req));
          const result = await renderExactWebPdf(payload, root, "http://localhost:5173");
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/pdf");
          res.setHeader("Content-Disposition", `attachment; filename="${path.basename(result.pdfPath)}"`);
          res.setHeader("Content-Length", String(result.pdfBytes.length));
          res.setHeader("X-Exact-Web-Mode", result.report.mode);
          res.setHeader("X-Exact-Web-Height", String(result.report.measuredHeight));
          res.setHeader("X-Exact-Web-Pages", String(result.report.pdfAudit.pages ?? ""));
          res.end(result.pdfBytes);
        } catch (error) {
          sendJson(res, 500, { error: error instanceof Error ? error.message : "Exact Web PDF export failed." });
        }
      });
    },
  };
}
