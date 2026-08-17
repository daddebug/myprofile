import type { ResolvedProjectMetadata } from "./projectMetadata";
import { localizePath } from "../locales/LocaleContext";
import type { Locale } from "../locales/types";
import { VISIBLE_COUNT } from "../pages/HomePage";

const CAPTURE_WIDTH = 1440;
const CAPTURE_HEIGHT = 900;
const PAGE_WAIT_TIMEOUT = 45_000;
const MAX_STANDALONE_HTML_BYTES = 10 * 1024 * 1024;
const MAX_COMPLETE_STANDALONE_HTML_BYTES = 300 * 1024 * 1024;
const MAX_EMBEDDED_IMAGE_WIDTH = 1440;
const MAX_EMBEDDED_IMAGE_HEIGHT = 1800;
const EMBEDDED_IMAGE_PROFILES = [
  { screenshotQuality: 0.82, photoQuality: 0.78 },
  { screenshotQuality: 0.78, photoQuality: 0.72 },
  { screenshotQuality: 0.74, photoQuality: 0.66 },
] as const;
const COMPLETE_EMBEDDED_IMAGE_PROFILES = [
  { screenshotQuality: 0.94, photoQuality: 0.9 },
  { screenshotQuality: 0.9, photoQuality: 0.86 },
  { screenshotQuality: 0.86, photoQuality: 0.82 },
] as const;
const UI_PRACTICE_PROJECT_ID = "ui-personal-practice";

export type StaticHtmlExportMode = "standard" | "complete-offline";
export type StaticHtmlDelivery = "download" | "return";

export type StaticHtmlExportPhase = "idle" | "capturing" | "packaging" | "done" | "error";

export type StaticHtmlExportProgress = {
  phase: StaticHtmlExportPhase;
  completed: number;
  total: number;
  currentLabel?: string;
};

export type StaticHtmlExportResult = {
  filename: string;
  bytes: number;
  html?: string;
  projectIds: string[];
  validation: StaticHtmlExportValidation;
};

export type StaticHtmlExportValidation = {
  selectedProjectIds: string[];
  exportedProjectIds: string[];
  selectedProjectCount: number;
  exportedProjectCount: number;
  coverIncluded: boolean;
  gameExperienceIncluded: boolean;
  unselectedProjectAssetsIncluded: string[];
  uiPracticeIncludedWithoutSelection: boolean;
  duplicateEmbeddedPayloads: number;
  embeddedImageCount: number;
};

type CapturedPage = {
  id: string;
  title: string;
  rootHtml: string;
  styles: string[];
  bodyClassName: string;
  htmlClassName: string;
  htmlStyle: string;
};

type AssetCache = Map<string, Promise<string>>;

function abortError() {
  return new DOMException("Static HTML export was cancelled.", "AbortError");
}

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError();
}

function nextFrame(win: Window) {
  return new Promise<void>((resolve) => win.requestAnimationFrame(() => win.requestAnimationFrame(() => resolve())));
}

async function waitFor(
  predicate: () => boolean,
  message: string,
  signal?: AbortSignal,
  timeout = PAGE_WAIT_TIMEOUT,
) {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    assertNotAborted(signal);
    if (Date.now() >= deadline) throw new Error(message);
    await new Promise((resolve) => window.setTimeout(resolve, 120));
  }
}

function createCaptureFrame(path: string) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.cssText = [
    "position:fixed",
    "inset:0 auto auto 0",
    `width:${CAPTURE_WIDTH}px`,
    `height:${CAPTURE_HEIGHT}px`,
    "border:0",
    "z-index:-2147483647",
    "pointer-events:none",
    "background:#181743",
  ].join(";");
  const captureUrl = new URL(path, window.location.href);
  captureUrl.searchParams.set("exportMode", "offline");
  frame.src = `${captureUrl.pathname}${captureUrl.search}${captureUrl.hash}`;
  document.body.append(frame);
  return frame;
}

async function waitForFrameLoad(frame: HTMLIFrameElement, signal?: AbortSignal) {
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(`Timed out loading ${frame.src}.`)), PAGE_WAIT_TIMEOUT);
    const abort = () => reject(abortError());
    frame.addEventListener("load", () => {
      window.clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      resolve();
    }, { once: true });
    signal?.addEventListener("abort", abort, { once: true });
  });
}

async function revealRenderedPage(doc: Document, signal?: AbortSignal) {
  const win = doc.defaultView;
  if (!win) throw new Error("The rendered page window is unavailable.");
  const step = Math.max(540, Math.floor(win.innerHeight * 0.78));
  for (let pass = 0; pass < 2; pass += 1) {
    const height = doc.documentElement.scrollHeight;
    for (let top = 0; top < height; top += step) {
      assertNotAborted(signal);
      win.scrollTo({ top, left: 0, behavior: "auto" });
      await nextFrame(win);
    }
  }
  win.scrollTo({ top: 0, left: 0, behavior: "auto" });
  await doc.fonts?.ready;
  await Promise.race([
    Promise.all(Array.from(doc.images).map(async (image) => {
      if (!image.complete) {
        await new Promise<void>((resolve) => {
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => resolve(), { once: true });
        });
      }
      await image.decode?.().catch(() => undefined);
    })),
    new Promise<void>((resolve) => window.setTimeout(resolve, 15_000)),
  ]);
  await nextFrame(win);
}

async function waitForStableRoot(root: HTMLElement, signal?: AbortSignal) {
  let previousHeight = -1;
  let stableReadings = 0;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    assertNotAborted(signal);
    const height = root.getBoundingClientRect().height;
    stableReadings = height >= 100 && Math.abs(height - previousHeight) < 0.5 ? stableReadings + 1 : 0;
    previousHeight = height;
    if (stableReadings >= 3) return;
    await new Promise((resolve) => window.setTimeout(resolve, 100));
  }
  throw new Error("The rendered page did not reach a stable height.");
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)), { once: true });
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Unable to embed a rendered asset.")), { once: true });
    reader.readAsDataURL(blob);
  });
}

function isSkippableAsset(value: string) {
  const normalized = value.trim();
  return !normalized || normalized.startsWith("data:") || normalized.startsWith("#") || normalized === "none";
}

async function embedAsset(rawUrl: string, baseUrl: string, cache: AssetCache) {
  if (isSkippableAsset(rawUrl)) return rawUrl.trim();
  let resolved: string;
  try {
    resolved = rawUrl.startsWith("blob:") ? rawUrl : new URL(rawUrl, baseUrl).href;
  } catch {
    return rawUrl;
  }
  const cached = cache.get(resolved);
  if (cached) return cached;
  const task = (async () => {
    try {
      const response = await fetch(resolved);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await blobToDataUrl(await response.blob());
    } catch (error) {
      const target = new URL(resolved, baseUrl);
      if (target.origin === window.location.origin || resolved.startsWith("blob:")) {
        throw new Error(`Unable to package local asset "${target.pathname}": ${error instanceof Error ? error.message : String(error)}`);
      }
      return resolved;
    }
  })();
  cache.set(resolved, task);
  return task;
}

async function inlineCssUrls(css: string, baseUrl: string, cache: AssetCache) {
  const matches = Array.from(css.matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/g));
  let output = css;
  for (const match of matches) {
    const original = match[0];
    const rawUrl = match[2].trim();
    const embedded = await embedAsset(rawUrl, baseUrl, cache);
    output = output.replace(original, `url("${embedded.replaceAll('"', "%22")}")`);
  }
  return output;
}

async function collectRenderedStyles(doc: Document, cache: AssetCache) {
  const styles: string[] = [];
  for (const sheet of Array.from(doc.styleSheets)) {
    let css = "";
    const baseUrl = sheet.href || doc.baseURI;
    try {
      css = Array.from(sheet.cssRules).map((rule) => rule.cssText).join("\n");
    } catch {
      if (sheet.href) {
        const response = await fetch(sheet.href);
        if (!response.ok) throw new Error(`Unable to read stylesheet ${sheet.href}.`);
        css = await response.text();
      }
    }
    if (css.trim()) styles.push(await inlineCssUrls(css, baseUrl, cache));
  }
  return styles;
}

async function embedRenderedAssets(sourceRoot: HTMLElement, cloneRoot: HTMLElement, cache: AssetCache) {
  const sourceElements = [sourceRoot, ...Array.from(sourceRoot.querySelectorAll<HTMLElement>("*"))];
  const cloneElements = [cloneRoot, ...Array.from(cloneRoot.querySelectorAll<HTMLElement>("*"))];

  await Promise.all(sourceElements.map(async (source, index) => {
    const clone = cloneElements[index];
    if (!clone) return;
    if (source.tagName === "IMG" && clone.tagName === "IMG") {
      const sourceImage = source as HTMLImageElement;
      const cloneImage = clone as HTMLImageElement;
      const embedded = await embedAsset(sourceImage.currentSrc || sourceImage.src, source.ownerDocument.baseURI, cache);
      cloneImage.src = embedded;
      cloneImage.removeAttribute("srcset");
      cloneImage.loading = "eager";
      cloneImage.decoding = "sync";
    } else if (source.tagName === "VIDEO" && clone.tagName === "VIDEO") {
      const sourceVideo = source as HTMLVideoElement;
      const cloneVideo = clone as HTMLVideoElement;
      if (sourceVideo.currentSrc || sourceVideo.src) {
        cloneVideo.src = await embedAsset(sourceVideo.currentSrc || sourceVideo.src, source.ownerDocument.baseURI, cache);
      }
      if (sourceVideo.poster) cloneVideo.poster = await embedAsset(sourceVideo.poster, source.ownerDocument.baseURI, cache);
      cloneVideo.controls = true;
      cloneVideo.autoplay = false;
    } else if (source.tagName === "SOURCE" && clone.tagName === "SOURCE") {
      const sourceMedia = source as HTMLSourceElement;
      const cloneMedia = clone as HTMLSourceElement;
      if (sourceMedia.src) cloneMedia.src = await embedAsset(sourceMedia.src, source.ownerDocument.baseURI, cache);
      cloneMedia.removeAttribute("srcset");
    }

    const background = source.ownerDocument.defaultView?.getComputedStyle(source).backgroundImage ?? "";
    if (background.includes("url(")) clone.style.backgroundImage = await inlineCssUrls(background, source.ownerDocument.baseURI, cache);
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
      clone.remove();
    }
  });

  const sourceFrames = Array.from(sourceRoot.querySelectorAll("iframe"));
  const cloneFrames = Array.from(cloneRoot.querySelectorAll("iframe"));
  sourceFrames.forEach((source, index) => {
    const clone = cloneFrames[index];
    if (!clone) return;
    const link = document.createElement("a");
    link.href = source.src;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.className = `${clone.className} snapshot-external-embed`;
    link.textContent = source.ownerDocument.documentElement.lang === "zh" ? "打开外部内容" : "Open external content";
    link.style.minHeight = `${Math.max(180, Math.round(source.getBoundingClientRect().height))}px`;
    clone.replaceWith(link);
  });
}

function cleanCapturedDom(cloneRoot: HTMLElement) {
  cloneRoot.querySelectorAll([
    "script",
    "vite-error-overlay",
    "[data-owner-editor-dock]",
    "[data-production-export-dock]",
    "[data-project-cover-editor]",
    "[data-project-print-control]",
    "[data-project-exact-export-control]",
    "[data-project-back-to-top]",
    "[data-project-bottom-navigation]",
    "[data-work-management-actions]",
    "[data-work-order-editor]",
    "[data-game-experience-editor-actions]",
    "[data-game-owner-toolbar]",
    ".editor-action",
    ".editor-icon",
    ".project-entry-loading",
  ].join(",")).forEach((element) => element.remove());
  cloneRoot.querySelectorAll("details").forEach((details) => { details.open = false; });
  cloneRoot.querySelectorAll<HTMLElement>("[data-project-route-shell] > main").forEach((main) => {
    main.style.opacity = "1";
    main.style.transform = "none";
  });
  cloneRoot.querySelectorAll<HTMLButtonElement>("button.fixed").forEach((button) => {
    if (button.className.includes("top-[84px]") && button.className.includes("z-[80]")) button.remove();
  });
}

function commitCapturedEntranceAnimations(cloneRoot: HTMLElement) {
  cloneRoot.querySelectorAll<HTMLElement>('[style*="opacity: 0"]').forEach((element) => {
    const transform = element.style.transform;
    if (!/translate(?:3d|X|Y)?\(/i.test(transform)) return;
    element.style.opacity = "1";
    element.style.transform = "none";
  });
}

// Second line of defense, independent of the data-project-content-ready
// wait above: a structural check on the actual captured clone, run once,
// synchronously - never a timing/poll-based check. cleanCapturedDom has
// already stripped every editor-only chrome element by this point
// ([data-owner-editor-dock], [data-project-back-to-top], etc.), so what's
// left under the route shell is either real project content or genuinely
// nothing - there is no third case. An empty shell must never silently
// become a "successful" captured page just because the route existed.
function assertProjectContentCaptured(cloneRoot: HTMLElement, title: string) {
  const shell = cloneRoot.querySelector<HTMLElement>("[data-project-route-shell]");
  if (!shell) throw new Error(`Captured project page for "${title}" has no route shell.`);
  const contentReady = shell.getAttribute("data-project-content-ready") === "true";
  const hasMeaningfulContent = (shell.textContent ?? "").trim().length > 40;
  if (!contentReady || !hasMeaningfulContent) {
    throw new Error(`Captured project page for "${title}" has no committed content (empty shell) - export stopped rather than saving a blank page.`);
  }
}

function normalizedPath(value: string, baseUrl: string) {
  return new URL(value, baseUrl).pathname.replace(/\/$/, "") || "/";
}

function selectedProjectPath(project: ResolvedProjectMetadata, locale: Locale) {
  return normalizedPath(localizePath(project.route ?? `/work/${project.slug}`, locale), window.location.href);
}

async function captureActiveHomepageSlides(
  doc: Document,
  selectedProjects: ResolvedProjectMetadata[],
  signal?: AbortSignal,
) {
  const rail = doc.querySelector<HTMLElement>("[data-featured-project-group]");
  if (!rail) throw new Error("The rendered homepage project rail was not found.");
  const slideByProjectId = new Map<string, HTMLElement>();
  rail.querySelectorAll<HTMLElement>("[data-carousel-index]").forEach((slide) => {
    const card = slide.querySelector<HTMLElement>("[data-featured-work-card][data-project-id]");
    const projectId = card?.dataset.projectId;
    if (projectId && !slideByProjectId.has(projectId)) slideByProjectId.set(projectId, slide);
  });

  const snapshots = new Map<string, HTMLElement>();
  for (const project of selectedProjects) {
    assertNotAborted(signal);
    const slide = slideByProjectId.get(project.id);
    if (!slide) throw new Error(`Selected project "${project.title}" has no existing rendered homepage card. Export stopped.`);
    const link = slide.querySelector<HTMLAnchorElement>("[data-featured-work-card] a[href]");
    if (!link) throw new Error(`The rendered homepage card for "${project.title}" has no project link.`);
    link.focus({ preventScroll: true });
    await waitFor(
      () => Boolean(slide.querySelector("[data-featured-work-details]")),
      `The rendered homepage card details for "${project.title}" did not appear.`,
      signal,
      3_000,
    );
    await new Promise((resolve) => window.setTimeout(resolve, 360));
    await nextFrame(doc.defaultView ?? window);
    const snapshot = slide.cloneNode(true) as HTMLElement;
    const card = snapshot.querySelector<HTMLElement>("[data-featured-work-card]");
    if (card) {
      card.style.opacity = "1";
      card.style.transform = "none";
    }
    snapshot.querySelectorAll<HTMLElement>("[data-featured-work-details]").forEach((details) => {
      details.style.height = "auto";
      details.style.opacity = "1";
    });
    snapshot.querySelectorAll("[data-featured-work-glow-cover-match]").forEach((glow) => glow.remove());
    snapshots.set(project.id, snapshot);
  }
  return snapshots;
}

function filterHomepageCards(
  cloneRoot: HTMLElement,
  selectedProjects: ResolvedProjectMetadata[],
  includeCover: boolean,
  includeGameExperience: boolean,
  activeSlides?: Map<string, HTMLElement>,
  preserveAllSections = false,
) {
  const rail = cloneRoot.querySelector<HTMLElement>("[data-featured-project-group]");
  if (!rail) throw new Error("The rendered homepage project rail was not found.");
  const featuredSection = rail.closest("section");
  // The real, live cover/hero (HomePortfolioCover.tsx, [data-home-portfolio-cover])
  // and the real, live Game Experience section (HomePage.tsx, #home-play-experience,
  // wrapping <HomePlayExperience/>) are both <section> siblings of the
  // featured-project rail on the actual homepage. Each is retained here
  // verbatim - never a separate synthesized copy - only when its matching
  // Collection Outline toggle (Cover / Game Experience) is selected; any
  // other homepage section stays removed regardless.
  const coverSection = includeCover ? cloneRoot.querySelector<HTMLElement>("[data-home-portfolio-cover]") : null;
  const gameExperienceSection = includeGameExperience ? cloneRoot.querySelector<HTMLElement>("#home-play-experience") : null;
  if (!preserveAllSections && featuredSection?.parentElement) {
    Array.from(featuredSection.parentElement.children).forEach((sibling) => {
      if (sibling.tagName === "SECTION" && sibling !== featuredSection && sibling !== coverSection && sibling !== gameExperienceSection) sibling.remove();
    });
  }
  const slides = Array.from(rail.querySelectorAll<HTMLElement>("[data-carousel-index]"));
  const slideByProjectId = new Map<string, HTMLElement>();
  slides.forEach((slide) => {
    const card = slide.querySelector<HTMLElement>("[data-featured-work-card][data-project-id]");
    const projectId = card?.dataset.projectId;
    if (projectId && !slideByProjectId.has(projectId)) slideByProjectId.set(projectId, slide);
  });

  const selectedSlides = selectedProjects.map((project) => {
    const slide = activeSlides?.get(project.id) ?? slideByProjectId.get(project.id);
    if (!slide) throw new Error(`Selected project "${project.title}" has no existing rendered homepage card. Export stopped.`);
    return slide;
  });
  rail.replaceChildren(...selectedSlides);
  rail.dataset.featuredProjectGroup = selectedProjects.map((project) => project.id).join("-");
  selectedSlides.forEach((slide, index) => {
    slide.dataset.carouselIndex = String(index);
    slide.dataset.logicalIndex = String(index);
  });

  const counter = cloneRoot.querySelector<HTMLElement>('[aria-live="polite"][aria-atomic="true"]');
  const counterParts = counter ? Array.from(counter.querySelectorAll("span")) : [];
  if (counterParts[0]) counterParts[0].textContent = selectedSlides.length ? "01" : "00";
  if (counterParts.at(-1)) counterParts.at(-1)!.textContent = String(selectedSlides.length).padStart(2, "0");

  // The live homepage's own carousel-arrow visibility (HomePage.tsx) is
  // computed from the full site-wide catalog, not from the subset of
  // projects actually kept in this export - once the rail above is cut down
  // to selectedSlides, the arrows captured from the live page can be stale
  // (visible even though the exported rail now fits on one page). Only ever
  // remove them here; if the export genuinely needs more than one page, the
  // live catalog must already have needed it too, so the arrows are already
  // present and correct.
  if (selectedSlides.length <= VISIBLE_COUNT) {
    const navGrid = cloneRoot.querySelector<HTMLElement>("[data-carousel-nav-grid]");
    if (navGrid) navGrid.removeAttribute("class");
    cloneRoot.querySelectorAll("[data-carousel-nav]").forEach((el) => el.remove());
  }
}

function rewriteNavigation(
  cloneRoot: HTMLElement,
  selectedProjects: ResolvedProjectMetadata[],
  locale: Locale,
  baseUrl: string,
  includeGameExperience: boolean,
  includeWorkPage = false,
  includePlayPage = false,
) {
  const projectByPath = new Map(selectedProjects.map((project) => [selectedProjectPath(project, locale), project.id]));
  const homePath = normalizedPath(localizePath("/", locale), baseUrl);
  const workPath = normalizedPath(localizePath("/work", locale), baseUrl);
  const playPath = normalizedPath(localizePath("/play", locale), baseUrl);
  cloneRoot.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((anchor) => {
    const raw = anchor.getAttribute("href") ?? "";
    if (raw.startsWith("mailto:") || raw.startsWith("tel:")) return;
    let url: URL;
    try { url = new URL(anchor.href, baseUrl); } catch { return; }
    if (url.origin !== window.location.origin) {
      anchor.href = url.href;
      anchor.target = "_blank";
      anchor.rel = "noreferrer";
      return;
    }
    const path = normalizedPath(url.pathname, baseUrl);
    if (path === homePath && url.hash && cloneRoot.querySelector(url.hash)) {
      anchor.href = url.hash;
      anchor.removeAttribute("target");
      delete anchor.dataset.staticTarget;
      return;
    }
    // The site header's PLAY nav item (Shell.tsx) and HomePlayExperience's
    // own "View full game log" link both point at the live /play route,
    // which this export never captures as its own page - Collection Game
    // Experience selection is the sole authority on what happens to them:
    // point at the retained in-page #home-play-experience section, or be
    // removed outright (never left as a disabled/dead link).
    if (path === playPath) {
      if (includePlayPage) {
        anchor.href = "#play";
        anchor.dataset.staticTarget = "play";
      } else if (includeGameExperience) {
        anchor.href = "#home-play-experience";
        anchor.removeAttribute("target");
        delete anchor.dataset.staticTarget;
      } else {
        anchor.remove();
      }
      return;
    }
    if (path === workPath && includeWorkPage) {
      anchor.href = "#work";
      anchor.dataset.staticTarget = "work";
      anchor.removeAttribute("target");
      return;
    }
    const projectId = projectByPath.get(path);
    if (projectId) {
      anchor.href = `#project:${projectId}`;
      anchor.dataset.staticTarget = `project:${projectId}`;
    } else {
      anchor.href = "#home";
      anchor.dataset.staticTarget = "home";
      if (path !== homePath && path !== workPath) anchor.setAttribute("aria-disabled", "true");
    }
    anchor.removeAttribute("target");
  });
}

async function capturePage(
  path: string,
  pageId: string,
  title: string,
  selectedProjects: ResolvedProjectMetadata[],
  includeCover: boolean,
  includeGameExperience: boolean,
  locale: Locale,
  cache: AssetCache,
  signal?: AbortSignal,
  pageKind: "home" | "project" | "work" | "play" = pageId === "home" ? "home" : "project",
  preserveAllHomepageSections = false,
) {
  const frame = createCaptureFrame(path);
  try {
    await waitForFrameLoad(frame, signal);
    const doc = frame.contentDocument;
    if (!doc) throw new Error(`Unable to inspect rendered page ${path}.`);
    const isHome = pageKind === "home";
    await waitFor(
      () => pageKind === "home"
        ? Boolean(doc.querySelector("[data-featured-project-group]"))
        : pageKind === "work"
          ? Boolean(doc.querySelector(".project-archive-row"))
          : pageKind === "play"
            ? Boolean(doc.querySelector("main article"))
            : Boolean(doc.querySelector(`[data-project-route-shell][data-project-id="${CSS.escape(pageId.replace(/^project:/, ""))}"]`)),
      `The rendered content for "${title}" did not appear.`,
      signal,
    );
    if (pageKind === "project") {
      // data-disk-read-complete only means the project JSON fetch finished -
      // NOT that the content it feeds has actually mounted. Several
      // ProjectPageContent branches (ProjectPage.tsx) render through
      // lazy()/Suspense with fallback={null}: the route shell can exist with
      // disk-read-complete already true while the real content is still an
      // in-flight import(), especially on a cold dev-server module-transform
      // cache (a fresh `pnpm dev` process, or the first time this specific
      // project's chunk is ever requested in that process's lifetime).
      // data-project-content-ready is the real signal - it only becomes
      // "true" once ProjectContentReadySignal has actually committed
      // alongside the real content in every branch, including inside each
      // Suspense boundary. Never wait on disk-read-complete, elapsed time,
      // or stable height alone as a proxy for this. See the permanent rule
      // in skills/static-html-export/SKILL.md.
      await waitFor(
        () => doc.querySelector("[data-project-route-shell]")?.getAttribute("data-project-content-ready") === "true",
        `The project content for "${title}" did not commit (Suspense/lazy content never mounted).`,
        signal,
      );
    }
    const root = doc.getElementById("root");
    if (!root) throw new Error(`The rendered root for "${title}" was not found.`);
    await revealRenderedPage(doc, signal);
    await waitForStableRoot(root, signal);

    if (pageKind === "play") {
      const collapsedDetails = Array.from(doc.querySelectorAll<HTMLButtonElement>('button[aria-controls^="game-experience-details-"][aria-expanded="false"]'));
      collapsedDetails.forEach((button) => button.click());
      if (collapsedDetails.length) {
        await waitFor(
          () => Array.from(doc.querySelectorAll<HTMLButtonElement>('button[aria-controls^="game-experience-details-"]'))
            .every((button) => button.getAttribute("aria-expanded") === "true"),
          "The complete Game Experience details did not expand.",
          signal,
        );
        await nextFrame(doc.defaultView ?? window);
        await waitForStableRoot(root, signal);
      }
    }

    const activeHomepageSlides = isHome
      ? await captureActiveHomepageSlides(doc, selectedProjects, signal)
      : undefined;
    const cloneRoot = root.cloneNode(true) as HTMLElement;
    cleanCapturedDom(cloneRoot);
    commitCapturedEntranceAnimations(cloneRoot);
    if (pageKind === "project") assertProjectContentCaptured(cloneRoot, title);
    if (pageKind === "work") {
      const archiveRows = Array.from(cloneRoot.querySelectorAll<HTMLElement>(".project-archive-row"));
      selectedProjects.forEach((project, index) => {
        archiveRows[index]?.setAttribute("data-public-project-id", project.id);
      });
    }
    if (isHome) filterHomepageCards(cloneRoot, selectedProjects, includeCover, includeGameExperience, activeHomepageSlides, preserveAllHomepageSections);
    rewriteNavigation(
      cloneRoot,
      selectedProjects,
      locale,
      doc.baseURI,
      includeGameExperience,
      preserveAllHomepageSections,
      preserveAllHomepageSections,
    );
    // Asset discovery must happen against the final retained DOM. Using a
    // same-document clone preserves URL resolution while ensuring removed
    // cards, hidden routes, and editor-only nodes can never enter the cache.
    const finalizedAssetSource = cloneRoot.cloneNode(true) as HTMLElement;
    await embedRenderedAssets(finalizedAssetSource, cloneRoot, cache);
    const styles = await collectRenderedStyles(doc, cache);
    return {
      id: pageId,
      title,
      rootHtml: cloneRoot.innerHTML,
      styles,
      bodyClassName: doc.body.className,
      htmlClassName: doc.documentElement.className,
      htmlStyle: doc.documentElement.style.cssText,
    } satisfies CapturedPage;
  } finally {
    frame.remove();
  }
}

function staticNavigationScript() {
  return `<script>
    (() => {
      const pages = Array.from(document.querySelectorAll('[data-static-page]'));
      const pageById = new Map(pages.map((page) => [page.dataset.staticPage, page]));
      const show = (id) => {
        pages.forEach((page) => { page.hidden = page.dataset.staticPage !== id; });
        const active = pageById.get(id);
        document.title = active?.dataset.pageTitle || document.title;
        scrollTo({ top: 0, left: 0, behavior: 'auto' });
      };
      // The hash is either a recognized page id (home / project:xyz) or, for
      // in-page targets like the PLAY nav link, a real element id within the
      // home page (e.g. #home-play-experience) - which only exists in the
      // exported HTML when Game Experience was selected. Anything else falls
      // back to home, matching the previous behavior.
      const showForHash = () => {
        const value = decodeURIComponent(location.hash.slice(1));
        if (pageById.has(value)) { show(value); return; }
        if (value && document.getElementById(value)) {
          show('home');
          requestAnimationFrame(() => { document.getElementById(value)?.scrollIntoView({ behavior: 'auto', block: 'start' }); });
          return;
        }
        show('home');
      };
      const navigate = (target) => {
        if (!pageById.has(target)) return;
        const nextHash = '#' + encodeURIComponent(target);
        if (location.hash !== nextHash) history.pushState(null, '', nextHash);
        show(target);
      };
      document.addEventListener('click', (event) => {
        const origin = event.target instanceof Element ? event.target : event.target?.parentElement;
        const link = origin?.closest?.('[data-static-target]');
        if (!link) return;
        event.preventDefault();
        const target = link.dataset.staticTarget || 'home';
        navigate(target);
      });
      addEventListener('hashchange', showForHash);
      addEventListener('popstate', showForHash);
      document.querySelectorAll('[data-static-page="home"]').forEach((home) => {
        const rail = home.querySelector('[data-featured-project-group]');
        if (!rail) return;
        home.querySelectorAll('button[aria-label]').forEach((button) => {
          const label = button.getAttribute('aria-label') || '';
          if (!/上一|下一|Previous|Next/i.test(label)) return;
          button.addEventListener('click', () => rail.scrollBy({ left: /上一|Previous/i.test(label) ? -rail.clientWidth : rail.clientWidth, behavior: 'smooth' }));
        });
      });
      showForHash();
    })();
  </script>`;
}

function buildStaticHtml(pages: CapturedPage[], locale: Locale) {
  const allStyles = [...new Set(pages.flatMap((page) => page.styles))].join("\n");
  const home = pages[0];
  const pageMarkup = pages.map((page, index) => (
    `<section data-static-page="${page.id}" data-page-title="${page.title.replaceAll('"', "&quot;")}"${index ? " hidden" : ""}>${page.rootHtml}</section>`
  )).join("\n");
  const snapshotCss = `
    [data-static-page][hidden] { display: none !important; }
    [data-static-page] { min-height: 100vh; }
    [data-static-page] main { opacity: 1 !important; transform: none !important; }
    .project-entry-content { opacity: 1 !important; transform: none !important; }
    .snapshot-external-embed { display: grid; width: 100%; place-items: center; border: 1px solid rgba(133,165,255,.28); border-radius: 10px; background: rgba(21,31,91,.5); color: #34f025; font: 700 12px/1.4 ui-monospace, monospace; text-decoration: none; }
    [data-static-page] *, [data-static-page] *::before, [data-static-page] *::after { animation-play-state: paused !important; }
  `;
  return `<!doctype html><html lang="${locale}" class="${home.htmlClassName}" style="${home.htmlStyle}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${home.title}</title><style>${allStyles}\n${snapshotCss}</style></head><body class="${home.bodyClassName}"><div id="root">${pageMarkup}</div>${staticNavigationScript()}</body></html>`;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: "image/webp" | "image/png", quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Unable to compress an embedded image.")), type, quality);
  });
}

type EmbeddedImageProfile = {
  screenshotQuality: number;
  photoQuality: number;
};

type EmbeddedImageStat = {
  sourceBytes: number;
  outputBytes: number;
  width: number;
  height: number;
  mimeType: string;
};

function canvasHasTransparency(context: CanvasRenderingContext2D, width: number, height: number) {
  const pixels = context.getImageData(0, 0, width, height).data;
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] < 255) return true;
  }
  return false;
}

async function optimizeEmbeddedImage(
  dataUrl: string,
  profile: EmbeddedImageProfile,
  preserveTransparency: boolean,
): Promise<{ dataUrl: string; stat: EmbeddedImageStat }> {
  const source = await (await fetch(dataUrl)).blob();
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(source);
    const scale = Math.min(
      1,
      MAX_EMBEDDED_IMAGE_WIDTH / bitmap.width,
      MAX_EMBEDDED_IMAGE_HEIGHT / bitmap.height,
    );
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("Unable to create an image compression canvas.");
    context.drawImage(bitmap, 0, 0, width, height);
    // PNGs in this portfolio are overwhelmingly UI screenshots/diagrams, so
    // retain more text detail than photographic JPEG/WebP sources.
    const quality = source.type === "image/png" ? profile.screenshotQuality : profile.photoQuality;
    const keepLosslessAlpha = preserveTransparency
      && source.type === "image/png"
      && canvasHasTransparency(context, width, height);
    const optimized = await canvasToBlob(canvas, keepLosslessAlpha ? "image/png" : "image/webp", keepLosslessAlpha ? undefined : quality);
    const output = scale === 1 && optimized.size >= source.size ? source : optimized;
    return {
      dataUrl: output === source ? dataUrl : await blobToDataUrl(output),
      stat: {
        sourceBytes: source.size,
        outputBytes: output.size,
        width,
        height,
        mimeType: output.type || source.type || "image/unknown",
      },
    };
  } catch {
    return {
      dataUrl,
      stat: {
        sourceBytes: source.size,
        outputBytes: source.size,
        width: bitmap?.width ?? 0,
        height: bitmap?.height ?? 0,
        mimeType: source.type || "image/unknown",
      },
    };
  } finally {
    bitmap?.close();
  }
}

function staticAssetHydrationMarkup(assets: Record<string, string>) {
  const payload = JSON.stringify(assets);
  return `<script type="application/json" id="static-asset-store">${payload}</script><script>
    (() => {
      const store = document.getElementById('static-asset-store');
      if (!store) return;
      const assets = JSON.parse(store.textContent || '{}');
      const resolve = (value) => value && value.startsWith('static-asset:') ? assets[value.slice(13)] || value : value;
      document.querySelectorAll('*').forEach((element) => {
        ['src', 'poster', 'href', 'xlink:href'].forEach((name) => {
          const value = element.getAttribute(name);
          const next = resolve(value);
          if (next && next !== value) element.setAttribute(name, next);
        });
        const style = element.getAttribute('style');
        if (style && style.includes('static-asset:')) {
          element.setAttribute('style', style.replace(/static-asset:([a-z0-9-]+)/g, (_, id) => assets[id] || ''));
        }
      });
      store.remove();
    })();
  </script>`;
}

async function packageEmbeddedImages(html: string, profile: EmbeddedImageProfile, preserveTransparency: boolean) {
  const dataUrlPattern = /data:image\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=]+/g;
  const sourceUrls = [...new Set(html.match(dataUrlPattern) ?? [])];
  const sourceToId = new Map<string, string>();
  const optimizedToId = new Map<string, string>();
  const assets: Record<string, string> = {};
  const imageStats: EmbeddedImageStat[] = [];
  for (const sourceUrl of sourceUrls) {
    const optimized = await optimizeEmbeddedImage(sourceUrl, profile, preserveTransparency);
    imageStats.push(optimized.stat);
    let id = optimizedToId.get(optimized.dataUrl);
    if (!id) {
      id = `asset-${optimizedToId.size + 1}`;
      optimizedToId.set(optimized.dataUrl, id);
      assets[id] = optimized.dataUrl;
    }
    sourceToId.set(sourceUrl, id);
  }
  const body = html.replace(dataUrlPattern, (sourceUrl) => `static-asset:${sourceToId.get(sourceUrl)}`);
  return {
    html: body.replace("</body>", `${staticAssetHydrationMarkup(assets)}</body>`),
    embeddedImageCount: Object.keys(assets).length,
    duplicateEmbeddedPayloads: sourceUrls.length - Object.keys(assets).length,
    imageStats,
  };
}

function formatLargestRequiredAssets(stats: EmbeddedImageStat[]) {
  return [...stats]
    .sort((left, right) => right.outputBytes - left.outputBytes)
    .slice(0, 8)
    .map((stat, index) => `${index + 1}. ${stat.mimeType} ${stat.width}x${stat.height}, ${(stat.outputBytes / 1024 / 1024).toFixed(1)} MB`)
    .join("; ");
}

async function optimizeStandaloneHtml(html: string, mode: StaticHtmlExportMode) {
  const complete = mode === "complete-offline";
  const profiles: readonly EmbeddedImageProfile[] = complete ? COMPLETE_EMBEDDED_IMAGE_PROFILES : EMBEDDED_IMAGE_PROFILES;
  const maxBytes = complete ? MAX_COMPLETE_STANDALONE_HTML_BYTES : MAX_STANDALONE_HTML_BYTES;
  let packaged: Awaited<ReturnType<typeof packageEmbeddedImages>> | undefined;
  for (const profile of profiles) {
    packaged = await packageEmbeddedImages(html, profile, complete);
    if (new Blob([packaged.html]).size <= maxBytes) return packaged;
  }
  if (complete && packaged) {
    const bytes = new Blob([packaged.html]).size;
    throw new Error(`完整压缩 HTML 为 ${(bytes / 1024 / 1024).toFixed(1)} MB，超过 300 MB，已阻止下载。最大必需图片：${formatLargestRequiredAssets(packaged.imageStats)}`);
  }
  throw new Error("The standalone HTML remains above 10 MB after export-only image optimization.");
}

function assertSameProjectIds(selectedProjectIds: string[], exportedProjectIds: string[], context: string) {
  if (selectedProjectIds.length === exportedProjectIds.length
    && selectedProjectIds.every((id, index) => id === exportedProjectIds[index])) return;
  throw new Error(`${context} project mismatch. Selected: ${selectedProjectIds.join(", ")}. Exported: ${exportedProjectIds.join(", ")}.`);
}

function validateStaticExportScope(
  pages: CapturedPage[],
  allProjects: ResolvedProjectMetadata[],
  selectedProjectIds: string[],
  includeCover: boolean,
  includeGameExperience: boolean,
  html: string,
  imageStats: { embeddedImageCount: number; duplicateEmbeddedPayloads: number },
): StaticHtmlExportValidation {
  const exportedProjectIds = pages
    .filter((page) => page.id.startsWith("project:"))
    .map((page) => page.id.replace(/^project:/, ""));
  assertSameProjectIds(selectedProjectIds, exportedProjectIds, "Captured page");

  const homepage = new DOMParser().parseFromString(pages[0]?.rootHtml ?? "", "text/html");
  const homepageProjectIds = Array.from(homepage.querySelectorAll<HTMLElement>("[data-featured-work-card][data-project-id]"))
    .map((card) => card.dataset.projectId ?? "");
  assertSameProjectIds(selectedProjectIds, homepageProjectIds, "Homepage card");

  // Selected sections in Collection === sections and corresponding
  // navigation entries present in the Static HTML export - no
  // fallback/default may silently replace an explicit Cover or Game
  // Experience selection in either direction.
  const coverIncluded = Boolean(homepage.querySelector("[data-home-portfolio-cover]"));
  if (coverIncluded !== includeCover) {
    throw new Error(includeCover
      ? "Cover was selected but is missing from the exported homepage."
      : "Cover was not selected but is present in the exported homepage.");
  }
  const gameExperienceIncluded = Boolean(homepage.querySelector("#home-play-experience"));
  if (gameExperienceIncluded !== includeGameExperience) {
    throw new Error(includeGameExperience
      ? "Game Experience was selected but is missing from the exported homepage."
      : "Game Experience was not selected but is present in the exported homepage.");
  }
  const playNavPresent = pages.some((page) => new DOMParser().parseFromString(page.rootHtml, "text/html")
    .querySelector('a[href="#home-play-experience"]'));
  if (playNavPresent !== includeGameExperience) {
    throw new Error(includeGameExperience
      ? "Game Experience was selected but the PLAY navigation entry is missing."
      : "Game Experience was not selected but a PLAY navigation entry is still present.");
  }

  const unselectedProjectAssetsIncluded = allProjects
    .map((project) => project.id)
    .filter((id) => !selectedProjectIds.includes(id))
    .filter((id) => html.includes(`/template-images/${id}/`)
      || html.includes(`/template-images-${id}/`)
      || html.includes(`/covers/${id}.`)
      || html.includes(`/project-images/${id}/`)
      || html.includes(`/playable-game-covers/${id}/`));
  const uiPracticeIncludedWithoutSelection = !selectedProjectIds.includes(UI_PRACTICE_PROJECT_ID)
    && (homepageProjectIds.includes(UI_PRACTICE_PROJECT_ID)
      || exportedProjectIds.includes(UI_PRACTICE_PROJECT_ID)
      || html.includes("/ui-personal-practice/"));

  if (unselectedProjectAssetsIncluded.length) {
    throw new Error(`Unselected project assets were packaged: ${unselectedProjectAssetsIncluded.join(", ")}.`);
  }
  if (uiPracticeIncludedWithoutSelection) throw new Error("UI Practice was packaged without being selected.");

  return {
    selectedProjectIds,
    exportedProjectIds,
    selectedProjectCount: selectedProjectIds.length,
    exportedProjectCount: exportedProjectIds.length,
    coverIncluded,
    gameExperienceIncluded,
    unselectedProjectAssetsIncluded,
    uiPracticeIncludedWithoutSelection,
    duplicateEmbeddedPayloads: imageStats.duplicateEmbeddedPayloads,
    embeddedImageCount: imageStats.embeddedImageCount,
  };
}

function validateCompleteOfflineScope(
  pages: CapturedPage[],
  publicProjects: ResolvedProjectMetadata[],
  openableProjects: ResolvedProjectMetadata[],
  optimizedHtml: string,
  imageStats: { embeddedImageCount: number; duplicateEmbeddedPayloads: number },
): StaticHtmlExportValidation {
  const exportedProjectIds = pages
    .filter((page) => page.id.startsWith("project:"))
    .map((page) => page.id.replace(/^project:/, ""));
  const openableProjectIds = openableProjects.map((project) => project.id);
  assertSameProjectIds(openableProjectIds, exportedProjectIds, "Complete offline project page");

  const homePage = pages.find((page) => page.id === "home");
  const workPage = pages.find((page) => page.id === "work");
  const playPage = pages.find((page) => page.id === "play");
  if (!homePage || !workPage || !playPage) throw new Error("The complete offline export is missing Home, Work, or PLAY.");

  const homepage = new DOMParser().parseFromString(homePage.rootHtml, "text/html");
  if (!homepage.querySelector("[data-home-portfolio-cover]")) throw new Error("The complete offline homepage cover is missing.");
  if (!homepage.querySelector("[data-featured-project-group]")) throw new Error("The complete offline homepage project overview is missing.");
  const manifesto = homepage.querySelector<HTMLElement>("#home-play-experience > p");
  const homepagePlay = homepage.querySelector<HTMLElement>("#home-play-experience");
  if (!manifesto || !homepagePlay) throw new Error("The complete offline homepage manifesto/PLAY section is missing.");
  if (manifesto.style.opacity === "0" || manifesto.closest<HTMLElement>('[style*="opacity: 0"]')) {
    throw new Error("The complete offline homepage manifesto remains visually hidden after capture.");
  }

  const work = new DOMParser().parseFromString(workPage.rootHtml, "text/html");
  const overviewProjectIds = Array.from(work.querySelectorAll<HTMLElement>("[data-public-project-id]"))
    .map((row) => row.dataset.publicProjectId ?? "");
  assertSameProjectIds(publicProjects.map((project) => project.id), overviewProjectIds, "Complete offline Work overview");

  const play = new DOMParser().parseFromString(playPage.rootHtml, "text/html");
  const gameRows = Array.from(play.querySelectorAll("main article"));
  if (!gameRows.length) throw new Error("The complete offline PLAY page contains no public Game Experience records.");
  const gamesWithoutCovers = gameRows.filter((row) => !row.querySelector("img[src]"));
  if (gamesWithoutCovers.length) throw new Error(`${gamesWithoutCovers.length} public Game Experience record(s) have no captured cover.`);
  const hiddenGames = gameRows.filter((row) => (row as HTMLElement).style.opacity === "0"
    || row.closest<HTMLElement>('[style*="opacity: 0"]'));
  if (hiddenGames.length) throw new Error(`${hiddenGames.length} public Game Experience record(s) remain visually hidden after capture.`);

  const editorSelector = "[data-owner-editor-dock],[data-production-export-dock],[data-work-management-actions],[data-work-order-editor],[data-game-experience-editor-actions],[data-game-owner-toolbar],.editor-action,.editor-icon";
  if (pages.some((page) => new DOMParser().parseFromString(page.rootHtml, "text/html").querySelector(editorSelector))) {
    throw new Error("Owner/editor-only controls remain in the complete offline export.");
  }

  const localDependencies = [
    /(?:src|href|poster)=["']blob:/i,
    /(?:src|href|poster)=["']file:/i,
    /(?:src|href|poster)=["']https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/i,
    /(?:src|href|poster)=["']\/(?!\/|#)/i,
  ];
  if (localDependencies.some((pattern) => pattern.test(optimizedHtml))) {
    throw new Error("The complete offline HTML still contains a local or development-only asset dependency.");
  }

  return {
    selectedProjectIds: openableProjectIds,
    exportedProjectIds,
    selectedProjectCount: openableProjectIds.length,
    exportedProjectCount: exportedProjectIds.length,
    coverIncluded: true,
    gameExperienceIncluded: true,
    unselectedProjectAssetsIncluded: [],
    uiPracticeIncludedWithoutSelection: false,
    duplicateEmbeddedPayloads: imageStats.duplicateEmbeddedPayloads,
    embeddedImageCount: imageStats.embeddedImageCount,
  };
}

function deliverHtml(html: string, filename: string, delivery: StaticHtmlDelivery) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  if (delivery === "return") return blob.size;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return blob.size;
}

export async function runPortfolioStaticHtmlExport(
  projects: ResolvedProjectMetadata[],
  locale: Locale,
  projectIds: string[],
  includeCover: boolean,
  includeGameExperience: boolean,
  onProgress?: (progress: StaticHtmlExportProgress) => void,
  signal?: AbortSignal,
  mode: StaticHtmlExportMode = "standard",
  delivery: StaticHtmlDelivery = "download",
): Promise<StaticHtmlExportResult> {
  const byId = new Map(projects.map((project) => [project.id, project]));
  if (new Set(projectIds).size !== projectIds.length) throw new Error("The selected project list contains duplicate project IDs.");
  const selectedProjects = projectIds.map((id) => byId.get(id)).filter((project): project is ResolvedProjectMetadata => Boolean(project));
  if (selectedProjects.length !== projectIds.length) {
    const missing = projectIds.filter((id) => !byId.has(id));
    throw new Error(`Selected project metadata is unavailable: ${missing.join(", ")}.`);
  }
  if (!selectedProjects.length) throw new Error("Enable at least one project first.");

  const total = selectedProjects.length + 1;
  const cache: AssetCache = new Map();
  const pages: CapturedPage[] = [];
  try {
    onProgress?.({ phase: "capturing", completed: 0, total, currentLabel: locale === "zh" ? "首页" : "Homepage" });
    pages.push(await capturePage(localizePath("/", locale), "home", document.title || "Portfolio", selectedProjects, includeCover, includeGameExperience, locale, cache, signal));
    for (let index = 0; index < selectedProjects.length; index += 1) {
      assertNotAborted(signal);
      const project = selectedProjects[index];
      onProgress?.({ phase: "capturing", completed: index + 1, total, currentLabel: project.title });
      pages.push(await capturePage(
        localizePath(project.route ?? `/work/${project.slug}`, locale),
        `project:${project.id}`,
        project.title,
        selectedProjects,
        includeCover,
        includeGameExperience,
        locale,
        cache,
        signal,
      ));
    }
    assertNotAborted(signal);
    onProgress?.({ phase: "packaging", completed: total, total });
    const selectedProjectIds = selectedProjects.map((project) => project.id);
    const builtHtml = buildStaticHtml(pages, locale);
    const optimized = await optimizeStandaloneHtml(builtHtml, mode);
    const validation = validateStaticExportScope(pages, projects, selectedProjectIds, includeCover, includeGameExperience, builtHtml, optimized);
    const prefix = mode === "complete-offline" ? "portfolio-complete-offline" : "portfolio-static";
    const filename = `${prefix}-${locale}-${new Date().toISOString().replace(/[:.]/g, "-")}.html`;
    const bytes = deliverHtml(optimized.html, filename, delivery);
    onProgress?.({ phase: "done", completed: total, total });
    return { filename, bytes, html: delivery === "return" ? optimized.html : undefined, projectIds: selectedProjectIds, validation };
  } finally {
    document.querySelectorAll<HTMLIFrameElement>('iframe[aria-hidden="true"][src^="/"]').forEach((frame) => {
      if (frame.style.zIndex === "-2147483647") frame.remove();
    });
  }
}

export async function runPortfolioCompleteOfflineHtmlExport(
  projects: ResolvedProjectMetadata[],
  locale: Locale,
  onProgress?: (progress: StaticHtmlExportProgress) => void,
  signal?: AbortSignal,
  delivery: StaticHtmlDelivery = "download",
): Promise<StaticHtmlExportResult> {
  const publicProjects = projects
    .filter((project) => project.group === "work" && project.visibility === "public")
    .sort((left, right) => left.archiveOrder - right.archiveOrder);
  const openableProjects = publicProjects.filter((project) => Boolean(project.route) && !project.comingSoon);
  const featuredProjects = publicProjects.filter((project) => project.featured);
  if (!publicProjects.length) throw new Error("The current public portfolio contains no public projects.");
  if (!openableProjects.length) throw new Error("The current public portfolio contains no openable public project pages.");
  if (!featuredProjects.length) throw new Error("The current public homepage contains no featured project cards.");

  const total = openableProjects.length + 3;
  const cache: AssetCache = new Map();
  const pages: CapturedPage[] = [];
  try {
    onProgress?.({ phase: "capturing", completed: 0, total, currentLabel: locale === "zh" ? "首页" : "Homepage" });
    pages.push(await capturePage(
      localizePath("/", locale),
      "home",
      document.title || "Portfolio",
      featuredProjects,
      true,
      true,
      locale,
      cache,
      signal,
      "home",
      true,
    ));

    assertNotAborted(signal);
    onProgress?.({ phase: "capturing", completed: 1, total, currentLabel: locale === "zh" ? "项目归档" : "Work archive" });
    pages.push(await capturePage(
      localizePath("/work", locale),
      "work",
      locale === "zh" ? "项目归档" : "Work archive",
      publicProjects,
      true,
      true,
      locale,
      cache,
      signal,
      "work",
      true,
    ));

    for (let index = 0; index < openableProjects.length; index += 1) {
      assertNotAborted(signal);
      const project = openableProjects[index];
      onProgress?.({ phase: "capturing", completed: index + 2, total, currentLabel: project.title });
      pages.push(await capturePage(
        localizePath(project.route ?? `/work/${project.slug}`, locale),
        `project:${project.id}`,
        project.title,
        openableProjects,
        true,
        true,
        locale,
        cache,
        signal,
        "project",
        true,
      ));
    }

    assertNotAborted(signal);
    onProgress?.({ phase: "capturing", completed: total - 1, total, currentLabel: "PLAY / Game Experience" });
    pages.push(await capturePage(
      localizePath("/play", locale),
      "play",
      locale === "zh" ? "游戏经历" : "Game Experience",
      openableProjects,
      true,
      true,
      locale,
      cache,
      signal,
      "play",
      true,
    ));

    assertNotAborted(signal);
    onProgress?.({ phase: "packaging", completed: total, total });
    const builtHtml = buildStaticHtml(pages, locale);
    const optimized = await optimizeStandaloneHtml(builtHtml, "complete-offline");
    const validation = validateCompleteOfflineScope(pages, publicProjects, openableProjects, optimized.html, optimized);
    const filename = `portfolio-complete-offline-${locale}-${new Date().toISOString().replace(/[:.]/g, "-")}.html`;
    const bytes = deliverHtml(optimized.html, filename, delivery);
    onProgress?.({ phase: "done", completed: total, total });
    return { filename, bytes, html: delivery === "return" ? optimized.html : undefined, projectIds: openableProjects.map((project) => project.id), validation };
  } finally {
    document.querySelectorAll<HTMLIFrameElement>('iframe[aria-hidden="true"][src^="/"]').forEach((frame) => {
      if (frame.style.zIndex === "-2147483647") frame.remove();
    });
  }
}
