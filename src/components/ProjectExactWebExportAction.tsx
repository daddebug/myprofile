import { useEffect, useState } from "react";
import { FileDown } from "lucide-react";
import { useParams } from "react-router-dom";
import { useLocale } from "../locales/LocaleContext";

type ExportState = "idle" | "preparing" | "exporting" | "done" | "error";
export type ExactProjectHeader = "logo-project" | "logo-only" | "none";
export type ExactSnapshotOptions = {
  header?: ExactProjectHeader;
  projectName?: string;
};
export type ExactSnapshotDiagnostics = {
  projectId: string;
  route: string;
  iframeIndex: number;
  iframeReadyState: DocumentReadyState;
  exportRootSelector: "[data-project-route-shell]";
  exportRootFound: boolean;
  exportRootChildCount: number;
  exportRootTextLength: number;
  exportRootWidth: number;
  exportRootHeight: number;
  documentScrollHeight: number;
  imageCount: number;
  loadedImageCount: number;
  failedImageCount: number;
  snapshotHtmlLength: number;
  fontReady: boolean;
  exportReadySignal: boolean;
};
export type ExactSnapshotContext = { projectId?: string; iframeIndex?: number };

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)), { once: true });
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Unable to embed image.")), { once: true });
    reader.readAsDataURL(blob);
  });
}

async function temporaryUrlToDataUrl(url: string, cache: Map<string, string>) {
  if (url.startsWith("data:")) return url;
  if (!url.startsWith("blob:") && !url.startsWith("filesystem:")) return url;
  const cached = cache.get(url);
  if (cached) return cached;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to read a local project image (${response.status}).`);
  const dataUrl = await blobToDataUrl(await response.blob());
  cache.set(url, dataUrl);
  return dataUrl;
}

async function revealCompleteProjectPage(root: HTMLElement) {
  const previousX = window.scrollX;
  const previousY = window.scrollY;
  const step = Math.max(480, Math.floor(window.innerHeight * 0.78));
  for (let pass = 0; pass < 2; pass += 1) {
    const height = document.documentElement.scrollHeight;
    for (let top = 0; top < height; top += step) {
      window.scrollTo({ top, left: 0, behavior: "auto" });
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    }
  }
  window.scrollTo({ top: previousY, left: previousX, behavior: "auto" });
  await document.fonts?.ready;
  const imageReadiness = Promise.all(Array.from(root.querySelectorAll("img")).map(async (image) => {
    if (!image.complete) {
      await new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      });
    }
    await image.decode?.().catch(() => undefined);
  }));
  await Promise.race([
    imageReadiness,
    new Promise<void>((resolve) => window.setTimeout(resolve, 15_000)),
  ]);
}

async function waitForStableExportRoot(root: HTMLElement) {
  // Project content mounts asynchronously (ProjectPageContent renders null
  // until its disk read resolves — see ProjectPage.tsx), so the root can
  // briefly sit at ~0px right after the iframe loads. Two consecutive equal
  // readings at that height would otherwise look "stable" and get accepted
  // before real content ever mounts, producing a bogus 0px export root.
  // Require the same 100px floor used to validate the final measurement
  // before a reading is allowed to count toward stability.
  let previousHeight = -1;
  let stableFrames = 0;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const height = root.getBoundingClientRect().height;
    stableFrames = height >= 100 && Math.abs(height - previousHeight) < 0.5 ? stableFrames + 1 : 0;
    previousHeight = height;
    if (stableFrames >= 2) return;
  }
  throw new Error("The project export root did not reach a stable layout.");
}

async function embedProjectAssets(sourceRoot: HTMLElement, cloneRoot: HTMLElement) {
  const cache = new Map<string, string>();
  const sourceImages = Array.from(sourceRoot.querySelectorAll("img"));
  const cloneImages = Array.from(cloneRoot.querySelectorAll("img"));
  await Promise.all(sourceImages.map(async (source, index) => {
    const clone = cloneImages[index];
    if (!clone) return;
    const url = source.currentSrc || source.src;
    const embedded = await temporaryUrlToDataUrl(url, cache).catch(() => url);
    clone.src = embedded;
    clone.removeAttribute("srcset");
    clone.loading = "eager";
    clone.decoding = "sync";
  }));

  const sourceElements = [sourceRoot, ...Array.from(sourceRoot.querySelectorAll<HTMLElement>("*"))];
  const cloneElements = [cloneRoot, ...Array.from(cloneRoot.querySelectorAll<HTMLElement>("*"))];
  await Promise.all(sourceElements.map(async (source, index) => {
    const clone = cloneElements[index];
    if (!clone) return;
    const background = getComputedStyle(source).backgroundImage;
    if (!background.includes("blob:") && !background.includes("filesystem:")) return;
    let resolved = background;
    const urls = Array.from(background.matchAll(/url\(["']?([^"')]+)["']?\)/g), (match) => match[1]);
    for (const url of urls) {
      const embedded = await temporaryUrlToDataUrl(url, cache).catch(() => url);
      resolved = resolved.replace(url, embedded);
    }
    clone.style.backgroundImage = resolved;
  }));

  const sourceCanvases = Array.from(sourceRoot.querySelectorAll("canvas"));
  const cloneCanvases = Array.from(cloneRoot.querySelectorAll("canvas"));
  sourceCanvases.forEach((source, index) => {
    const clone = cloneCanvases[index];
    if (!clone) return;
    try {
      const image = document.createElement("img");
      image.src = source.toDataURL("image/png");
      image.alt = source.getAttribute("aria-label") ?? "Canvas visual";
      image.style.cssText = source.style.cssText;
      image.width = source.width;
      image.height = source.height;
      clone.replaceWith(image);
    } catch {
      // A cross-origin canvas remains as-is; the rest of the DOM stays selectable.
    }
  });
}

function absoluteStylesheetMarkup() {
  return Array.from(document.head.querySelectorAll<HTMLLinkElement | HTMLStyleElement>('link[rel="stylesheet"], style'))
    .map((element) => {
      const clone = element.cloneNode(true) as HTMLLinkElement | HTMLStyleElement;
      if (clone instanceof HTMLLinkElement) clone.href = new URL(clone.href, document.baseURI).href;
      return clone.outerHTML;
    })
    .join("\n");
}

function markHorizontalExportRows(sourceRoot: HTMLElement, cloneRoot: HTMLElement) {
  const sourceElements = [sourceRoot, ...Array.from(sourceRoot.querySelectorAll<HTMLElement>("*"))];
  const cloneElements = [cloneRoot, ...Array.from(cloneRoot.querySelectorAll<HTMLElement>("*"))];
  sourceElements.forEach((source, index) => {
    const style = getComputedStyle(source);
    if (!/(auto|scroll)/.test(style.overflowX) || source.clientWidth <= 0) return;
    const strip = Array.from(source.children).filter((child): child is HTMLElement => child instanceof HTMLElement)
      .sort((left, right) => Math.max(right.scrollWidth, right.offsetWidth) - Math.max(left.scrollWidth, left.offsetWidth))[0];
    if (!strip || strip.children.length < 2 || !/(flex|grid)/.test(getComputedStyle(strip).display)) return;
    const cloneFrame = cloneElements[index];
    const stripIndex = Array.from(source.children).indexOf(strip);
    const cloneStrip = cloneFrame?.children[stripIndex];
    if (!(cloneFrame instanceof HTMLElement) || !(cloneStrip instanceof HTMLElement)) return;
    cloneFrame.dataset.exactHorizontalFrame = "true";
    cloneStrip.dataset.exactHorizontalStrip = "true";
  });
}

function horizontalExportLayoutScript() {
  return `<script>
    (() => {
      const MIN_SCALE = 0.58;
      const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const readyImages = () => Promise.all(Array.from(document.images).map((image) => image.complete ? Promise.resolve() : new Promise((resolve) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
      })));
      const innerWidth = (frame) => {
        const style = getComputedStyle(frame);
        return Math.max(1, frame.clientWidth - parseFloat(style.paddingLeft || "0") - parseFloat(style.paddingRight || "0"));
      };
      const rowMetrics = (strip) => {
        const rect = strip.getBoundingClientRect();
        return {
          width: Math.max(1, Math.ceil(Math.max(strip.scrollWidth, strip.offsetWidth, rect.width))),
          height: Math.max(1, Math.ceil(Math.max(strip.scrollHeight, strip.offsetHeight, rect.height))),
        };
      };
      const scaleRow = (frame, strip) => {
        const availableWidth = innerWidth(frame);
        const natural = rowMetrics(strip);
        let scale = Math.min(1, availableWidth / natural.width);
        const style = getComputedStyle(frame);
        const paddingTop = parseFloat(style.paddingTop || "0");
        const paddingBottom = parseFloat(style.paddingBottom || "0");
        frame.style.position = "relative";
        frame.style.overflow = "visible";
        frame.style.overflowX = "visible";
        strip.style.position = "absolute";
        strip.style.top = paddingTop + "px";
        strip.style.left = "50%";
        strip.style.width = natural.width + "px";
        strip.style.maxWidth = "none";
        strip.style.marginLeft = "0";
        strip.style.marginRight = "0";
        strip.style.transformOrigin = "top center";
        strip.style.transform = "translateX(-50%) scale(" + scale + ")";
        const renderedWidth = strip.getBoundingClientRect().width;
        if (renderedWidth > availableWidth + 0.5) {
          scale *= availableWidth / renderedWidth;
          strip.style.transform = "translateX(-50%) scale(" + scale + ")";
        }
        const renderedHeight = strip.getBoundingClientRect().height;
        frame.style.height = Math.ceil(paddingTop + renderedHeight + paddingBottom) + "px";
        strip.dataset.exactHorizontalScale = scale.toFixed(4);
        return scale;
      };
      const splitAndScaleRow = (frame, strip) => {
        const itemStyle = getComputedStyle(strip);
        const gap = parseFloat(itemStyle.columnGap || itemStyle.gap || "0");
        const children = Array.from(strip.children).filter((child) => child instanceof HTMLElement);
        const flowItems = children.filter((child) => getComputedStyle(child).position !== "absolute");
        if (flowItems.length < 2) return scaleRow(frame, strip);
        const availableWidth = innerWidth(frame);
        const maximumGroupWidth = availableWidth / MIN_SCALE;
        const groups = [];
        let group = [];
        let groupWidth = 0;
        flowItems.forEach((item) => {
          const width = Math.max(1, Math.ceil(item.getBoundingClientRect().width));
          const nextWidth = group.length ? groupWidth + gap + width : width;
          if (group.length && nextWidth > maximumGroupWidth) {
            groups.push(group);
            group = [];
            groupWidth = 0;
          }
          group.push(item);
          groupWidth = groupWidth ? groupWidth + gap + width : width;
        });
        if (group.length) groups.push(group);
        if (groups.length <= 1) return scaleRow(frame, strip);

        const decorations = children.filter((child) => getComputedStyle(child).position === "absolute");
        const originalStrip = strip.cloneNode(false);
        frame.replaceChildren();
        frame.style.height = "auto";
        frame.style.overflow = "visible";
        frame.style.overflowX = "visible";
        frame.style.display = "grid";
        frame.style.gridTemplateColumns = "minmax(0, 1fr)";
        frame.style.gap = Math.max(20, gap) + "px";
        frame.dataset.exactHorizontalGroups = String(groups.length);
        groups.forEach((items) => {
          const groupFrame = document.createElement("div");
          groupFrame.dataset.exactHorizontalGroup = "true";
          groupFrame.style.width = "100%";
          groupFrame.style.minWidth = "0";
          groupFrame.style.maxWidth = "100%";
          const groupStrip = originalStrip.cloneNode(false);
          groupStrip.removeAttribute("id");
          groupStrip.dataset.exactHorizontalStrip = "true";
          decorations.forEach((item) => groupStrip.append(item.cloneNode(true)));
          items.forEach((item) => groupStrip.append(item.cloneNode(true)));
          groupFrame.append(groupStrip);
          frame.append(groupFrame);
          scaleRow(groupFrame, groupStrip);
        });
      };
      const layout = async () => {
        await document.fonts?.ready;
        await readyImages();
        await nextFrame();
        document.querySelectorAll("[data-exact-horizontal-frame]").forEach((frame) => {
          const strip = Array.from(frame.children).find((child) => child instanceof HTMLElement && child.dataset.exactHorizontalStrip === "true");
          if (!(frame instanceof HTMLElement) || !(strip instanceof HTMLElement)) return;
          const natural = rowMetrics(strip);
          const requiredScale = Math.min(1, innerWidth(frame) / natural.width);
          if (requiredScale < MIN_SCALE) splitAndScaleRow(frame, strip);
          else scaleRow(frame, strip);
        });
        await nextFrame();
        document.documentElement.dataset.exactHorizontalReady = "true";
      };
      layout().catch((error) => {
        document.documentElement.dataset.exactHorizontalError = error instanceof Error ? error.message : String(error);
        document.documentElement.dataset.exactHorizontalReady = "true";
      });
    })();
  </script>`;
}

export async function buildExactSnapshotResult(options: ExactSnapshotOptions = {}, context: ExactSnapshotContext = {}) {
  const sourceRoot = document.querySelector<HTMLElement>("[data-project-route-shell]");
  if (!sourceRoot) throw new Error("The current project content root was not found.");
  await revealCompleteProjectPage(sourceRoot);
  await waitForStableExportRoot(sourceRoot);
  const rootRect = sourceRoot.getBoundingClientRect();
  const rootTextLength = sourceRoot.innerText.trim().length;
  const mediaCount = sourceRoot.querySelectorAll("img,svg,canvas,video").length;
  if (rootRect.width < 100) throw new Error(`Invalid project export root width (${Math.round(rootRect.width)}px).`);
  if (rootRect.height < 100) throw new Error(`Invalid project export root height (${Math.round(rootRect.height)}px).`);
  if (rootTextLength < 50 && mediaCount === 0) throw new Error("The project export root appears empty.");
  const projectId = sourceRoot.dataset.projectId ?? context.projectId ?? "unknown-project";
  if (context.projectId && projectId !== context.projectId) throw new Error(`Project export mismatch: expected ${context.projectId}, received ${projectId}.`);
  const images = Array.from(sourceRoot.querySelectorAll("img"));
  const cloneRoot = sourceRoot.cloneNode(true) as HTMLElement;
  cloneRoot.dataset.exactWebExport = "true";
  markHorizontalExportRows(sourceRoot, cloneRoot);
  await embedProjectAssets(sourceRoot, cloneRoot);

  cloneRoot.querySelectorAll("details").forEach((details) => { details.open = false; });
  cloneRoot.querySelectorAll('[data-exact-export="hide"]').forEach((element) => element.remove());
  cloneRoot.querySelectorAll([
    "[data-project-print-control]",
    "[data-project-exact-export-control]",
    "[data-project-back-to-top]",
    "[data-project-bottom-navigation]",
    "vite-error-overlay",
  ].join(",")).forEach((element) => element.remove());
  cloneRoot.querySelectorAll(":scope > .fixed").forEach((element) => element.remove());
  cloneRoot.querySelectorAll<HTMLAnchorElement>('a[href$="/work"]').forEach((element) => element.remove());

  if (options.header && options.header !== "none") {
    const header = document.createElement("div");
    header.className = "exact-export-project-header";
    const logo = document.createElement("span");
    logo.className = "exact-export-project-logo";
    logo.textContent = "D.D";
    header.append(logo);
    if (options.header === "logo-project" && options.projectName) {
      const name = document.createElement("span");
      name.className = "exact-export-project-name";
      name.textContent = options.projectName;
      header.append(name);
    }
    cloneRoot.prepend(header);
  }

  // Captured here, at the moment the real page's own snapshot is built —
  // this is "the current browser CSS viewport width" the export must
  // reproduce (per the layout-fidelity investigation: Exact Web PDF used
  // to hard-force 1440px, which silently diverged from whatever width the
  // page was actually being viewed at, since the site is intentionally
  // responsive). Never a physical-pixel/DPR concept — just the CSS
  // viewport width every responsive rule in the live page is already
  // resolving against right now.
  const captureWidth = window.innerWidth;
  const exactCss = `
    html, body { margin: 0; min-width: ${captureWidth}px; width: ${captureWidth}px; overflow: visible; background: #181743; }
    body { min-height: 0; }
    #root, [data-exact-web-export] { width: ${captureWidth}px; min-width: ${captureWidth}px; min-height: 0; overflow: visible; }
    [data-exact-web-export] > main,
    [data-exact-web-export] > div > main {
      opacity: 1 !important;
      transform: none !important;
    }
    [data-exact-web-export], [data-exact-web-export] * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    [data-exact-web-export] *, [data-exact-web-export] *::before, [data-exact-web-export] *::after {
      animation-play-state: paused !important;
      transition: none !important;
    }
    [data-exact-web-export] [data-exact-export="hide"] { display: none !important; }
    [data-exact-web-export] [data-exact-export="static"] {
      cursor: default !important;
      pointer-events: none !important;
    }
    [data-exact-web-export] a[data-exact-export="static"] {
      color: inherit !important;
      text-decoration: none !important;
    }
    .exact-export-project-header {
      display: flex; width: min(calc(100% - 160px), 1280px); margin: 0 auto;
      align-items: center; gap: 18px; border-bottom: 1px solid rgba(133,165,255,.24); padding: 26px 0 18px;
      background: #181743; color: #f4f5fa;
    }
    .exact-export-project-logo {
      display: grid; width: 44px; height: 44px; flex: none; place-items: center;
      border: 1px solid rgba(52,240,37,.5); border-radius: 14px; background: #202b72;
      color: #34f025; font: 800 16px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    .exact-export-project-name { font: 650 16px/1.3 system-ui, sans-serif; color: rgba(244,245,250,.82); }
  `;
  const lang = document.documentElement.lang || "zh";
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=${captureWidth},initial-scale=1">${absoluteStylesheetMarkup()}<style>${exactCss}</style></head><body class="${document.body.className}"><div id="root">${cloneRoot.outerHTML}</div>${horizontalExportLayoutScript()}</body></html>`;
  const diagnostics: ExactSnapshotDiagnostics = {
    projectId,
    route: window.location.pathname,
    iframeIndex: context.iframeIndex ?? 0,
    iframeReadyState: document.readyState,
    exportRootSelector: "[data-project-route-shell]",
    exportRootFound: true,
    exportRootChildCount: sourceRoot.childElementCount,
    exportRootTextLength: rootTextLength,
    exportRootWidth: Math.round(rootRect.width),
    exportRootHeight: Math.round(rootRect.height),
    documentScrollHeight: document.documentElement.scrollHeight,
    imageCount: images.length,
    loadedImageCount: images.filter((image) => image.complete && image.naturalWidth > 0).length,
    failedImageCount: images.filter((image) => image.complete && image.naturalWidth === 0).length,
    snapshotHtmlLength: html.length,
    fontReady: document.fonts.status === "loaded",
    exportReadySignal: true,
  };
  return { html, diagnostics, captureWidth };
}

declare global {
  interface Window {
    __exactWebExport?: { buildSnapshot: typeof buildExactSnapshotResult };
  }
}

// Lets the Portfolio Collection export's own headless capture page (which
// navigates directly to a project route, never inside an iframe) call the
// exact same DOM-snapshot builder the single-project "Export Exact Web PDF"
// button uses — no postMessage/bridge round-trip needed, since both run in
// the same page context. This is what makes Collection's project pages the
// canonical exact-web output instead of a second, independently-drifting
// rendering pipeline (see scripts/portfolioCollectionExportPlugin.ts).
if (import.meta.env.DEV) window.__exactWebExport = { buildSnapshot: buildExactSnapshotResult };

export function ProjectExactWebExportBridge() {
  useEffect(() => {
    if (!import.meta.env.DEV || window.parent === window) return undefined;
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== window.parent) return;
      const request = event.data as { type?: string; requestId?: string; projectId?: string; iframeIndex?: number; options?: ExactSnapshotOptions };
      if (request.type !== "dilida:exact-snapshot-request" || !request.requestId || !event.ports[0]) return;
      const port = event.ports[0];
      void buildExactSnapshotResult(request.options, { projectId: request.projectId, iframeIndex: request.iframeIndex }).then(({ html, diagnostics, captureWidth }) => {
        port.postMessage({ ok: true, requestId: request.requestId, projectId: diagnostics.projectId, html, diagnostics, captureWidth });
      }).catch((error) => {
        port.postMessage({ ok: false, requestId: request.requestId, error: error instanceof Error ? error.message : "Snapshot failed." });
      });
    };
    window.addEventListener("message", receive);
    window.parent.postMessage({
      type: "dilida:exact-snapshot-ready",
      projectId: document.querySelector<HTMLElement>("[data-project-route-shell]")?.dataset.projectId,
      readyState: document.readyState,
    }, window.location.origin);
    return () => window.removeEventListener("message", receive);
  }, []);
  return null;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function ProjectExactWebExportAction({ onBeforeExport }: { onBeforeExport?: () => void }) {
  const { locale } = useLocale();
  const { slug = "project" } = useParams();
  const [state, setState] = useState<ExportState>("idle");
  const [message, setMessage] = useState("");

  if (!import.meta.env.DEV) return null;

  const runExport = async () => {
    if (state === "preparing" || state === "exporting") return;
    setState("preparing");
    setMessage("Preparing exact webpage...");
    onBeforeExport?.();
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    try {
      const { html, captureWidth } = await buildExactSnapshotResult();
      const projectId = document.querySelector<HTMLElement>("[data-project-route-shell]")?.dataset.projectId;
      if (!projectId) throw new Error("The stable project ID was not found.");
      setState("exporting");
      setMessage("Generating screen-faithful PDF...");
      const response = await fetch("/__local-export/exact-project-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, slug, locale, width: captureWidth, html }),
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({ error: "Exact Web PDF export failed." })) as { error?: string };
        throw new Error(failure.error || "Exact Web PDF export failed.");
      }
      const filename = `${slug}-${locale.toUpperCase()}-exact-web.pdf`;
      downloadBlob(await response.blob(), filename);
      const mode = response.headers.get("X-Exact-Web-Mode");
      const height = response.headers.get("X-Exact-Web-Height");
      setState("done");
      setMessage(`${mode === "section-pages" ? "Exact Web PDF - Section Pages" : "Continuous Web PDF"} · ${height ?? "?"}px`);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Exact Web PDF export failed.");
    }
  };

  return (
    <div className="flex max-w-full flex-col items-end gap-1" data-project-exact-export-control>
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-full border border-electricBlue/55 bg-deepIndigo/92 px-4 py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-acidGreen shadow-archive backdrop-blur transition hover:border-acidGreen/70 hover:bg-archiveBlue/92 disabled:cursor-wait disabled:opacity-60"
        onClick={() => void runExport()}
        disabled={state === "preparing" || state === "exporting"}
      >
        <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
        {state === "preparing" ? "PREPARING EXACT WEBPAGE..." : state === "exporting" ? "GENERATING PDF..." : "EXPORT EXACT WEB PDF"}
      </button>
      {message ? <p className={`max-w-sm rounded-md bg-deepIndigo/92 px-2.5 py-1.5 text-right font-mono text-[9px] leading-4 ${state === "error" ? "text-peach" : "text-softWhite/52"}`} aria-live="polite">{message}</p> : null}
    </div>
  );
}
