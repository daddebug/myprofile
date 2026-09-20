import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ArrowLeft, Pencil } from "lucide-react";
import { PageTransition } from "../components/PageTransition";
import { useLocale } from "../locales/LocaleContext";
import { useProjectCatalog } from "../hooks/useProjectCatalog";
import { ProjectBackToTop } from "../components/ProjectBackToTop";
import { CaseStudyEditorDock, CaseStudyEditorProvider, useCaseStudyEditor } from "../components/CaseStudyEditor";
import { ProjectEntryGate } from "../components/ProjectEntryGate";
import { ensureStagedProjectLoaded, getCollectionJobId, hasStagedDataFor, isCollectionExportCapture } from "../lib/collectionExportStaging";
import { PROJECT_PUBLIC_META_CHANGED_EVENT } from "../lib/projectMetadata";

const DynamicProjectPage = lazy(() => import("./DynamicProjectPage").then((module) => ({ default: module.DynamicProjectPage })));
const ProjectCoverEditor = lazy(() => import("../components/ProjectCoverEditor").then((module) => ({ default: module.ProjectCoverEditor })));
const ProjectExactWebExportAction = lazy(() => import("../components/ProjectExactWebExportAction").then((module) => ({ default: module.ProjectExactWebExportAction })));
const ProjectExactWebExportBridge = lazy(() => import("../components/ProjectExactWebExportAction").then((module) => ({ default: module.ProjectExactWebExportBridge })));
const ProjectInfoEditor = lazy(() => import("../components/ProjectManagementPanels").then((module) => ({ default: module.ProjectInfoEditor })));
const ProjectQuickSettings = lazy(() => import("../components/ProjectQuickSettings").then((module) => ({ default: module.ProjectQuickSettings })));

export function ProjectRouteShell() {
  const location = useLocation();
  const routeKey = `${location.pathname}${location.search}`;

  return (
    <ProjectEntryGate key={routeKey} routeKey={routeKey}>
      <CaseStudyEditorProvider>
        <ProjectRouteShellFrame />
      </CaseStudyEditorProvider>
    </ProjectEntryGate>
  );
}

function ProjectRouteShellFrame() {
  // isEditing is automatic now (tied directly to global editingMode, see
  // CaseStudyEditorProvider) -- no manual toggle left to wire up here.
  // setIsEditing survives only for the Exact Web PDF export's temporary
  // before/after suppression below.
  const { isEditing, setIsEditing } = useCaseStudyEditor();
  const { slug } = useParams();
  const { locale, pathFor } = useLocale();
  const navigate = useNavigate();
  const [showProjectInfo, setShowProjectInfo] = useState(false);
  const jobId = getCollectionJobId();
  // Server-side capture navigates with ?collectionJob=<id> for a dynamic
  // project whose real catalog entry and draft only exist in the owner's own
  // browser (collectionExportStaging.ts). Wait for that project's staged
  // data to load before resolving anything from the catalog — otherwise a
  // dynamic project's Playwright-side lookup always misses (empty profile)
  // and silently redirects to /work before its content ever gets a chance to
  // render. A no-op (resolves immediately) outside collection export mode.
  const [stagedGateReady, setStagedGateReady] = useState(!jobId);
  useEffect(() => {
    if (!jobId || !slug) return;
    let active = true;
    void ensureStagedProjectLoaded(slug).then(() => {
      if (!active) return;
      window.dispatchEvent(new CustomEvent(PROJECT_PUBLIC_META_CHANGED_EVENT));
      setStagedGateReady(true);
    });
    return () => { active = false; };
  }, [jobId, slug]);
  const projectCatalog = useProjectCatalog(locale);
  const projectMetadata = projectCatalog.find(
    (project) => project.slug === slug && project.route === `/work/${project.slug}`,
  );
  const shellRef = useRef<HTMLDivElement>(null);

  // Sets data-project-export-ready="true" once this project's real content
  // has actually rendered and settled: the root height has stopped changing
  // for two consecutive checks above a trivial size, and ordinary content
  // images have either loaded or been given up on after a bounded grace
  // period (IMAGE_GRACE_MS) — a single slow or broken image must never keep
  // the whole export waiting for the full 20s server-side timeout. Special
  // embedded media (iframe, video, playable-game frames, interactive Figma
  // prototypes) is never waited on at all: only its outer container needs to
  // exist in the DOM, never its internal load state.
  //
  // Only runs when the URL carries ?collectionExport=1 (set by the collection
  // export pipeline when it navigates here) — gated because it does two
  // things a normal visitor must never see: forces every below-the-fold,
  // natively loading="lazy" image to start loading immediately (headless
  // Chromium does not reliably fire native lazy-load's intersection trigger
  // at all), and scrolls once through the whole page (confirmed necessary
  // too — this site's scroll-triggered reveal content stays collapsed until
  // its own viewport intersection fires, and print/PDF rendering measures a
  // taller final layout than an unscrolled page reports, which produced a
  // silently-duplicated second PDF page).
  useEffect(() => {
    const root = shellRef.current;
    if (!root || !projectMetadata) return undefined;
    root.removeAttribute("data-project-export-ready");
    root.removeAttribute("data-project-export-diagnostics");
    if (!isCollectionExportCapture()) return undefined;
    // CSS-only signal for the collection-export-only rules in styles.css
    // (break-inside: avoid on top-level modules, the export-only glow
    // background) — set on <html> so it's visible to a global stylesheet
    // selector without threading a prop through every content system.
    // Never set outside collection export capture.
    document.documentElement.setAttribute("data-collection-export-capture", "true");

    let cancelled = false;
    let interval: number | undefined;
    const startedAt = Date.now();
    // Ordinary content images get this long to finish loading before a
    // still-incomplete one is logged as a warning and treated as settled
    // rather than continuing to block — well inside the server's 20s
    // "ready" step timeout, so a bad image can never eat the whole budget.
    const IMAGE_GRACE_MS = 9_000;
    const SPECIAL_MEDIA_SELECTOR = "[data-playable-game]";

    const normalImages = () => Array.from(root.querySelectorAll("img")).filter((image) => !image.closest(SPECIAL_MEDIA_SELECTOR));

    const snapshot = (extra: Record<string, unknown> = {}) => {
      const images = normalImages();
      const incomplete = images.filter((image) => !image.complete);
      const diagnostics = {
        projectId: projectMetadata.id,
        elapsedMs: Date.now() - startedAt,
        collectionJobId: jobId,
        stagedDraftFound: jobId ? hasStagedDataFor(projectMetadata.id) : null,
        diskReadComplete: root.getAttribute("data-disk-read-complete"),
        templateInstanceCount: root.querySelectorAll("[data-template-instance-id]").length,
        rootHeight: Math.round(root.getBoundingClientRect().height),
        totalImages: images.length,
        completeImages: images.length - incomplete.length,
        incompleteImages: incomplete.length,
        incompleteImageSources: incomplete.slice(0, 20).map((image) => ({ src: image.currentSrc || image.src, alt: image.alt })),
        iframeCount: root.querySelectorAll("iframe").length,
        videoCount: root.querySelectorAll("video").length,
        playableGameCount: root.querySelectorAll("[data-playable-game]").length,
        figmaPrototypeCount: root.querySelectorAll("[data-figma-prototype-block], [data-figma-prototype-frame]").length,
        ...extra,
      };
      root.setAttribute("data-project-export-diagnostics", JSON.stringify(diagnostics));
      (window as unknown as { __collectionExportDiagnostics?: unknown }).__collectionExportDiagnostics = diagnostics;
      if (import.meta.env.DEV) console.info("[collection export] ready check", diagnostics);
      return diagnostics;
    };

    const sweepAndWatch = async () => {
      normalImages().forEach((image) => { image.loading = "eager"; });
      const step = Math.max(600, Math.floor(window.innerHeight * 0.9));
      for (let top = 0; top < document.documentElement.scrollHeight && !cancelled; top += step) {
        window.scrollTo({ top, left: 0, behavior: "auto" });
        await new Promise<void>((resolve) => window.setTimeout(resolve, 150));
      }
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      if (cancelled) return;

      const heightHistory: number[] = [];
      let previousHeight = -1;
      let stableHits = 0;
      let warnedIncomplete = false;
      interval = window.setInterval(() => {
        const images = normalImages();
        images.forEach((image) => { if (image.loading === "lazy") image.loading = "eager"; });
        const incomplete = images.filter((image) => !image.complete);
        const imageGracePassed = Date.now() - startedAt >= IMAGE_GRACE_MS;
        if (imageGracePassed && incomplete.length && !warnedIncomplete) {
          warnedIncomplete = true;
          console.warn(
            `[collection export] "${projectMetadata.id}": ${incomplete.length} image(s) still not complete after ${IMAGE_GRACE_MS}ms — proceeding without them.`,
            incomplete.map((image) => ({ src: image.currentSrc || image.src, alt: image.alt })),
          );
        }
        const imagesSettled = incomplete.length === 0 || imageGracePassed;
        const height = root.getBoundingClientRect().height;
        heightHistory.push(Math.round(height));
        if (heightHistory.length > 6) heightHistory.shift();
        const heightOk = height >= 100;
        stableHits = imagesSettled && heightOk && Math.abs(height - previousHeight) < 0.5 ? stableHits + 1 : 0;
        previousHeight = height;
        const diagnostics = snapshot({ heightHistory: [...heightHistory], imagesSettled, imageGracePassed, stableHits });
        if (stableHits >= 2) {
          root.setAttribute("data-project-export-ready", "true");
          if (import.meta.env.DEV) console.info(`[collection export] "${projectMetadata.id}" ready`, diagnostics);
          window.clearInterval(interval);
        }
      }, 150);
    };

    void sweepAndWatch();
    return () => {
      cancelled = true;
      if (interval !== undefined) window.clearInterval(interval);
    };
  }, [projectMetadata?.id, stagedGateReady]);

  if (!stagedGateReady) return null;
  // Unmatched slug: the homepage, never /work -- /work is owner-only Project
  // Archive tooling now, not a public fallback destination.
  if (!projectMetadata) return <Navigate to={pathFor("/")} replace />;

  return (
    <div data-project-route-shell data-project-id={projectMetadata.id} ref={shellRef}>
      <Suspense fallback={null}>
        <ProjectExactWebExportBridge />
      </Suspense>
      <ProjectBackToTop />
      <CaseStudyEditorDock
        actions={<>
          <button type="button" className="editor-action bg-deepIndigo/92 text-acidGreen" onClick={() => setShowProjectInfo(true)}><Pencil className="h-3.5 w-3.5" />EDIT PROJECT INFO</button>
          <Suspense fallback={null}><ProjectQuickSettings project={projectMetadata} onOpenProjectInfo={() => setShowProjectInfo(true)} /></Suspense>
          <Suspense fallback={null}><ProjectExactWebExportAction onBeforeExport={() => setIsEditing(false)} onAfterExport={() => setIsEditing(true)} /></Suspense>
        </>}
      />
      {showProjectInfo ? <Suspense fallback={null}><ProjectInfoEditor project={projectMetadata} catalog={projectCatalog} onClose={() => setShowProjectInfo(false)} onSaved={(nextSlug) => { setShowProjectInfo(false); if (nextSlug !== slug) navigate(pathFor(`/work/${nextSlug}`), { replace: true }); }} /></Suspense> : null}
      {isEditing ? (
        <Suspense fallback={null}>
          <ProjectCoverEditor
            projectId={projectMetadata.id}
            locale={locale}
            fallbackImage={projectMetadata.coverImage}
          />
        </Suspense>
      ) : null}
      <ProjectPageContent projectId={projectMetadata.id} />
    </div>
  );
}

// The canonical "real content has committed" signal, distinct from
// data-disk-read-complete (which only means the project JSON fetch
// finished, not that the content it feeds - possibly behind a
// lazy()/Suspense boundary rendering fallback={null} in the meantime - has
// actually mounted). Rendered as a sibling of the real content in every
// ProjectPageContent branch below, including inside each Suspense boundary:
// a non-suspending sibling still only commits once its Suspense boundary as
// a whole resolves, so this effect firing is proof the real content around
// it, not just the shell, is now in the DOM. Static HTML export
// (portfolioStaticHtmlExport.ts) waits on this exact attribute before
// cloning - never on disk-read-complete, elapsed time, or stable height
// alone. See the permanent rule in skills/static-html-export/SKILL.md.
function ProjectContentReadySignal() {
  useEffect(() => {
    const shell = document.querySelector("[data-project-route-shell]");
    shell?.setAttribute("data-project-content-ready", "true");
    return () => {
      shell?.setAttribute("data-project-content-ready", "false");
    };
  }, []);
  return null;
}

function ProjectPageContent({ projectId }: { projectId: string }) {
  const { locale, pathFor } = useLocale();
  const projectCatalog = useProjectCatalog(locale);
  const publicMetadata = projectCatalog.find((item) => item.id === projectId);

  // Project Renderer Final Cutover: every real catalog project is a
  // Portfolio 2.0 DynamicProjectPage now (ui-personal-practice included --
  // its UI-practice images were migrated into Universal Media template
  // instances, see drafts["ui-personal-practice"]). ProjectDocumentPage (a
  // never-actually-used content tier -- zero projects, on disk or
  // published, have ever had a ProjectDocument) and the
  // ui-personal-practice-only CustomProjectContent registry have both been
  // retired from this selection, so there is exactly one live public
  // project renderer, not three.
  if (publicMetadata?.isDynamic) {
    return <Suspense fallback={null}><ProjectContentReadySignal /><DynamicProjectPage projectId={projectId} metadata={publicMetadata} /></Suspense>;
  }

  // Unmatched project id -- the homepage, not a resurrected Portfolio 1.0
  // fallback page.
  return <Navigate to={pathFor("/")} replace />;
}

function EnglishProjectPlaceholder({ slug }: { slug: string }) {
  const { messages, pathFor } = useLocale();

  // Portfolio 2.0 palette (#F7F6ED / #495D47) -- this placeholder is a real,
  // still-live visitor-reachable page (an EN translation not being ready
  // yet), not V1 code, so it keeps its function; only its old navy/neon
  // Portfolio 1.0 appearance is removed.
  return (
    <PageTransition>
      <main className="grid min-h-[70svh] place-items-center bg-[#f7f6ed] px-4 py-20 text-center text-black md:px-6">
        <div className="max-w-2xl">
          <h1 className="font-display text-5xl leading-tight md:text-7xl">{messages.project.englishInProgress}</h1>
          <p className="mt-6 text-lg leading-8 text-black/68">{messages.project.chineseAvailable}</p>
          <Link
            className="mt-8 inline-flex items-center gap-2 rounded-[12px] border border-[#495d47]/45 px-4 py-2 text-sm font-bold text-[#495d47] transition hover:bg-[#495d47] hover:text-[#f7f6ed]"
            to={pathFor(`/work/${slug}`, "zh")}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {messages.project.viewChineseVersion}
          </Link>
        </div>
      </main>
    </PageTransition>
  );
}
