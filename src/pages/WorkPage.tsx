import { useEffect, useRef, useState, type DragEvent } from "react";
import { AlertTriangle, ArrowLeft, ArrowUp, ArrowDown, Copy, Edit3, ExternalLink, FilePlus2, GripVertical, ImageUp, Loader2, Pencil, RotateCcw, Save, Star, Trash2, X } from "lucide-react";
import { Link } from "react-router-dom";
import { PageTransition } from "../components/PageTransition";
import { ACCEPTED_COVER_TYPES, MAX_COVER_FILE_SIZE } from "../components/ProjectCoverEditor";
import { NewProjectWizard, ProjectInfoEditor } from "../components/ProjectManagementPanels";
import { useOwnerProjectCatalog, useProjectCatalog } from "../hooks/useProjectCatalog";
import { useProjectCover } from "../hooks/useProjectCover";
import { commitProjectCover, decodeProjectCover, stageProjectCover } from "../lib/portfolioContentClient";
import {
  createDynamicProject,
  getPortfolioTrackLabel,
  PORTFOLIO_TRACK_OPTIONS,
  setProjectArchiveOrder,
  setProjectFeatured,
  setProjectPublicMetaOverride,
  type PortfolioTrack,
  type ProjectCatalogItem,
  type ProjectPublicationState,
  type ProjectVisibility,
  type ResolvedProjectMetadata,
} from "../lib/projectMetadata";
import { createStableId, getProjectDocument, saveProjectDocument } from "../lib/projectDocuments";
import { finalizeProjectDeletion, markProjectPendingDeletion, undoProjectPendingDeletion } from "../lib/deletePortfolioProject";
import { useDirtyIntents } from "../lib/dirtyIntentStore";
import { useLocale } from "../locales/LocaleContext";
import { useEditingMode } from "../hooks/useEditingMode";
import { useSurfaceSignal } from "../hooks/useSurfaceSignal";

// No Homepage-placement / PROJECT-EXPLORE slot control here anymore
// (Phase B.1 of the Homepage 3.0 Modular Interaction Redesign): the
// Homepage no longer reads homeProjectSlots/homeExplorationSlots at all --
// it renders directly from the canonical catalog, sorted by archiveOrder
// (HomeProjectFlow.tsx). This page's own archiveOrder control below (see
// `copy.edit`/`copy.sorting`) IS the Homepage's order now; there is
// deliberately no second ordering or placement system. The old
// homeProjectSlots.ts/homeExplorationSlots.ts stores and their persisted
// data still exist (never destructively deleted -- see CLAUDE.md's
// non-destructive-migration rule) and are still read/written by
// deletePortfolioProject.ts (clears a dangling slot reference when a
// project is permanently deleted, so the legacy data doesn't accumulate
// references to ids that no longer exist) and by the publish bundle
// export/import pipeline (kept in sync across publishes so the legacy
// data is never silently lost or orphaned) -- but neither of those affects
// what actually renders on the Homepage, and this page has no UI for them.

const archiveCopy = {
  zh: {
    eyebrow: "/ 项目中台",
    title: "项目中台",
    description: "所有项目的统一登记与状态入口 -- 在这里看到的、改动的，就是首页与项目页实际使用的同一份数据。",
    edit: "项目顺序",
    sorting: "项目顺序（首页顺序）",
    sortingHelp: "拖动项目调整顺序，或使用上下移动按钮 —— 这就是首页的展示顺序，只有点击保存后才会写入。",
    featured: "首页推荐",
    moveUp: "上移",
    moveDown: "下移",
    save: "保存顺序",
    cancel: "取消",
    comingSoon: "筹备中",
    deleteProject: "删除项目",
    deleteTitle: "删除项目？",
    deleteBody: (title: string) => `「${title}」将从档案中隐藏，并在下次发布时从生产环境移除。本地草稿、资源仍会保留，可在发布完成前随时撤销。`,
    deleteConfirm: "删除",
    pendingDeletionTitle: "待删除项目",
    pendingDeletionHelp: "已标记删除，尚未发布。发布成功前可以撤销；本地数据尚未被清除。",
    undoDelete: "撤销删除",
    openProject: "打开项目页",
    editInfo: "编辑项目信息",
    duplicate: "复制项目",
    delete: "删除",
    newProject: "新增项目",
    publicationLabel: "状态",
    visibilityLabel: "可见性",
    trackLabel: "方向",
    updatedLabel: "更新于",
    pendingChanges: "有未保存的修改",
    unclassified: "未分类",
    publicationOptions: { draft: "草稿", published: "已发布", "coming-soon": "筹备中" } as Record<ProjectPublicationState, string>,
    visibilityOptions: { public: "公开", hidden: "隐藏" } as Record<ProjectVisibility, string>,
    empty: "还没有项目 -- 点击“新增项目”创建第一个。",
  },
  en: {
    eyebrow: "/ Project Control Center",
    title: "Project Control Center",
    description: "The single registry every project lives in -- what you see and change here is the same data the Homepage and project pages actually read.",
    edit: "Homepage Order",
    sorting: "Homepage Order (archive order)",
    sortingHelp: "Drag projects into order, or use the move buttons — this is the exact order the Homepage displays them in. Changes are written only when you save.",
    featured: "Featured",
    moveUp: "Move up",
    moveDown: "Move down",
    save: "Save order",
    cancel: "Cancel",
    comingSoon: "Coming soon",
    deleteProject: "Delete project",
    deleteTitle: "Delete this project?",
    deleteBody: (title: string) => `"${title}" will be hidden from the archive and removed from production on the next publish. Local drafts and assets are kept, and this can be undone any time before that publish completes.`,
    deleteConfirm: "Delete",
    pendingDeletionTitle: "Pending deletion",
    pendingDeletionHelp: "Marked for deletion but not yet published. You can undo any time before that publish completes — local data has not been cleared.",
    undoDelete: "Undo delete",
    openProject: "Open project page",
    editInfo: "Edit project info",
    duplicate: "Duplicate project",
    delete: "Delete",
    newProject: "New project",
    publicationLabel: "State",
    visibilityLabel: "Visibility",
    trackLabel: "Track",
    updatedLabel: "Updated",
    pendingChanges: "Has unpublished changes",
    unclassified: "Unclassified",
    publicationOptions: { draft: "Draft", published: "Published", "coming-soon": "Coming soon" } as Record<ProjectPublicationState, string>,
    visibilityOptions: { public: "Public", hidden: "Hidden" } as Record<ProjectVisibility, string>,
    empty: "No projects yet -- click \"New project\" to create the first one.",
  },
};

export function WorkPage() {
  const { locale, pathFor } = useLocale();
  // Portfolio 2.0's own light (#F7F6ED) surface, declared for
  // ProductionExportDock's surface-adaptive glass buttons -- see
  // useSurfaceSignal's own comment for why this can't just be page CSS.
  // Was "dark" (this page's old permanent bg-deepIndigo) -- updated
  // together with this page's own visual migration below.
  useSurfaceSignal("light");
  // Raw: still needed for the pending-deletion strip itself and the
  // editingProject/deleteTarget lookups below, which must find a
  // pending-delete project too (its own row is what "undo" acts on).
  const projectCatalog = useProjectCatalog(locale);
  // Filtered: the one canonical owner-lifecycle resolution, shared with
  // Homepage/Other Projects/publish/export -- see fullArchive below.
  const ownerProjectCatalog = useOwnerProjectCatalog(locale);
  // Archive/export controls (New project, Reorder, Edit project info) are
  // editor chrome, not permission -- gated on isOwner && editingMode via
  // useEditingMode(), same as ProductionExportDock/HomePage. This page is
  // only reachable at all from a normal click path via the dock's PROJECT
  // ARCHIVE link, which itself only renders once editingMode is already on.
  const editingMode = useEditingMode();
  const [isEditingOrder, setIsEditingOrder] = useState(false);
  const [draftOrder, setDraftOrder] = useState<string[]>([]);
  const [draftFeatured, setDraftFeatured] = useState<Record<string, boolean>>({});
  const [draggedProjectId, setDraggedProjectId] = useState<string | null>(null);
  const [managementPanel, setManagementPanel] = useState<"new" | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const copy = archiveCopy[locale];

  // Two-phase deletion (Publishing Architecture V2, Deletion Transaction
  // Model): a project with an open DELETE dirty intent is filtered out of
  // every list below -- "deleted" in the UI, but its local data (draft,
  // assets, cover, catalog override) is untouched until finalizeProjectDeletion()
  // confirms the delete actually published. useDirtyIntents is live-reactive,
  // so undoing a pending deletion (or a finalize completing) updates these
  // lists immediately without a page reload.
  const dirtyIntents = useDirtyIntents("project");
  const pendingDeletionIds = new Set(
    dirtyIntents.filter((entry) => entry.kind === "DELETE").map((entry) => entry.entityId),
  );
  const dirtyProjectIds = new Set(dirtyIntents.map((entry) => entry.entityId));
  const pendingDeletionProjects = projectCatalog.filter((project) => pendingDeletionIds.has(project.id));

  useEffect(() => {
    for (const id of pendingDeletionIds) {
      finalizeProjectDeletion(id).catch(() => undefined);
    }
    // Only re-run when the SET of pending-deletion ids actually changes membership,
    // not on every unrelated catalog re-render -- otherwise this would refire on
    // every keystroke elsewhere in the app.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [[...pendingDeletionIds].sort().join(",")]);

  // fullArchive is the canonical registry view: every non-deleted project,
  // in archive order -- no visibility/publication/track filter. Hiding a
  // hidden/draft/coming-soon project from THIS list is exactly the bug this
  // redesign fixes (a freshly created project defaults to hidden + draft,
  // so the old visibility==="public" display filter here meant it never
  // appeared until the owner separately made it public -- easy to read as
  // "new projects don't sync," when the catalog write and its reactivity
  // were already correct). Visibility/publication/track are now per-row
  // status + controls, never a display gate.
  const fullArchive = [...ownerProjectCatalog]
    .sort((left, right) => left.archiveOrder - right.archiveOrder);
  const managedProjects = fullArchive.filter((project) => project.group === "work");
  const projectsById = new Map(managedProjects.map((project) => [project.id, project]));

  // Undo needs to restore a project's visibility WITHIN an already-open
  // reorder session too, not just after re-entering it: deleting removes
  // the id from `draftOrder` immediately (see confirmDelete), so undoing the
  // DELETE intent alone leaves it absent from the local editing session's
  // order array even though managedProjects/pendingDeletionIds already have
  // it back. Re-append any managedProjects id that's missing from the
  // in-progress draftOrder whenever the pending-deletion set changes.
  useEffect(() => {
    if (!isEditingOrder) return;
    setDraftOrder((current) => {
      const currentSet = new Set(current);
      const missing = managedProjects.filter((project) => !currentSet.has(project.id)).map((project) => project.id);
      return missing.length ? [...current, ...missing] : current;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditingOrder, [...pendingDeletionIds].sort().join(",")]);
  const draftProjects = draftOrder
    .map((projectId) => projectsById.get(projectId))
    .filter((project): project is ResolvedProjectMetadata => Boolean(project));
  const editingProject = editingProjectId ? projectCatalog.find((project) => project.id === editingProjectId) : undefined;
  const deleteTarget = deleteTargetId ? projectCatalog.find((project) => project.id === deleteTargetId) : undefined;

  const beginEditing = () => {
    setDraftOrder(managedProjects.map((project) => project.id));
    setDraftFeatured(Object.fromEntries(managedProjects.map((project) => [project.id, project.featured])));
    setDraggedProjectId(null);
    setIsEditingOrder(true);
  };

  const cancelEditing = () => {
    setDraftOrder([]);
    setDraftFeatured({});
    setDraggedProjectId(null);
    setIsEditingOrder(false);
  };

  const moveDraftProject = (projectId: string, targetIndex: number) => {
    setDraftOrder((current) => {
      const currentIndex = current.indexOf(projectId);
      if (currentIndex < 0 || targetIndex < 0 || targetIndex >= current.length || currentIndex === targetIndex) return current;
      const next = [...current];
      next.splice(currentIndex, 1);
      next.splice(targetIndex, 0, projectId);
      return next;
    });
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>, targetProjectId: string) => {
    event.preventDefault();
    const sourceProjectId = draggedProjectId ?? event.dataTransfer.getData("text/plain");
    const targetIndex = draftOrder.indexOf(targetProjectId);
    if (sourceProjectId && targetIndex >= 0) moveDraftProject(sourceProjectId, targetIndex);
    setDraggedProjectId(null);
  };

  const saveEditing = () => {
    const workProjectIds = new Set(managedProjects.map((project) => project.id));
    let workIndex = 0;
    const normalizedCanonicalOrder = fullArchive.map((project) => {
      if (!workProjectIds.has(project.id)) return project.id;
      return draftOrder[workIndex++];
    });

    managedProjects.forEach((project) => {
      const nextFeatured = draftFeatured[project.id] ?? project.featured;
      if (nextFeatured !== project.featured) setProjectFeatured(project.id, nextFeatured);
    });
    setProjectArchiveOrder(normalizedCanonicalOrder);
    setIsEditingOrder(false);
    setDraftOrder([]);
    setDraftFeatured({});
    setDraggedProjectId(null);
  };

  const confirmDelete = () => {
    if (!deleteTargetId) return;
    // Phase 1 only: opens a DELETE dirty intent and lets the filters above
    // hide the project. No local data is touched here -- see
    // deletePortfolioProject.ts's Deletion Transaction Model.
    markProjectPendingDeletion(deleteTargetId);
    setDraftOrder((current) => current.filter((id) => id !== deleteTargetId));
    setDraftFeatured((current) => { const { [deleteTargetId]: _removed, ...rest } = current; return rest; });
    if (editingProjectId === deleteTargetId) setEditingProjectId(null);
    setDeleteTargetId(null);
  };

  // Every field below writes straight into the canonical
  // setProjectPublicMetaOverride override store -- the exact same call
  // EDIT PROJECT INFO and the old reorder-session controls already used --
  // so Homepage/DynamicProjectPage's own reactive reads (useProjectCatalog)
  // pick it up immediately, with no separate "/work draft" copy anywhere.
  const changeVisibility = (projectId: string, next: ProjectVisibility) => setProjectPublicMetaOverride(projectId, { visibility: next });
  const changePublicationState = (projectId: string, next: ProjectPublicationState) => setProjectPublicMetaOverride(projectId, { publicationState: next });
  const changeTrack = (projectId: string, next: PortfolioTrack | null) => setProjectPublicMetaOverride(projectId, { portfolioTrack: next });

  return (
    <PageTransition>
      <main className="min-h-screen text-[#3C4A3A]" style={{ background: "#F7F6ED" }}>
        {/* Floating circular Back control -- same structure/position as
            DynamicProjectPage's accepted Back button, recolored to this
            page's own new light surface (was dark-navy/acid-green admin
            tokens) instead of introducing a third color scheme. Always
            rendered regardless of editingMode -- navigation, not an
            editing control. */}
        <Link
          to={pathFor("/")}
          data-work-back-button
          aria-label={locale === "zh" ? "返回首页" : "Back to home"}
          title={locale === "zh" ? "返回" : "Back"}
          className="fixed left-4 top-4 z-[70] grid h-11 w-11 place-items-center rounded-full border border-[#495D47]/20 bg-[#F7F6ED]/90 text-[#495D47] shadow-[0_8px_22px_rgba(73,93,71,0.16)] backdrop-blur transition-[opacity,transform,border-color,color,background-color] duration-300 ease-out hover:border-[#495D47]/40 hover:bg-[#495D47] hover:text-[#F7F6ED] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#495D47]/60 motion-reduce:transition-none md:left-7 md:top-7"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </Link>

        {editingMode && !isEditingOrder ? (
          <div className="fixed right-4 top-[84px] z-[70] flex flex-wrap justify-end gap-2 md:right-6" data-work-management-actions>
            <button type="button" className="work-control-button" onClick={() => setManagementPanel("new")}><FilePlus2 className="h-3.5 w-3.5" />{copy.newProject}</button>
            <button type="button" className="work-control-button" onClick={beginEditing}><Edit3 className="h-3.5 w-3.5" />{copy.edit}</button>
          </div>
        ) : null}

        {managementPanel === "new" ? <NewProjectWizard catalog={projectCatalog} onClose={() => setManagementPanel(null)} /> : null}
        {editingProject ? <ProjectInfoEditor project={editingProject} catalog={projectCatalog} onClose={() => setEditingProjectId(null)} /> : null}
        {deleteTarget ? (
          <DeleteProjectConfirm
            title={deleteTarget.title}
            copy={copy}
            onCancel={() => setDeleteTargetId(null)}
            onConfirm={confirmDelete}
          />
        ) : null}

        {editingMode && pendingDeletionProjects.length > 0 ? (
          <section className="border-b border-[#C97B4A]/25 bg-[#C97B4A]/[0.06] py-6">
            <div className="site-container">
              <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[#B15E2E]">{copy.pendingDeletionTitle}</h2>
              <p className="mt-1.5 max-w-2xl text-xs leading-5 text-[#6E6A64]">{copy.pendingDeletionHelp}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {pendingDeletionProjects.map((project) => (
                  <div key={project.id} className="flex items-center gap-2 rounded-full border border-[#C97B4A]/30 bg-white/60 py-1.5 pl-4 pr-2 text-xs text-[#495D47]">
                    <span className="truncate">{project.title}</span>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-full border border-[#495D47]/35 px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[#2B6828] transition hover:bg-[#2B6828]/10"
                      onClick={() => undoProjectPendingDeletion(project.id)}
                    >
                      <RotateCcw className="h-3 w-3" aria-hidden="true" />
                      {copy.undoDelete}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <section className="border-b border-[#495D47]/12 py-14 md:py-16">
          <div className="site-container">
            <p className="font-mono text-[11px] font-bold tracking-[0.18em] text-[#2B6828]">{copy.eyebrow}</p>
            <h1 className="mt-3 font-display text-4xl font-semibold text-[#3C4A3A] md:text-5xl">{copy.title}</h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-[#6E6A64]">{copy.description}</p>
          </div>
        </section>

        {isEditingOrder ? (
          <section className="border-b border-[#495D47]/12 bg-white/40 py-8" data-work-order-editor>
            <div className="site-container">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="font-display text-2xl font-semibold text-[#3C4A3A]">{copy.sorting}</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6E6A64]">{copy.sortingHelp}</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="work-control-button" onClick={cancelEditing}><X className="h-3.5 w-3.5" aria-hidden="true" />{copy.cancel}</button>
                  <button type="button" className="work-control-button work-control-button--primary" onClick={saveEditing}><Save className="h-3.5 w-3.5" aria-hidden="true" />{copy.save}</button>
                </div>
              </div>

              <div className="mt-6 grid gap-2">
                {draftProjects.map((project, index) => (
                  <div
                    key={project.id}
                    className={`rounded-[10px] border bg-white/70 p-3 transition ${draggedProjectId === project.id ? "border-[#2B6828]/50 opacity-60" : "border-[#495D47]/14"}`}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(event) => handleDrop(event, project.id)}
                  >
                    <div className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-3">
                      <button
                        type="button"
                        className="grid h-9 w-9 cursor-grab place-items-center text-[#495D47]/40 active:cursor-grabbing"
                        draggable
                        onDragStart={(event) => {
                          setDraggedProjectId(project.id);
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", project.id);
                        }}
                        onDragEnd={() => setDraggedProjectId(null)}
                        aria-label={`${copy.sorting}: ${project.title}`}
                      >
                        <GripVertical className="h-5 w-5" aria-hidden="true" />
                      </button>
                      <span className="w-7 font-mono text-xs font-bold text-[#2B6828]">{String(index + 1).padStart(2, "0")}</span>
                      <p className="min-w-0 truncate font-display text-base font-semibold text-[#3C4A3A]">{project.title}</p>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          className={`grid h-9 w-9 place-items-center rounded-full border transition ${draftFeatured[project.id] ? "border-[#2B6828]/50 bg-[#2B6828]/10 text-[#2B6828]" : "border-[#495D47]/16 text-[#495D47]/40 hover:text-[#495D47]"}`}
                          onClick={() => setDraftFeatured((current) => ({ ...current, [project.id]: !current[project.id] }))}
                          aria-label={`${copy.featured}: ${project.title}`}
                          aria-pressed={Boolean(draftFeatured[project.id])}
                        >
                          <Star className={`h-4 w-4 ${draftFeatured[project.id] ? "fill-current" : ""}`} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="grid h-9 w-9 place-items-center rounded-full border border-[#495D47]/16 text-[#495D47]/56 transition hover:border-[#2B6828]/40 hover:text-[#2B6828] disabled:opacity-20"
                          onClick={() => moveDraftProject(project.id, index - 1)}
                          disabled={index === 0}
                          aria-label={`${copy.moveUp}: ${project.title}`}
                        >
                          <ArrowUp className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="grid h-9 w-9 place-items-center rounded-full border border-[#495D47]/16 text-[#495D47]/56 transition hover:border-[#2B6828]/40 hover:text-[#2B6828] disabled:opacity-20"
                          onClick={() => moveDraftProject(project.id, index + 1)}
                          disabled={index === draftProjects.length - 1}
                          aria-label={`${copy.moveDown}: ${project.title}`}
                        >
                          <ArrowDown className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : (
          <section className="pb-28 pt-2 md:pb-36">
            <div className="site-container">
              {managedProjects.length === 0 ? (
                <p className="border-t border-[#495D47]/12 py-10 text-sm leading-6 text-[#6E6A64]">{copy.empty}</p>
              ) : null}
              <div className="divide-y divide-[#495D47]/10 border-t border-[#495D47]/12">
                {managedProjects.map((project) => (
                  <ProjectControlRow
                    key={project.id}
                    project={project}
                    copy={copy}
                    locale={locale}
                    pathFor={pathFor}
                    editingMode={editingMode}
                    isDirty={dirtyProjectIds.has(project.id)}
                    onOpenInfo={() => setEditingProjectId(project.id)}
                    onDuplicate={() => duplicateManagedProject(project, managedProjects)}
                    onDelete={() => setDeleteTargetId(project.id)}
                    onVisibilityChange={(next) => changeVisibility(project.id, next)}
                    onPublicationChange={(next) => changePublicationState(project.id, next)}
                    onTrackChange={(next) => changeTrack(project.id, next)}
                  />
                ))}
              </div>
            </div>
          </section>
        )}
      </main>
    </PageTransition>
  );
}

function ProjectControlRow({
  project,
  copy,
  locale,
  pathFor,
  editingMode,
  isDirty,
  onOpenInfo,
  onDuplicate,
  onDelete,
  onVisibilityChange,
  onPublicationChange,
  onTrackChange,
}: {
  project: ResolvedProjectMetadata;
  copy: typeof archiveCopy["zh"];
  locale: "zh" | "en";
  pathFor: (path: string) => string;
  editingMode: boolean;
  isDirty: boolean;
  onOpenInfo: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onVisibilityChange: (next: ProjectVisibility) => void;
  onPublicationChange: (next: ProjectPublicationState) => void;
  onTrackChange: (next: PortfolioTrack | null) => void;
}) {
  const cover = useProjectCover(project.id, project.coverImage ?? "");
  const { messages } = useLocale();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverError, setCoverError] = useState("");
  const isAvailable = Boolean(project.route) && !project.comingSoon;
  const updatedLabel = project.updatedAt
    ? new Date(project.updatedAt).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", { year: "numeric", month: "short", day: "numeric" })
    : "--";

  // Acts directly on the row's own cover thumbnail -- no separate cover-edit
  // panel/block. Reuses the exact same canonical pipeline
  // ProjectCoverEditor's "compact" variant used (stageProjectCover ->
  // decodeProjectCover -> commitProjectCover, useProjectCover for the
  // resolved image) -- not a second upload implementation. Uploads
  // immediately on file selection (no separate candidate-preview/confirm
  // step) since there's no room for one without adding height to the row.
  const uploadCover = async (file: File) => {
    if (!ACCEPTED_COVER_TYPES.has(file.type)) { setCoverError(messages.homeEditor.unsupportedFile); return; }
    if (file.size > MAX_COVER_FILE_SIZE) { setCoverError(messages.homeEditor.fileTooLarge); return; }
    setCoverError("");
    setCoverUploading(true);
    try {
      const staged = await stageProjectCover(file);
      await decodeProjectCover(staged.publicUrl);
      await commitProjectCover(project.id, staged.commitToken);
    } catch (uploadCoverError) {
      setCoverError(uploadCoverError instanceof Error ? uploadCoverError.message : messages.homeEditor.saveError);
    } finally {
      setCoverUploading(false);
    }
  };

  return (
    <div className="py-5 md:py-6" data-work-project-row data-project-id={project.id}>
      <div className="flex flex-wrap items-start gap-4">
        <div className="group/cover relative h-16 w-24 shrink-0 overflow-hidden rounded-[8px] bg-[#495D47]/8">
          {cover.image ? <img src={cover.image} alt="" className="h-full w-full object-cover" loading="lazy" /> : null}
          {cover.hasLocalCover ? <span className="absolute right-1 top-1 rounded-full bg-[#3C4A3A]/80 px-1.5 py-0.5 font-mono text-[7px] font-bold uppercase tracking-[0.06em] text-white">Local</span> : null}
          {editingMode ? (
            <>
              <button
                type="button"
                className="absolute inset-0 grid place-items-center bg-[#1B211A]/0 text-transparent transition-colors duration-150 group-hover/cover:bg-[#1B211A]/45 group-hover/cover:text-white disabled:cursor-wait"
                onClick={() => fileInputRef.current?.click()}
                disabled={coverUploading}
                aria-label={locale === "zh" ? `更换封面: ${project.title}` : `Replace cover: ${project.title}`}
                title={locale === "zh" ? "更换封面" : "Replace cover"}
              >
                {coverUploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ImageUp className="h-4 w-4" aria-hidden="true" />}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/png,image/jpeg,image/webp"
                aria-label={locale === "zh" ? "更换封面" : "Replace cover"}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void uploadCover(file);
                }}
              />
            </>
          ) : null}
          {coverError ? <span className="absolute inset-x-0 bottom-0 truncate bg-[#B15E2E]/90 px-1 py-0.5 text-center font-mono text-[7px] font-bold text-white" title={coverError}>{coverError}</span> : null}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="truncate font-display text-lg font-semibold text-[#3C4A3A]">{project.title}</h2>
            {isDirty ? <span className="rounded-full border border-[#C97B4A]/40 bg-[#C97B4A]/10 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[#B15E2E]">{copy.pendingChanges}</span> : null}
          </div>
          <p className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-[0.1em] text-[#495D47]/44">{project.id} · {copy.updatedLabel} {updatedLabel}</p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              className="work-inline-select"
              value={project.publicationState}
              onChange={(event) => onPublicationChange(event.target.value as ProjectPublicationState)}
              disabled={!editingMode}
              aria-label={`${copy.publicationLabel}: ${project.title}`}
            >
              {(Object.entries(copy.publicationOptions) as [ProjectPublicationState, string][]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select
              className="work-inline-select"
              value={project.visibility}
              onChange={(event) => onVisibilityChange(event.target.value as ProjectVisibility)}
              disabled={!editingMode}
              aria-label={`${copy.visibilityLabel}: ${project.title}`}
            >
              {(Object.entries(copy.visibilityOptions) as [ProjectVisibility, string][]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select
              className="work-inline-select"
              value={project.portfolioTrack ?? ""}
              onChange={(event) => onTrackChange((event.target.value || null) as PortfolioTrack | null)}
              disabled={!editingMode}
              aria-label={`${copy.trackLabel}: ${project.title}`}
            >
              <option value="">{copy.unclassified}</option>
              {PORTFOLIO_TRACK_OPTIONS.map((track) => <option key={track} value={track}>{getPortfolioTrackLabel(track)}</option>)}
            </select>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {isAvailable && project.route ? (
            <Link to={pathFor(project.route)} className="work-icon-button" aria-label={`${copy.openProject}: ${project.title}`} title={copy.openProject}>
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </Link>
          ) : null}
          {editingMode ? (
            <>
              <button type="button" className="work-icon-button" onClick={onOpenInfo} aria-label={`${copy.editInfo}: ${project.title}`} title={copy.editInfo}>
                <Pencil className="h-4 w-4" aria-hidden="true" />
              </button>
              {project.isDynamic ? <button type="button" className="work-icon-button" onClick={onDuplicate} aria-label={`${copy.duplicate}: ${project.title}`} title={copy.duplicate}><Copy className="h-4 w-4" aria-hidden="true" /></button> : null}
              {project.isDynamic ? <button type="button" className="work-icon-button work-icon-button--danger" onClick={onDelete} aria-label={`${copy.delete}: ${project.title}`} title={copy.delete}><Trash2 className="h-4 w-4" aria-hidden="true" /></button> : null}
            </>
          ) : null}
        </div>
      </div>

    </div>
  );
}

function duplicateManagedProject(project: ResolvedProjectMetadata, catalog: ResolvedProjectMetadata[]) {
  const source = getProjectDocument(project.id);
  if (!source) return;
  const id = window.prompt("New stable project ID (lowercase kebab-case)", `${project.id}-copy`);
  if (!id) return;
  const slug = window.prompt("New slug (lowercase kebab-case)", `${project.slug}-copy`);
  if (!slug) return;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) { window.alert("Project ID and slug must use lowercase kebab-case."); return; }
  if (catalog.some((item) => item.id === id || item.slug === slug)) { window.alert("That project ID or slug already exists."); return; }
  const document = structuredClone(source);
  document.projectId = id;
  document.sections = document.sections.map((section) => ({
    ...section,
    id: createStableId("section"),
    blocks: section.blocks.map((block) => {
      const nodeIds = new Map(block.content.nodes?.map((node) => [node.id, createStableId("node")]) ?? []);
      return {
        ...block,
        id: createStableId("block"),
        content: {
          ...block.content,
          media: block.content.media?.map((media) => ({ ...media, id: createStableId("media") })),
          items: block.content.items?.map((item) => ({ ...item, id: createStableId("item") })),
          nodes: block.content.nodes?.map((node) => ({
            ...node,
            id: nodeIds.get(node.id) ?? createStableId("node"),
            parentId: node.parentId ? nodeIds.get(node.parentId) : undefined,
          })),
        },
      };
    }),
  }));
  saveProjectDocument(document);
  const record: ProjectCatalogItem = { id, slug, route: `/work/${slug}`, titleZh: `${project.titleZh} 副本`, titleEn: `${project.titleEn} Copy`, summaryZh: project.summaryZh, summaryEn: project.summaryEn, tagsZh: project.tagsZh, tagsEn: project.tagsEn, categoryZh: project.categoryZh, categoryEn: project.categoryEn, duration: project.duration, archiveOrder: Math.max(...catalog.map((item) => item.archiveOrder)) + 1, featured: false, group: "work", visibility: "hidden", publicationState: "draft", coverImage: "", comingSoon: false, isDynamic: true, templateId: project.templateId, templateVersionUsed: project.templateVersionUsed, year: project.year, role: project.role, collaborators: project.collaborators, tools: project.tools };
  createDynamicProject(record);
}

function DeleteProjectConfirm({ title, copy, onCancel, onConfirm }: {
  title: string;
  copy: typeof archiveCopy["zh"];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[110] grid place-items-center bg-[#08081e]/88 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-[14px] border border-peach/35 bg-[#11113a] p-5 shadow-archive">
        <div className="flex items-center gap-2 text-peach">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <h2 className="font-display text-xl font-semibold">{copy.deleteTitle}</h2>
        </div>
        <p className="mt-3 text-sm leading-6 text-softWhite/68">{copy.deleteBody(title)}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full border border-softWhite/16 px-4 py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-softWhite/64 transition hover:border-softWhite/40 hover:text-softWhite"
            onClick={onCancel}
          >
            {copy.cancel}
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full border border-peach bg-peach/12 px-4 py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-peach transition hover:bg-peach hover:text-deepIndigo"
            onClick={onConfirm}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            {copy.deleteConfirm}
          </button>
        </div>
      </div>
    </div>
  );
}
