import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowLeft, ArrowUp, Check, Clipboard, Eye, FileCode2, FileText, FolderOpen, RotateCcw, Save, X } from "lucide-react";
import { Link } from "react-router-dom";
import { useProjectCatalog } from "../hooks/useProjectCatalog";
import { formatPlaytime, gameTitle, useGameExperienceStore } from "../lib/gameExperience";
import {
  createPortfolioPdfConfig,
  pdfSectionLabel,
  loadPortfolioPdfConfig,
  moveOrderedItem,
  savePortfolioPdfConfig,
  type PdfSectionId,
  type PdfPreset,
  type PortfolioPdfConfig,
} from "../lib/portfolioPdf";
import { getUiPracticeCatalog } from "../lib/uiPracticeCatalog";
import { useLocale } from "../locales/LocaleContext";
import {
  runPortfolioCollectionExport,
  type CollectionExportPhase,
  type PortfolioCollectionSectionId,
  type PortfolioCollectionSelection,
} from "../lib/portfolioCollectionExport";
import { MAX_COLLECTION_PROJECTS } from "../lib/collectionCoverGeometry";
import {
  runPortfolioCompleteOfflineHtmlExport,
  runPortfolioStaticHtmlExport,
  type StaticHtmlExportPhase,
  type StaticHtmlExportProgress,
} from "../lib/portfolioStaticHtmlExport";
import {
  DeliverablesBridgeError,
  deliverableFolderPath,
  loadDeliverableDirections,
  registerDeliverableHtml,
  registerDeliverablePath,
  runDeliverableAction,
  type DeliverableArtifact,
  type DeliverableDirection,
} from "../lib/deliverablesBridge";
import "../pdf.css";

// Maps the old A4/print builder's section vocabulary onto the new
// Playwright pipeline's — "profile" has no equivalent there (that pipeline
// never had a profile/bio page) and is dropped; "games" is renamed
// "game-experience" to match portfolioCollectionExport.ts's own naming.
const SECTION_ID_TO_COLLECTION_SECTION: Partial<Record<PdfSectionId, PortfolioCollectionSectionId>> = {
  cover: "cover",
  projects: "projects",
  "ui-works": "ui-works",
  games: "game-experience",
  contact: "contact",
};

// Builds the new pipeline's explicit selection contract straight from this
// editor's own existing Outline/Projects/UI/Games panel state — the same
// enabled flags and order arrows the owner already uses, just read instead
// of duplicated into a second selection UI. Never mutates config or touches
// PORTFOLIO_PDF_CONFIG_STORAGE_KEY; this is a pure read.
// Single source of truth for "is Cover selected", shared by both export
// pipelines (buildCollectionSelection below, and StaticHtmlGenerateAction) -
// reads the exact same Outline/章节 panel state the owner already toggles,
// so neither pipeline can silently diverge from what's checked there.
function isCoverSelected(config: PortfolioPdfConfig): boolean {
  return config.sections.some((section) => section.id === "cover" && section.enabled);
}

// Mirrors buildCollectionSelection's own includeGameExperience condition
// exactly (section enabled AND at least one game individually enabled) so
// the PLAY nav entry can never disagree with what the PDF/Collection
// pipeline considers "Game Experience selected".
function isGameExperienceSelected(config: PortfolioPdfConfig): boolean {
  const sectionEnabled = config.sections.some((section) => section.id === "games" && section.enabled);
  return sectionEnabled && config.games.some((game) => game.enabled);
}

function buildCollectionSelection(config: PortfolioPdfConfig): PortfolioCollectionSelection {
  const orderedProjectIds = [...config.projects].sort((a, b) => a.order - b.order).filter((item) => item.enabled).map((item) => item.id);
  const orderedUiWorkIds = [...config.uiWorks].sort((a, b) => a.order - b.order).filter((item) => item.enabled).map((item) => item.id);
  const orderedGameIds = [...config.games].sort((a, b) => a.order - b.order).filter((item) => item.enabled).map((item) => item.id);
  const sectionOrder = [...new Set(
    [...config.sections].sort((a, b) => a.order - b.order)
      .filter((section) => section.enabled)
      .flatMap((section) => {
        const mapped = SECTION_ID_TO_COLLECTION_SECTION[section.id];
        return mapped ? [mapped] : [];
      }),
  )];
  return {
    projectIds: orderedProjectIds.slice(0, MAX_COLLECTION_PROJECTS),
    sectionOrder,
    includeUiWorks: sectionOrder.includes("ui-works") && orderedUiWorkIds.length > 0,
    selectedUiWorkIds: orderedUiWorkIds,
    includeGameExperience: sectionOrder.includes("game-experience") && orderedGameIds.length > 0,
    selectedGameIds: orderedGameIds,
    includeContact: sectionOrder.includes("contact"),
  };
}

type Panel = "outline" | "projects" | "ui" | "games" | "settings";

const panelLabels = {
  zh: { outline: "章节", projects: "项目", ui: "UI 作品", games: "游戏经历", settings: "设置" },
  en: { outline: "Sections", projects: "Projects", ui: "UI Works", games: "Games", settings: "Settings" },
};

export function PortfolioPdfBuilderPage() {
  const { locale, pathFor } = useLocale();
  const projects = useProjectCatalog(locale).filter((item) => item.visibility === "public");
  const games = useGameExperienceStore().records.filter((item) => item.publication.visibility === "public" && !item.publication.archived).sort((a, b) => a.publication.libraryOrder - b.publication.libraryOrder);
  const uiWorks = useMemo(() => getUiPracticeCatalog(), []);
  const inputs = useMemo(() => ({ locale, projectIds: projects.map((item) => item.id), uiIds: uiWorks.map((item) => item.id), gameIds: games.map((item) => item.id) }), [games, locale, projects, uiWorks]);
  const [config, setConfig] = useState<PortfolioPdfConfig>(() => loadPortfolioPdfConfig(inputs));
  const [panel, setPanel] = useState<Panel>("outline");
  const [saved, setSaved] = useState(false);

  const applyPreset = (preset: PdfPreset) => {
    setConfig({ ...createPortfolioPdfConfig(inputs, preset), theme: config.theme });
    setSaved(false);
  };

  const save = () => {
    savePortfolioPdfConfig(config);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2200);
  };

  return <main className="min-h-screen bg-[#0b1035] text-softWhite" data-pdf-builder>
    <header className="sticky top-0 z-50 flex h-16 items-center justify-between border-b border-softWhite/10 bg-[#0b1035]/96 px-4 backdrop-blur md:px-6">
      <div className="flex items-center gap-3"><Link to={pathFor("/work")} className="grid h-9 w-9 place-items-center rounded border border-softWhite/15 text-softWhite/70" aria-label={locale === "zh" ? "返回作品列表" : "Back to work"}><ArrowLeft className="h-4 w-4" /></Link><div><p className="font-mono text-[9px] tracking-[0.16em] text-acidGreen">PORTFOLIO COLLECTION</p><h1 className="text-sm font-semibold">{locale === "zh" ? "作品集合集导出" : "Portfolio collection export"}</h1></div></div>
      <div className="flex items-center gap-2"><button type="button" className="pdf-builder-button" onClick={save}><Save className="h-4 w-4" />{saved ? (locale === "zh" ? "已保存" : "Saved") : (locale === "zh" ? "保存配置" : "Save config")}</button><StaticHtmlGenerateAction locale={locale} projects={projects} config={config} /><CollectionGenerateAction locale={locale} projects={projects} config={config} /></div>
    </header>

    <div className="mx-auto min-h-[calc(100vh-4rem)] max-w-[720px]">
      <div className="max-h-[calc(100vh-4rem)] overflow-y-auto p-4 md:p-6">
        <div className="grid grid-cols-5 gap-1 rounded-lg bg-softWhite/[0.04] p-1">
          {(Object.keys(panelLabels[locale]) as Panel[]).map((id) => <button type="button" key={id} onClick={() => setPanel(id)} className={`rounded px-2 py-2 text-[10px] font-semibold ${panel === id ? "bg-acidGreen text-deepIndigo" : "text-softWhite/55 hover:text-softWhite"}`}>{panelLabels[locale][id]}</button>)}
        </div>
        <div className="mt-5">
          {panel === "outline" ? <OutlinePanel locale={locale} config={config} setConfig={setConfig} /> : null}
          {panel === "projects" ? <ProjectsPanel locale={locale} config={config} setConfig={setConfig} projects={projects} /> : null}
          {panel === "ui" ? <UiPanel locale={locale} config={config} setConfig={setConfig} items={uiWorks} /> : null}
          {panel === "games" ? <GamesPanel locale={locale} config={config} setConfig={setConfig} games={games} /> : null}
          {panel === "settings" ? <SettingsPanel locale={locale} config={config} applyPreset={applyPreset} /> : null}
        </div>
      </div>
    </div>
  </main>;
}

function StaticHtmlGenerateAction({ locale, projects, config }: { locale: "zh" | "en"; projects: ReturnType<typeof useProjectCatalog>; config: PortfolioPdfConfig }) {
  const [phase, setPhase] = useState<StaticHtmlExportPhase>("idle");
  const [message, setMessage] = useState("");
  const [directionDialog, setDirectionDialog] = useState<DirectionDialogState | null>(null);
  const [deliverable, setDeliverable] = useState<GeneratedDeliverable | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const busy = phase === "capturing" || phase === "packaging";

  const chooseDirection = async () => {
    setDirectionDialog({ loading: true, directions: [] });
    try {
      const directions = await loadDeliverableDirections();
      setDirectionDialog({ loading: false, directions });
    } catch (error) {
      setDirectionDialog({ loading: false, directions: [], error: error instanceof Error ? error.message : "DILIDA DESK is unavailable." });
    }
  };

  const archiveHtml = async (generated: GeneratedDeliverable, replace: boolean) => {
    if (!generated.html) return;
    try {
      const artifact = await registerDeliverableHtml({
        directionId: generated.direction?.id,
        artifactType: generated.artifactType as "portfolio-html" | "complete-offline-html",
        fileName: generated.fileName,
        html: generated.html,
        replace,
      });
      setDeliverable({ ...generated, artifact, html: undefined, archiveError: undefined, slotOccupied: false });
    } catch (error) {
      setDeliverable({
        ...generated,
        archiveError: error instanceof Error ? error.message : "Archive failed.",
        slotOccupied: error instanceof DeliverablesBridgeError && error.slotOccupied,
      });
    }
  };

  const runExport = async (scope: "collection" | "complete-offline", direction?: DeliverableDirection) => {
    const projectIds = [...config.projects].sort((a, b) => a.order - b.order).filter((item) => item.enabled).map((item) => item.id);
    if (scope === "collection" && !projectIds.length) {
      setPhase("error");
      setMessage(locale === "zh" ? "请至少启用一个项目。" : "Enable at least one project first.");
      return;
    }
    const includeCover = isCoverSelected(config);
    const includeGameExperience = isGameExperienceSelected(config);
    const controller = new AbortController();
    controllerRef.current = controller;
    setPhase("capturing");
    setDeliverable(null);
    setMessage(locale === "zh" ? "正在读取当前首页…" : "Reading the current homepage...");
    try {
      const onProgress = (progress: StaticHtmlExportProgress) => {
        setPhase(progress.phase);
        if (progress.phase === "capturing") {
          setMessage(`${locale === "zh" ? "正在冻结" : "Capturing"} ${progress.currentLabel ?? ""} (${progress.completed}/${progress.total})`);
        } else if (progress.phase === "packaging") {
          setMessage(locale === "zh" ? "正在内联图片与样式…" : "Embedding images and styles...");
        }
      };
      const result = scope === "complete-offline"
        ? await runPortfolioCompleteOfflineHtmlExport(projects, locale, onProgress, controller.signal, "return")
        : await runPortfolioStaticHtmlExport(projects, locale, projectIds, includeCover, includeGameExperience, onProgress, controller.signal, "standard", "return");
      if (!result.html) throw new Error("The generated HTML was not returned for local archiving.");
      setPhase("done");
      setMessage("");
      const generated: GeneratedDeliverable = {
        fileName: result.filename,
        artifactType: scope === "complete-offline" ? "complete-offline-html" : "portfolio-html",
        direction,
        html: result.html,
        bytes: result.bytes,
      };
      setDeliverable(generated);
      await archiveHtml(generated, false);
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "Static HTML export failed.");
    } finally {
      controllerRef.current = null;
    }
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <button type="button" className="pdf-builder-button" onClick={() => void chooseDirection()} disabled={busy}>
          <FileCode2 className="h-4 w-4" />
          {busy ? (locale === "zh" ? "生成中…" : "GENERATING...") : (locale === "zh" ? "生成单文件 HTML" : "Generate Single HTML")}
        </button>
        <button type="button" className="pdf-builder-button" onClick={() => void runExport("complete-offline")} disabled={busy}>
          <FileCode2 className="h-4 w-4" />
          {locale === "zh" ? "导出完整离线作品集" : "Export Complete Offline Portfolio"}
        </button>
        {busy ? <button type="button" className="pdf-builder-button" onClick={() => controllerRef.current?.abort()}><X className="h-4 w-4" />{locale === "zh" ? "取消" : "Cancel"}</button> : null}
      </div>
      {message && phase !== "done" ? (
        <div className={`absolute right-0 top-full z-50 mt-2 w-80 rounded-lg border bg-[#0b1035] px-3 py-2 text-xs leading-5 shadow-archive ${phase === "error" ? "border-peach/45 text-peach" : "border-softWhite/12 text-softWhite/70"}`} aria-live="polite">
          <p className="break-all">{message}</p>
        </div>
      ) : null}
      {directionDialog ? <DirectionDialog locale={locale} state={directionDialog} onCancel={() => setDirectionDialog(null)} onSelect={(direction) => { setDirectionDialog(null); void runExport("collection", direction); }} /> : null}
      {deliverable ? <DeliverableResultPanel locale={locale} result={deliverable} onClose={() => setDeliverable(null)} onArchive={(replace) => archiveHtml(deliverable, replace)} /> : null}
    </div>
  );
}

// The "Generate" step for the new Playwright/pdf-lib collection pipeline —
// reads this same page's existing selection state (via
// buildCollectionSelection) and hands it to runPortfolioCollectionExport().
// Never touches PORTFOLIO_PDF_CONFIG_STORAGE_KEY itself; that's owned
// entirely by save()/loadPortfolioPdfConfig() above. This does not restore
// the old window.print() A4 pipeline — Export PDF (A4) above is unchanged
// and still does that; this is a separate, additive action.
function CollectionGenerateAction({ locale, projects, config }: { locale: "zh" | "en"; projects: ReturnType<typeof useProjectCatalog>; config: PortfolioPdfConfig }) {
  const [phase, setPhase] = useState<CollectionExportPhase>("idle");
  const [message, setMessage] = useState("");
  const [directionDialog, setDirectionDialog] = useState<DirectionDialogState | null>(null);
  const [deliverable, setDeliverable] = useState<GeneratedDeliverable | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const chooseDirection = async () => {
    setDirectionDialog({ loading: true, directions: [] });
    try {
      const directions = await loadDeliverableDirections();
      setDirectionDialog({ loading: false, directions });
    } catch (error) {
      setDirectionDialog({ loading: false, directions: [], error: error instanceof Error ? error.message : "DILIDA DESK is unavailable." });
    }
  };

  const archivePdf = async (generated: GeneratedDeliverable, replace: boolean) => {
    if (!generated.sourcePath || !generated.direction) return;
    try {
      const artifact = await registerDeliverablePath({
        directionId: generated.direction.id,
        artifactType: "portfolio-pdf",
        sourcePath: generated.sourcePath,
        replace,
      });
      setDeliverable({ ...generated, artifact, archiveError: undefined, slotOccupied: false });
    } catch (error) {
      setDeliverable({
        ...generated,
        archiveError: error instanceof Error ? error.message : "Archive failed.",
        slotOccupied: error instanceof DeliverablesBridgeError && error.slotOccupied,
      });
    }
  };

  const runExport = async (direction: DeliverableDirection) => {
    const selection = buildCollectionSelection(config);
    if (!selection.projectIds.length) {
      setPhase("error");
      setMessage(locale === "zh" ? "请至少启用一个项目。" : "Enable at least one project first.");
      return;
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    setPhase("staging");
    setDeliverable(null);
    setMessage(locale === "zh" ? "正在抓取项目页面…" : "Capturing project pages...");
    try {
      const result = await runPortfolioCollectionExport(projects, locale, selection, (progress) => {
        setPhase(progress.phase);
        if (progress.phase === "staging") {
          setMessage(
            progress.currentLabel
              ? `${locale === "zh" ? "正在抓取" : "Capturing"} ${progress.currentLabel} (${progress.completed}/${progress.total})`
              : locale === "zh" ? "正在抓取项目页面…" : "Capturing project pages...",
          );
        } else if (progress.phase === "finalizing") {
          setMessage(locale === "zh" ? "正在合并 PDF…" : "Merging PDF...");
        }
      }, controller.signal);
      setPhase("done");
      // Selected/included/unselected/blocked are distinct, non-overlapping
      // counts — never combine "never selected" with "selected but dropped"
      // into one number again (see portfolioCollectionExport.ts).
      const counts = locale === "zh"
        ? `（已选 ${result.selectedProjectIds.length}，已包含 ${result.includedProjectIds.length}，未选中 ${result.unselectedProjectIds.length}，被拦截/失败 ${result.blockedProjectIds.length}）`
        : ` (Selected ${result.selectedProjectIds.length}, Included ${result.includedProjectIds.length}, Unselected ${result.unselectedProjectIds.length}, Blocked/failed ${result.blockedProjectIds.length})`;
      setMessage("");
      const generated: GeneratedDeliverable = {
        fileName: result.outputPath.split(/[\\/]/).pop() || "portfolio-collection.pdf",
        artifactType: "portfolio-pdf",
        direction,
        sourcePath: result.outputPath,
        bytes: result.bytes,
        detail: `${result.pages} ${locale === "zh" ? "页" : "pages"}${counts}`,
      };
      setDeliverable(generated);
      await archivePdf(generated, false);
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "Collection export failed.");
    } finally {
      controllerRef.current = null;
    }
  };

  const cancelExport = () => controllerRef.current?.abort();
  const busy = phase === "staging" || phase === "finalizing";

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <button type="button" className="pdf-builder-button pdf-builder-button-primary" onClick={() => void chooseDirection()} disabled={busy}>
          <FileText className="h-4 w-4" />
          {busy ? (locale === "zh" ? "生成中…" : "GENERATING...") : (locale === "zh" ? "生成合集 PDF" : "Generate Collection PDF")}
        </button>
        {busy ? (
          <button type="button" className="pdf-builder-button" onClick={cancelExport}>
            <X className="h-4 w-4" />
            {locale === "zh" ? "取消" : "Cancel"}
          </button>
        ) : null}
      </div>
      {message && phase !== "done" ? (
        <div
          className={`absolute right-0 top-full z-50 mt-2 w-80 rounded-lg border bg-[#0b1035] px-3 py-2 text-xs leading-5 shadow-archive ${
            phase === "error" ? "border-peach/45 text-peach" : "border-softWhite/12 text-softWhite/70"
          }`}
          aria-live="polite"
        >
          <p className="break-all">{message}</p>
        </div>
      ) : null}
      {directionDialog ? <DirectionDialog locale={locale} state={directionDialog} onCancel={() => setDirectionDialog(null)} onSelect={(direction) => { setDirectionDialog(null); void runExport(direction); }} /> : null}
      {deliverable ? <DeliverableResultPanel locale={locale} result={deliverable} onClose={() => setDeliverable(null)} onArchive={(replace) => archivePdf(deliverable, replace)} /> : null}
    </div>
  );
}

type DirectionDialogState = {
  loading: boolean;
  directions: DeliverableDirection[];
  error?: string;
};

type GeneratedDeliverable = {
  fileName: string;
  artifactType: "portfolio-pdf" | "portfolio-html" | "complete-offline-html";
  direction?: DeliverableDirection;
  sourcePath?: string;
  html?: string;
  bytes: number;
  detail?: string;
  artifact?: DeliverableArtifact;
  archiveError?: string;
  slotOccupied?: boolean;
};

function DirectionDialog({ locale, state, onCancel, onSelect }: {
  locale: "zh" | "en";
  state: DirectionDialogState;
  onCancel: () => void;
  onSelect: (direction: DeliverableDirection) => void;
}) {
  const [selectedId, setSelectedId] = useState(() => state.directions.find((item) => item.active)?.id ?? state.directions[0]?.id ?? "");
  const effectiveId = selectedId || state.directions.find((item) => item.active)?.id || state.directions[0]?.id || "";
  const selected = state.directions.find((item) => item.id === effectiveId);
  return createPortal(
    <div className="fixed inset-0 z-[200] grid place-items-center bg-[#070a25]/65 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={locale === "zh" ? "选择求职方向" : "Choose career direction"}>
      <div className="w-full max-w-md rounded-lg border border-softWhite/15 bg-[#0b1035] p-5 shadow-archive">
        <h2 className="text-base font-semibold">{locale === "zh" ? "用于哪个求职方向？" : "Which career direction is this for?"}</h2>
        <p className="mt-1 text-xs leading-5 text-softWhite/50">{locale === "zh" ? "方向来自 DILIDA DESK 的 Resume Library。" : "Directions come from the DILIDA DESK Resume Library."}</p>
        {state.loading ? <p className="mt-4 text-sm text-softWhite/60">{locale === "zh" ? "正在读取求职方向…" : "Loading directions..."}</p> : null}
        {state.error ? <p className="mt-4 rounded border border-peach/35 bg-peach/5 p-3 text-xs leading-5 text-peach">{state.error}</p> : null}
        {!state.loading && !state.error && !state.directions.length ? <p className="mt-4 text-sm text-softWhite/60">{locale === "zh" ? "Resume Library 中暂无求职方向。" : "No Resume Library direction is available."}</p> : null}
        {state.directions.length ? (
          <select className="mt-4 w-full rounded border border-softWhite/15 bg-[#111742] px-3 py-2 text-sm text-softWhite" value={effectiveId} onChange={(event) => setSelectedId(event.target.value)}>
            {state.directions.map((direction) => <option key={direction.id} value={direction.id}>{direction.label}{direction.active ? (locale === "zh" ? "（当前）" : " (active)") : ""}</option>)}
          </select>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="pdf-builder-button" onClick={onCancel}>{locale === "zh" ? "取消" : "Cancel"}</button>
          <button type="button" className="pdf-builder-button pdf-builder-button-primary" disabled={!selected} onClick={() => selected && onSelect(selected)}>{locale === "zh" ? "开始导出" : "Start export"}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function DeliverableResultPanel({ locale, result, onClose, onArchive }: {
  locale: "zh" | "en";
  result: GeneratedDeliverable;
  onClose: () => void;
  onArchive: (replace: boolean) => Promise<void>;
}) {
  const [actionMessage, setActionMessage] = useState("");
  const [archiving, setArchiving] = useState(false);
  const path = result.artifact?.absolutePath ?? result.sourcePath ?? "";
  const folder = path ? deliverableFolderPath(path) : "";
  const typeLabel = result.artifactType === "portfolio-pdf" ? "PDF" : "HTML";
  const destination = result.artifactType === "complete-offline-html"
    ? (locale === "zh" ? "完整离线作品集 / HTML" : "Complete Offline Portfolio / HTML")
    : `${result.direction?.label ?? ""} / ${locale === "zh" ? "作品集" : "Portfolio"} / ${typeLabel}`;
  const perform = async (action: "preview" | "open" | "reveal") => {
    if (!result.artifact) return;
    try {
      await runDeliverableAction(result.artifact.artifactId, action);
      setActionMessage(locale === "zh" ? "操作已发送到 DILIDA DESK。" : "Action sent to DILIDA DESK.");
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Action failed.");
    }
  };
  const copy = async (value: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setActionMessage(locale === "zh" ? "路径已复制。" : "Path copied.");
    } catch {
      setActionMessage(locale === "zh" ? "复制失败，请检查浏览器权限。" : "Copy failed. Check browser permission.");
    }
  };
  const archive = async () => {
    const replace = Boolean(result.slotOccupied);
    if (replace && !window.confirm(locale === "zh" ? "当前槽位已有文件。确认替换当前归档？" : "This slot already has a file. Replace the current archive?")) return;
    setArchiving(true);
    await onArchive(replace);
    setArchiving(false);
  };
  const buttonClass = "inline-flex items-center gap-1.5 rounded border border-softWhite/20 px-2.5 py-1.5 text-[11px] font-semibold text-softWhite/80 disabled:cursor-not-allowed disabled:opacity-35 hover:border-acidGreen hover:text-acidGreen";
  return createPortal(
    <div className="fixed inset-0 z-[200] grid place-items-center bg-[#070a25]/65 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={locale === "zh" ? "导出结果" : "Export result"}>
      <div className="w-full max-w-2xl rounded-lg border border-softWhite/15 bg-[#0b1035] p-5 shadow-archive">
        <div className="flex items-start justify-between gap-4">
          <div><p className="font-mono text-[10px] tracking-[0.14em] text-acidGreen">EXPORT RESULT</p><h2 className="mt-1 text-lg font-semibold">{result.fileName}</h2></div>
          <button type="button" className="grid h-8 w-8 place-items-center rounded border border-softWhite/15 text-softWhite/60 hover:text-softWhite" onClick={onClose} aria-label={locale === "zh" ? "关闭" : "Close"}><X className="h-4 w-4" /></button>
        </div>
        <dl className="mt-4 grid gap-2 text-xs leading-5 sm:grid-cols-[110px_1fr]">
          <dt className="text-softWhite/40">{locale === "zh" ? "类型" : "Type"}</dt><dd>{typeLabel}</dd>
          {result.direction ? <><dt className="text-softWhite/40">{locale === "zh" ? "求职方向" : "Direction"}</dt><dd>{result.direction.label}</dd></> : null}
          <dt className="text-softWhite/40">{locale === "zh" ? "归档状态" : "Archive status"}</dt><dd className={result.artifact ? "text-acidGreen" : "text-peach"}>{result.artifact ? `${locale === "zh" ? "已归档到" : "Archived to"} ${destination}` : (locale === "zh" ? "尚未归档" : "Not archived")}</dd>
          <dt className="text-softWhite/40">{locale === "zh" ? "文件大小" : "File size"}</dt><dd>{(result.bytes / 1024 / 1024).toFixed(1)} MB{result.detail ? ` · ${result.detail}` : ""}</dd>
          {path ? <><dt className="text-softWhite/40">{locale === "zh" ? "本地路径" : "Local path"}</dt><dd className="break-all font-mono text-[11px] text-softWhite/65">{path}</dd></> : null}
        </dl>
        {result.archiveError ? <p className="mt-4 rounded border border-peach/35 bg-peach/5 p-3 text-xs leading-5 text-peach">{result.slotOccupied ? (locale === "zh" ? "当前槽位已有归档。确认后可替换当前文件。" : "The slot already has an archived file. Confirm to replace it.") : result.archiveError}</p> : null}
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" className={buttonClass} disabled={!result.artifact} onClick={() => void perform("preview")}><Eye className="h-3.5 w-3.5" />{locale === "zh" ? "快速预览" : "Quick Preview"}</button>
          {!result.artifact ? <button type="button" className={buttonClass} disabled={archiving} onClick={() => void archive()}><Save className="h-3.5 w-3.5" />{archiving ? (locale === "zh" ? "归档中…" : "Archiving...") : result.slotOccupied ? (locale === "zh" ? "替换当前归档" : "Replace current archive") : (locale === "zh" ? "归档" : "Archive")}</button> : null}
          <button type="button" className={buttonClass} disabled={!path} onClick={() => void copy(path)}><Clipboard className="h-3.5 w-3.5" />{locale === "zh" ? "复制文件路径" : "Copy file path"}</button>
          <button type="button" className={buttonClass} disabled={!folder} onClick={() => void copy(folder)}><Clipboard className="h-3.5 w-3.5" />{locale === "zh" ? "复制文件夹路径" : "Copy folder path"}</button>
          <button type="button" className={buttonClass} disabled={!result.artifact} onClick={() => void perform("open")}><FileText className="h-3.5 w-3.5" />{locale === "zh" ? "打开文件" : "Open file"}</button>
          <button type="button" className={buttonClass} disabled={!result.artifact} onClick={() => void perform("reveal")}><FolderOpen className="h-3.5 w-3.5" />{locale === "zh" ? "打开所在文件夹" : "Open folder"}</button>
        </div>
        {actionMessage ? <p className="mt-3 text-xs text-softWhite/55" aria-live="polite">{actionMessage}</p> : null}
      </div>
    </div>,
    document.body,
  );
}

type ConfigSetter = React.Dispatch<React.SetStateAction<PortfolioPdfConfig>>;

function PanelHeading({ children, hint }: { children: string; hint?: string }) {
  return <div className="mb-4"><h2 className="font-display text-xl font-semibold">{children}</h2>{hint ? <p className="mt-1 text-xs leading-5 text-softWhite/45">{hint}</p> : null}</div>;
}

function OutlinePanel({ locale, config, setConfig }: { locale: "zh" | "en"; config: PortfolioPdfConfig; setConfig: ConfigSetter }) {
  const ordered = [...config.sections].sort((a, b) => a.order - b.order);
  return <div><PanelHeading hint={locale === "zh" ? "启用、禁用或调整 PDF 章节顺序。" : "Enable, disable, or reorder PDF sections."}>{locale === "zh" ? "文档结构" : "Document outline"}</PanelHeading><div className="space-y-2">{ordered.map((section, index) => <div key={section.id} className="pdf-config-row"><label className="flex min-w-0 flex-1 items-center gap-3"><input type="checkbox" checked={section.enabled} onChange={(event) => setConfig((current) => ({ ...current, sections: current.sections.map((item) => item.id === section.id ? { ...item, enabled: event.target.checked } : item) }))} /><span className="truncate text-sm">{pdfSectionLabel(section.id, locale)}</span></label><MoveButtons index={index} count={ordered.length} onMove={(direction) => setConfig((current) => ({ ...current, sections: moveOrderedItem(current.sections, index, direction) }))} /></div>)}</div></div>;
}

function ProjectsPanel({ locale, config, setConfig, projects }: { locale: "zh" | "en"; config: PortfolioPdfConfig; setConfig: ConfigSetter; projects: ReturnType<typeof useProjectCatalog> }) {
  const byId = new Map(projects.map((item) => [item.id, item]));
  const ordered = [...config.projects].sort((a, b) => a.order - b.order);
  return <div>
    <PanelHeading hint={locale === "zh" ? "启用、禁用或调整合集 PDF 中的项目顺序。" : "Enable, disable, or reorder the projects included in the collection PDF."}>{locale === "zh" ? "项目选择" : "Project selection"}</PanelHeading>
    <div className="space-y-2">{ordered.map((item, index) => {
      const project = byId.get(item.id); if (!project) return null;
      return <div key={item.id} className="pdf-config-row"><label className="flex min-w-0 flex-1 items-center gap-3"><input type="checkbox" checked={item.enabled} onChange={(event) => setConfig((current) => ({ ...current, projects: current.projects.map((entry) => entry.id === item.id ? { ...entry, enabled: event.target.checked } : entry) }))} /><span className="truncate text-sm">{project.title}</span></label><MoveButtons index={index} count={ordered.length} onMove={(direction) => setConfig((current) => ({ ...current, projects: moveOrderedItem(current.projects, index, direction) }))} /></div>;
    })}</div>
  </div>;
}

function UiPanel({ locale, config, setConfig, items }: { locale: "zh" | "en"; config: PortfolioPdfConfig; setConfig: ConfigSetter; items: ReturnType<typeof getUiPracticeCatalog> }) {
  const byId = new Map(items.map((item) => [item.id, item])); const ordered = [...config.uiWorks].sort((a, b) => a.order - b.order);
  return <div><PanelHeading>{locale === "zh" ? "UI 作品选择" : "UI work selection"}</PanelHeading><div className="mb-4 grid grid-cols-2 gap-3"><SelectField label={locale === "zh" ? "每页数量" : "Items per page"} value={String(config.uiOptions.density)} options={[["2", "2"], ["4", "4"], ["6", "6"]]} onChange={(value) => setConfig((current) => ({ ...current, uiOptions: { ...current.uiOptions, density: Number(value) as 2 | 4 | 6 } }))} /><SelectField label={locale === "zh" ? "图片适配" : "Image fit"} value={config.uiOptions.cropMode} options={[["contain", locale === "zh" ? "完整显示" : "Contain"], ["cover", locale === "zh" ? "裁切填充" : "Cover"]]} onChange={(value) => setConfig((current) => ({ ...current, uiOptions: { ...current.uiOptions, cropMode: value as "contain" | "cover" } }))} /></div><label className="mb-4 block text-xs"><input className="mr-2" type="checkbox" checked={config.uiOptions.showCaptions} onChange={(event) => setConfig((current) => ({ ...current, uiOptions: { ...current.uiOptions, showCaptions: event.target.checked } }))} />{locale === "zh" ? "显示标题与说明" : "Show titles and captions"}</label><div className="space-y-2">{ordered.map((entry, index) => { const item = byId.get(entry.id); if (!item) return null; return <div className="pdf-config-row" key={entry.id}><label className="flex min-w-0 flex-1 items-center gap-2"><input type="checkbox" checked={entry.enabled} onChange={(event) => setConfig((current) => ({ ...current, uiWorks: current.uiWorks.map((value) => value.id === entry.id ? { ...value, enabled: event.target.checked } : value) }))} /><img src={item.src} alt="" className="h-9 w-12 rounded object-cover" /><span className="truncate text-xs">{item.title || item.filename}</span></label><MoveButtons index={index} count={ordered.length} onMove={(direction) => setConfig((current) => ({ ...current, uiWorks: moveOrderedItem(current.uiWorks, index, direction) }))} /></div>; })}</div></div>;
}

function GamesPanel({ locale, config, setConfig, games }: { locale: "zh" | "en"; config: PortfolioPdfConfig; setConfig: ConfigSetter; games: ReturnType<typeof useGameExperienceStore>["records"] }) {
  const byId = new Map(games.map((item) => [item.id, item])); const ordered = [...config.games].sort((a, b) => a.order - b.order);
  return <div><PanelHeading>{locale === "zh" ? "游戏经历选择" : "Game selection"}</PanelHeading><div className="mb-4 flex gap-4 text-xs"><label><input className="mr-2" type="checkbox" checked={config.gameOptions.showAchievements} onChange={(event) => setConfig((current) => ({ ...current, gameOptions: { ...current.gameOptions, showAchievements: event.target.checked } }))} />{locale === "zh" ? "成就" : "Achievements"}</label><label><input className="mr-2" type="checkbox" checked={config.gameOptions.showTags} onChange={(event) => setConfig((current) => ({ ...current, gameOptions: { ...current.gameOptions, showTags: event.target.checked } }))} />Tags</label></div><div className="space-y-2">{ordered.map((entry, index) => { const game = byId.get(entry.id); if (!game) return null; const playtime = formatPlaytime(game, locale); return <div className="pdf-config-card" key={entry.id}><div className="flex items-center gap-2"><label className="min-w-0 flex-1"><input className="mr-2" type="checkbox" checked={entry.enabled} onChange={(event) => setConfig((current) => ({ ...current, games: current.games.map((value) => value.id === entry.id ? { ...value, enabled: event.target.checked } : value) }))} /><span className="text-sm">{gameTitle(game, locale)}</span>{playtime ? <span className="ml-2 text-[10px] text-softWhite/35">{playtime}</span> : null}</label><MoveButtons index={index} count={ordered.length} onMove={(direction) => setConfig((current) => ({ ...current, games: moveOrderedItem(current.games, index, direction) }))} /></div><select value={entry.detailLevel} onChange={(event) => setConfig((current) => ({ ...current, games: current.games.map((value) => value.id === entry.id ? { ...value, detailLevel: event.target.value as typeof entry.detailLevel } : value) }))} className="mt-2 w-full rounded bg-[#0b1035] px-3 py-2 text-xs"><option value="metadata">{locale === "zh" ? "仅元数据" : "Metadata only"}</option><option value="summary">{locale === "zh" ? "摘要" : "Summary"}</option><option value="detail">{locale === "zh" ? "摘要 + 详情" : "Summary + detail"}</option></select></div>; })}</div></div>;
}

function SettingsPanel({ locale, config, applyPreset }: { locale: "zh" | "en"; config: PortfolioPdfConfig; applyPreset: (preset: PdfPreset) => void }) {
  return <div><PanelHeading hint={locale === "zh" ? "预设会重置当前未保存的选择，但不会修改作品内容。" : "Presets reset unsaved selection, never portfolio content."}>{locale === "zh" ? "文档设置" : "Document settings"}</PanelHeading><div className="grid gap-3"><div><p className="mb-2 text-xs text-softWhite/45">{locale === "zh" ? "预设" : "Preset"}</p><div className="grid gap-2">{(["compact", "standard", "detailed"] as PdfPreset[]).map((preset) => <button type="button" key={preset} onClick={() => applyPreset(preset)} className={`flex items-center justify-between rounded-lg border px-4 py-3 text-left text-sm ${config.preset === preset ? "border-acidGreen/60 bg-acidGreen/8 text-acidGreen" : "border-softWhite/10"}`}><span>{preset === "compact" ? (locale === "zh" ? "紧凑求职版" : "Compact application") : preset === "standard" ? (locale === "zh" ? "标准作品集" : "Standard portfolio") : (locale === "zh" ? "详细档案" : "Detailed archive")}</span>{config.preset === preset ? <Check className="h-4 w-4" /> : <RotateCcw className="h-3.5 w-3.5 opacity-35" />}</button>)}</div></div></div></div>;
}

function MoveButtons({ index, count, onMove }: { index: number; count: number; onMove: (direction: -1 | 1) => void }) {
  return <span className="flex shrink-0"><button type="button" className="pdf-icon-button" disabled={index === 0} onClick={(event) => { event.preventDefault(); onMove(-1); }} aria-label="Move up"><ArrowUp className="h-3.5 w-3.5" /></button><button type="button" className="pdf-icon-button" disabled={index === count - 1} onClick={(event) => { event.preventDefault(); onMove(1); }} aria-label="Move down"><ArrowDown className="h-3.5 w-3.5" /></button></span>;
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[][]; onChange: (value: string) => void }) {
  return <label className="pdf-field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([key, text]) => <option value={key} key={key}>{text}</option>)}</select></label>;
}
