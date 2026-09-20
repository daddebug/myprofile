import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Braces, Undo2 } from "lucide-react";
import { PageTransition } from "../components/PageTransition";
import { useCaseStudyEditor } from "../components/CaseStudyEditor";
import { useOwnerMode } from "../hooks/useOwnerMode";
import { useSurfaceSignal } from "../hooks/useSurfaceSignal";
import { useLocale } from "../locales/LocaleContext";
import { caseStudyLayout } from "../lib/caseStudyLayout";
import { TemplateFlowRegion } from "../components/TemplateInstancesSection";
import { deleteProjectBodyAsset, getProjectBodyAsset, putProjectBodyAssetRecord } from "../lib/projectBodyAssetDb";
import { setProjectPublicMetaOverride, type ProjectPublicMetaOverride, type ResolvedProjectMetadata } from "../lib/projectMetadata";
import { useOwnerProjectCatalog } from "../hooks/useProjectCatalog";
import { DynamicProjectCodePanel } from "../components/DynamicProjectCodePanel";
import {
  getDynamicProjectImageMapping,
  type DynamicProjectImageMapping,
} from "../lib/portfolioContentClient";
import { getStagedDynamicDraft, isCollectionExportCapture, isCollectionStagingMode } from "../lib/collectionExportStaging";
import { getPublishedProjectDraft } from "../lib/publishedPortfolio";
import { markProjectDirty } from "../lib/publishIntent";
import {
  emptyDynamicProjectDraft,
  hydrateExistingDiskImageAssets,
  normalizeDynamicProjectDraft,
  resolveDevProjectDraft,
  type DraftLifecycle,
  type DynamicProjectDraft,
  type OrphanedDiskMapping,
} from "../lib/dynamicProjectDraftHydration";
import { ProjectPresentation } from "../project-presentation/ProjectPresentation";
import { ProjectEndSections } from "../project-presentation/ProjectEndSections";
import "../project-presentation/project-end-sections.css";

// The page every project created through "New project" renders on — a
// blank shell with no auto-generated content, built around the current
// 9-template system (TemplateFlowRegion). Title / subtitle / category /
// duration are read-only here on purpose: they already have exactly one
// editable home (EDIT PROJECT INFO, wired generically for every project in
// ProjectRouteShellFrame), so this page doesn't duplicate that control.
//
// Duplicated (not imported) in src/lib/collectionExportStaging.ts, which
// needs this exact key format to read the owner's real draft for staging —
// kept as a plain string there instead of importing from this page module to
// avoid a lib-depends-on-page dependency direction. Keep both in sync.
function draftStorageKey(projectId: string) {
  return `dilida-portfolio:dynamic-project:${projectId}:draft:v1`;
}

type ProjectCodeUndo = {
  draft: DynamicProjectDraft;
  metadata: Partial<ProjectPublicMetaOverride>;
};

function loadDraft(projectId: string) {
  const publishedDraft = normalizeDynamicProjectDraft(getPublishedProjectDraft(projectId));
  if (typeof window === "undefined" || !import.meta.env.DEV) {
    // Production (and any non-browser/prerender context) has no access to
    // the owner's own localStorage, and is never a Collection-export
    // capture — that always runs against the local dev server, where DEV is
    // true (see the branch below). Fall back to this exact project's own
    // published draft: the same static data already bundled for every
    // visitor via publishedPortfolio.json, produced by the same
    // portfolio:import pipeline that writes the localStorage draft shape.
    return {
      draft: publishedDraft ?? emptyDynamicProjectDraft(),
      suspiciousLocalDraft: false,
      suspiciousReason: "",
      source: publishedDraft ? "published" as const : "empty" as const,
    };
  }
  // Collection export capture: this browser's localStorage is Playwright's
  // separate, empty profile, so the real draft was staged ahead of time (see
  // collectionExportStaging.ts) and fetched into memory before this page's
  // effect ever calls loadDraft. Never falls back to (necessarily empty)
  // localStorage in this mode — an unstaged project should render as
  // genuinely empty rather than silently look like real, saved content.
  if (isCollectionStagingMode()) {
    const staged = getStagedDynamicDraft(projectId);
    return {
      draft: staged ?? emptyDynamicProjectDraft(),
      suspiciousLocalDraft: false,
      suspiciousReason: "",
      source: staged ? "local" as const : "empty" as const,
    };
  }
  const stored = window.localStorage.getItem(draftStorageKey(projectId));
  return resolveDevProjectDraft(stored, publishedDraft);
}

function editableMetadataSnapshot(metadata: ResolvedProjectMetadata): Partial<ProjectPublicMetaOverride> {
  return {
    titleZh: metadata.titleZh,
    titleEn: metadata.titleEn,
    summaryZh: metadata.summaryZh,
    summaryEn: metadata.summaryEn,
    categoryZh: metadata.categoryZh,
    categoryEn: metadata.categoryEn,
    tagsZh: [...metadata.tagsZh],
    tagsEn: [...metadata.tagsEn],
    duration: metadata.duration ?? "",
    year: metadata.year ?? "",
    role: metadata.role ?? "",
    collaborators: [...(metadata.collaborators ?? [])],
    tools: [...(metadata.tools ?? [])],
  };
}

export function DynamicProjectPage({ projectId, metadata }: { projectId: string; metadata: ResolvedProjectMetadata }) {
  const { locale, pathFor } = useLocale();
  const location = useLocation();
  const { isEditing } = useCaseStudyEditor();
  // This page's own light (bg-[#F7F6ED], see the <article> below) background,
  // declared for ProductionExportDock's surface-adaptive glass buttons --
  // see useSurfaceSignal's own comment for why this can't just be page CSS.
  useSurfaceSignal("light");
  // ProjectEndSections' "Other Projects" slot cards need PERMISSION
  // (isOwner) kept separate from editor-chrome visibility (isEditing, which
  // already folds in editingMode via useCaseStudyEditor) -- same split as
  // HomePage's grid, so draft/hidden projects stay clickable for the owner
  // even with editingMode off.
  const isOwner = useOwnerMode();
  // Reactive, not a one-shot resolveProjectCatalog() snapshot -- Other
  // Projects (ProjectEndSections below) must never keep recommending a
  // project whose catalog entry has since changed (deleted, hidden,
  // unpublished) while this page stays open.
  const projectCatalog = useOwnerProjectCatalog(locale);
  const initialHydration = useRef<ReturnType<typeof loadDraft> | null>(null);
  if (!initialHydration.current) initialHydration.current = loadDraft(projectId);
  const [draft, setDraft] = useState<DynamicProjectDraft>(() => initialHydration.current!.draft);
  const [draftLifecycle, setDraftLifecycle] = useState<DraftLifecycle>("hydrating");
  const draftLifecycleRef = useRef<DraftLifecycle>("hydrating");
  const [suspiciousLocalDraft, setSuspiciousLocalDraft] = useState(
    () => initialHydration.current!.suspiciousLocalDraft,
  );
  const [suspiciousReason, setSuspiciousReason] = useState(
    () => initialHydration.current!.suspiciousReason,
  );
  const [orphanedDiskMappings, setOrphanedDiskMappings] = useState<OrphanedDiskMapping[]>([]);
  const [projectCodeOpen, setProjectCodeOpen] = useState(false);
  const [projectCodeUndo, setProjectCodeUndo] = useState<ProjectCodeUndo | null>(null);
  const [projectCodeStatus, setProjectCodeStatus] = useState("");
  const [diskImageMapping, setDiskImageMapping] = useState<DynamicProjectImageMapping | null>(null);
  const loadedProjectId = useRef(projectId);

  const transitionDraftLifecycle = (next: DraftLifecycle) => {
    draftLifecycleRef.current = next;
    setDraftLifecycle(next);
  };

  const applyAuthoringMutation = (
    updater: DynamicProjectDraft | ((current: DynamicProjectDraft) => DynamicProjectDraft),
  ) => {
    transitionDraftLifecycle("ready-dirty");
    setDraft(updater);
  };

  // Every other template's own width is clamped to this same rail (see
  // --case-study-master-rail in template-library.css) so nothing can ever
  // render wider than whatever this page's real top title uses.
  // Cover content is rendered separately from the active Portfolio 2.0 flow.
  const instancesAfterCover = draft.templateInstances;
  const masterRailStyle = {
    "--case-study-header-inset": "var(--site-page-gutter)",
    "--case-study-header-title-max": "var(--site-content-max-width)",
  } as CSSProperties;

  useEffect(() => {
    if (loadedProjectId.current === projectId) return;
    loadedProjectId.current = projectId;
    const hydration = loadDraft(projectId);
    transitionDraftLifecycle("hydrating");
    setDraft(hydration.draft);
    setSuspiciousLocalDraft(hydration.suspiciousLocalDraft);
    setSuspiciousReason(hydration.suspiciousReason);
    setOrphanedDiskMappings([]);
    setProjectCodeOpen(false);
    setProjectCodeUndo(null);
    setProjectCodeStatus("");
    setDiskImageMapping(null);
  }, [projectId]);

  const reloadDiskImages = async () => {
    try {
      const mapping = await getDynamicProjectImageMapping(projectId);
      setDiskImageMapping(mapping);
      setDraft((current) => {
        const hydration = hydrateExistingDiskImageAssets(current.templateInstances, mapping);
        setOrphanedDiskMappings(hydration.orphanedMappings);
        return { ...current, templateInstances: hydration.instances };
      });
    } catch {
      // Production pages and a stopped local content service keep their existing read path.
    }
  };

  useEffect(() => {
    let cancelled = false;
    void getDynamicProjectImageMapping(projectId).then((mapping) => {
      if (cancelled) return;
      setDiskImageMapping(mapping);
      setDraft((current) => {
        const hydration = hydrateExistingDiskImageAssets(current.templateInstances, mapping);
        setOrphanedDiskMappings(hydration.orphanedMappings);
        return { ...current, templateInstances: hydration.instances };
      });
    }).catch(() => undefined).finally(() => {
      if (!cancelled && draftLifecycleRef.current === "hydrating") {
        transitionDraftLifecycle("ready-clean");
      }
    });
    return () => { cancelled = true; };
  }, [projectId]);

  useEffect(() => {
    if (draftLifecycleRef.current !== "ready-dirty") return undefined;
    const timeout = window.setTimeout(() => {
      if (typeof window === "undefined") return;
      try {
        window.localStorage.setItem(draftStorageKey(projectId), JSON.stringify(draft));
        markProjectDirty(projectId);
        transitionDraftLifecycle("ready-clean");
      } catch {
        // Best-effort autosave, matching every other draft page in this app.
      }
    }, 400);
    return () => window.clearTimeout(timeout);
  }, [draft, projectId]);

  // Two independent title lines from EDIT PROJECT INFO (titleLine1Zh/
  // titleLine2Zh, titleLine1En/titleLine2En on the project's metadata
  // override -- see projectMetadata.ts's resolveTitleLines), not a single
  // string split on "\n". An empty titleLine2 (old data that has never
  // been split, or a genuinely single-line title) is filtered out here so
  const heroTitleLines = [metadata.titleLine1, metadata.titleLine2]
    .map((line) => line.trim())
    .filter(Boolean);

  // The collection-export-only glow background lives on the ancestor
  // [data-project-route-shell] (styles.css) — this article's own opaque
  // bg-deepIndigo would otherwise sit on top and hide it completely, so it
  // drops to transparent in capture mode only.
  return (
    <PageTransition>
      <article
        data-dynamic-project-page
        data-draft-lifecycle={draftLifecycle}
        data-suspicious-local-draft={suspiciousLocalDraft ? "true" : "false"}
        data-orphaned-disk-mapping-count={orphanedDiskMappings.length}
        className={`overflow-hidden ${isCollectionExportCapture() ? "" : "bg-[#F7F6ED]"}`}
        // One base accent for this project's Hero + Footer -- both derive
        // their actual surface color from this via color-mix() in
        // project-web-sections.css, never rendered raw. Set here (the
        // common ancestor of both ProjectPresentation/Hero and
        // ProjectEndSections/Footer) so a single value drives both.
        style={{ "--project-accent": metadata.projectThemeColor } as CSSProperties}
      >
        {isCollectionExportCapture() ? null : (
          <>
            {/* Floating circular control, not a header/toolbar row -- reuses
                ProjectBackToTop's exact visual language (diameter, border,
                background, shadow, hover transition) so the two read as one
                family, differing only in icon and fixed corner. Always on
                (no scroll-triggered fade like BackToTop), and pinned to
                top-left while BackToTop only ever occupies bottom-right, so
                the two can never overlap. Always the current-locale
                Portfolio homepage -- /work is now owner-only Project
                Archive tooling, not part of public navigation, and there is
                no browser-history guessing here. data-project-back-button
                (not data-project-back-to-top) keeps it out of the unrelated
                scroll-to-top DOM-strip selectors in the export/print
                pipeline while still picking up the same warm-Cover-surface
                color override as every other floating control here (see
                project-web-sections.css). */}
            <Link
              to={pathFor("/")}
              data-project-back-button
              aria-label={locale === "zh" ? "返回首页" : "Back to home"}
              title={locale === "zh" ? "返回" : "Back"}
              className="fixed left-4 top-4 z-[70] grid h-11 w-11 place-items-center rounded-full border border-[#495d47]/30 bg-[#f7f6ed] text-[#495d47] shadow-[0_8px_22px_rgba(3,5,26,0.12)] transition-[opacity,transform,border-color,color,background-color] duration-300 ease-out hover:border-[#495d47] hover:bg-[#495d47] hover:text-[#f7f6ed] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#495d47] motion-reduce:transition-none md:left-7 md:top-7"
            >
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            </Link>
            {/* Quiet typography, not a segmented control -- no shared
                container, background, or border with Back above. */}
            <div className="fixed right-4 top-4 z-[70] flex items-center gap-1.5 text-[13px] font-medium md:right-7 md:top-7">
              <Link
                to={`${pathFor(location.pathname, "zh")}${location.search}${location.hash}`}
                className={`transition-colors duration-200 ${locale === "zh" ? "text-[#495d47]" : "text-[#495d47]/45 hover:text-[#495d47]"}`}
              >
                中文
              </Link>
              <span aria-hidden="true" className="text-[#495d47]/30">/</span>
              <Link
                to={`${pathFor(location.pathname, "en")}${location.search}${location.hash}`}
                className={`transition-colors duration-200 ${locale === "en" ? "text-[#495d47]" : "text-[#495d47]/45 hover:text-[#495d47]"}`}
              >
                EN
              </Link>
            </div>
          </>
        )}
        <ProjectPresentation
          category={metadata.category ?? ""}
          titleLines={heroTitleLines}
          duration={metadata.duration ?? ""}
          description={metadata.summary ?? ""}
        />

        {/* backgroundColor overrides caseStudyLayout.contentSection's own
            bg-deepIndigo (inline style always wins over a utility class,
            regardless of Tailwind's generated rule order) -- scoped to
            this page only, contentSection's shared definition is
            untouched so every other page that uses it is unaffected. */}
        <section
          className={caseStudyLayout.contentSection}
          style={{ paddingBlock: 0, backgroundColor: "#F7F6ED" }}
        >
          {/* Project templates touch edge-to-edge in flow. Each renderer owns
              any vertical breathing room inside its own section. */}
          <div
            className={`${caseStudyLayout.blocks} project-content-blocks`}
            style={{ ...masterRailStyle, marginTop: 0, gap: 0 }}
          >
            {isEditing ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[6px] border border-electricBlue/25 bg-archiveBlue/10 px-3 py-2">
                <div className="grid gap-1">
                  <span className={`text-xs ${projectCodeStatus ? "text-[#d8bb72]" : "text-softWhite/44"}`}>
                    {projectCodeStatus || (locale === "zh" ? "当前为本地草稿" : "Current local draft")}
                  </span>
                  {suspiciousLocalDraft ? (
                    <span data-suspicious-draft-warning className="text-xs text-[#8b4b37]">
                      {locale === "zh" ? `检测到可疑本地草稿：${suspiciousReason}` : `Suspicious local draft: ${suspiciousReason}`}
                    </span>
                  ) : null}
                  {orphanedDiskMappings.length > 0 ? (
                    <span data-orphaned-mapping-warning className="text-xs text-[#8b4b37]">
                      {locale === "zh"
                        ? `检测到 ${orphanedDiskMappings.length} 条孤立磁盘资源映射；未重建任何模板。`
                        : `${orphanedDiskMappings.length} orphaned disk asset mappings found; no templates were recreated.`}
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {projectCodeUndo ? (
                    <button
                      type="button"
                      className="editor-action inline-flex items-center gap-2"
                      onClick={() => {
                        applyAuthoringMutation(structuredClone(projectCodeUndo.draft));
                        setProjectPublicMetaOverride(projectId, projectCodeUndo.metadata);
                        setProjectCodeUndo(null);
                        setProjectCodeStatus(locale === "zh" ? "本次项目代码应用已撤销，尚未落盘" : "Project-code application undone, not saved to disk");
                      }}
                    >
                      <Undo2 className="h-4 w-4" aria-hidden="true" />
                      {locale === "zh" ? "撤销本次项目代码应用" : "Undo project-code application"}
                    </button>
                  ) : null}
                  <button type="button" className="editor-action inline-flex items-center gap-2" onClick={() => setProjectCodeOpen(true)}>
                    <Braces className="h-4 w-4" aria-hidden="true" />
                    {locale === "zh" ? "项目代码" : "Project code"}
                  </button>
                </div>
              </div>
            ) : null}
            <TemplateFlowRegion
              regionId="content"
              projectId={projectId}
              legacyItems={[]}
              instances={instancesAfterCover}
              onInstancesChange={(next) => applyAuthoringMutation((current) => {
                const hydration = hydrateExistingDiskImageAssets(next, diskImageMapping);
                setOrphanedDiskMappings(hydration.orphanedMappings);
                return {
                  ...current,
                  // Cover remains presentation-owned. Every other template,
                  // including statement-longform, stays in this ordered flow.
                  templateInstances: hydration.instances,
                  updatedAt: new Date().toISOString(),
                };
              })}
              isEditing={isEditing}
              language={locale}
              onDiskImagesChanged={() => void reloadDiskImages()}
              db={{
                getDraftImage: (id) => getProjectBodyAsset(id),
                putDraftImage: (record) => putProjectBodyAssetRecord({ ...record, projectId }),
                deleteDraftImage: (id) => deleteProjectBodyAsset(id),
              }}
            />
          </div>
        </section>
        <ProjectEndSections
          currentProjectId={projectId}
          projects={projectCatalog}
          pathFor={pathFor}
          isOwner={isOwner}
          isEditingUI={isEditing}
        />
        {isEditing && projectCodeOpen ? (
          <DynamicProjectCodePanel
            projectId={projectId}
            metadata={metadata}
            instances={draft.templateInstances}
            language={locale}
            onApply={(nextInstances, metadataPatch, recoveryPath) => {
              setProjectCodeUndo({ draft: structuredClone(draft), metadata: editableMetadataSnapshot(metadata) });
              applyAuthoringMutation((current) => {
                const hydration = hydrateExistingDiskImageAssets(nextInstances, diskImageMapping);
                setOrphanedDiskMappings(hydration.orphanedMappings);
                return {
                  ...current,
                  templateInstances: hydration.instances,
                  updatedAt: new Date().toISOString(),
                };
              });
              setProjectPublicMetaOverride(projectId, metadataPatch);
              setProjectCodeStatus(locale === "zh" ? `尚未落盘 · 已备份 ${recoveryPath}` : `Not saved to disk · Backed up to ${recoveryPath}`);
            }}
            onClose={() => setProjectCodeOpen(false)}
          />
        ) : null}
      </article>
    </PageTransition>
  );
}
