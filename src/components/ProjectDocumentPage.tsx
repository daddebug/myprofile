import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type * as React from "react";
import { ArrowDown, ArrowLeft, ArrowUp, ChevronDown, Copy, Eye, EyeOff, ExternalLink, FileUp, GripVertical, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { Link } from "react-router-dom";
import { useCaseStudyEditor } from "./CaseStudyEditor";
import { useLocale } from "../locales/LocaleContext";
import { useProjectBodyAsset } from "../hooks/useProjectBodyAsset";
import { BilingualInput } from "./editor/BilingualInput";
import { ProjectHeroTitleSummary } from "./ProjectHeroTitleSummary";
import { projectHeroTextWidth } from "../lib/caseStudyLayout";
import { AspectRatioSelect, aspectRatioToClassName, type AspectRatioValue } from "./editor/AspectRatioSelect";
import { ImageAssetUploader, isAcceptedImageFile, useResolvedAssetSource } from "./editor/ImageAssetUploader";
import { BlockLayoutPicker } from "./editor/BlockLayoutPicker";
import { setProjectPublicMetaOverride, type ResolvedProjectMetadata } from "../lib/projectMetadata";
import { markProjectDirty } from "../lib/publishIntent";
import { isCollectionExportCapture } from "../lib/collectionExportStaging";
import { getPortfolioExportMode } from "../lib/portfolioExportMode";
import { recordEmptySlotCollapsed, recordEmptySlotFound } from "../lib/collectionMediaDiagnostics";
import {
  createStableId,
  getProjectDocument,
  localized,
  PROJECT_DOCUMENTS_CHANGED_EVENT,
  saveProjectDocument,
  type LocalizedText,
  type ProjectAnnotatedImageItem,
  type ProjectBoundaryList,
  type ProjectCardSubItem,
  type ProjectComparisonColumn,
  type ProjectDiagramNode,
  type ProjectDocument,
  type ProjectDocumentBlock,
  type ProjectDocumentSection,
  type ProjectFigmaPrototype,
  type ProjectGroupedCard,
  type ProjectImageSlotItem,
  type ProjectMatrixRow,
  type ProjectMediaItem,
  type ProjectTab,
  type ProjectThinkingMapNode,
  type ProjectTimelineItem,
} from "../lib/projectDocuments";
import { blockLayoutLibrary } from "../lib/projectTemplates";
import { getProjectBodyAsset } from "../lib/projectBodyAssetDb";
import {
  commitProjectBodyAssets,
  decodeProjectBodyAsset,
  saveProjectBodyDocument,
  stageProjectBodyAsset,
} from "../lib/portfolioContentClient";
import { parseXMindFile, type ParsedXMindSheet, type XMindConversionStyle } from "../lib/xmindImport";
import { figmaPrototypeUrlErrorMessage, normalizeFigmaPrototypeUrl } from "../lib/figmaEmbed";

export function ProjectDocumentPage({ metadata, initialDocument }: { metadata: ResolvedProjectMetadata; initialDocument?: ProjectDocument }) {
  const { locale, messages, pathFor } = useLocale();
  const { isEditing } = useCaseStudyEditor();
  const [saved, setSaved] = useState(() => initialDocument ?? getProjectDocument(metadata.id));
  const [draft, setDraft] = useState<ProjectDocument | undefined>(() => initialDocument ?? getProjectDocument(metadata.id));
  const [metaDraft, setMetaDraft] = useState(() => metadata);
  const [pendingAssets, setPendingAssets] = useState<Record<string, File>>({});
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    const refresh = (event: Event) => {
      const projectId = (event as CustomEvent<{ projectId?: string }>).detail?.projectId;
      if (!projectId || projectId === metadata.id) {
        const next = getProjectDocument(metadata.id);
        setSaved(next);
        if (!isEditing) setDraft(next);
      }
    };
    window.addEventListener(PROJECT_DOCUMENTS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(PROJECT_DOCUMENTS_CHANGED_EVENT, refresh);
  }, [metadata.id, isEditing]);

  useEffect(() => {
    if (!initialDocument) return;
    setSaved(initialDocument);
    if (!isEditing) setDraft(initialDocument);
  }, [initialDocument, isEditing]);

  const wasEditingRef = useRef(isEditing);
  useEffect(() => {
    const enteringEditMode = isEditing && !wasEditingRef.current;
    wasEditingRef.current = isEditing;
    if (isEditing) {
      setDraft(saved ? structuredClone(saved) : undefined);
      setMetaDraft(metadata);
      setPendingAssets({});
      // Only reset the save status when editing is first turned on. `saved`
      // also changes as a *result* of a successful save() call below — without
      // this guard, that update re-runs this effect and immediately stomps the
      // "saved" status back to "idle" before the owner ever sees it.
      if (enteringEditMode) {
        setStatus("idle");
        setError("");
      }
    } else {
      setDraft(saved);
      setPendingAssets({});
    }
  }, [isEditing, metadata, saved]);

  if (!saved || !draft) {
    return <MissingProjectDocument metadata={metadata} />;
  }

  const save = async () => {
    setStatus("saving");
    setError("");
    try {
      const referencedPendingAssets = Object.entries(pendingAssets).filter(([assetId]) => projectDocumentReferencesAsset(draft, assetId));
      const staged = await Promise.all(referencedPendingAssets.map(async ([assetId, file]) => {
        const result = await stageProjectBodyAsset(metadata.id, assetId, file);
        await decodeProjectBodyAsset(result.publicUrl);
        return result;
      }));
      const documentWithDiskPaths = staged.reduce(
        (current, asset) => applyDiskAssetPath(current, asset.assetId, asset.publicUrl),
        structuredClone(draft),
      );
      const installed = staged.length
        ? await commitProjectBodyAssets(metadata.id, documentWithDiskPaths, staged.map((asset) => ({ assetId: asset.assetId, commitToken: asset.commitToken })))
        : await saveProjectBodyDocument(metadata.id, documentWithDiskPaths);
      const persistedDocument = installed.document as ProjectDocument;
      saveProjectDocument(persistedDocument);
      markProjectDirty(metadata.id);
      setProjectPublicMetaOverride(metadata.id, {
        titleZh: metaDraft.titleZh, titleEn: metaDraft.titleEn,
        summaryZh: metaDraft.summaryZh, summaryEn: metaDraft.summaryEn,
        categoryZh: metaDraft.categoryZh, categoryEn: metaDraft.categoryEn,
        duration: metaDraft.duration,
      });
      setSaved(structuredClone(persistedDocument));
      setDraft(structuredClone(persistedDocument));
      setPendingAssets({});
      setStatus("saved");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save this project.");
      setStatus("error");
    }
  };

  const cancel = () => {
    setDraft(structuredClone(saved));
    setMetaDraft(metadata);
    setPendingAssets({});
    setStatus("idle");
    setError("");
  };

  const rendered = isEditing ? draft : saved;
  const renderedMetadata = isEditing ? metaDraft : metadata;
  const isDirty = isEditing && (
    Object.keys(pendingAssets).length > 0
    || JSON.stringify(draft) !== JSON.stringify(saved)
    || JSON.stringify(metaDraft) !== JSON.stringify(metadata)
  );

  // The collection-export-only glow background lives on the ancestor
  // [data-project-route-shell] (styles.css) — this article's own opaque
  // bg-deepIndigo would otherwise sit on top and hide it completely, so it
  // drops to transparent in capture mode only (site-container/normal owner
  // view keeps the real background, unchanged).
  return (
    <article className={`min-h-screen text-softWhite ${isCollectionExportCapture() ? "" : "bg-deepIndigo"}`} data-project-document-page>
      <section className="relative overflow-hidden border-b border-softWhite/10 py-14 md:py-20">
        <div className="absolute inset-0 bg-grain bg-[length:18px_18px] opacity-20" />
        <div className="site-container relative">
          {isCollectionExportCapture() ? null : (
            <Link to={pathFor("/work")} className="inline-flex items-center gap-2 text-sm font-semibold text-acidGreen"><ArrowLeft className="h-4 w-4" />{messages.project.backToArchive}</Link>
          )}
          <p className="mt-10 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-acidGreen">{renderedMetadata.category}</p>
          {isEditing ? (
            <ProjectHeroTitleSummary>
              <div className="mt-5 grid gap-4">
                <BilingualInput label="Project title" zh={metaDraft.titleZh} en={metaDraft.titleEn} onChange={(key, value) => setMetaDraft((current) => ({ ...current, [key === "zh" ? "titleZh" : "titleEn"]: value }))} large />
                <BilingualInput label="Short description" zh={metaDraft.summaryZh} en={metaDraft.summaryEn} onChange={(key, value) => setMetaDraft((current) => ({ ...current, [key === "zh" ? "summaryZh" : "summaryEn"]: value }))} multiline />
              </div>
            </ProjectHeroTitleSummary>
          ) : (
            <>
              <ProjectHeroTitleSummary>
                <h1 className={`mt-5 font-display text-[clamp(3.2rem,8vw,7.5rem)] font-semibold leading-[0.98] ${projectHeroTextWidth.title}`}>{renderedMetadata.title}</h1>
                <p className={`mt-6 text-lg leading-8 text-softWhite/68 ${projectHeroTextWidth.summary}`}>{renderedMetadata.summary}</p>
              </ProjectHeroTitleSummary>
              {renderedMetadata.duration ? <p className="mt-4 font-mono text-xs uppercase tracking-[0.12em] text-softWhite/44">{renderedMetadata.duration}</p> : null}
            </>
          )}
        </div>
      </section>

      {isEditing ? (
        <div className="sticky top-[var(--owner-dock-bottom)] z-50 border-b border-electricBlue/25 bg-[#101034]/96 py-3 backdrop-blur" data-project-document-actions>
          <div className="site-container flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-acidGreen">Project structure</p>
              <p className="text-xs text-softWhite/44">Changes remain temporary until Save.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs ${status === "error" ? "text-peach" : isDirty ? "text-[#d8bb72]" : "text-softWhite/48"}`}>
                {status === "saving" ? "正在写入本地项目目录" : status === "saved" ? "已保存到本地项目目录" : status === "error" ? error : isDirty ? "尚未保存" : "No changes"}
              </span>
              <button type="button" className="editor-action" onClick={cancel}><X className="h-4 w-4" />Cancel</button>
              <button type="button" className="editor-action border-acidGreen bg-acidGreen text-deepIndigo" onClick={save} disabled={status === "saving"}><Save className="h-4 w-4" />Save</button>
            </div>
          </div>
        </div>
      ) : null}

      <ProjectDocumentRenderer
        document={rendered}
        locale={locale}
        isEditing={isEditing}
        pendingAssets={pendingAssets}
        onDocumentChange={setDraft}
        onPendingAsset={(assetId, file) => setPendingAssets((current) => ({ ...current, [assetId]: file }))}
      />
    </article>
  );
}

function MissingProjectDocument({ metadata }: { metadata: ResolvedProjectMetadata }) {
  return <main className="grid min-h-[70svh] place-items-center bg-deepIndigo px-6 text-center text-softWhite"><div><p className="font-mono text-xs uppercase tracking-[0.18em] text-acidGreen">Project content</p><h1 className="mt-4 font-display text-5xl">{metadata.title}</h1><p className="mt-5 text-softWhite/58">This catalog project does not have a reusable project document yet.</p></div></main>;
}

function projectDocumentReferencesAsset(document: ProjectDocument, assetId: string) {
  const visit = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.some(visit);
    if (!value || typeof value !== "object") return false;
    const record = value as Record<string, unknown>;
    if (record.assetId === assetId || record.posterAssetId === assetId) return true;
    return Object.values(record).some(visit);
  };
  return visit(document.sections);
}

function applyDiskAssetPath(document: ProjectDocument, assetId: string, publicUrl: string) {
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== "object") return value;
    const record = value as Record<string, unknown>;
    const next = Object.fromEntries(Object.entries(record).map(([key, child]) => [key, visit(child)]));
    if (record.assetId === assetId) next.publicPath = publicUrl;
    if (record.posterAssetId === assetId) next.posterPublicPath = publicUrl;
    return next;
  };
  return visit(document) as ProjectDocument;
}

export function ProjectDocumentRenderer({ document, locale, isEditing, pendingAssets, onDocumentChange, onPendingAsset }: {
  document: ProjectDocument; locale: "zh" | "en"; isEditing: boolean; pendingAssets: Record<string, File>;
  onDocumentChange: (document: ProjectDocument) => void; onPendingAsset: (assetId: string, file: File) => void;
}) {
  const sections = document.sections;
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const changeSection = (id: string, updater: (section: ProjectDocumentSection) => ProjectDocumentSection) => onDocumentChange({ ...document, sections: sections.map((section) => section.id === id ? updater(section) : section) });
  const moveSection = (index: number, direction: -1 | 1) => {
    const target = index + direction; if (target < 0 || target >= sections.length) return;
    const next = [...sections]; [next[index], next[target]] = [next[target], next[index]]; onDocumentChange({ ...document, sections: next });
  };
  const addSection = () => onDocumentChange({ ...document, sections: [...sections, { id: createStableId("section"), type: "chapter", title: localized("新章节", "New section"), visibility: "visible", blocks: [] }] });
  const toggleCollapsed = (id: string) => setCollapsedSections((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  // Collection export renders one project as a standalone printed page, not
  // a scrolling webpage — the normal, generous scroll-reading rhythm
  // (gap-20/28 between sections, gap-10 between blocks) reads as too sparse
  // and too long there. Fixed to precise pixel targets in capture mode only
  // (32px between sections, 18px between blocks within a section); the live
  // site's own reading rhythm is untouched.
  const captureMode = isCollectionExportCapture();
  const sectionGapClassName = captureMode ? "grid gap-[32px]" : "grid gap-20 md:gap-28";
  const blockGapClassName = captureMode ? "mt-[20px] grid gap-[18px]" : "mt-10 grid gap-10";

  return <div className="site-container py-16 md:py-24">
    <div className={sectionGapClassName}>
      {sections.map((section, index) => {
        if (section.visibility === "hidden" && !isEditing) return null;
        const collapsed = collapsedSections.has(section.id);
        return (
        <section key={section.id} className={`scroll-mt-28 ${section.visibility === "hidden" ? "opacity-45" : ""}`} data-document-section={section.id}>
          {isEditing ? <SectionControls section={section} index={index} count={sections.length} collapsed={collapsed} onChange={(next) => changeSection(section.id, () => next)} onMove={(direction) => moveSection(index, direction)} onDuplicate={() => onDocumentChange({ ...document, sections: [...sections.slice(0, index + 1), cloneSection(section), ...sections.slice(index + 1)] })} onDelete={() => { if (window.confirm("Delete this section? Body assets will be retained.")) onDocumentChange({ ...document, sections: sections.filter((item) => item.id !== section.id) }); }} onToggleCollapsed={() => toggleCollapsed(section.id)} /> : null}
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-acidGreen/70">{String(index + 1).padStart(2, "0")}</p>
          <h2 className="mt-3 max-w-4xl font-display text-[clamp(2rem,4vw,4.5rem)] font-semibold leading-tight">{textFor(section.title, locale)}</h2>
          {isEditing ? <BilingualInput label="Section title" zh={section.title.zh} en={section.title.en} onChange={(key, value) => changeSection(section.id, (current) => ({ ...current, title: { ...current.title, [key]: value } }))} /> : null}
          {collapsed && isEditing ? <p className="mt-6 text-xs text-softWhite/40">{section.blocks.length} block{section.blocks.length === 1 ? "" : "s"} hidden while collapsed.</p> : (
          <div className={blockGapClassName}>
            {section.blocks.map((block, blockIndex) => {
              if (block.visibility === "hidden" && !isEditing) return null;
              return <ProjectBlockView key={block.id} projectId={document.projectId} block={block} locale={locale} isEditing={isEditing} pendingAssets={pendingAssets} onPendingAsset={onPendingAsset} onChange={(next) => changeSection(section.id, (current) => ({ ...current, blocks: current.blocks.map((item) => item.id === block.id ? next : item) }))} onMove={(direction) => changeSection(section.id, (current) => ({ ...current, blocks: moveItem(current.blocks, blockIndex, direction) }))} onDuplicate={() => changeSection(section.id, (current) => ({ ...current, blocks: [...current.blocks.slice(0, blockIndex + 1), cloneBlock(block), ...current.blocks.slice(blockIndex + 1)] }))} onDelete={() => { if (window.confirm("Delete this block? Uploaded assets will be retained.")) changeSection(section.id, (current) => ({ ...current, blocks: current.blocks.filter((item) => item.id !== block.id) })); }} onToggleVisibility={() => changeSection(section.id, (current) => ({ ...current, blocks: current.blocks.map((item) => item.id === block.id ? { ...item, visibility: item.visibility === "hidden" ? "visible" : "hidden" } : item) }))} blockIndex={blockIndex} blockCount={section.blocks.length} draggedBlockId={draggedBlockId} onDragStart={() => setDraggedBlockId(block.id)} onDragEnd={() => setDraggedBlockId(null)} onDragOver={() => { if (!draggedBlockId || draggedBlockId === block.id) return; changeSection(section.id, (current) => ({ ...current, blocks: moveItemById(current.blocks, draggedBlockId, block.id) })); }} />;
            })}
            {isEditing ? <AddBlock onAdd={(kind) => changeSection(section.id, (current) => ({ ...current, blocks: [...current.blocks, createSimpleBlock(kind)] }))} /> : null}
          </div>
          )}
        </section>
        );
      })}
    </div>
    {isEditing ? <button type="button" className="mt-16 inline-flex items-center gap-2 rounded-full border border-acidGreen/45 px-4 py-2 text-sm font-semibold text-acidGreen" onClick={addSection}><Plus className="h-4 w-4" />Add section</button> : null}
  </div>;
}

type ProjectBlockViewProps = { projectId: string; block: ProjectDocumentBlock; locale: "zh" | "en"; isEditing: boolean; pendingAssets: Record<string, File>; onPendingAsset: (id: string, file: File) => void; onChange: (block: ProjectDocumentBlock) => void; onMove: (direction: -1 | 1) => void; onDuplicate: () => void; onDelete: () => void; onToggleVisibility: () => void; blockIndex: number; blockCount: number; draggedBlockId: string | null; onDragStart: () => void; onDragEnd: () => void; onDragOver: () => void };

function ProjectBlockView(props: ProjectBlockViewProps) {
  const { block, locale, isEditing } = props;
  const known = ["text", "media", "structured", "diagram", "figma-prototype", "divider", "comparison-table", "decision-matrix", "timeline", "annotated-image", "boundary-list", "grouped-cards", "image-slot-grid", "thinking-map", "tabbed-content"].includes(block.type);
  if (isEditing) return <SimpleBlockEditorCard {...props} known={known} />;
  return <div className={`relative ${block.variant === "emphasis" ? "border-l-2 border-acidGreen/55 pl-6" : ""}`} data-document-block={block.id}>
    {!known ? <div className="rounded-[8px] border border-peach/25 p-5 text-sm text-peach">Unsupported block type: {block.type}</div> : null}
    {block.type === "text" ? <TextBlock block={block} locale={locale} /> : null}
    {block.type === "media" ? <MediaBlock {...props} /> : null}
    {block.type === "structured" ? <StructuredBlock block={block} locale={locale} /> : null}
    {block.type === "diagram" ? <DiagramBlock block={block} locale={locale} /> : null}
    {block.type === "figma-prototype" ? <FigmaPrototypeBlock block={block} locale={locale} /> : null}
    {block.type === "divider" ? <DividerBlock /> : null}
    {block.type === "comparison-table" ? <ComparisonTableBlock block={block} locale={locale} pendingAssets={props.pendingAssets} /> : null}
    {block.type === "decision-matrix" ? <MatrixTableBlock block={block} locale={locale} /> : null}
    {block.type === "timeline" ? <TimelineBlock block={block} locale={locale} /> : null}
    {block.type === "annotated-image" ? <AnnotatedImageBlock block={block} locale={locale} pendingAssets={props.pendingAssets} /> : null}
    {block.type === "boundary-list" ? <BoundaryListBlock block={block} locale={locale} /> : null}
    {block.type === "grouped-cards" ? <GroupedCardsBlock block={block} locale={locale} /> : null}
    {block.type === "image-slot-grid" ? <ImageSlotGridBlock block={block} locale={locale} pendingAssets={props.pendingAssets} /> : null}
    {block.type === "thinking-map" ? <ThinkingMapBlock block={block} locale={locale} /> : null}
    {block.type === "tabbed-content" ? <TabbedContentBlock block={block} locale={locale} /> : null}
  </div>;
}

function SimpleBlockEditorCard(props: ProjectBlockViewProps & { known: boolean }) {
  const { block, locale, draggedBlockId } = props;
  const [open, setOpen] = useState(false);
  const title = textFor(block.content.title, locale) || "Untitled block";
  const description = textFor(block.content.body, locale) || textFor(block.content.media?.[0]?.caption, locale) || "Add a description";
  const media = block.type === "figma-prototype" && block.content.figmaPrototype?.posterAssetId
    ? [{ id: "figma-poster", assetId: block.content.figmaPrototype.posterAssetId, alt: localized(), caption: localized(), cropMode: "cover" as const, focalPosition: "50% 50%", aspectRatio: "16:9" as const }]
    : (block.content.media ?? []);
  const hidden = block.visibility === "hidden";
  return <article
    draggable
    data-document-block={block.id}
    className={`rounded-[10px] border bg-archiveBlue/16 p-3 transition md:p-4 ${draggedBlockId === block.id ? "border-acidGreen/70 opacity-65" : "border-softWhite/12 hover:border-acidGreen/38"} ${hidden ? "opacity-55" : ""}`}
    onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", block.id); props.onDragStart(); }}
    onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; props.onDragOver(); }}
    onDrop={(event) => event.preventDefault()}
    onDragEnd={props.onDragEnd}
  >
    <div className="grid items-center gap-4 md:grid-cols-[auto_180px_minmax(0,1fr)_auto]">
      <div className="flex items-center gap-2 self-stretch md:flex-col md:justify-center">
        <GripVertical className="h-5 w-5 cursor-grab text-softWhite/32 active:cursor-grabbing" aria-hidden="true" />
        <span className="font-mono text-[10px] font-bold text-acidGreen">{String(props.blockIndex + 1).padStart(2, "0")}</span>
      </div>
      <BlockThumbnail media={media} pendingAssets={props.pendingAssets} />
      <div className="min-w-0">
        <p className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-acidGreen/72">{simpleBlockLabel(block)}{hidden ? " · hidden from public view" : ""}</p>
        <h3 className="mt-2 truncate font-display text-xl font-semibold text-softWhite">{title}</h3>
        <p className="mt-1 line-clamp-2 text-sm leading-6 text-softWhite/50">{description}</p>
      </div>
      <div className="flex items-center gap-2 md:justify-end">
        <button type="button" className="editor-icon" aria-label="Move block up" disabled={props.blockIndex === 0} onClick={() => props.onMove(-1)}><ArrowUp className="h-4 w-4" /></button>
        <button type="button" className="editor-icon" aria-label="Move block down" disabled={props.blockIndex === props.blockCount - 1} onClick={() => props.onMove(1)}><ArrowDown className="h-4 w-4" /></button>
        <button type="button" className="editor-icon" aria-label="Duplicate block" onClick={props.onDuplicate}><Copy className="h-4 w-4" /></button>
        <button type="button" className="editor-icon" aria-label={hidden ? "Show block publicly" : "Hide block from public view"} onClick={props.onToggleVisibility}>{hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
        <button type="button" className="editor-action" onClick={() => setOpen((current) => !current)}><Pencil className="h-3.5 w-3.5" />{open ? "Done" : "Edit"}</button>
        <button type="button" className="editor-icon text-peach" aria-label="Delete block" onClick={props.onDelete}><Trash2 className="h-4 w-4" /></button>
      </div>
    </div>
    {open ? <div className="mt-4 border-t border-softWhite/10 pt-4">
      {!props.known ? <div className="rounded-[8px] border border-peach/25 p-5 text-sm text-peach">Unsupported block type: {block.type}</div> : null}
      {block.type === "media" ? <MediaBlock {...props} /> : null}
      {block.type === "text" ? <TextBlock block={block} locale={locale} /> : null}
      {block.type === "structured" ? <StructuredBlock block={block} locale={locale} /> : null}
      {block.type === "diagram" ? <DiagramBlock block={block} locale={locale} /> : null}
      {block.type === "figma-prototype" ? <FigmaPrototypeBlock block={block} locale={locale} /> : null}
      {block.type === "divider" ? <DividerBlock /> : null}
      {block.type === "comparison-table" ? <ComparisonTableBlock block={block} locale={locale} pendingAssets={props.pendingAssets} /> : null}
      {block.type === "decision-matrix" ? <MatrixTableBlock block={block} locale={locale} /> : null}
      {block.type === "timeline" ? <TimelineBlock block={block} locale={locale} /> : null}
      {block.type === "annotated-image" ? <AnnotatedImageBlock block={block} locale={locale} pendingAssets={props.pendingAssets} /> : null}
      {block.type === "boundary-list" ? <BoundaryListBlock block={block} locale={locale} /> : null}
      {block.type === "grouped-cards" ? <GroupedCardsBlock block={block} locale={locale} /> : null}
      {block.type === "image-slot-grid" ? <ImageSlotGridBlock block={block} locale={locale} pendingAssets={props.pendingAssets} /> : null}
      {block.type === "thinking-map" ? <ThinkingMapBlock block={block} locale={locale} /> : null}
      {block.type === "tabbed-content" ? <TabbedContentBlock block={block} locale={locale} /> : null}
      {props.known ? <BlockContentEditor {...props} /> : null}
      <div className="mt-4"><BlockControls block={block} locale={locale} onChange={props.onChange} /></div>
    </div> : null}
  </article>;
}

function BlockThumbnail({ media, pendingAssets }: { media: ProjectMediaItem[]; pendingAssets: Record<string, File> }) {
  if (!media.length) return <div className="grid aspect-video w-full place-items-center overflow-hidden rounded-[8px] border border-softWhite/10 bg-deepIndigo/48 text-xs text-softWhite/26">Text block</div>;
  return <div className={`grid aspect-video w-full overflow-hidden rounded-[8px] border border-softWhite/10 bg-deepIndigo/48 ${media.length > 1 ? "grid-cols-2 gap-px" : ""}`}>
    {media.slice(0, 2).map((item) => <MediaThumbnail key={item.id} item={item} pendingFile={item.assetId ? pendingAssets[item.assetId] : undefined} />)}
  </div>;
}

function MediaThumbnail({ item, pendingFile }: { item: ProjectMediaItem; pendingFile?: File }) {
  const [source, setSource] = useState(item.publicPath ?? "");
  useEffect(() => {
    let url = "";
    if (pendingFile) {
      url = URL.createObjectURL(pendingFile);
      setSource(url);
      return () => URL.revokeObjectURL(url);
    }
    if (item.publicPath?.startsWith("/portfolio-assets/project-body/")) {
      setSource(item.publicPath);
      return undefined;
    }
    if (!item.assetId) {
      setSource(item.publicPath ?? "");
      return;
    }
    let cancelled = false;
    getProjectBodyAsset(item.assetId).then((record) => {
      if (!cancelled && record) {
        url = URL.createObjectURL(record.blob);
        setSource(url);
      }
    }).catch(() => setSource(item.publicPath ?? ""));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [item.assetId, item.publicPath, pendingFile]);
  return source ? <img src={source} alt="" className="h-full min-w-0 w-full object-contain" /> : <div className="grid h-full place-items-center text-[10px] text-softWhite/24">Image</div>;
}

function simpleBlockLabel(block: ProjectDocumentBlock) {
  if (block.type === "text") return "Text only";
  if (block.type === "figma-prototype") return "Figma prototype";
  if (block.type === "divider") return "Divider";
  if (block.type === "comparison-table") return "Comparison table";
  if (block.type === "decision-matrix") return "Decision / criteria matrix";
  if (block.type === "timeline") return "Timeline";
  if (block.type === "annotated-image") return "Annotated image";
  if (block.type === "boundary-list") return "Boundary / keep-change list";
  if (block.type === "grouped-cards") return "Grouped cards";
  if (block.type === "image-slot-grid") return "Image slot grid";
  if (block.type === "thinking-map") return "Thinking / system map";
  if (block.type === "tabbed-content") return "Tabbed content";
  if (block.type !== "media") return block.type;
  if (block.layout === "two-equal-images" || (block.content.media?.length ?? 0) > 1) return "Two images";
  if (block.layout === "image-text-left" || block.layout === "image-text-right") return "Image + text";
  return "Large image";
}

function TextBlock({ block, locale }: { block: ProjectDocumentBlock; locale: "zh" | "en" }) {
  const title = textFor(block.content.title, locale); const body = textFor(block.content.body, locale); const secondary = textFor(block.content.secondaryBody, locale);
  if (block.layout === "large-statement" || block.layout === "key-takeaway") return <p className="max-w-5xl font-display text-[clamp(2rem,4vw,4.5rem)] font-semibold leading-[1.12]">{body || title}</p>;
  if (block.layout === "two-column-text" || block.layout === "problem-response" || block.layout === "question-answer") return <div className="grid gap-7 md:grid-cols-2"><div><h3 className="font-display text-2xl">{title}</h3><p className="mt-4 text-base leading-8 text-softWhite/68 whitespace-pre-line">{body}</p></div><p className="text-base leading-8 text-softWhite/58 whitespace-pre-line">{secondary}</p></div>;
  return <div className="max-w-4xl"><h3 className="font-display text-2xl font-semibold">{title}</h3><p className="mt-4 whitespace-pre-line text-[clamp(1rem,1.15vw,1.2rem)] leading-8 text-softWhite/68">{body}</p></div>;
}

function DividerBlock() {
  return <hr className="mx-auto w-full max-w-5xl border-softWhite/14" />;
}

function StructuredBlock({ block, locale }: { block: ProjectDocumentBlock; locale: "zh" | "en" }) {
  return <div><h3 className="font-display text-2xl font-semibold">{textFor(block.content.title, locale)}</h3><div className="mt-6 grid gap-px overflow-hidden rounded-[8px] bg-softWhite/10 sm:grid-cols-2 lg:grid-cols-3">{(block.content.items ?? []).map((item, index) => <div key={item.id} className="bg-[#151542] p-5"><span className="font-mono text-[10px] text-acidGreen">{String(index + 1).padStart(2, "0")}</span><h4 className="mt-3 font-display text-xl">{textFor(item.title, locale)}</h4><p className="mt-2 text-sm leading-6 text-softWhite/58">{textFor(item.description, locale)}</p></div>)}</div></div>;
}

function DiagramBlock({ block, locale }: { block: ProjectDocumentBlock; locale: "zh" | "en" }) {
  const nodes = [...(block.content.nodes ?? [])].sort((a, b) => a.order - b.order);
  const vertical = block.layout === "vertical-flow" || block.layout === "hierarchy-map" || block.layout === "branching-tree";
  return <div><h3 className="font-display text-2xl font-semibold">{textFor(block.content.title, locale)}</h3><div className={`mt-7 ${vertical ? "grid gap-3" : "flex gap-3 overflow-x-auto pb-3"}`}>{nodes.map((node, index) => <div key={node.id} className={`${vertical ? "ml-[calc(var(--depth,0)*1rem)]" : "min-w-[210px]"} rounded-[8px] border ${node.emphasis ? "border-acidGreen/50 bg-acidGreen/8" : "border-softWhite/10 bg-archiveBlue/24"} p-4`} style={{ "--depth": nodeDepth(node, nodes) } as React.CSSProperties}><span className="font-mono text-[9px] text-softWhite/34">{String(index + 1).padStart(2, "0")}</span><p className="mt-2 font-semibold text-softWhite/88">{textFor(node.title, locale)}</p><p className="mt-2 text-sm leading-6 text-softWhite/50">{textFor(node.description, locale)}</p></div>)}</div></div>;
}

function ComparisonTableBlock({ block, locale, pendingAssets }: { block: ProjectDocumentBlock; locale: "zh" | "en"; pendingAssets: Record<string, File> }) {
  const columns = block.content.comparisonColumns ?? [];
  const title = textFor(block.content.title, locale);
  return <div className="mx-auto w-full max-w-6xl">
    {title ? <h3 className="font-display text-2xl font-semibold">{title}</h3> : null}
    <div className={`mt-6 grid gap-7 ${columns.length >= 3 ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
      {columns.map((column) => <ComparisonColumnFigure key={column.id} column={column} locale={locale} pendingFile={column.media?.assetId ? pendingAssets[column.media.assetId] : undefined} />)}
    </div>
  </div>;
}

function ComparisonColumnFigure({ column, locale, pendingFile }: { column: ProjectComparisonColumn; locale: "zh" | "en"; pendingFile?: File }) {
  const source = useResolvedAssetSource(column.media?.assetId, column.media?.publicPath, pendingFile);
  const [loadFailed, setLoadFailed] = useState(false);
  const hasReference = Boolean(column.media && (column.media.assetId || column.media.publicPath));
  const mediaSlotState = source ? (loadFailed ? "failed" : "filled") : hasReference ? "failed" : "empty";
  const slotId = `comparison-table:${column.id}`;
  const captureMode = isCollectionExportCapture();
  const suppressEmpty = mediaSlotState === "empty" && captureMode;
  if (suppressEmpty) { recordEmptySlotFound(slotId); recordEmptySlotCollapsed(slotId); }
  return <div className="min-w-0">
    {column.media && !suppressEmpty ? <div className="aspect-video w-full overflow-hidden rounded-[8px] bg-archiveBlue/30" data-media-slot-state={mediaSlotState} data-media-slot-id={slotId}>{source ? <img src={source} alt={textFor(column.media.alt, locale)} className="h-full w-full object-cover" onError={() => setLoadFailed(true)} /> : <div className="grid h-full place-items-center text-sm text-softWhite/28">Image</div>}</div> : null}
    <h4 className="mt-4 font-display text-xl font-semibold">{textFor(column.title, locale)}</h4>
    <p className="mt-2 whitespace-pre-line text-sm leading-6 text-softWhite/62">{textFor(column.description, locale)}</p>
  </div>;
}

function MatrixTableBlock({ block, locale }: { block: ProjectDocumentBlock; locale: "zh" | "en" }) {
  const columns = block.content.matrixColumns ?? [];
  const rows = block.content.matrixRows ?? [];
  const title = textFor(block.content.title, locale);
  return <div className="mx-auto w-full max-w-6xl">
    {title ? <h3 className="text-center font-display text-[clamp(1.25rem,2vw,1.5rem)] font-semibold leading-[1.3]">{title}</h3> : null}
    <div className="mt-6 overflow-x-auto rounded-[12px] border border-softWhite/10">
      <table className="w-full min-w-[640px] table-fixed border-collapse text-left">
        <thead>
          <tr className="bg-archiveBlue/30">
            {columns.map((column, index) => <th key={index} className="px-4 py-3 font-mono text-xs font-bold tracking-[0.06em] text-[#9FAAD2]">{textFor(column, locale)}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => <tr key={row.id} className="border-t border-softWhite/10 align-top">
            {row.cells.map((cell, index) => <td key={index} className="whitespace-pre-line px-4 py-4 text-sm leading-6 text-softWhite/76">{textFor(cell, locale)}</td>)}
          </tr>)}
        </tbody>
      </table>
    </div>
  </div>;
}

function TimelineBlock({ block, locale }: { block: ProjectDocumentBlock; locale: "zh" | "en" }) {
  const items = [...(block.content.timelineItems ?? [])].sort((a, b) => a.order - b.order);
  const title = textFor(block.content.title, locale);
  return <div className="mx-auto w-full max-w-6xl">
    {title ? <h3 className="font-display text-2xl font-semibold">{title}</h3> : null}
    <div className="mt-7 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => <div key={item.id} className={`rounded-[10px] border p-4 ${item.emphasis ? "border-acidGreen/50 bg-acidGreen/8" : "border-softWhite/10 bg-archiveBlue/18"}`}>
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-acidGreen/80">{textFor(item.date, locale)}</p>
        <h4 className="mt-2 font-display text-lg font-semibold text-softWhite">{textFor(item.label, locale)}</h4>
        <p className="mt-2 text-sm leading-6 text-softWhite/58">{textFor(item.description, locale)}</p>
      </div>)}
    </div>
  </div>;
}

function AnnotatedImageBlock({ block, locale, pendingAssets }: { block: ProjectDocumentBlock; locale: "zh" | "en"; pendingAssets: Record<string, File> }) {
  const items = block.content.annotatedImages ?? [];
  const title = textFor(block.content.title, locale);
  return <div className="mx-auto w-full max-w-6xl">
    {title ? <h3 className="font-display text-2xl font-semibold">{title}</h3> : null}
    <div className={`mt-6 grid gap-7 ${items.length >= 3 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2"}`}>
      {items.map((item) => <AnnotatedImageFigure key={item.id} item={item} locale={locale} pendingFile={item.media?.assetId ? pendingAssets[item.media.assetId] : undefined} />)}
    </div>
  </div>;
}

function AnnotatedImageFigure({ item, locale, pendingFile }: { item: ProjectAnnotatedImageItem; locale: "zh" | "en"; pendingFile?: File }) {
  const source = useResolvedAssetSource(item.media?.assetId, item.media?.publicPath, pendingFile);
  const [loadFailed, setLoadFailed] = useState(false);
  const hasReference = Boolean(item.media && (item.media.assetId || item.media.publicPath));
  const mediaSlotState = source ? (loadFailed ? "failed" : "filled") : hasReference ? "failed" : "empty";
  const slotId = `annotated-image:${item.id}`;
  const captureMode = isCollectionExportCapture();
  const suppressEmpty = mediaSlotState === "empty" && captureMode;
  if (suppressEmpty) { recordEmptySlotFound(slotId); recordEmptySlotCollapsed(slotId); }
  return <div className="min-w-0">
    {suppressEmpty ? null : <div className="aspect-video w-full overflow-hidden rounded-[8px] bg-archiveBlue/30" data-media-slot-state={mediaSlotState} data-media-slot-id={slotId}>{source ? <img src={source} alt={textFor(item.title, locale)} className="h-full w-full object-cover" onError={() => setLoadFailed(true)} /> : <div className="grid h-full place-items-center text-sm text-softWhite/28">Image</div>}</div>}
    <h4 className="mt-4 font-display text-lg font-semibold">{textFor(item.title, locale)}</h4>
    <p className="mt-2 whitespace-pre-line text-sm leading-6 text-softWhite/62">{textFor(item.description, locale)}</p>
  </div>;
}

function BoundaryListBlock({ block, locale }: { block: ProjectDocumentBlock; locale: "zh" | "en" }) {
  const lists = block.content.boundaryLists ?? [];
  const title = textFor(block.content.title, locale);
  return <div className="mx-auto w-full max-w-6xl">
    {title ? <h3 className="font-display text-2xl font-semibold">{title}</h3> : null}
    <div className={`mt-6 grid gap-7 ${lists.length >= 2 ? "md:grid-cols-2" : ""}`}>
      {lists.map((list) => <div key={list.id} className="rounded-[10px] border border-softWhite/10 bg-archiveBlue/14 p-5">
        <h4 className="font-display text-xl font-semibold text-acidGreen">{textFor(list.label, locale)}</h4>
        <ul className="mt-4 grid gap-2">{list.items.map((item, index) => <li key={index} className="flex gap-3 text-sm leading-6 text-softWhite/68"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-softWhite/30" />{textFor(item, locale)}</li>)}</ul>
      </div>)}
    </div>
  </div>;
}

function GroupedCardsBlock({ block, locale }: { block: ProjectDocumentBlock; locale: "zh" | "en" }) {
  const cards = block.content.groupedCards ?? [];
  const title = textFor(block.content.title, locale);
  return <div className="mx-auto w-full max-w-6xl">
    {title ? <h3 className="font-display text-2xl font-semibold">{title}</h3> : null}
    <div className="mt-6 grid gap-5 sm:grid-cols-2">
      {cards.map((card) => <div key={card.id} className="rounded-[10px] border border-softWhite/10 bg-archiveBlue/14 p-5">
        <h4 className="font-display text-xl font-semibold">{textFor(card.title, locale)}</h4>
        {textFor(card.meta, locale) ? <p className="mt-1 font-mono text-xs text-[#9FAAD2]">{textFor(card.meta, locale)}</p> : null}
        <div className="mt-4 grid gap-3">{card.subItems.map((sub) => <div key={sub.id} className="border-t border-softWhite/10 pt-3"><p className="text-sm font-semibold text-softWhite/80">{textFor(sub.title, locale)}</p><p className="mt-1 whitespace-pre-line text-sm leading-6 text-softWhite/56">{textFor(sub.description, locale)}</p></div>)}</div>
      </div>)}
    </div>
  </div>;
}

function ImageSlotGridBlock({ block, locale, pendingAssets }: { block: ProjectDocumentBlock; locale: "zh" | "en"; pendingAssets: Record<string, File> }) {
  const items = block.content.imageSlotItems ?? [];
  const title = textFor(block.content.title, locale);
  return <div className="mx-auto w-full max-w-6xl">
    {title ? <h3 className="font-display text-2xl font-semibold">{title}</h3> : null}
    <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => <ImageSlotGridFigure key={item.id} item={item} locale={locale} pendingFile={item.media?.assetId ? pendingAssets[item.media.assetId] : undefined} />)}
    </div>
  </div>;
}

function ImageSlotGridFigure({ item, locale, pendingFile }: { item: ProjectImageSlotItem; locale: "zh" | "en"; pendingFile?: File }) {
  const source = useResolvedAssetSource(item.media?.assetId, item.media?.publicPath, pendingFile);
  const [loadFailed, setLoadFailed] = useState(false);
  const hasReference = Boolean(item.media && (item.media.assetId || item.media.publicPath));
  const mediaSlotState = source ? (loadFailed ? "failed" : "filled") : hasReference ? "failed" : "empty";
  const slotId = `image-slot-grid:${item.id}`;
  const captureMode = isCollectionExportCapture();
  const suppressEmpty = mediaSlotState === "empty" && captureMode;
  if (suppressEmpty) { recordEmptySlotFound(slotId); recordEmptySlotCollapsed(slotId); }
  return <div className="min-w-0">
    {suppressEmpty ? null : <div className="aspect-video w-full overflow-hidden rounded-[8px] border border-softWhite/10 bg-archiveBlue/24" data-media-slot-state={mediaSlotState} data-media-slot-id={slotId}>{source ? <img src={source} alt={textFor(item.label, locale)} className="h-full w-full object-cover" onError={() => setLoadFailed(true)} /> : <div className="grid h-full place-items-center text-xs text-softWhite/26">Empty slot</div>}</div>}
    <p className="mt-2 text-xs font-semibold uppercase tracking-[0.08em] text-softWhite/50">{textFor(item.label, locale)}</p>
  </div>;
}

function ThinkingMapBlock({ block, locale }: { block: ProjectDocumentBlock; locale: "zh" | "en" }) {
  const nodes = [...(block.content.thinkingMapNodes ?? [])].sort((a, b) => a.order - b.order);
  const title = textFor(block.content.title, locale);
  const body = textFor(block.content.body, locale);
  return <div className="mx-auto w-full max-w-5xl">
    {title ? <h3 className="font-display text-2xl font-semibold">{title}</h3> : null}
    {body ? <p className="mt-3 text-sm leading-7 text-softWhite/60">{body}</p> : null}
    <div className="mt-7 grid gap-3">
      {nodes.map((node, index) => <div key={node.id} className={`rounded-[8px] border p-4 ${node.emphasis ? "border-acidGreen/50 bg-acidGreen/8" : "border-softWhite/10 bg-archiveBlue/18"}`}>
        <span className="font-mono text-[9px] text-softWhite/34">{String(index + 1).padStart(2, "0")}</span>
        <p className="mt-1 font-semibold text-softWhite/88">{textFor(node.label, locale)}</p>
        <p className="mt-2 whitespace-pre-line text-sm leading-6 text-softWhite/54">{textFor(node.body, locale)}</p>
      </div>)}
    </div>
  </div>;
}

function TabbedContentBlock({ block, locale }: { block: ProjectDocumentBlock; locale: "zh" | "en" }) {
  const tabs = block.content.tabs ?? [];
  const [active, setActive] = useState(0);
  const title = textFor(block.content.title, locale);
  return <div className="mx-auto w-full max-w-5xl">
    {title ? <h3 className="font-display text-2xl font-semibold">{title}</h3> : null}
    <div className="mt-5 flex flex-wrap gap-2 border-b border-softWhite/10">
      {tabs.map((tab, index) => <button key={tab.id} type="button" onClick={() => setActive(index)} className={`rounded-t-[6px] px-4 py-2 text-sm font-semibold transition ${index === active ? "border-b-2 border-acidGreen text-acidGreen" : "text-softWhite/50 hover:text-softWhite/80"}`}>{textFor(tab.label, locale)}</button>)}
    </div>
    <div className="mt-5 whitespace-pre-line text-sm leading-7 text-softWhite/68">{textFor(tabs[active]?.body, locale)}</div>
  </div>;
}

function MediaBlock(props: { projectId: string; block: ProjectDocumentBlock; locale: "zh" | "en"; isEditing: boolean; pendingAssets: Record<string, File>; onPendingAsset: (id: string, file: File) => void; onChange: (block: ProjectDocumentBlock) => void }) {
  const media = props.block.content.media ?? [];
  const columns = props.block.layout === "three-image-row" ? "md:grid-cols-3" : props.block.layout === "two-equal-images" || props.block.layout === "before-after" || props.block.layout === "mobile-screen-pair" ? "md:grid-cols-2" : props.block.layout === "responsive-grid" ? "sm:grid-cols-2 lg:grid-cols-3" : "grid-cols-1";
  const isImageText = props.block.layout === "image-text-left" || props.block.layout === "image-text-right";
  const figures = <div className={`grid gap-6 ${columns}`}>{media.map((item, index) => <MediaFigure key={item.id} item={item} locale={props.locale} pendingFile={item.assetId ? props.pendingAssets[item.assetId] : undefined} isEditing={props.isEditing} onFile={(file) => { const assetId = createStableId("asset"); props.onPendingAsset(assetId, file); props.onChange({ ...props.block, content: { ...props.block.content, media: media.map((current) => current.id === item.id ? { ...current, assetId, publicPath: undefined } : current) } }); }} onChange={(next) => props.onChange({ ...props.block, content: { ...props.block.content, media: media.map((current) => current.id === item.id ? next : current) } })} onMove={(direction) => props.onChange({ ...props.block, content: { ...props.block.content, media: moveItem(media, index, direction) } })} onRemove={() => props.onChange({ ...props.block, content: { ...props.block.content, media: media.filter((current) => current.id !== item.id) } })} index={index} count={media.length} />)}</div>;
  if (isImageText) {
    const text = <div><h3 className="font-display text-2xl font-semibold">{textFor(props.block.content.title, props.locale)}</h3><p className="mt-4 whitespace-pre-line text-base leading-8 text-softWhite/64">{textFor(props.block.content.body, props.locale)}</p></div>;
    return <div className="grid items-center gap-7 md:grid-cols-2">{props.block.layout === "image-text-left" ? <>{text}{figures}</> : <>{figures}{text}</>}</div>;
  }
  return <div className="mx-auto w-full max-w-5xl"><h3 className="font-display text-2xl font-semibold">{textFor(props.block.content.title, props.locale)}</h3>{textFor(props.block.content.body, props.locale) ? <p className="mt-3 max-w-3xl text-base leading-7 text-softWhite/58">{textFor(props.block.content.body, props.locale)}</p> : null}<div className="mt-7">{figures}</div></div>;
}

function MediaFigure({ item, locale, pendingFile, isEditing, onFile, onChange, onMove, onRemove, index, count }: { item: ProjectMediaItem; locale: "zh" | "en"; pendingFile?: File; isEditing: boolean; onFile: (file: File) => void; onChange: (item: ProjectMediaItem) => void; onMove: (direction: -1 | 1) => void; onRemove: () => void; index: number; count: number }) {
  const source = useResolvedAssetSource(item.assetId, item.publicPath, pendingFile);
  const aspectClass = aspectRatioToClassName(item.aspectRatio);
  const [loadFailed, setLoadFailed] = useState(false);
  // Raw-data classification (not "did this render a usable <img>"): a real
  // assetId/publicPath reference that failed to resolve is a genuine asset
  // failure (captureProjectPage aborts on it), never silently treated as an
  // empty slot the way the old "Image {n}" placeholder text used to look —
  // that placeholder reading as broken, unstyled filler in the exported
  // collection PDF is exactly what it was.
  const hasReference = Boolean(item.assetId || item.publicPath);
  const mediaSlotState = source ? (loadFailed ? "failed" : "filled") : hasReference ? "failed" : "empty";
  const slotId = `media-block:${item.id}`;
  const captureMode = isCollectionExportCapture();
  const suppressEmpty = mediaSlotState === "empty" && captureMode;
  if (suppressEmpty) { recordEmptySlotFound(slotId); recordEmptySlotCollapsed(slotId); }
  return <figure>
    {suppressEmpty ? null : <div className={`${aspectClass} mx-auto w-full max-w-5xl overflow-hidden rounded-[8px] bg-archiveBlue/30`} data-media-slot-state={mediaSlotState} data-media-slot-id={slotId}>{source ? <img src={source} alt={textFor(item.alt, locale)} className={`h-full w-full ${item.cropMode === "cover" ? "object-cover" : "object-contain"}`} style={{ objectPosition: item.focalPosition }} onError={() => setLoadFailed(true)} /> : <div className="grid h-full place-items-center text-sm text-softWhite/28">Image {index + 1}</div>}</div>}
    <figcaption className="mt-3 text-sm leading-6 text-softWhite/54">{textFor(item.caption, locale)}</figcaption>
    {isEditing ? <div className="mt-3 grid gap-3 rounded-[8px] border border-softWhite/10 p-3">
      <ImageAssetUploader source={source} onFile={onFile} showPreview={false} chooseLabel="Choose image" replaceLabel="Replace image" />
      <div className="flex flex-wrap gap-2">
        <button type="button" className="editor-icon" disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp className="h-3.5 w-3.5" /></button>
        <button type="button" className="editor-icon" disabled={index === count - 1} onClick={() => onMove(1)}><ArrowDown className="h-3.5 w-3.5" /></button>
        <button type="button" className="editor-action text-peach" onClick={onRemove}><Trash2 className="h-3.5 w-3.5" />Delete image</button>
      </div>
      <BilingualInput label="Description" zh={item.caption.zh} en={item.caption.en} onChange={(key, value) => onChange({ ...item, caption: { ...item.caption, [key]: value } })} />
      <details className="rounded-[8px] border border-softWhite/10 p-3">
        <summary className="cursor-pointer font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-softWhite/44">Advanced image options</summary>
        <div className="mt-3 grid gap-3">
          <div className="grid gap-2 sm:grid-cols-3"><label><span className="editor-label">Fit</span><select className="editor-select" value={item.cropMode} onChange={(event) => onChange({ ...item, cropMode: event.target.value as ProjectMediaItem["cropMode"] })}><option value="contain">Contain</option><option value="cover">Cover</option></select></label><AspectRatioSelect value={item.aspectRatio as AspectRatioValue} onChange={(value) => onChange({ ...item, aspectRatio: value })} /><label><span className="editor-label">Focal position</span><input className="editor-input" value={item.focalPosition} onChange={(event) => onChange({ ...item, focalPosition: event.target.value })} /></label></div>
          <BilingualInput label="Alt text" zh={item.alt.zh} en={item.alt.en} onChange={(key, value) => onChange({ ...item, alt: { ...item.alt, [key]: value } })} />
        </div>
      </details>
    </div> : null}
  </figure>;
}

function BlockContentEditor(props: { block: ProjectDocumentBlock; pendingAssets: Record<string, File>; onChange: (block: ProjectDocumentBlock) => void; onPendingAsset: (id: string, file: File) => void }) {
  const { block, onChange } = props;
  const content = block.content;
  if (block.type === "diagram") return <DiagramEditor block={block} onChange={onChange} />;
  if (block.type === "figma-prototype") return <FigmaPrototypeEditor block={block} onChange={onChange} pendingAssets={props.pendingAssets} onPendingAsset={props.onPendingAsset} />;
  if (block.type === "divider") return <p className="mt-5 text-xs text-softWhite/44">A divider has no text or image content — use "Change template" below to switch it to a different block type.</p>;
  if (block.type === "comparison-table") return <ComparisonTableEditor block={block} onChange={onChange} pendingAssets={props.pendingAssets} onPendingAsset={props.onPendingAsset} />;
  if (block.type === "decision-matrix") return <MatrixTableEditor block={block} onChange={onChange} />;
  if (block.type === "timeline") return <TimelineEditor block={block} onChange={onChange} />;
  if (block.type === "annotated-image") return <AnnotatedImageEditor block={block} onChange={onChange} pendingAssets={props.pendingAssets} onPendingAsset={props.onPendingAsset} />;
  if (block.type === "boundary-list") return <BoundaryListEditor block={block} onChange={onChange} />;
  if (block.type === "grouped-cards") return <GroupedCardsEditor block={block} onChange={onChange} />;
  if (block.type === "image-slot-grid") return <ImageSlotGridEditor block={block} onChange={onChange} pendingAssets={props.pendingAssets} onPendingAsset={props.onPendingAsset} />;
  if (block.type === "thinking-map") return <ThinkingMapEditor block={block} onChange={onChange} />;
  if (block.type === "tabbed-content") return <TabbedContentEditor block={block} onChange={onChange} />;
  return <div className="mt-5 grid gap-3 rounded-[8px] border border-electricBlue/25 bg-archiveBlue/10 p-4"><BilingualInput label="Block title" zh={content.title?.zh ?? ""} en={content.title?.en ?? ""} onChange={(key, value) => onChange({ ...block, content: { ...content, title: { ...(content.title ?? localized()), [key]: value } } })} /><BilingualInput label="Body" zh={content.body?.zh ?? ""} en={content.body?.en ?? ""} multiline onChange={(key, value) => onChange({ ...block, content: { ...content, body: { ...(content.body ?? localized()), [key]: value } } })} />{block.type === "text" && ["two-column-text", "problem-response", "question-answer"].includes(block.layout) ? <BilingualInput label="Secondary body" zh={content.secondaryBody?.zh ?? ""} en={content.secondaryBody?.en ?? ""} multiline onChange={(key, value) => onChange({ ...block, content: { ...content, secondaryBody: { ...(content.secondaryBody ?? localized()), [key]: value } } })} /> : null}{block.type === "media" ? <button type="button" className="editor-action w-fit" onClick={() => onChange({ ...block, content: { ...content, media: [...(content.media ?? []), createMediaItem()] } })}><Plus className="h-4 w-4" />Add image</button> : null}{block.type === "structured" ? <StructuredItemsEditor block={block} onChange={onChange} /> : null}</div>;
}

function StructuredItemsEditor({ block, onChange }: { block: ProjectDocumentBlock; onChange: (block: ProjectDocumentBlock) => void }) {
  const items = block.content.items ?? [];
  return <div className="grid gap-3">{items.map((item, index) => <div key={item.id} className="rounded-[8px] border border-softWhite/10 p-3"><div className="flex justify-between"><span className="font-mono text-[10px] text-acidGreen">ITEM {index + 1}</span><button type="button" onClick={() => onChange({ ...block, content: { ...block.content, items: items.filter((current) => current.id !== item.id) } })}><Trash2 className="h-4 w-4" /></button></div><BilingualInput label="Title" zh={item.title.zh} en={item.title.en} onChange={(key, value) => onChange({ ...block, content: { ...block.content, items: items.map((current) => current.id === item.id ? { ...current, title: { ...current.title, [key]: value } } : current) } })} /><BilingualInput label="Description" zh={item.description.zh} en={item.description.en} multiline onChange={(key, value) => onChange({ ...block, content: { ...block.content, items: items.map((current) => current.id === item.id ? { ...current, description: { ...current.description, [key]: value } } : current) } })} /></div>)}<button type="button" className="editor-action w-fit" onClick={() => onChange({ ...block, content: { ...block.content, items: [...items, { id: createStableId("item"), title: localized("新条目", "New item"), description: localized() }] } })}><Plus className="h-4 w-4" />Add item</button></div>;
}

function createComparisonColumn(): ProjectComparisonColumn {
  return { id: createStableId("column"), title: localized("新列", "New column"), description: localized() };
}

function ComparisonTableEditor({ block, onChange, pendingAssets, onPendingAsset }: { block: ProjectDocumentBlock; onChange: (block: ProjectDocumentBlock) => void; pendingAssets: Record<string, File>; onPendingAsset: (id: string, file: File) => void }) {
  const columns = block.content.comparisonColumns ?? [];
  const updateColumns = (next: ProjectComparisonColumn[]) => onChange({ ...block, content: { ...block.content, comparisonColumns: next } });
  return <div className="mt-5 grid gap-3 rounded-[8px] border border-electricBlue/25 bg-archiveBlue/10 p-4">
    <BilingualInput label="Block title (optional)" zh={block.content.title?.zh ?? ""} en={block.content.title?.en ?? ""} onChange={(key, value) => onChange({ ...block, content: { ...block.content, title: { ...(block.content.title ?? localized()), [key]: value } } })} />
    <div className="grid gap-3">
      {columns.map((column, index) => <ComparisonColumnEditorItem key={column.id} column={column} index={index} count={columns.length} pendingAssets={pendingAssets} onPendingAsset={onPendingAsset}
        onChange={(next) => updateColumns(columns.map((current) => current.id === column.id ? next : current))}
        onMove={(direction) => updateColumns(moveItem(columns, index, direction))}
        onDuplicate={() => updateColumns([...columns.slice(0, index + 1), { ...structuredClone(column), id: createStableId("column") }, ...columns.slice(index + 1)])}
        onDelete={() => updateColumns(columns.filter((current) => current.id !== column.id))}
      />)}
    </div>
    <button type="button" className="editor-action w-fit" onClick={() => updateColumns([...columns, createComparisonColumn()])}><Plus className="h-4 w-4" />Add column</button>
  </div>;
}

function ComparisonColumnEditorItem({ column, index, count, pendingAssets, onPendingAsset, onChange, onMove, onDuplicate, onDelete }: { column: ProjectComparisonColumn; index: number; count: number; pendingAssets: Record<string, File>; onPendingAsset: (id: string, file: File) => void; onChange: (column: ProjectComparisonColumn) => void; onMove: (direction: -1 | 1) => void; onDuplicate: () => void; onDelete: () => void }) {
  const pendingFile = column.media?.assetId ? pendingAssets[column.media.assetId] : undefined;
  const source = useResolvedAssetSource(column.media?.assetId, column.media?.publicPath, pendingFile);
  return <div className="rounded-[8px] border border-softWhite/10 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="font-mono text-[10px] text-acidGreen">COLUMN {index + 1}</span>
      <div className="flex items-center gap-1">
        <button type="button" className="editor-icon" aria-label="Move column left" disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp className="h-3.5 w-3.5 -rotate-90" /></button>
        <button type="button" className="editor-icon" aria-label="Move column right" disabled={index === count - 1} onClick={() => onMove(1)}><ArrowDown className="h-3.5 w-3.5 -rotate-90" /></button>
        <button type="button" className="editor-icon" aria-label="Duplicate column" onClick={onDuplicate}><Copy className="h-3.5 w-3.5" /></button>
        <button type="button" className="editor-icon text-peach" aria-label="Delete column" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
    </div>
    <div className="mt-3">
      <ImageAssetUploader source={source} previewClassName="aspect-video w-full" chooseLabel="Choose image" replaceLabel="Replace image" onFile={(file) => { const assetId = createStableId("asset"); onPendingAsset(assetId, file); onChange({ ...column, media: { ...(column.media ?? createMediaItem()), assetId, publicPath: undefined } }); }} onRemove={column.media ? () => onChange({ ...column, media: undefined }) : undefined} />
    </div>
    <div className="mt-3 grid gap-3">
      <BilingualInput label="Column title" zh={column.title.zh} en={column.title.en} onChange={(key, value) => onChange({ ...column, title: { ...column.title, [key]: value } })} />
      <BilingualInput label="Column description" zh={column.description.zh} en={column.description.en} multiline onChange={(key, value) => onChange({ ...column, description: { ...column.description, [key]: value } })} />
    </div>
  </div>;
}

function MatrixTableEditor({ block, onChange }: { block: ProjectDocumentBlock; onChange: (block: ProjectDocumentBlock) => void }) {
  const columns = block.content.matrixColumns ?? [];
  const rows = block.content.matrixRows ?? [];
  const updateColumns = (next: LocalizedText[]) => onChange({ ...block, content: { ...block.content, matrixColumns: next } });
  const updateRows = (next: ProjectMatrixRow[]) => onChange({ ...block, content: { ...block.content, matrixRows: next } });
  // Column count and every row's cell count must change together — two
  // separate onChange calls would each rebuild `content` from the same
  // stale `block`, so the second call would silently overwrite the first.
  const addColumn = () => onChange({ ...block, content: { ...block.content, matrixColumns: [...columns, localized("新列", "New column")], matrixRows: rows.map((row) => ({ ...row, cells: [...row.cells, localized()] })) } });
  const removeColumn = (columnIndex: number) => onChange({ ...block, content: { ...block.content, matrixColumns: columns.filter((_, index) => index !== columnIndex), matrixRows: rows.map((row) => ({ ...row, cells: row.cells.filter((_, index) => index !== columnIndex) })) } });
  const addRow = () => updateRows([...rows, { id: createStableId("row"), cells: columns.map(() => localized()) }]);
  return <div className="mt-5 grid gap-3 rounded-[8px] border border-electricBlue/25 bg-archiveBlue/10 p-4">
    <BilingualInput label="Block title (optional)" zh={block.content.title?.zh ?? ""} en={block.content.title?.en ?? ""} onChange={(key, value) => onChange({ ...block, content: { ...block.content, title: { ...(block.content.title ?? localized()), [key]: value } } })} />
    <div className="grid gap-3">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-softWhite/40">Columns</p>
      {columns.map((column, columnIndex) => <div key={columnIndex} className="grid gap-2 rounded-[8px] border border-softWhite/10 p-3 md:grid-cols-[1fr_1fr_auto]">
        <input className="editor-input" placeholder="Column header (zh)" value={column.zh} onChange={(event) => updateColumns(columns.map((current, index) => index === columnIndex ? { ...current, zh: event.target.value } : current))} />
        <input className="editor-input" placeholder="Column header (en)" value={column.en} onChange={(event) => updateColumns(columns.map((current, index) => index === columnIndex ? { ...current, en: event.target.value } : current))} />
        <button type="button" className="editor-icon text-peach" aria-label="Delete column" onClick={() => removeColumn(columnIndex)}><Trash2 className="h-4 w-4" /></button>
      </div>)}
      <button type="button" className="editor-action w-fit" onClick={addColumn}><Plus className="h-4 w-4" />Add column</button>
    </div>
    <div className="grid gap-3">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-softWhite/40">Rows</p>
      {rows.map((row, rowIndex) => <div key={row.id} className="rounded-[8px] border border-softWhite/10 p-3">
        <div className="flex items-center justify-between"><span className="font-mono text-[10px] text-acidGreen">ROW {rowIndex + 1}</span>
          <div className="flex items-center gap-1">
            <button type="button" className="editor-icon" disabled={rowIndex === 0} onClick={() => updateRows(moveItem(rows, rowIndex, -1))}><ArrowUp className="h-3.5 w-3.5" /></button>
            <button type="button" className="editor-icon" disabled={rowIndex === rows.length - 1} onClick={() => updateRows(moveItem(rows, rowIndex, 1))}><ArrowDown className="h-3.5 w-3.5" /></button>
            <button type="button" className="editor-icon" onClick={() => updateRows([...rows.slice(0, rowIndex + 1), { id: createStableId("row"), cells: [...row.cells] }, ...rows.slice(rowIndex + 1)])}><Copy className="h-3.5 w-3.5" /></button>
            <button type="button" className="editor-icon text-peach" onClick={() => updateRows(rows.filter((current) => current.id !== row.id))}><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        </div>
        <div className="mt-2 grid gap-2">
          {row.cells.map((cell, cellIndex) => <div key={cellIndex} className="grid gap-2 sm:grid-cols-2">
            <input className="editor-input" placeholder={`${textForPlain(columns[cellIndex]) || `Column ${cellIndex + 1}`} (zh)`} value={cell.zh} onChange={(event) => updateRows(rows.map((current, index) => index === rowIndex ? { ...current, cells: current.cells.map((currentCell, cIndex) => cIndex === cellIndex ? { ...currentCell, zh: event.target.value } : currentCell) } : current))} />
            <input className="editor-input" placeholder={`${textForPlain(columns[cellIndex]) || `Column ${cellIndex + 1}`} (en)`} value={cell.en} onChange={(event) => updateRows(rows.map((current, index) => index === rowIndex ? { ...current, cells: current.cells.map((currentCell, cIndex) => cIndex === cellIndex ? { ...currentCell, en: event.target.value } : currentCell) } : current))} />
          </div>)}
        </div>
      </div>)}
      <button type="button" className="editor-action w-fit" onClick={addRow}><Plus className="h-4 w-4" />Add row</button>
    </div>
  </div>;
}

function TimelineEditor({ block, onChange }: { block: ProjectDocumentBlock; onChange: (block: ProjectDocumentBlock) => void }) {
  const items = block.content.timelineItems ?? [];
  const updateItems = (next: ProjectTimelineItem[]) => onChange({ ...block, content: { ...block.content, timelineItems: next.map((item, order) => ({ ...item, order })) } });
  return <div className="mt-5 grid gap-3 rounded-[8px] border border-electricBlue/25 bg-archiveBlue/10 p-4">
    <BilingualInput label="Block title (optional)" zh={block.content.title?.zh ?? ""} en={block.content.title?.en ?? ""} onChange={(key, value) => onChange({ ...block, content: { ...block.content, title: { ...(block.content.title ?? localized()), [key]: value } } })} />
    <div className="grid gap-3">
      {items.map((item, index) => <div key={item.id} className="rounded-[8px] border border-softWhite/10 p-3">
        <div className="flex items-center justify-between"><span className="font-mono text-[10px] text-acidGreen">ITEM {index + 1}</span>
          <div className="flex items-center gap-1">
            <button type="button" className="editor-icon" disabled={index === 0} onClick={() => updateItems(moveItem(items, index, -1))}><ArrowUp className="h-3.5 w-3.5" /></button>
            <button type="button" className="editor-icon" disabled={index === items.length - 1} onClick={() => updateItems(moveItem(items, index, 1))}><ArrowDown className="h-3.5 w-3.5" /></button>
            <button type="button" className="editor-icon" onClick={() => updateItems([...items.slice(0, index + 1), { ...structuredClone(item), id: createStableId("timeline-item") }, ...items.slice(index + 1)])}><Copy className="h-3.5 w-3.5" /></button>
            <button type="button" className="editor-icon text-peach" onClick={() => updateItems(items.filter((current) => current.id !== item.id))}><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        </div>
        <div className="mt-3 grid gap-3">
          <BilingualInput label="Date" zh={item.date.zh} en={item.date.en} onChange={(key, value) => updateItems(items.map((current) => current.id === item.id ? { ...current, date: { ...current.date, [key]: value } } : current))} />
          <BilingualInput label="Label" zh={item.label.zh} en={item.label.en} onChange={(key, value) => updateItems(items.map((current) => current.id === item.id ? { ...current, label: { ...current.label, [key]: value } } : current))} />
          <BilingualInput label="Description" zh={item.description.zh} en={item.description.en} multiline onChange={(key, value) => updateItems(items.map((current) => current.id === item.id ? { ...current, description: { ...current.description, [key]: value } } : current))} />
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={item.emphasis} onChange={(event) => updateItems(items.map((current) => current.id === item.id ? { ...current, emphasis: event.target.checked } : current))} />Emphasis</label>
        </div>
      </div>)}
    </div>
    <button type="button" className="editor-action w-fit" onClick={() => updateItems([...items, { id: createStableId("timeline-item"), date: localized("2026", "2026"), label: localized("新事件", "New event"), description: localized(), emphasis: false, order: items.length }])}><Plus className="h-4 w-4" />Add item</button>
  </div>;
}

function AnnotatedImageEditor({ block, onChange, pendingAssets, onPendingAsset }: { block: ProjectDocumentBlock; onChange: (block: ProjectDocumentBlock) => void; pendingAssets: Record<string, File>; onPendingAsset: (id: string, file: File) => void }) {
  const items = block.content.annotatedImages ?? [];
  const updateItems = (next: ProjectAnnotatedImageItem[]) => onChange({ ...block, content: { ...block.content, annotatedImages: next } });
  return <div className="mt-5 grid gap-3 rounded-[8px] border border-electricBlue/25 bg-archiveBlue/10 p-4">
    <BilingualInput label="Block title (optional)" zh={block.content.title?.zh ?? ""} en={block.content.title?.en ?? ""} onChange={(key, value) => onChange({ ...block, content: { ...block.content, title: { ...(block.content.title ?? localized()), [key]: value } } })} />
    <div className="grid gap-3">
      {items.map((item, index) => <AnnotatedImageEditorItem key={item.id} item={item} index={index} count={items.length} pendingAssets={pendingAssets} onPendingAsset={onPendingAsset}
        onChange={(next) => updateItems(items.map((current) => current.id === item.id ? next : current))}
        onMove={(direction) => updateItems(moveItem(items, index, direction))}
        onDuplicate={() => updateItems([...items.slice(0, index + 1), { ...structuredClone(item), id: createStableId("annotated-image") }, ...items.slice(index + 1)])}
        onDelete={() => updateItems(items.filter((current) => current.id !== item.id))}
      />)}
    </div>
    <button type="button" className="editor-action w-fit" onClick={() => updateItems([...items, { id: createStableId("annotated-image"), title: localized("新图片", "New image"), description: localized() }])}><Plus className="h-4 w-4" />Add image</button>
  </div>;
}

function AnnotatedImageEditorItem({ item, index, count, pendingAssets, onPendingAsset, onChange, onMove, onDuplicate, onDelete }: { item: ProjectAnnotatedImageItem; index: number; count: number; pendingAssets: Record<string, File>; onPendingAsset: (id: string, file: File) => void; onChange: (item: ProjectAnnotatedImageItem) => void; onMove: (direction: -1 | 1) => void; onDuplicate: () => void; onDelete: () => void }) {
  const pendingFile = item.media?.assetId ? pendingAssets[item.media.assetId] : undefined;
  const source = useResolvedAssetSource(item.media?.assetId, item.media?.publicPath, pendingFile);
  return <div className="rounded-[8px] border border-softWhite/10 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="font-mono text-[10px] text-acidGreen">IMAGE {index + 1}</span>
      <div className="flex items-center gap-1">
        <button type="button" className="editor-icon" aria-label="Move image up" disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp className="h-3.5 w-3.5" /></button>
        <button type="button" className="editor-icon" aria-label="Move image down" disabled={index === count - 1} onClick={() => onMove(1)}><ArrowDown className="h-3.5 w-3.5" /></button>
        <button type="button" className="editor-icon" aria-label="Duplicate image" onClick={onDuplicate}><Copy className="h-3.5 w-3.5" /></button>
        <button type="button" className="editor-icon text-peach" aria-label="Delete image" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
    </div>
    <div className="mt-3"><ImageAssetUploader source={source} previewClassName="aspect-video w-full" chooseLabel="Choose image" replaceLabel="Replace image" onFile={(file) => { const assetId = createStableId("asset"); onPendingAsset(assetId, file); onChange({ ...item, media: { ...(item.media ?? createMediaItem()), assetId, publicPath: undefined } }); }} onRemove={item.media ? () => onChange({ ...item, media: undefined }) : undefined} /></div>
    <div className="mt-3 grid gap-3">
      <BilingualInput label="Image title" zh={item.title.zh} en={item.title.en} onChange={(key, value) => onChange({ ...item, title: { ...item.title, [key]: value } })} />
      <BilingualInput label="Image description" zh={item.description.zh} en={item.description.en} multiline onChange={(key, value) => onChange({ ...item, description: { ...item.description, [key]: value } })} />
    </div>
  </div>;
}

function BoundaryListEditor({ block, onChange }: { block: ProjectDocumentBlock; onChange: (block: ProjectDocumentBlock) => void }) {
  const lists = block.content.boundaryLists ?? [];
  const updateLists = (next: ProjectBoundaryList[]) => onChange({ ...block, content: { ...block.content, boundaryLists: next } });
  return <div className="mt-5 grid gap-3 rounded-[8px] border border-electricBlue/25 bg-archiveBlue/10 p-4">
    <BilingualInput label="Block title (optional)" zh={block.content.title?.zh ?? ""} en={block.content.title?.en ?? ""} onChange={(key, value) => onChange({ ...block, content: { ...block.content, title: { ...(block.content.title ?? localized()), [key]: value } } })} />
    <div className="grid gap-3">
      {lists.map((list, listIndex) => <div key={list.id} className="rounded-[8px] border border-softWhite/10 p-3">
        <div className="flex items-center justify-between"><BilingualInput label="List label" zh={list.label.zh} en={list.label.en} onChange={(key, value) => updateLists(lists.map((current) => current.id === list.id ? { ...current, label: { ...current.label, [key]: value } } : current))} /><button type="button" className="editor-icon text-peach" onClick={() => updateLists(lists.filter((current) => current.id !== list.id))}><Trash2 className="h-4 w-4" /></button></div>
        <div className="mt-3 grid gap-2">
          {list.items.map((item, itemIndex) => <div key={itemIndex} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input className="editor-input" placeholder="中文" value={item.zh} onChange={(event) => updateLists(lists.map((current, cIndex) => cIndex === listIndex ? { ...current, items: current.items.map((currentItem, iIndex) => iIndex === itemIndex ? { ...currentItem, zh: event.target.value } : currentItem) } : current))} />
            <input className="editor-input" placeholder="English" value={item.en} onChange={(event) => updateLists(lists.map((current, cIndex) => cIndex === listIndex ? { ...current, items: current.items.map((currentItem, iIndex) => iIndex === itemIndex ? { ...currentItem, en: event.target.value } : currentItem) } : current))} />
            <div className="flex gap-1">
              <button type="button" className="editor-icon" disabled={itemIndex === 0} onClick={() => updateLists(lists.map((current, cIndex) => cIndex === listIndex ? { ...current, items: moveItem(current.items, itemIndex, -1) } : current))}><ArrowUp className="h-3.5 w-3.5" /></button>
              <button type="button" className="editor-icon" disabled={itemIndex === list.items.length - 1} onClick={() => updateLists(lists.map((current, cIndex) => cIndex === listIndex ? { ...current, items: moveItem(current.items, itemIndex, 1) } : current))}><ArrowDown className="h-3.5 w-3.5" /></button>
              <button type="button" className="editor-icon text-peach" onClick={() => updateLists(lists.map((current, cIndex) => cIndex === listIndex ? { ...current, items: current.items.filter((_, iIndex) => iIndex !== itemIndex) } : current))}><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          </div>)}
          <button type="button" className="editor-action w-fit" onClick={() => updateLists(lists.map((current, cIndex) => cIndex === listIndex ? { ...current, items: [...current.items, localized("", "")] } : current))}><Plus className="h-3.5 w-3.5" />Add item</button>
        </div>
      </div>)}
    </div>
    <button type="button" className="editor-action w-fit" onClick={() => updateLists([...lists, { id: createStableId("boundary-list"), label: localized("新列表", "New list"), items: [] }])}><Plus className="h-4 w-4" />Add list</button>
  </div>;
}

function GroupedCardsEditor({ block, onChange }: { block: ProjectDocumentBlock; onChange: (block: ProjectDocumentBlock) => void }) {
  const cards = block.content.groupedCards ?? [];
  const updateCards = (next: ProjectGroupedCard[]) => onChange({ ...block, content: { ...block.content, groupedCards: next } });
  const updateCard = (id: string, updater: (card: ProjectGroupedCard) => ProjectGroupedCard) => updateCards(cards.map((card) => card.id === id ? updater(card) : card));
  return <div className="mt-5 grid gap-3 rounded-[8px] border border-electricBlue/25 bg-archiveBlue/10 p-4">
    <BilingualInput label="Block title (optional)" zh={block.content.title?.zh ?? ""} en={block.content.title?.en ?? ""} onChange={(key, value) => onChange({ ...block, content: { ...block.content, title: { ...(block.content.title ?? localized()), [key]: value } } })} />
    <div className="grid gap-3">
      {cards.map((card, index) => <div key={card.id} className="rounded-[8px] border border-softWhite/10 p-3">
        <div className="flex items-center justify-between"><span className="font-mono text-[10px] text-acidGreen">CARD {index + 1}</span>
          <div className="flex items-center gap-1">
            <button type="button" className="editor-icon" disabled={index === 0} onClick={() => updateCards(moveItem(cards, index, -1))}><ArrowUp className="h-3.5 w-3.5" /></button>
            <button type="button" className="editor-icon" disabled={index === cards.length - 1} onClick={() => updateCards(moveItem(cards, index, 1))}><ArrowDown className="h-3.5 w-3.5" /></button>
            <button type="button" className="editor-icon" onClick={() => updateCards([...cards.slice(0, index + 1), { ...structuredClone(card), id: createStableId("card") }, ...cards.slice(index + 1)])}><Copy className="h-3.5 w-3.5" /></button>
            <button type="button" className="editor-icon text-peach" onClick={() => updateCards(cards.filter((current) => current.id !== card.id))}><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        </div>
        <div className="mt-3 grid gap-3">
          <BilingualInput label="Card title" zh={card.title.zh} en={card.title.en} onChange={(key, value) => updateCard(card.id, (current) => ({ ...current, title: { ...current.title, [key]: value } }))} />
          <BilingualInput label="Card meta (optional)" zh={card.meta.zh} en={card.meta.en} onChange={(key, value) => updateCard(card.id, (current) => ({ ...current, meta: { ...current.meta, [key]: value } }))} />
          <div className="grid gap-2 rounded-[6px] border border-softWhite/10 p-2">
            <p className="font-mono text-[9px] uppercase text-softWhite/40">Sub-items</p>
            {card.subItems.map((sub, subIndex) => <div key={sub.id} className="grid gap-2 rounded-[6px] border border-softWhite/10 p-2">
              <div className="flex justify-between"><span className="font-mono text-[9px] text-acidGreen">{subIndex + 1}</span>
                <div className="flex gap-1">
                  <button type="button" className="editor-icon" disabled={subIndex === 0} onClick={() => updateCard(card.id, (current) => ({ ...current, subItems: moveItem(current.subItems, subIndex, -1) }))}><ArrowUp className="h-3.5 w-3.5" /></button>
                  <button type="button" className="editor-icon" disabled={subIndex === card.subItems.length - 1} onClick={() => updateCard(card.id, (current) => ({ ...current, subItems: moveItem(current.subItems, subIndex, 1) }))}><ArrowDown className="h-3.5 w-3.5" /></button>
                  <button type="button" className="editor-icon text-peach" onClick={() => updateCard(card.id, (current) => ({ ...current, subItems: current.subItems.filter((item) => item.id !== sub.id) }))}><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
              <BilingualInput label="Sub-item title" zh={sub.title.zh} en={sub.title.en} onChange={(key, value) => updateCard(card.id, (current) => ({ ...current, subItems: current.subItems.map((item) => item.id === sub.id ? { ...item, title: { ...item.title, [key]: value } } : item) }))} />
              <BilingualInput label="Sub-item description" zh={sub.description.zh} en={sub.description.en} multiline onChange={(key, value) => updateCard(card.id, (current) => ({ ...current, subItems: current.subItems.map((item) => item.id === sub.id ? { ...item, description: { ...item.description, [key]: value } } : item) }))} />
            </div>)}
            <button type="button" className="editor-action w-fit" onClick={() => updateCard(card.id, (current) => ({ ...current, subItems: [...current.subItems, { id: createStableId("sub-item"), title: localized("新条目", "New item"), description: localized() }] }))}><Plus className="h-3.5 w-3.5" />Add sub-item</button>
          </div>
        </div>
      </div>)}
    </div>
    <button type="button" className="editor-action w-fit" onClick={() => updateCards([...cards, { id: createStableId("card"), title: localized("新卡片", "New card"), meta: localized(), subItems: [] }])}><Plus className="h-4 w-4" />Add card</button>
  </div>;
}

function ImageSlotGridEditor({ block, onChange, pendingAssets, onPendingAsset }: { block: ProjectDocumentBlock; onChange: (block: ProjectDocumentBlock) => void; pendingAssets: Record<string, File>; onPendingAsset: (id: string, file: File) => void }) {
  const items = block.content.imageSlotItems ?? [];
  const updateItems = (next: ProjectImageSlotItem[]) => onChange({ ...block, content: { ...block.content, imageSlotItems: next } });
  return <div className="mt-5 grid gap-3 rounded-[8px] border border-electricBlue/25 bg-archiveBlue/10 p-4">
    <BilingualInput label="Block title (optional)" zh={block.content.title?.zh ?? ""} en={block.content.title?.en ?? ""} onChange={(key, value) => onChange({ ...block, content: { ...block.content, title: { ...(block.content.title ?? localized()), [key]: value } } })} />
    <div className="grid gap-3">
      {items.map((item, index) => <ImageSlotEditorItem key={item.id} item={item} index={index} count={items.length} pendingAssets={pendingAssets} onPendingAsset={onPendingAsset}
        onChange={(next) => updateItems(items.map((current) => current.id === item.id ? next : current))}
        onMove={(direction) => updateItems(moveItem(items, index, direction))}
        onDuplicate={() => updateItems([...items.slice(0, index + 1), { ...structuredClone(item), id: createStableId("image-slot") }, ...items.slice(index + 1)])}
        onDelete={() => updateItems(items.filter((current) => current.id !== item.id))}
      />)}
    </div>
    <button type="button" className="editor-action w-fit" onClick={() => updateItems([...items, { id: createStableId("image-slot"), label: localized("新图片位", "New slot") }])}><Plus className="h-4 w-4" />Add slot</button>
  </div>;
}

function ImageSlotEditorItem({ item, index, count, pendingAssets, onPendingAsset, onChange, onMove, onDuplicate, onDelete }: { item: ProjectImageSlotItem; index: number; count: number; pendingAssets: Record<string, File>; onPendingAsset: (id: string, file: File) => void; onChange: (item: ProjectImageSlotItem) => void; onMove: (direction: -1 | 1) => void; onDuplicate: () => void; onDelete: () => void }) {
  const pendingFile = item.media?.assetId ? pendingAssets[item.media.assetId] : undefined;
  const source = useResolvedAssetSource(item.media?.assetId, item.media?.publicPath, pendingFile);
  return <div className="rounded-[8px] border border-softWhite/10 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="font-mono text-[10px] text-acidGreen">SLOT {index + 1}</span>
      <div className="flex items-center gap-1">
        <button type="button" className="editor-icon" disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp className="h-3.5 w-3.5" /></button>
        <button type="button" className="editor-icon" disabled={index === count - 1} onClick={() => onMove(1)}><ArrowDown className="h-3.5 w-3.5" /></button>
        <button type="button" className="editor-icon" onClick={onDuplicate}><Copy className="h-3.5 w-3.5" /></button>
        <button type="button" className="editor-icon text-peach" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
    </div>
    <div className="mt-3"><ImageAssetUploader source={source} previewClassName="aspect-video w-full" chooseLabel="Choose image" replaceLabel="Replace image" onFile={(file) => { const assetId = createStableId("asset"); onPendingAsset(assetId, file); onChange({ ...item, media: { ...(item.media ?? createMediaItem()), assetId, publicPath: undefined } }); }} onRemove={item.media ? () => onChange({ ...item, media: undefined }) : undefined} /></div>
    <div className="mt-3"><BilingualInput label="Slot label" zh={item.label.zh} en={item.label.en} onChange={(key, value) => onChange({ ...item, label: { ...item.label, [key]: value } })} /></div>
  </div>;
}

function ThinkingMapEditor({ block, onChange }: { block: ProjectDocumentBlock; onChange: (block: ProjectDocumentBlock) => void }) {
  const nodes = block.content.thinkingMapNodes ?? [];
  const updateNodes = (next: ProjectThinkingMapNode[]) => onChange({ ...block, content: { ...block.content, thinkingMapNodes: next.map((node, order) => ({ ...node, order })) } });
  return <div className="mt-5 grid gap-3 rounded-[8px] border border-electricBlue/25 bg-archiveBlue/10 p-4">
    <BilingualInput label="Eyebrow (optional)" zh={block.content.eyebrow?.zh ?? ""} en={block.content.eyebrow?.en ?? ""} onChange={(key, value) => onChange({ ...block, content: { ...block.content, eyebrow: { ...(block.content.eyebrow ?? localized()), [key]: value } } })} />
    <BilingualInput label="Heading" zh={block.content.title?.zh ?? ""} en={block.content.title?.en ?? ""} onChange={(key, value) => onChange({ ...block, content: { ...block.content, title: { ...(block.content.title ?? localized()), [key]: value } } })} />
    <BilingualInput label="Description" zh={block.content.body?.zh ?? ""} en={block.content.body?.en ?? ""} multiline onChange={(key, value) => onChange({ ...block, content: { ...block.content, body: { ...(block.content.body ?? localized()), [key]: value } } })} />
    <div className="grid gap-2">
      {nodes.map((node, index) => <div key={node.id} className="grid gap-2 rounded-[8px] border border-softWhite/10 p-3">
        <div className="flex items-center justify-between"><span className="font-mono text-[10px] text-acidGreen">NODE {index + 1}</span>
          <div className="flex gap-1">
            <button type="button" className="editor-icon" disabled={index === 0} onClick={() => updateNodes(moveItem(nodes, index, -1))}><ArrowUp className="h-3.5 w-3.5" /></button>
            <button type="button" className="editor-icon" disabled={index === nodes.length - 1} onClick={() => updateNodes(moveItem(nodes, index, 1))}><ArrowDown className="h-3.5 w-3.5" /></button>
            <button type="button" className="editor-icon" onClick={() => updateNodes([...nodes.slice(0, index + 1), { ...structuredClone(node), id: createStableId("thinking-node") }, ...nodes.slice(index + 1)])}><Copy className="h-3.5 w-3.5" /></button>
            <button type="button" className="editor-icon text-peach" onClick={() => updateNodes(nodes.filter((current) => current.id !== node.id))}><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        </div>
        <BilingualInput label="Node label" zh={node.label.zh} en={node.label.en} onChange={(key, value) => updateNodes(nodes.map((current) => current.id === node.id ? { ...current, label: { ...current.label, [key]: value } } : current))} />
        <BilingualInput label="Node body" zh={node.body.zh} en={node.body.en} multiline onChange={(key, value) => updateNodes(nodes.map((current) => current.id === node.id ? { ...current, body: { ...current.body, [key]: value } } : current))} />
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={node.emphasis} onChange={(event) => updateNodes(nodes.map((current) => current.id === node.id ? { ...current, emphasis: event.target.checked } : current))} />Emphasis</label>
      </div>)}
    </div>
    <button type="button" className="editor-action w-fit" onClick={() => updateNodes([...nodes, { id: createStableId("thinking-node"), label: localized("新节点", "New node"), body: localized(), emphasis: false, order: nodes.length }])}><Plus className="h-4 w-4" />Add node</button>
  </div>;
}

function TabbedContentEditor({ block, onChange }: { block: ProjectDocumentBlock; onChange: (block: ProjectDocumentBlock) => void }) {
  const tabs = block.content.tabs ?? [];
  const updateTabs = (next: ProjectTab[]) => onChange({ ...block, content: { ...block.content, tabs: next } });
  return <div className="mt-5 grid gap-3 rounded-[8px] border border-electricBlue/25 bg-archiveBlue/10 p-4">
    <BilingualInput label="Block title (optional)" zh={block.content.title?.zh ?? ""} en={block.content.title?.en ?? ""} onChange={(key, value) => onChange({ ...block, content: { ...block.content, title: { ...(block.content.title ?? localized()), [key]: value } } })} />
    <div className="grid gap-3">
      {tabs.map((tab, index) => <div key={tab.id} className="rounded-[8px] border border-softWhite/10 p-3">
        <div className="flex items-center justify-between"><span className="font-mono text-[10px] text-acidGreen">TAB {index + 1}</span>
          <div className="flex gap-1">
            <button type="button" className="editor-icon" disabled={index === 0} onClick={() => updateTabs(moveItem(tabs, index, -1))}><ArrowUp className="h-3.5 w-3.5" /></button>
            <button type="button" className="editor-icon" disabled={index === tabs.length - 1} onClick={() => updateTabs(moveItem(tabs, index, 1))}><ArrowDown className="h-3.5 w-3.5" /></button>
            <button type="button" className="editor-icon" onClick={() => updateTabs([...tabs.slice(0, index + 1), { ...structuredClone(tab), id: createStableId("tab") }, ...tabs.slice(index + 1)])}><Copy className="h-3.5 w-3.5" /></button>
            <button type="button" className="editor-icon text-peach" onClick={() => updateTabs(tabs.filter((current) => current.id !== tab.id))}><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        </div>
        <BilingualInput label="Tab label" zh={tab.label.zh} en={tab.label.en} onChange={(key, value) => updateTabs(tabs.map((current) => current.id === tab.id ? { ...current, label: { ...current.label, [key]: value } } : current))} />
        <div className="mt-2"><BilingualInput label="Tab body" zh={tab.body.zh} en={tab.body.en} multiline onChange={(key, value) => updateTabs(tabs.map((current) => current.id === tab.id ? { ...current, body: { ...current.body, [key]: value } } : current))} /></div>
      </div>)}
    </div>
    <button type="button" className="editor-action w-fit" onClick={() => updateTabs([...tabs, { id: createStableId("tab"), label: localized("新标签", "New tab"), body: localized() }])}><Plus className="h-4 w-4" />Add tab</button>
  </div>;
}

function DiagramEditor({ block, onChange }: { block: ProjectDocumentBlock; onChange: (block: ProjectDocumentBlock) => void }) {
  const [sheets, setSheets] = useState<ParsedXMindSheet[]>([]); const [sheetId, setSheetId] = useState(""); const [style, setStyle] = useState<XMindConversionStyle>("hierarchy-map"); const [error, setError] = useState("");
  const nodes = block.content.nodes ?? [];
  const importFile = async (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; try { const parsed = await parseXMindFile(file); setSheets(parsed); setSheetId(parsed[0]?.id ?? ""); setError(parsed.length ? "" : "No readable sheets were found."); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to parse XMind."); } };
  return <div className="mt-5 grid gap-3 rounded-[8px] border border-electricBlue/25 bg-archiveBlue/10 p-4"><BilingualInput label="Diagram title" zh={block.content.title?.zh ?? ""} en={block.content.title?.en ?? ""} onChange={(key, value) => onChange({ ...block, content: { ...block.content, title: { ...(block.content.title ?? localized()), [key]: value } } })} /><label className="editor-action w-fit cursor-pointer"><FileUp className="h-4 w-4" />Import XMind<input className="hidden" type="file" accept=".xmind" onChange={importFile} /></label>{error ? <p className="text-sm text-peach">{error}</p> : null}{sheets.length ? <div className="rounded-[8px] border border-acidGreen/25 p-4"><p className="text-sm text-softWhite/64">Preview: {sheets.find((sheet) => sheet.id === sheetId)?.nodes.length ?? 0} editable nodes</p><div className="mt-3 flex flex-wrap gap-2"><select value={sheetId} onChange={(event) => setSheetId(event.target.value)} className="editor-select">{sheets.map((sheet) => <option key={sheet.id} value={sheet.id}>{sheet.title}</option>)}</select><select value={style} onChange={(event) => setStyle(event.target.value as XMindConversionStyle)} className="editor-select"><option value="hierarchy-map">Hierarchy tree</option><option value="horizontal-flow">Horizontal process</option><option value="vertical-flow">Vertical process</option><option value="branching-tree">Branching process</option><option value="user-flow">Journey / stages</option><option value="relationship-map">Relationship map</option></select><button type="button" className="editor-action border-acidGreen text-acidGreen" onClick={() => { const sheet = sheets.find((item) => item.id === sheetId); if (sheet) onChange({ ...block, layout: style, content: { ...block.content, nodes: sheet.nodes } }); setSheets([]); }}>Insert diagram</button></div>{style !== "hierarchy-map" && style !== "branching-tree" ? <p className="mt-2 text-xs text-peach">Sibling order will be interpreted as sequence.</p> : null}</div> : null}<div className="grid gap-2">{nodes.map((node, index) => <div key={node.id} className="grid gap-2 rounded-[8px] border border-softWhite/10 p-3 md:grid-cols-[1fr_1fr_auto]"><input className="editor-input" value={node.title.zh} onChange={(event) => updateNode(block, node.id, { title: { ...node.title, zh: event.target.value } }, onChange)} /><input className="editor-input" value={node.title.en} onChange={(event) => updateNode(block, node.id, { title: { ...node.title, en: event.target.value } }, onChange)} /><div className="flex gap-1"><button type="button" onClick={() => onChange({ ...block, content: { ...block.content, nodes: moveItem(nodes, index, -1) } })}><ArrowUp className="h-4 w-4" /></button><button type="button" onClick={() => onChange({ ...block, content: { ...block.content, nodes: moveItem(nodes, index, 1) } })}><ArrowDown className="h-4 w-4" /></button><button type="button" onClick={() => onChange({ ...block, content: { ...block.content, nodes: nodes.filter((current) => current.id !== node.id).map((current) => current.parentId === node.id ? { ...current, parentId: node.parentId } : current) } })}><Trash2 className="h-4 w-4" /></button></div><input className="editor-input md:col-span-2" value={node.description.zh} placeholder="Description" onChange={(event) => updateNode(block, node.id, { description: { ...node.description, zh: event.target.value } }, onChange)} /><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={node.emphasis} onChange={(event) => updateNode(block, node.id, { emphasis: event.target.checked }, onChange)} />Emphasis</label></div>)}</div><button type="button" className="editor-action w-fit" onClick={() => onChange({ ...block, content: { ...block.content, nodes: [...nodes, { id: createStableId("node"), title: localized("新节点", "New node"), description: localized(), nodeType: "step", emphasis: false, order: nodes.length }] } })}><Plus className="h-4 w-4" />Add node</button></div>;
}

function FigmaPrototypeEditor({ block, onChange, pendingAssets, onPendingAsset }: { block: ProjectDocumentBlock; onChange: (block: ProjectDocumentBlock) => void; pendingAssets: Record<string, File>; onPendingAsset: (id: string, file: File) => void }) {
  const content = block.content;
  const figma = content.figmaPrototype;
  const [urlDraft, setUrlDraft] = useState(figma?.sourceUrl ?? "");
  const [urlError, setUrlError] = useState("");
  const posterAssetId = figma?.posterAssetId;
  const pendingPoster = posterAssetId ? pendingAssets[posterAssetId] : undefined;
  const posterSource = useResolvedAssetSource(posterAssetId, figma?.posterPublicPath, pendingPoster);

  const updateFigma = (patch: Partial<ProjectFigmaPrototype>) => {
    onChange({ ...block, content: { ...content, figmaPrototype: { sourceUrl: "", embedUrl: "", ...figma, ...patch } } });
  };

  const applyUrl = () => {
    const trimmed = urlDraft.trim();
    if (!trimmed) { setUrlError(""); return; }
    const result = normalizeFigmaPrototypeUrl(trimmed);
    if (!result.ok) { setUrlError(figmaPrototypeUrlErrorMessage(result.error)); return; }
    setUrlError("");
    updateFigma({ sourceUrl: result.sourceUrl, embedUrl: result.embedUrl });
  };

  return <div className="mt-5 grid gap-3 rounded-[8px] border border-electricBlue/25 bg-archiveBlue/10 p-4">
    <BilingualInput label="Block title" zh={content.title?.zh ?? ""} en={content.title?.en ?? ""} onChange={(key, value) => onChange({ ...block, content: { ...content, title: { ...(content.title ?? localized()), [key]: value } } })} />
    <BilingualInput label="Description" zh={content.body?.zh ?? ""} en={content.body?.en ?? ""} multiline onChange={(key, value) => onChange({ ...block, content: { ...content, body: { ...(content.body ?? localized()), [key]: value } } })} />
    <label>
      <span className="editor-label">Figma prototype URL</span>
      <input
        className="editor-input"
        placeholder="https://www.figma.com/proto/..."
        value={urlDraft}
        onChange={(event) => setUrlDraft(event.target.value)}
        onBlur={applyUrl}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); applyUrl(); } }}
      />
    </label>
    {urlError ? <p className="text-sm text-peach">{urlError}</p> : null}
    {figma?.embedUrl ? <p className="break-all text-xs text-softWhite/44">Embed URL ready: {figma.embedUrl}</p> : null}
    <BilingualInput
      label="Interaction hint (optional)"
      zh={figma?.interactionHint?.zh ?? ""}
      en={figma?.interactionHint?.en ?? ""}
      onChange={(key, value) => updateFigma({ interactionHint: { ...(figma?.interactionHint ?? localized()), [key]: value } })}
    />
    <AspectRatioSelect value={(figma?.aspectRatio ?? "16:9") as AspectRatioValue} onChange={(value) => updateFigma({ aspectRatio: value })} />
    <div className="grid gap-3 rounded-[8px] border border-softWhite/10 p-3">
      <span className="editor-label">Static poster image</span>
      <ImageAssetUploader
        source={posterSource}
        previewClassName="aspect-video w-full max-w-xs"
        chooseLabel="Choose poster"
        replaceLabel="Replace poster"
        onFile={(file) => {
          const assetId = createStableId("asset");
          onPendingAsset(assetId, file);
          updateFigma({ posterAssetId: assetId, posterPublicPath: undefined });
        }}
      />
    </div>
  </div>;
}

function FigmaPrototypeBlock({ block, locale }: { block: ProjectDocumentBlock; locale: "zh" | "en" }) {
  const content = block.content;
  const figma = content.figmaPrototype;
  const title = textFor(content.title, locale);
  const description = textFor(content.body, locale);
  const posterSource = useProjectBodyAsset(figma?.posterAssetId, figma?.posterPublicPath);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isNearViewport, setIsNearViewport] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [posterLoadFailed, setPosterLoadFailed] = useState(false);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || isNearViewport) return undefined;
    if (typeof IntersectionObserver === "undefined") { setIsNearViewport(true); return undefined; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setIsNearViewport(true);
    }, { rootMargin: "600px 0px", threshold: 0 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [isNearViewport]);

  if (!figma?.sourceUrl || !figma?.embedUrl) {
    return <div className="mx-auto w-full max-w-5xl rounded-[10px] border border-dashed border-softWhite/16 p-8 text-center text-sm text-softWhite/40">Figma prototype not configured yet.</div>;
  }

  const aspectClass = aspectRatioToClassName(figma.aspectRatio);
  const hintText = figma.interactionHint && (figma.interactionHint.zh || figma.interactionHint.en)
    ? textFor(figma.interactionHint, locale)
    : (locale === "zh" ? "可交互原型 — 点击体验" : "Interactive prototype — click to explore");

  const artifactMode = getPortfolioExportMode() !== "live";
  const hasPosterReference = Boolean(figma.posterAssetId || figma.posterPublicPath);
  const posterSlotState = !hasPosterReference ? null : posterSource ? (posterLoadFailed ? "failed" : "filled") : "failed";
  const posterSlotId = `figma-prototype-block:${block.id}`;

  return <figure className="mx-auto w-full max-w-5xl" data-figma-prototype-block>
    {title || description ? <div className="mb-4">
      {title ? <h3 className="font-display text-2xl font-semibold">{title}</h3> : null}
      {description ? <p className="mt-2 max-w-3xl text-base leading-7 text-softWhite/64">{description}</p> : null}
    </div> : null}

    {artifactMode ? (
      <div className={`relative overflow-hidden rounded-[10px] border border-softWhite/12 bg-archiveBlue/20 ${aspectClass}`} data-media-slot-state={posterSlotState ?? undefined} data-media-slot-id={posterSlotId}>
        {posterSource ? (
          <img src={posterSource} alt={title || "Figma prototype preview"} className="absolute inset-0 h-full w-full object-cover" onError={() => setPosterLoadFailed(true)} />
        ) : (
          <div className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-softWhite/40">{title || (locale === "zh" ? "可交互原型" : "Interactive prototype")}</div>
        )}
      </div>
    ) : (
      <div ref={containerRef} data-figma-prototype-interactive className={`relative overflow-hidden rounded-[10px] border border-softWhite/12 bg-archiveBlue/20 ${aspectClass}`}>
        {posterSource ? (
          <img
            src={posterSource}
            alt={title || "Figma prototype preview"}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${iframeLoaded ? "opacity-0" : "opacity-100"}`}
          />
        ) : null}
        {!posterSource && !isNearViewport ? <div className="absolute inset-0 grid place-items-center text-sm text-softWhite/28">Figma prototype</div> : null}
        {isNearViewport ? (
          <iframe
            src={figma.embedUrl}
            title={title || "Figma prototype"}
            className={`absolute inset-0 h-full w-full border-0 transition-opacity duration-500 ${iframeLoaded ? "opacity-100" : "opacity-0"}`}
            loading="lazy"
            allowFullScreen
            onLoad={() => setIframeLoaded(true)}
            onPointerDown={() => setHasInteracted(true)}
          />
        ) : null}
        {isNearViewport && !hasInteracted ? (
          <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-full border border-softWhite/16 bg-deepIndigo/78 px-3 py-1.5 font-mono text-[10px] font-semibold text-softWhite/82 backdrop-blur">
            {hintText}
          </div>
        ) : null}
      </div>
    )}

    <div className="mt-3">
      <a href={figma.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-acidGreen hover:text-softWhite">
        <ExternalLink className="h-4 w-4" aria-hidden="true" />
        {locale === "zh" ? "在 Figma 中打开" : "Open in Figma"}
      </a>
    </div>

  </figure>;
}

function SectionControls({ section, index, count, collapsed, onChange, onMove, onDuplicate, onDelete, onToggleCollapsed }: { section: ProjectDocumentSection; index: number; count: number; collapsed: boolean; onChange: (section: ProjectDocumentSection) => void; onMove: (direction: -1 | 1) => void; onDuplicate: () => void; onDelete: () => void; onToggleCollapsed: () => void }) {
  return <div className="mb-5 flex flex-wrap items-center gap-2 rounded-[8px] border border-acidGreen/20 bg-acidGreen/[0.04] p-3">
    <span className="font-mono text-[10px] text-acidGreen">SECTION</span>
    <button type="button" className="editor-icon" aria-label="Move section up" disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp className="h-4 w-4" /></button>
    <button type="button" className="editor-icon" aria-label="Move section down" disabled={index === count - 1} onClick={() => onMove(1)}><ArrowDown className="h-4 w-4" /></button>
    <button type="button" className="editor-action" onClick={onToggleCollapsed}><ChevronDown className={`h-4 w-4 transition-transform ${collapsed ? "-rotate-90" : ""}`} />{collapsed ? "Expand" : "Collapse"}</button>
    <button type="button" className="editor-action" onClick={() => onChange({ ...section, visibility: section.visibility === "visible" ? "hidden" : "visible" })}>{section.visibility === "visible" ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}{section.visibility}</button>
    <button type="button" className="editor-icon" aria-label="Duplicate section" onClick={onDuplicate}><Copy className="h-4 w-4" /></button>
    <button type="button" className="editor-icon text-peach" aria-label="Delete section" onClick={onDelete}><Trash2 className="h-4 w-4" /></button>
  </div>;
}

function BlockControls({ block, locale, onChange }: { block: ProjectDocumentBlock; locale: "zh" | "en"; onChange: (block: ProjectDocumentBlock) => void }) {
  const layouts = blockLayoutLibrary.filter((layout) => layout.type === block.type);
  return <div className="grid gap-3 rounded-[8px] border border-electricBlue/20 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="font-mono text-[9px] uppercase text-[#9FAAD2]">{block.type}</span>
      <label className="flex items-center gap-2 text-xs text-softWhite/50">Style<select className="editor-select" value={block.variant} onChange={(event) => onChange({ ...block, variant: event.target.value as ProjectDocumentBlock["variant"] })}>{["quiet", "standard", "emphasis", "editorial", "technical"].map((variant) => <option key={variant}>{variant}</option>)}</select></label>
    </div>
    {layouts.length ? <div>
      <p className="mb-2 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-softWhite/40">Change template</p>
      <BlockLayoutPicker layouts={layouts} value={block.layout} onChange={(id) => onChange({ ...block, layout: id })} locale={locale} />
    </div> : null}
  </div>;
}

type SimpleBlockKind = "large-image" | "image-text" | "text-only" | "two-images" | "figma-prototype" | "divider" | "comparison-table" | "decision-matrix" | "timeline" | "annotated-image" | "boundary-list" | "grouped-cards" | "image-slot-grid" | "thinking-map" | "tabbed-content";

const simpleBlockOptions: Array<{ kind: SimpleBlockKind; label: string; description: string }> = [
  { kind: "large-image", label: "Large image", description: "One contained image with title and description" },
  { kind: "image-text", label: "Image + text", description: "One image beside a short explanation" },
  { kind: "text-only", label: "Text only", description: "Title and description without an image" },
  { kind: "two-images", label: "Two images", description: "Two equal images with captions" },
  { kind: "comparison-table", label: "Comparison table", description: "Two or more columns, each with its own image, title, and description" },
  { kind: "decision-matrix", label: "Decision / criteria matrix", description: "A real multi-column, multi-row table" },
  { kind: "timeline", label: "Timeline", description: "Dated events, each with a label and description" },
  { kind: "annotated-image", label: "Annotated image", description: "Images each with an independent title and description" },
  { kind: "boundary-list", label: "Boundary / keep-change list", description: "Two or more labeled lists side by side" },
  { kind: "grouped-cards", label: "Grouped cards", description: "A repeating group of cards, each with its own sub-items" },
  { kind: "image-slot-grid", label: "Image slot grid", description: "A labeled grid of independent image slots" },
  { kind: "thinking-map", label: "Thinking / system map", description: "A sequence of labelled reasoning or system nodes" },
  { kind: "tabbed-content", label: "Tabbed content", description: "Switchable tabs, each with its own label and body" },
  { kind: "figma-prototype", label: "Figma prototype", description: "An embedded, interactive Figma prototype with a poster fallback" },
  { kind: "divider", label: "Divider", description: "A plain horizontal divider between sections of content" },
];

function AddBlock({ onAdd }: { onAdd: (kind: SimpleBlockKind) => void }) {
  const [open, setOpen] = useState(false);
  return <div className="rounded-[10px] border border-dashed border-acidGreen/30 bg-acidGreen/[0.025] p-4">
    <button type="button" className="editor-action border-acidGreen/55 bg-acidGreen text-deepIndigo" onClick={() => setOpen((current) => !current)}><Plus className="h-4 w-4" />ADD BLOCK</button>
    {open ? <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {simpleBlockOptions.map((option) => <button key={option.kind} type="button" className="rounded-[8px] border border-softWhite/12 bg-deepIndigo/50 p-4 text-left transition hover:border-acidGreen/55 hover:bg-archiveBlue/30" onClick={() => { onAdd(option.kind); setOpen(false); }}>
        <span className="font-display text-lg font-semibold text-softWhite">{option.label}</span>
        <span className="mt-2 block text-xs leading-5 text-softWhite/44">{option.description}</span>
      </button>)}
    </div> : null}
  </div>;
}


function textFor(value: { zh: string; en: string; useZhAsEnglishFallback?: boolean } | undefined, locale: "zh" | "en") { if (!value) return ""; return locale === "zh" ? value.zh : value.en || (value.useZhAsEnglishFallback ? value.zh : ""); }
function textForPlain(value: LocalizedText | undefined) { return value?.zh || value?.en || ""; }
function moveItem<T>(items: T[], index: number, direction: -1 | 1) { const target = index + direction; if (target < 0 || target >= items.length) return items; const next = [...items]; [next[index], next[target]] = [next[target], next[index]]; return next.map((item, order) => item && typeof item === "object" && "order" in item ? { ...item, order } : item) as T[]; }
function moveItemById<T extends { id: string }>(items: T[], sourceId: string, targetId: string) { const sourceIndex = items.findIndex((item) => item.id === sourceId); const targetIndex = items.findIndex((item) => item.id === targetId); if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return items; const next = [...items]; const [source] = next.splice(sourceIndex, 1); next.splice(targetIndex, 0, source); return next; }
function cloneBlock(block: ProjectDocumentBlock): ProjectDocumentBlock { const nodeIds = new Map(block.content.nodes?.map((node) => [node.id, createStableId("node")]) ?? []); return { ...structuredClone(block), id: createStableId("block"), content: { ...structuredClone(block.content), media: block.content.media?.map((item) => ({ ...item, id: createStableId("media") })), items: block.content.items?.map((item) => ({ ...item, id: createStableId("item") })), nodes: block.content.nodes?.map((node) => ({ ...node, id: nodeIds.get(node.id) ?? createStableId("node"), parentId: node.parentId ? nodeIds.get(node.parentId) : undefined })), comparisonColumns: block.content.comparisonColumns?.map((column) => ({ ...column, id: createStableId("column") })), matrixRows: block.content.matrixRows?.map((row) => ({ ...row, id: createStableId("row") })), timelineItems: block.content.timelineItems?.map((item) => ({ ...item, id: createStableId("timeline-item") })), annotatedImages: block.content.annotatedImages?.map((item) => ({ ...item, id: createStableId("annotated-image") })), boundaryLists: block.content.boundaryLists?.map((list) => ({ ...list, id: createStableId("boundary-list") })), groupedCards: block.content.groupedCards?.map((card) => ({ ...card, id: createStableId("card"), subItems: card.subItems.map((sub) => ({ ...sub, id: createStableId("sub-item") })) })), imageSlotItems: block.content.imageSlotItems?.map((item) => ({ ...item, id: createStableId("image-slot") })), thinkingMapNodes: block.content.thinkingMapNodes?.map((node) => ({ ...node, id: createStableId("thinking-node") })), tabs: block.content.tabs?.map((tab) => ({ ...tab, id: createStableId("tab") })) } }; }
function cloneSection(section: ProjectDocumentSection): ProjectDocumentSection { return { ...structuredClone(section), id: createStableId("section"), blocks: section.blocks.map(cloneBlock) }; }
function createSimpleBlock(kind: SimpleBlockKind): ProjectDocumentBlock {
  if (kind === "figma-prototype") {
    return {
      id: createStableId("block"),
      type: "figma-prototype",
      layout: "figma-embed",
      variant: "standard",
      content: {
        title: localized("新内容", "New content"),
        body: localized(),
        items: [],
        media: [],
        nodes: [],
        figmaPrototype: { sourceUrl: "", embedUrl: "", aspectRatio: "16:9" },
      },
      settings: {},
    };
  }
  if (kind === "divider") {
    return {
      id: createStableId("block"),
      type: "divider",
      layout: "divider-line",
      variant: "standard",
      content: { title: localized(), body: localized(), items: [], media: [], nodes: [] },
      settings: {},
    };
  }
  if (kind === "comparison-table") {
    return {
      id: createStableId("block"), type: "comparison-table", layout: "comparison-columns", variant: "standard",
      content: { title: localized(), items: [], media: [], nodes: [], comparisonColumns: [createComparisonColumn(), createComparisonColumn()] },
      settings: {},
    };
  }
  if (kind === "decision-matrix") {
    const columns = [localized("类型", "Type"), localized("决策", "Decision")];
    return {
      id: createStableId("block"), type: "decision-matrix", layout: "matrix-table", variant: "standard",
      content: { title: localized(), items: [], media: [], nodes: [], matrixColumns: columns, matrixRows: [{ id: createStableId("row"), cells: columns.map(() => localized()) }] },
      settings: {},
    };
  }
  if (kind === "timeline") {
    return {
      id: createStableId("block"), type: "timeline", layout: "timeline-dates", variant: "standard",
      content: { title: localized(), items: [], media: [], nodes: [], timelineItems: [{ id: createStableId("timeline-item"), date: localized("2026", "2026"), label: localized("新事件", "New event"), description: localized(), emphasis: false, order: 0 }] },
      settings: {},
    };
  }
  if (kind === "annotated-image") {
    return {
      id: createStableId("block"), type: "annotated-image", layout: "annotated-image-grid", variant: "standard",
      content: { title: localized(), items: [], media: [], nodes: [], annotatedImages: [{ id: createStableId("annotated-image"), title: localized("新图片", "New image"), description: localized() }] },
      settings: {},
    };
  }
  if (kind === "boundary-list") {
    return {
      id: createStableId("block"), type: "boundary-list", layout: "boundary-list-columns", variant: "standard",
      content: { title: localized(), items: [], media: [], nodes: [], boundaryLists: [{ id: createStableId("boundary-list"), label: localized("保留", "Keep"), items: [] }, { id: createStableId("boundary-list"), label: localized("调整", "Change"), items: [] }] },
      settings: {},
    };
  }
  if (kind === "grouped-cards") {
    return {
      id: createStableId("block"), type: "grouped-cards", layout: "grouped-cards-list", variant: "standard",
      content: { title: localized(), items: [], media: [], nodes: [], groupedCards: [{ id: createStableId("card"), title: localized("新卡片", "New card"), meta: localized(), subItems: [] }] },
      settings: {},
    };
  }
  if (kind === "image-slot-grid") {
    return {
      id: createStableId("block"), type: "image-slot-grid", layout: "image-slot-grid", variant: "standard",
      content: { title: localized(), items: [], media: [], nodes: [], imageSlotItems: [{ id: createStableId("image-slot"), label: localized("新图片位", "New slot") }] },
      settings: {},
    };
  }
  if (kind === "thinking-map") {
    return {
      id: createStableId("block"), type: "thinking-map", layout: "thinking-map-nodes", variant: "standard",
      content: { title: localized(), items: [], media: [], nodes: [], thinkingMapNodes: [{ id: createStableId("thinking-node"), label: localized("新节点", "New node"), body: localized(), emphasis: false, order: 0 }] },
      settings: {},
    };
  }
  if (kind === "tabbed-content") {
    return {
      id: createStableId("block"), type: "tabbed-content", layout: "tabbed-panels", variant: "standard",
      content: { title: localized(), items: [], media: [], nodes: [], tabs: [{ id: createStableId("tab"), label: localized("标签 1", "Tab 1"), body: localized() }] },
      settings: {},
    };
  }
  const mediaCount = kind === "two-images" ? 2 : kind === "text-only" ? 0 : 1;
  return {
    id: createStableId("block"),
    type: kind === "text-only" ? "text" : "media",
    layout: kind === "large-image" ? "contained-image" : kind === "image-text" ? "image-text-right" : kind === "two-images" ? "two-equal-images" : "standard-body",
    variant: "standard",
    content: {
      title: localized("新内容", "New content"),
      body: localized(),
      items: [],
      media: Array.from({ length: mediaCount }, () => createMediaItem()),
      nodes: [],
    },
    settings: {},
  };
}
function createMediaItem(): ProjectMediaItem { return { id: createStableId("media"), alt: localized(), caption: localized(), cropMode: "contain", focalPosition: "50% 50%", aspectRatio: "16:9" }; }
function nodeDepth(node: ProjectDiagramNode, nodes: ProjectDiagramNode[]) { let depth = 0; let parent = node.parentId; while (parent && depth < 8) { depth += 1; parent = nodes.find((item) => item.id === parent)?.parentId; } return depth; }
function updateNode(block: ProjectDocumentBlock, nodeId: string, patch: Partial<ProjectDiagramNode>, onChange: (block: ProjectDocumentBlock) => void) { onChange({ ...block, content: { ...block.content, nodes: (block.content.nodes ?? []).map((node) => node.id === nodeId ? { ...node, ...patch } : node) } }); }
