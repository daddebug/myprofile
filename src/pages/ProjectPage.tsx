import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { lazy, Suspense, useEffect, useRef, useState, type ComponentType } from "react";
import { ArrowLeft, ArrowRight, ExternalLink, Pencil, Sparkles } from "lucide-react";
import { getAdjacentProjects, getProjectBySlug } from "../data/projects";
import { PageTransition } from "../components/PageTransition";
import { ProjectHeroTitleSummary } from "../components/ProjectHeroTitleSummary";
import { projectHeroTextWidth } from "../lib/caseStudyLayout";
import { ImageWithFallback } from "../components/ImageWithFallback";
import { ProjectBlocks } from "../components/ProjectBlocks";
import { PlayableFrame } from "../components/PlayableFrame";
import { CaseStudyVisual } from "../components/CaseStudyVisual";
import { useLocale } from "../locales/LocaleContext";
import { getProjectTranslation } from "../content/projects/translations";
import { useProjectCatalog } from "../hooks/useProjectCatalog";
import { ProjectBackToTop } from "../components/ProjectBackToTop";
import { CaseStudyEditorDock, CaseStudyEditorProvider, useCaseStudyEditor } from "../components/CaseStudyEditor";
import { getProjectDocument } from "../lib/projectDocuments";
import { ProjectEntryGate } from "../components/ProjectEntryGate";
import { getDiskProjectBodyDocument } from "../lib/portfolioContentClient";
import type { ProjectDocument } from "../lib/projectDocuments";
import { ensureStagedProjectLoaded, getCollectionJobId, getStagedProjectDocument, hasStagedDataFor, isCollectionExportCapture } from "../lib/collectionExportStaging";
import { PROJECT_PUBLIC_META_CHANGED_EVENT } from "../lib/projectMetadata";

const UIPracticePage = lazy(() => import("./UIPracticePage").then((module) => ({ default: module.UIPracticePage })));
const DynamicProjectPage = lazy(() => import("./DynamicProjectPage").then((module) => ({ default: module.DynamicProjectPage })));
const ProjectCoverEditor = lazy(() => import("../components/ProjectCoverEditor").then((module) => ({ default: module.ProjectCoverEditor })));
const ProjectDocumentPage = lazy(() => import("../components/ProjectDocumentPage").then((module) => ({ default: module.ProjectDocumentPage })));
const ProjectExactWebExportAction = lazy(() => import("../components/ProjectExactWebExportAction").then((module) => ({ default: module.ProjectExactWebExportAction })));
const ProjectExactWebExportBridge = lazy(() => import("../components/ProjectExactWebExportAction").then((module) => ({ default: module.ProjectExactWebExportBridge })));
const ProjectInfoEditor = lazy(() => import("../components/ProjectManagementPanels").then((module) => ({ default: module.ProjectInfoEditor })));

const projectContentRegistry: Record<string, ComponentType> = {
  "ui-personal-practice": UIPracticePage,
};

const projectsWithCompleteCustomEnglishContent = new Set<string>([]);

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
  const { isEditing, setIsEditing, toggleEditing } = useCaseStudyEditor();
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
  if (!projectMetadata) return <Navigate to={pathFor("/work")} replace />;

  return (
    <div data-project-route-shell data-project-id={projectMetadata.id} ref={shellRef}>
      <Suspense fallback={null}>
        <ProjectExactWebExportBridge />
      </Suspense>
      <ProjectBackToTop />
      <CaseStudyEditorDock
        isEditing={isEditing}
        onToggle={toggleEditing}
        actions={<>
          <button type="button" className="editor-action bg-deepIndigo/92 text-acidGreen" onClick={() => setShowProjectInfo(true)}><Pencil className="h-3.5 w-3.5" />EDIT PROJECT INFO</button>
          <Suspense fallback={null}><ProjectExactWebExportAction onBeforeExport={() => setIsEditing(false)} /></Suspense>
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
  const { locale, messages, pathFor } = useLocale();
  const { isEditing } = useCaseStudyEditor();
  const projectCatalog = useProjectCatalog(locale);
  const publicMetadata = projectCatalog.find((item) => item.id === projectId);
  const CustomProjectContent = projectContentRegistry[projectId];
  const [diskDocument, setDiskDocument] = useState<ProjectDocument | null>(null);
  const [diskReadComplete, setDiskReadComplete] = useState(!import.meta.env.DEV);
  useEffect(() => {
    let active = true;
    setDiskDocument(null);
    setDiskReadComplete(!import.meta.env.DEV);
    const shell = document.querySelector("[data-project-route-shell]");
    shell?.setAttribute("data-disk-read-complete", String(!import.meta.env.DEV));
    // A fresh project must never keep showing the PREVIOUS project's
    // "content ready" state while its own content is still loading -
    // ProjectContentReadySignal will flip this back to "true" once real
    // content for THIS projectId actually commits.
    shell?.setAttribute("data-project-content-ready", "false");
    if (!import.meta.env.DEV) return () => { active = false; };
    getDiskProjectBodyDocument<ProjectDocument>(projectId)
      .then((record) => { if (active) setDiskDocument(record?.document ?? null); })
      .catch(() => { if (active) setDiskDocument(null); })
      .finally(() => {
        if (!active) return;
        setDiskReadComplete(true);
        document.querySelector("[data-project-route-shell]")?.setAttribute("data-disk-read-complete", "true");
      });
    return () => { active = false; };
  }, [projectId]);
  // Playwright's headless capture browser has its own separate, empty
  // profile — a dynamic project's ProjectDocument (owner-browser
  // localStorage only, not yet disk-committed) was staged ahead of time by
  // collectionExportStaging.ts's producer and must be read from that
  // in-memory staged cache here, never from this profile's own (empty)
  // localStorage. getStagedProjectDocument returns null outside collection
  // job mode, so this is a no-op on the real site and for the owner.
  const projectDocument = diskDocument ?? getStagedProjectDocument(projectId) ?? getProjectDocument(projectId);

  if (!diskReadComplete) return null;

  // A migrated, validated ProjectDocument always wins over the legacy bespoke
  // page for this project id — once migration has run in the owner's browser,
  // this is the only path rendered (public view and the EDIT toggle both go
  // through the unified editor). The bespoke component below is kept only as
  // an automatic fallback for projects that have not been migrated yet.
  if (projectDocument && publicMetadata) {
    const translationStatus = projectDocument.translationStatus ?? "complete";
    // The owner must always be able to see and edit English fields directly,
    // regardless of how complete they are — the placeholder only applies to
    // public (non-editing) English visitors, matching the exact behaviour
    // the bespoke pages already had for incomplete translations.
    if (locale === "en" && !isEditing && translationStatus === "unavailable") {
      return <><ProjectContentReadySignal /><EnglishProjectPlaceholder slug={projectId} /></>;
    }
    return <Suspense fallback={null}>
      <ProjectContentReadySignal />
      {locale === "en" && !isEditing && translationStatus === "partial" ? (
        <p className="site-container pt-8 text-sm text-softWhite/50">{messages.project.chineseAvailable}</p>
      ) : null}
      <ProjectDocumentPage metadata={publicMetadata} initialDocument={projectDocument} />
    </Suspense>;
  }

  // A dynamic project (created through "New project") with no ProjectDocument
  // yet is a blank project waiting to be built with the current 9-template
  // system — it never falls through to the legacy bespoke/static renderers.
  if (publicMetadata?.isDynamic) {
    return <Suspense fallback={null}><ProjectContentReadySignal /><DynamicProjectPage projectId={projectId} metadata={publicMetadata} /></Suspense>;
  }

  if (
    CustomProjectContent
    && locale === "en"
    && !projectsWithCompleteCustomEnglishContent.has(projectId)
    && getProjectTranslation(projectId, "en")?.status !== "complete"
  ) {
    return <><ProjectContentReadySignal /><EnglishProjectPlaceholder slug={projectId} /></>;
  }

  if (CustomProjectContent) return <Suspense fallback={null}><ProjectContentReadySignal /><CustomProjectContent /></Suspense>;

  const project = getProjectBySlug(projectId);

  if (!project) {
    return <Navigate to={pathFor("/work")} replace />;
  }

  const { previous, next } = getAdjacentProjects(project.slug);
  const metadata = project.metadata ?? [
    ["Role", project.role],
    ["Timeline", publicMetadata?.duration ?? project.timeline],
    ["Tools", project.tools.join(", ")],
    ["Type", project.type],
  ].map(([label, value]) => ({ label, value }));

  return (
    <PageTransition>
      <ProjectContentReadySignal />
      <article className="bg-deepIndigo text-softWhite">
        <section className="relative overflow-hidden bg-deepIndigo">
          <div className="absolute inset-0 bg-grain bg-[length:18px_18px] opacity-35" />
          <div className="site-container relative py-14 md:py-18">
            {isCollectionExportCapture() ? null : (
              <Link
                to={pathFor("/work")}
                className="mb-8 inline-flex items-center gap-2 rounded-full border border-softWhite/18 bg-archiveBlue/36 px-3 py-2 text-sm font-bold text-acidGreen transition hover:-translate-y-1 hover:border-acidGreen"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                {messages.project.backToArchive}
              </Link>
            )}
            <div className="grid gap-10 md:grid-cols-[0.85fr_1.15fr] md:items-end">
              <div>
                <p className="w-fit rounded-full border border-acidGreen/35 bg-acidGreen/10 px-3 py-1 font-mono text-xs font-bold uppercase tracking-[0.18em] text-acidGreen">
                  artifact {project.year} / {publicMetadata?.category ?? project.category}
                </p>
                <ProjectHeroTitleSummary>
                  <h1 className={`mt-5 font-display text-[clamp(3.5rem,8vw,7.5rem)] leading-none text-softWhite ${projectHeroTextWidth.title}`}>{publicMetadata?.title ?? project.title}</h1>
                  <p className={`mt-5 text-lg leading-8 text-softWhite/76 ${projectHeroTextWidth.summary}`}>{publicMetadata?.summary ?? project.subtitle}</p>
                </ProjectHeroTitleSummary>
                {project.primaryQuestion ? (
                  <p className="mt-6 max-w-3xl text-2xl font-semibold leading-9 text-softWhite md:text-3xl md:leading-10">
                    {project.primaryQuestion}
                  </p>
                ) : null}
                <p className="mt-5 text-base leading-8 text-softWhite/66">{project.summary}</p>
                <div className="mt-8 flex flex-wrap gap-2">
                  {project.highlights.slice(0, 3).map((highlight) => (
                    <span
                      key={highlight}
                      className="rounded-full border border-softWhite/14 bg-archiveBlue/38 px-3 py-1 text-xs font-bold text-softWhite/78"
                    >
                      {highlight}
                    </span>
                  ))}
                </div>
              </div>
              {project.heroComparison ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <CaseStudyVisual image={project.heroComparison.before} />
                  <CaseStudyVisual image={project.heroComparison.after} />
                </div>
              ) : (
                <div className="relative overflow-hidden rounded-[30px] border border-softWhite/14 bg-archiveBlue/34 p-3 shadow-archive">
                  <ImageWithFallback
                    src={publicMetadata?.coverImage || project.cover}
                    alt={`${publicMetadata?.title ?? project.title} cover`}
                    className="aspect-[4/3] w-full rounded-[22px] object-cover md:aspect-[16/10]"
                    placeholderClassName="aspect-[4/3] rounded-[22px] md:aspect-[16/10]"
                  />
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="bg-archiveBlue py-8">
          <div className="site-container grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {metadata.map(({ label, value }) => (
              <div key={label} className="rounded-[24px] border border-softWhite/12 bg-deepIndigo/46 p-5">
                <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-acidGreen">{label}</p>
                <p className="mt-3 text-sm leading-6 text-softWhite/72">{value}</p>
              </div>
            ))}
          </div>
        </section>

        {project.caseMap?.length ? (
          <section className="bg-deepIndigo py-5">
            <div className="site-container">
              <div className="flex gap-5 overflow-x-auto border-y border-softWhite/10 py-3">
                {project.caseMap.map((item) => (
                  <span
                    key={`${item.label}-${item.title}`}
                    className="shrink-0 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-softWhite/54"
                  >
                    <span className="text-acidGreen">{item.label}</span> {item.title}
                  </span>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <section className="bg-deepIndigo py-16 md:py-20">
          <div className="site-container grid gap-10 md:grid-cols-[280px_1fr]">
            <aside className="h-fit rounded-[30px] border border-softWhite/12 bg-archiveBlue/34 p-5 md:sticky md:top-24">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-acidGreen text-deepIndigo">
                  <Sparkles className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-acidGreen">Archive map</p>
                  <p className="mt-1 text-sm font-bold text-softWhite">{publicMetadata?.title ?? project.title}</p>
                </div>
              </div>
              <div className="mt-6 grid gap-3 text-sm leading-6 text-softWhite/68">
                <p>{project.summary}</p>
                <div className="border-t border-softWhite/10 pt-4">
                  <p className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-acidGreen">Role</p>
                  <p className="mt-1">{project.role}</p>
                </div>
              </div>
            </aside>
            <div>
              <p className="w-fit rounded-full border border-acidGreen/45 bg-acidGreen/10 px-3 py-1 font-mono text-xs font-bold uppercase tracking-[0.18em] text-acidGreen">
                {project.openingEyebrow ?? "opening spread"}
              </p>
              <h2 className="mt-3 max-w-4xl font-display text-5xl leading-tight text-softWhite md:text-6xl">
                {project.openingTitle ?? "A small project world about rules, feeling, and interface trust."}
              </h2>
              <div className="mt-8 grid gap-6 md:grid-cols-[1fr_0.8fr]">
                <p className="text-xl leading-9 text-softWhite/72">{project.openingSummary ?? project.summary}</p>
                <p className="text-base leading-8 text-softWhite/62">{project.background}</p>
              </div>
              <div className="mt-10 grid gap-4 lg:grid-cols-2">
                <InfoList title="Design clues" items={project.designGoals} />
                <InfoList title="Notable traces" items={project.highlights} />
              </div>
            </div>
          </div>
        </section>

        <section className="bg-[#121239] py-16 md:py-20">
          <div className="site-container">
            <div className="mb-14 grid gap-8 md:grid-cols-[0.55fr_1fr]">
              <div>
                <p className="w-fit rounded-full border border-acidGreen/45 bg-acidGreen/10 px-3 py-1 font-mono text-xs font-bold uppercase tracking-[0.18em] text-acidGreen">
                  process zine
                </p>
                <h2 className="mt-3 font-display text-5xl leading-tight text-softWhite md:text-6xl">
                  {project.processTitle ?? "Behind the Interface"}
                </h2>
              </div>
              <div className="grid gap-3">
                {project.process.map((step, index) => (
                  <div
                    key={step}
                    className="grid gap-3 rounded-[24px] border border-softWhite/12 bg-archiveBlue/34 p-4 sm:grid-cols-[72px_1fr]"
                  >
                    <span className="font-mono text-3xl font-semibold text-acidGreen">{String(index + 1).padStart(2, "0")}</span>
                    <p className="text-sm leading-6 text-softWhite/70">{step}</p>
                  </div>
                ))}
              </div>
            </div>

            <ProjectBlocks blocks={project.blocks} />

            {project.playable ? (
              <div className="mt-10">
                <PlayableFrame {...project.playable} />
              </div>
            ) : null}

            {project.externalLinks?.length ? (
              <div className="mt-10 flex flex-wrap gap-3">
                {project.externalLinks.map((link) => (
                  <a
                    key={link.label}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-softWhite/12 bg-archiveBlue/34 px-4 py-2 text-sm font-bold text-softWhite transition hover:-translate-y-1 hover:border-acidGreen hover:text-acidGreen"
                  >
                    {link.label}
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        <nav className="bg-deepIndigo py-10 text-softWhite" data-project-bottom-navigation>
          <div className="site-container grid gap-4 md:grid-cols-2">
            {previous ? (
              <Link className="project-nav-link" to={pathFor(`/work/${previous.slug}`)}>
                <ArrowLeft className="h-5 w-5" aria-hidden="true" />
                <span>
                  <span className="block font-mono text-xs uppercase tracking-[0.2em] text-acidGreen">{messages.project.previousProject}</span>
                  <span className="font-display text-2xl">{previous.title}</span>
                </span>
              </Link>
            ) : null}
            {next ? (
              <Link className="project-nav-link justify-end text-right" to={pathFor(`/work/${next.slug}`)}>
                <span>
                  <span className="block font-mono text-xs uppercase tracking-[0.2em] text-acidGreen">{messages.project.nextProject}</span>
                  <span className="font-display text-2xl">{next.title}</span>
                </span>
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </Link>
            ) : null}
          </div>
        </nav>
      </article>
    </PageTransition>
  );
}

function EnglishProjectPlaceholder({ slug }: { slug: string }) {
  const { messages, pathFor } = useLocale();

  return (
    <PageTransition>
      <main className="grid min-h-[70svh] place-items-center bg-deepIndigo px-4 py-20 text-center text-softWhite md:px-6">
        <div className="max-w-2xl">
          <h1 className="font-display text-5xl leading-tight md:text-7xl">{messages.project.englishInProgress}</h1>
          <p className="mt-6 text-lg leading-8 text-softWhite/68">{messages.project.chineseAvailable}</p>
          <Link
            className="mt-8 inline-flex items-center gap-2 rounded-[12px] border border-acidGreen/45 px-4 py-2 text-sm font-bold text-acidGreen transition hover:bg-acidGreen hover:text-deepIndigo"
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

function InfoList({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="rounded-[30px] border border-softWhite/12 bg-archiveBlue/34 p-6">
      <h3 className="font-display text-3xl text-softWhite">{title}</h3>
      <ul className="mt-5 space-y-3">
        {items.map((item) => (
          <li key={item} className="flex gap-3 text-sm leading-6 text-softWhite/70">
            <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-acidGreen" />
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
