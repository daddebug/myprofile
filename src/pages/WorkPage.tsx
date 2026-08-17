import { useEffect, useState, type DragEvent } from "react";
import { AlertTriangle, ArrowDown, ArrowRight, ArrowUp, Copy, Edit3, Eye, EyeOff, FilePlus2, GripVertical, Pencil, RotateCcw, Save, Star, Trash2, X } from "lucide-react";
import { Link } from "react-router-dom";
import { PageTransition } from "../components/PageTransition";
import { ProjectCoverEditor } from "../components/ProjectCoverEditor";
import { NewProjectWizard, ProjectInfoEditor } from "../components/ProjectManagementPanels";
import { useProjectCatalog } from "../hooks/useProjectCatalog";
import { createDynamicProject, setProjectArchiveOrder, setProjectFeatured, setProjectPublicMetaOverride, type ProjectCatalogItem, type ResolvedProjectMetadata } from "../lib/projectMetadata";
import { createStableId, getProjectDocument, saveProjectDocument } from "../lib/projectDocuments";
import { finalizeProjectDeletion, markProjectPendingDeletion, undoProjectPendingDeletion } from "../lib/deletePortfolioProject";
import { useDirtyIntents } from "../lib/dirtyIntentStore";
import { useLocale } from "../locales/LocaleContext";
import { useOwnerMode } from "../hooks/useOwnerMode";

const archiveCopy = {
  zh: {
    eyebrow: "/ 项目档案",
    title: "项目档案",
    description: "这里整理了商业案例、游戏交互探索与个人实验。",
    edit: "编辑排序",
    sorting: "项目排序",
    sortingHelp: "拖动项目调整顺序，或使用上下移动按钮。只有点击保存后才会写入。",
    featured: "首页推荐",
    featuredButHidden: "已设为首页推荐，但当前仍为隐藏状态，不会出现在主页。点击右侧的眼睛图标改为可见，并保存排序。",
    moveUp: "上移",
    moveDown: "下移",
    save: "保存排序",
    cancel: "取消",
    comingSoon: "筹备中",
    deleteProject: "删除项目",
    deleteTitle: "删除项目？",
    deleteBody: (title: string) => `「${title}」将从档案中隐藏，并在下次发布时从生产环境移除。本地草稿、资源仍会保留，可在发布完成前随时撤销。`,
    deleteConfirm: "删除",
    pendingDeletionTitle: "待删除项目",
    pendingDeletionHelp: "已标记删除，尚未发布。发布成功前可以撤销；本地数据尚未被清除。",
    undoDelete: "撤销删除",
  },
  en: {
    eyebrow: "/ Archive",
    title: "Project Archive",
    description: "A visual index of case studies, game interaction explorations, and personal experiments.",
    edit: "Edit order",
    sorting: "Project order",
    sortingHelp: "Drag projects into order, or use the move buttons. Changes are written only when you save.",
    featured: "Featured",
    featuredButHidden: "Featured is on, but this project is still Hidden, so it will not appear on the homepage. Click the eye icon to make it visible, then save the order.",
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
  },
};

export function WorkPage() {
  const { locale, pathFor } = useLocale();
  const projectCatalog = useProjectCatalog(locale);
  const ownerMode = useOwnerMode();
  const [isEditingOrder, setIsEditingOrder] = useState(false);
  const [draftOrder, setDraftOrder] = useState<string[]>([]);
  const [draftFeatured, setDraftFeatured] = useState<Record<string, boolean>>({});
  const [draftVisibility, setDraftVisibility] = useState<Record<string, "public" | "hidden">>({});
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
  const pendingDeletionIds = new Set(
    useDirtyIntents("project").filter((entry) => entry.kind === "DELETE").map((entry) => entry.entityId),
  );
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

  const fullArchive = [...projectCatalog]
    .filter((project) => !pendingDeletionIds.has(project.id))
    .sort((left, right) => left.archiveOrder - right.archiveOrder);
  const managedProjects = fullArchive.filter((project) => project.group === "work");
  const orderedProjects = managedProjects.filter(
    (project) => project.group === "work" && project.visibility === "public",
  );
  const projectsById = new Map(managedProjects.map((project) => [project.id, project]));

  // Undo needs to restore a project's visibility WITHIN an already-open
  // "编辑排序" session too, not just after re-entering it: deleting removes
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
    setDraftVisibility(Object.fromEntries(managedProjects.map((project) => [project.id, project.visibility])));
    setDraggedProjectId(null);
    setIsEditingOrder(true);
  };

  const cancelEditing = () => {
    setDraftOrder([]);
    setDraftFeatured({});
    setDraftVisibility({});
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
      const nextVisibility = draftVisibility[project.id] ?? project.visibility;
      if (nextVisibility !== project.visibility) setProjectPublicMetaOverride(project.id, { visibility: nextVisibility });
    });
    setProjectArchiveOrder(normalizedCanonicalOrder);
    setIsEditingOrder(false);
    setDraftOrder([]);
    setDraftFeatured({});
    setDraftVisibility({});
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
    setDraftVisibility((current) => { const { [deleteTargetId]: _removed, ...rest } = current; return rest; });
    if (editingProjectId === deleteTargetId) setEditingProjectId(null);
    setDeleteTargetId(null);
  };

  return (
    <PageTransition>
      <main className="min-h-screen bg-deepIndigo text-softWhite">
        {import.meta.env.DEV && !isEditingOrder ? (
          <div className="fixed right-4 top-[84px] z-[70] flex flex-wrap justify-end gap-2 md:right-6" data-work-management-actions>
            <button type="button" className="editor-action bg-deepIndigo/95 shadow-archive" onClick={() => setManagementPanel("new")}><FilePlus2 className="h-3.5 w-3.5" />{locale === "zh" ? "新增项目" : "New project"}</button>
            <button type="button" className="editor-action bg-deepIndigo/95 text-acidGreen shadow-archive" onClick={beginEditing}><Edit3 className="h-3.5 w-3.5" />{copy.edit}</button>
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

        {import.meta.env.DEV && pendingDeletionProjects.length > 0 ? (
          <section className="border-b border-peach/25 bg-peach/[0.06] py-6" data-work-pending-deletions>
            <div className="site-container">
              <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-peach">{copy.pendingDeletionTitle}</h2>
              <p className="mt-1.5 max-w-2xl text-xs leading-5 text-softWhite/56">{copy.pendingDeletionHelp}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {pendingDeletionProjects.map((project) => (
                  <div key={project.id} className="flex items-center gap-2 rounded-full border border-peach/30 bg-deepIndigo/60 py-1.5 pl-4 pr-2 text-xs text-softWhite/72">
                    <span className="truncate">{project.title}</span>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-full border border-acidGreen/50 px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-acidGreen transition hover:bg-acidGreen/12"
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

        <section className="border-b border-softWhite/10 py-16 md:py-20">
          <div className="site-container">
            <p className="font-mono text-[11px] font-bold tracking-[0.18em] text-acidGreen">{copy.eyebrow}</p>
            <h1 className="project-archive-title mt-4 font-display font-semibold text-softWhite">{copy.title}</h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-softWhite/64">{copy.description}</p>
          </div>
        </section>

        {isEditingOrder ? (
          <section className="border-b border-softWhite/10 bg-archiveBlue/10 py-8" data-work-order-editor>
            <div className="site-container">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="font-display text-2xl font-semibold text-softWhite">{copy.sorting}</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-softWhite/56">{copy.sortingHelp}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-full border border-softWhite/16 px-4 py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-softWhite/64 transition hover:border-softWhite/40 hover:text-softWhite"
                    onClick={cancelEditing}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                    {copy.cancel}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-full border border-acidGreen bg-acidGreen px-4 py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-deepIndigo transition hover:bg-softWhite"
                    onClick={saveEditing}
                  >
                    <Save className="h-3.5 w-3.5" aria-hidden="true" />
                    {copy.save}
                  </button>
                </div>
              </div>

              <div className="mt-6 grid gap-2">
                {draftProjects.map((project, index) => (
                  <div
                    key={project.id}
                    className={`rounded-[8px] border bg-deepIndigo/74 p-3 transition ${draggedProjectId === project.id ? "border-acidGreen/70 opacity-60" : "border-softWhite/10"}`}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(event) => handleDrop(event, project.id)}
                  >
                    <div className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-3">
                      <button
                        type="button"
                        className="grid h-9 w-9 cursor-grab place-items-center text-softWhite/30 active:cursor-grabbing"
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
                      <span className="w-7 font-mono text-xs font-bold text-acidGreen">{String(index + 1).padStart(2, "0")}</span>
                      <div className="min-w-0">
                        <p className="truncate font-display text-base font-semibold text-softWhite">{project.title}</p>
                      <p className="mt-1 truncate font-mono text-[9px] uppercase tracking-[0.12em] text-softWhite/34">{project.id} · {project.templateId ? `${project.templateId}@${project.templateVersionUsed ?? 1}` : "Custom Legacy"} · {project.publicationState}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button type="button" className="editor-action" onClick={() => setEditingProjectId(project.id)}><Pencil className="h-4 w-4" />EDIT PROJECT INFO</button>
                        {project.isDynamic ? <button type="button" className="editor-icon" onClick={() => duplicateManagedProject(project, managedProjects)} aria-label={`Duplicate ${project.title}`}><Copy className="h-4 w-4" /></button> : null}
                        {project.isDynamic ? <button type="button" className="editor-icon text-peach" onClick={() => setDeleteTargetId(project.id)} aria-label={`${copy.deleteProject}: ${project.title}`}><Trash2 className="h-4 w-4" /></button> : null}
                        <button type="button" className={`editor-icon ${draftVisibility[project.id] === "public" ? "text-acidGreen" : "text-softWhite/38"}`} onClick={() => setDraftVisibility((current) => ({ ...current, [project.id]: current[project.id] === "public" ? "hidden" : "public" }))} aria-label={`${draftVisibility[project.id] === "public" ? "Hide" : "Show"} ${project.title}`}>{draftVisibility[project.id] === "public" ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</button>
                        <button
                          type="button"
                          className={`grid h-9 w-9 place-items-center rounded-full border transition ${draftFeatured[project.id] ? "border-acidGreen/65 bg-acidGreen/12 text-acidGreen" : "border-softWhite/12 text-softWhite/36 hover:text-softWhite"}`}
                          onClick={() => setDraftFeatured((current) => ({ ...current, [project.id]: !current[project.id] }))}
                          aria-label={`${copy.featured}: ${project.title}`}
                          aria-pressed={Boolean(draftFeatured[project.id])}
                        >
                          <Star className={`h-4 w-4 ${draftFeatured[project.id] ? "fill-current" : ""}`} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="grid h-9 w-9 place-items-center rounded-full border border-softWhite/12 text-softWhite/56 transition hover:border-acidGreen/50 hover:text-acidGreen disabled:opacity-20"
                          onClick={() => moveDraftProject(project.id, index - 1)}
                          disabled={index === 0}
                          aria-label={`${copy.moveUp}: ${project.title}`}
                        >
                          <ArrowUp className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="grid h-9 w-9 place-items-center rounded-full border border-softWhite/12 text-softWhite/56 transition hover:border-acidGreen/50 hover:text-acidGreen disabled:opacity-20"
                          onClick={() => moveDraftProject(project.id, index + 1)}
                          disabled={index === draftProjects.length - 1}
                          aria-label={`${copy.moveDown}: ${project.title}`}
                        >
                          <ArrowDown className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                    {draftFeatured[project.id] && draftVisibility[project.id] !== "public" ? (
                      <p className="mt-2 flex items-center gap-1.5 text-xs leading-5 text-peach" role="status">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        {copy.featuredButHidden}
                      </p>
                    ) : null}
                    <ProjectCoverEditor
                      projectId={project.id}
                      locale={locale}
                      fallbackImage={project.coverImage}
                      variant="compact"
                    />
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <section className="pb-28 pt-8 md:pb-36 md:pt-12">
          <div className="site-container border-b border-softWhite/10">
            {orderedProjects.map((project, index) => {
              const row = <ArchiveRow project={project} index={index} comingSoonLabel={copy.comingSoon} />;
              return <div key={project.id} className="relative">
                {ownerMode ? <button type="button" className="editor-action absolute bottom-3 right-10 z-10 bg-deepIndigo/96 text-acidGreen shadow-archive" onClick={() => setEditingProjectId(project.id)}><Pencil className="h-3.5 w-3.5" />EDIT PROJECT INFO</button> : null}
                {project.route && !project.comingSoon ? <Link
                  to={pathFor(project.route)}
                  className="project-archive-row group min-w-0 border-t border-softWhite/10 py-7 outline-none transition-colors duration-300 hover:bg-softWhite/[0.025] focus-visible:bg-softWhite/[0.04] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-acidGreen/70 md:py-9"
                >
                  {row}
                </Link> : <div className="project-archive-row min-w-0 border-t border-softWhite/10 py-7 opacity-72 md:py-9" aria-disabled="true">
                  {row}
                </div>}
              </div>;
            })}
          </div>
        </section>
      </main>
    </PageTransition>
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

function ArchiveRow({ project, index, comingSoonLabel }: { project: ResolvedProjectMetadata; index: number; comingSoonLabel: string }) {
  const tags = project.tags.slice(0, 2).join(" / ") || project.category;
  const isAvailable = Boolean(project.route) && !project.comingSoon;

  return (
    <>
      <span className="pt-1 font-mono text-[11px] font-bold tracking-[0.12em] text-softWhite/32">{String(index + 1).padStart(2, "0")}</span>
      <div className="min-w-0">
        <h2 className={`project-archive-project-title font-display font-semibold text-softWhite transition-colors duration-300 ${isAvailable ? "group-hover:text-acidGreen group-focus-visible:text-acidGreen" : ""}`}>
          {project.title}
        </h2>
        <p className="mt-3 max-w-3xl text-base leading-7 text-softWhite/60">{project.summary}</p>
      </div>
      <div className="project-archive-metadata min-w-0">
        <p className="font-mono text-[10px] font-bold uppercase leading-5 tracking-[0.12em] text-softWhite/42">{tags}</p>
        <p className="mt-1 font-mono text-[10px] tracking-[0.1em] text-[#9FAAD2]">{project.comingSoon ? comingSoonLabel : project.duration}</p>
      </div>
      {isAvailable ? (
        <ArrowRight className="project-archive-arrow h-5 w-5 text-softWhite/34 transition duration-300 group-hover:translate-x-1 group-hover:text-acidGreen group-focus-visible:translate-x-1 group-focus-visible:text-acidGreen" aria-hidden="true" />
      ) : (
        <span className="project-archive-arrow" aria-hidden="true" />
      )}
    </>
  );
}
