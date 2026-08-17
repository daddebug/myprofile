import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Braces, Undo2 } from "lucide-react";
import { PageTransition } from "../components/PageTransition";
import { ProjectHeroTitleSummary } from "../components/ProjectHeroTitleSummary";
import { useCaseStudyEditor } from "../components/CaseStudyEditor";
import { useLocale } from "../locales/LocaleContext";
import { caseStudyLayout } from "../lib/caseStudyLayout";
import { TemplateFlowRegion } from "../components/TemplateInstancesSection";
import { mergeTemplateInstances, type TemplateInstance } from "../lib/projectTemplateInstances";
import { deleteProjectBodyAsset, getProjectBodyAsset, putProjectBodyAssetRecord } from "../lib/projectBodyAssetDb";
import { useTemplateHorizontalInset } from "../lib/templateLayoutDefaults";
import { layoutControls as projectHeaderLayoutControls } from "../templates/ProjectHeaderTemplate";
import type { ResolvedProjectMetadata } from "../lib/projectMetadata";
import { setProjectPublicMetaOverride, type ProjectPublicMetaOverride } from "../lib/projectMetadata";
import { DynamicProjectCodePanel } from "../components/DynamicProjectCodePanel";
import {
  getDynamicProjectImageMapping,
  type DynamicProjectImageMapping,
} from "../lib/portfolioContentClient";
import { getStagedDynamicDraft, isCollectionExportCapture, isCollectionStagingMode } from "../lib/collectionExportStaging";
import { getPublishedProjectDraft } from "../lib/publishedPortfolio";
import { markProjectDirty } from "../lib/publishIntent";
import { backfillMatchingTemplateImagePublicPaths } from "../lib/templateImageReferences";

const dynamicProjectPickerExcludedTemplateIds = ["project-header"];

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

type DynamicProjectDraft = {
  version: 1;
  templateInstances: TemplateInstance[];
  updatedAt: string;
};

type ProjectCodeUndo = {
  draft: DynamicProjectDraft;
  metadata: Partial<ProjectPublicMetaOverride>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function emptyDraft(): DynamicProjectDraft {
  return { version: 1, templateInstances: [], updatedAt: new Date(0).toISOString() };
}

function normalizeDraft(parsed: unknown): DynamicProjectDraft | null {
  if (!isRecord(parsed) || parsed.version !== 1) return null;
  return {
    version: 1,
    templateInstances: mergeTemplateInstances(parsed.templateInstances),
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : emptyDraft().updatedAt,
  };
}

function loadDraft(projectId: string): DynamicProjectDraft {
  const publishedDraft = normalizeDraft(getPublishedProjectDraft(projectId));
  if (typeof window === "undefined" || !import.meta.env.DEV) {
    // Production (and any non-browser/prerender context) has no access to
    // the owner's own localStorage, and is never a Collection-export
    // capture — that always runs against the local dev server, where DEV is
    // true (see the branch below). Fall back to this exact project's own
    // published draft: the same static data already bundled for every
    // visitor via publishedPortfolio.json, produced by the same
    // portfolio:import pipeline that writes the localStorage draft shape.
    return publishedDraft ?? emptyDraft();
  }
  // Collection export capture: this browser's localStorage is Playwright's
  // separate, empty profile, so the real draft was staged ahead of time (see
  // collectionExportStaging.ts) and fetched into memory before this page's
  // effect ever calls loadDraft. Never falls back to (necessarily empty)
  // localStorage in this mode — an unstaged project should render as
  // genuinely empty rather than silently look like real, saved content.
  if (isCollectionStagingMode()) {
    const staged = getStagedDynamicDraft(projectId);
    return staged ?? emptyDraft();
  }
  try {
    const stored = window.localStorage.getItem(draftStorageKey(projectId));
    if (!stored) return emptyDraft();
    const localDraft = normalizeDraft(JSON.parse(stored) as unknown) ?? emptyDraft();
    return publishedDraft
      ? {
          ...localDraft,
          templateInstances: backfillMatchingTemplateImagePublicPaths(
            localDraft.templateInstances,
            publishedDraft.templateInstances,
          ),
        }
      : localDraft;
  } catch {
    return emptyDraft();
  }
}

function mergeDiskImageInstances(
  instances: TemplateInstance[],
  mapping: DynamicProjectImageMapping | null,
) {
  if (!mapping) return instances;
  const next = [...instances];
  const diskInstances = Object.values(mapping.instances).sort((a, b) => a.order - b.order);
  for (const disk of diskInstances) {
    const diskItems = Array.isArray(disk.content.items) ? disk.content.items : [];
    const persistedItems = disk.templateId === "image-row" ? diskItems.filter((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return false;
      const image = (value as Record<string, unknown>).image;
      if (!image || typeof image !== "object" || Array.isArray(image)) return false;
      const imageId = (image as Record<string, unknown>).imageId;
      return typeof imageId === "string" && Boolean(mapping.images[imageId]);
    }) : [];
    const persistedCompareImages = disk.templateId === "direction-compare"
      ? (["leftImage", "rightImage"] as const).flatMap((field) => {
          const image = disk.content[field];
          if (!image || typeof image !== "object" || Array.isArray(image)) return [];
          const imageId = (image as Record<string, unknown>).imageId;
          return typeof imageId === "string" && mapping.images[imageId] ? [[field, image] as const] : [];
        })
      : [];
    if (!persistedItems.length && !persistedCompareImages.length) continue;
    const existingIndex = next.findIndex((instance) => instance.instanceId === disk.instanceId);
    if (existingIndex < 0) {
      const restored: TemplateInstance = {
        instanceId: disk.instanceId,
        templateId: disk.templateId,
        regionId: disk.regionId,
        anchorId: disk.anchorId,
        content: structuredClone(disk.content),
        ...(disk.layoutSettings ? { layoutSettings: structuredClone(disk.layoutSettings) } : {}),
      };
      next.splice(Math.min(disk.order, next.length), 0, restored);
      continue;
    }
    const existing = next[existingIndex];
    if (existing.templateId === "direction-compare" && disk.templateId === "direction-compare") {
      const restoredContent = { ...existing.content };
      for (const [field, image] of persistedCompareImages) {
        const localImage = existing.content[field];
        restoredContent[field] = localImage && typeof localImage === "object" && !Array.isArray(localImage)
          ? { ...structuredClone(image), ...localImage, imageId: (image as Record<string, unknown>).imageId, publicPath: (image as Record<string, unknown>).publicPath }
          : structuredClone(image);
      }
      next[existingIndex] = { ...existing, content: restoredContent };
      continue;
    }
    if (existing.templateId !== "image-row" || disk.templateId !== "image-row") continue;
    const localItems = Array.isArray(existing.content.items) ? existing.content.items : [];
    const byId = new Map(localItems.flatMap((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value) || typeof (value as Record<string, unknown>).id !== "string") return [];
      return [[(value as Record<string, unknown>).id as string, value] as const];
    }));
    for (const diskItem of persistedItems) {
      const diskRecord = diskItem as Record<string, unknown>;
      const itemId = diskRecord.id as string;
      const local = byId.get(itemId);
      byId.set(itemId, local && typeof local === "object" && !Array.isArray(local)
        ? { ...(diskRecord as Record<string, unknown>), ...(local as Record<string, unknown>), image: diskRecord.image }
        : diskRecord);
    }
    const persistedIds = new Set(persistedItems.map((item) => (item as Record<string, unknown>).id));
    const mergedItems = [
      ...localItems.map((item) => {
        const id = item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>).id : undefined;
        return typeof id === "string" && persistedIds.has(id) ? byId.get(id) : item;
      }),
      ...persistedItems.filter((item) => !localItems.some((local) => local && typeof local === "object" && !Array.isArray(local) && (local as Record<string, unknown>).id === (item as Record<string, unknown>).id)),
    ];
    next[existingIndex] = {
      ...existing,
      content: { ...existing.content, items: mergedItems },
    };
  }
  return next;
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
  const { locale, pathFor, messages } = useLocale();
  const { isEditing } = useCaseStudyEditor();
  const [draft, setDraft] = useState<DynamicProjectDraft>(() => loadDraft(projectId));
  const [projectCodeOpen, setProjectCodeOpen] = useState(false);
  const [projectCodeUndo, setProjectCodeUndo] = useState<ProjectCodeUndo | null>(null);
  const [projectCodeStatus, setProjectCodeStatus] = useState("");
  const [diskImageMapping, setDiskImageMapping] = useState<DynamicProjectImageMapping | null>(null);
  const didMount = useRef(false);
  const loadedProjectId = useRef(projectId);

  // Every other template's own width is clamped to this same rail (see
  // --case-study-master-rail in template-library.css) so nothing can ever
  // render wider than whatever this page's real top title uses.
  const headerTemplateDefaultInset = useTemplateHorizontalInset("project-header");
  const xmindTemplateDefaultInset = useTemplateHorizontalInset("xmind-breakdown");
  const headerInstance = draft.templateInstances.find((instance) => instance.templateId === "project-header");
  const xmindInstance = draft.templateInstances.find((instance) => instance.templateId === "xmind-breakdown");
  const xmindHorizontalInset = xmindInstance?.layoutSettings?.horizontalInset ?? xmindTemplateDefaultInset;
  const masterRailStyle = headerInstance
    ? {
        // A real Project Header instance exists — mirror its own current
        // inset (its own override if set, otherwise the template's saved
        // default) and its title's max-width, so the rail always matches
        // Header's real current rendering, including if it's edited later.
        "--case-study-header-inset": `${headerInstance.layoutSettings?.horizontalInset ?? headerTemplateDefaultInset}px`,
        "--case-study-header-title-max": projectHeaderLayoutControls.titleMaxWidth,
        "--dynamic-xmind-horizontal-inset": `${xmindHorizontalInset}px`,
      } as CSSProperties
    : {
        // No Project Header instance on this project — this page's real
        // top title is instead its own built-in hero (heroContainer, which
        // renders through .site-container). Falling back to Project
        // Header's *template default* inset/title-max here would clamp
        // every template to a rail that has nothing to do with what's
        // actually anchoring the page. Point the same two inputs at the
        // site-wide tokens .site-container itself uses instead, so the
        // rail this produces is exactly .site-container's own box.
        "--case-study-header-inset": "var(--site-page-gutter)",
        "--case-study-header-title-max": "var(--site-content-max-width)",
        "--dynamic-xmind-horizontal-inset": `${xmindHorizontalInset}px`,
      } as CSSProperties;

  useEffect(() => {
    if (loadedProjectId.current === projectId) return;
    loadedProjectId.current = projectId;
    didMount.current = false;
    setDraft(loadDraft(projectId));
    setProjectCodeOpen(false);
    setProjectCodeUndo(null);
    setProjectCodeStatus("");
    setDiskImageMapping(null);
  }, [projectId]);

  const reloadDiskImages = async () => {
    try {
      const mapping = await getDynamicProjectImageMapping(projectId);
      setDiskImageMapping(mapping);
      setDraft((current) => ({
        ...current,
        templateInstances: mergeDiskImageInstances(current.templateInstances, mapping),
      }));
    } catch {
      // Production pages and a stopped local content service keep their existing read path.
    }
  };

  useEffect(() => {
    let cancelled = false;
    void getDynamicProjectImageMapping(projectId).then((mapping) => {
      if (cancelled) return;
      setDiskImageMapping(mapping);
      setDraft((current) => ({
        ...current,
        templateInstances: mergeDiskImageInstances(current.templateInstances, mapping),
      }));
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [projectId]);

  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return undefined;
    }
    const timeout = window.setTimeout(() => {
      if (typeof window === "undefined") return;
      try {
        window.localStorage.setItem(draftStorageKey(projectId), JSON.stringify(draft));
        markProjectDirty(projectId);
      } catch {
        // Best-effort autosave, matching every other draft page in this app.
      }
    }, 400);
    return () => window.clearTimeout(timeout);
  }, [draft, projectId]);

  // The collection-export-only glow background lives on the ancestor
  // [data-project-route-shell] (styles.css) — this article's own opaque
  // bg-deepIndigo would otherwise sit on top and hide it completely, so it
  // drops to transparent in capture mode only.
  return (
    <PageTransition>
      <article className={`overflow-hidden text-softWhite ${isCollectionExportCapture() ? "" : "bg-deepIndigo"}`}>
        {/* paddingBottom override: caseStudyLayout.heroSection's own pb-14/
            md:pb-20 is shared with CrossPlatformDraftPage/ThreeDCharacterUiDraftPage
            (untouched there) — this page's hero-to-first-template gap was
            too large stacked on top of contentSection's own padding-top and
            the template grid's margin-top, so it's shortened here only. */}
        <section className={caseStudyLayout.heroSection} style={{ paddingBottom: "40px" }}>
          <div className="absolute inset-0 bg-grain bg-[length:18px_18px] opacity-25" />
          <div className={caseStudyLayout.heroContainer}>
            {isCollectionExportCapture() ? null : (
              <Link to={pathFor("/work")} className={caseStudyLayout.backLink}>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                {messages.project.backToArchive}
              </Link>
            )}
            <div className={caseStudyLayout.heroComposition}>
              <div className={caseStudyLayout.heroCopy}>
                {metadata.category ? <p className={caseStudyLayout.category}>{metadata.category}</p> : null}
                <ProjectHeroTitleSummary>
                  <h1 className={caseStudyLayout.heroTitle}>{metadata.title}</h1>
                  {metadata.summary ? <p className={caseStudyLayout.subtitle}>{metadata.summary}</p> : null}
                </ProjectHeroTitleSummary>
              </div>
              <div className={caseStudyLayout.durationPosition}>
                {metadata.duration ? <p className={caseStudyLayout.durationText}>{metadata.duration}</p> : null}
              </div>
            </div>
          </div>
        </section>

        {/* paddingTop override — same reasoning as heroSection's paddingBottom
            above: shortens the hero-to-first-template gap without touching
            the shared class (CrossPlatformDraftPage/ThreeDCharacterUiDraftPage
            keep their own py-16/md:py-24 unchanged). */}
        <section className={caseStudyLayout.contentSection} style={{ paddingTop: "56px" }}>
          {/* caseStudyLayout.blocks (gap-12), not contentStack (gap-24/32) —
              matches the container CrossPlatformDraftPage/ThreeDCharacterUiDraftPage
              wrap their own TemplateFlowRegion calls in, so template-to-template
              spacing is governed by exactly one grid gap plus InstanceBlock's own
              margin, the same as every other project page. blocks' own mt-14
              is overridden to 0 below — it's redundant on top of
              contentSection's paddingTop for the first template specifically,
              and this page has no legacy content that depends on it. */}
          <div className={caseStudyLayout.blocks} style={{ ...masterRailStyle, marginTop: 0 }}>
            {isEditing ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[6px] border border-electricBlue/25 bg-archiveBlue/10 px-3 py-2">
                <span className={`text-xs ${projectCodeStatus ? "text-[#d8bb72]" : "text-softWhite/44"}`}>
                  {projectCodeStatus || (locale === "zh" ? "当前为本地草稿" : "Current local draft")}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {projectCodeUndo ? (
                    <button
                      type="button"
                      className="editor-action inline-flex items-center gap-2"
                      onClick={() => {
                        setDraft(structuredClone(projectCodeUndo.draft));
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
              instances={draft.templateInstances}
              onInstancesChange={(next) => setDraft((current) => ({
                ...current,
                templateInstances: mergeDiskImageInstances(next, diskImageMapping),
                updatedAt: new Date().toISOString(),
              }))}
              isEditing={isEditing}
              language={locale}
              pickerExcludedTemplateIds={dynamicProjectPickerExcludedTemplateIds}
              onDiskImagesChanged={() => void reloadDiskImages()}
              db={{
                getDraftImage: (id) => getProjectBodyAsset(id),
                putDraftImage: (record) => putProjectBodyAssetRecord({ ...record, projectId }),
                deleteDraftImage: (id) => deleteProjectBodyAsset(id),
              }}
            />
          </div>
        </section>
        {isEditing && projectCodeOpen ? (
          <DynamicProjectCodePanel
            projectId={projectId}
            metadata={metadata}
            instances={draft.templateInstances}
            language={locale}
            onApply={(nextInstances, metadataPatch, recoveryPath) => {
              setProjectCodeUndo({ draft: structuredClone(draft), metadata: editableMetadataSnapshot(metadata) });
              setDraft((current) => ({
                ...current,
                templateInstances: mergeDiskImageInstances(nextInstances, diskImageMapping),
                updatedAt: new Date().toISOString(),
              }));
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
