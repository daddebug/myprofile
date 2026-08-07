import { useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Check, FileText, FolderOpen, RotateCcw, Save, X } from "lucide-react";
import { Link } from "react-router-dom";
import { pdfSectionLabel } from "../components/PortfolioPdfDocument";
import { useProjectCatalog } from "../hooks/useProjectCatalog";
import { formatPlaytime, gameTitle, useGameExperienceStore } from "../lib/gameExperience";
import {
  createPortfolioPdfConfig,
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
  openCollectionFile,
  openCollectionFolder,
  runPortfolioCollectionExport,
  type CollectionExportPhase,
  type PortfolioCollectionSectionId,
  type PortfolioCollectionSelection,
} from "../lib/portfolioCollectionExport";
import { MAX_COLLECTION_PROJECTS } from "../lib/collectionCoverGeometry";
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
      <div className="flex items-center gap-2"><button type="button" className="pdf-builder-button" onClick={save}><Save className="h-4 w-4" />{saved ? (locale === "zh" ? "已保存" : "Saved") : (locale === "zh" ? "保存配置" : "Save config")}</button><CollectionGenerateAction locale={locale} projects={projects} config={config} /></div>
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
  const [outputPath, setOutputPath] = useState("");
  // Temporary, explicit, UI-driven override — replaces the earlier
  // ?emergencyPdfExport=1 query-param approach, which did not reliably
  // reach the actual Generate request (client-side route/tab-switching in
  // this page can rewrite the URL and silently drop unrelated query
  // params). This is real React state read directly at request time, not
  // parsed from window.location, so it cannot be lost that way.
  const [emergencyPdfExport, setEmergencyPdfExport] = useState(false);
  // A second, independent emergency mode — never combined with the one
  // above. Renders each project's real website layout and slices it into
  // landscape-A4-ratio physical pages without ever letting Chromium's print
  // pagination decide a page break (captureProjectPageWebsiteSlice). See
  // the state comment above for why this is real React state, not a URL
  // query param.
  const [websiteSlice, setWebsiteSlice] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const runExport = async () => {
    const selection = buildCollectionSelection(config);
    if (!selection.projectIds.length) {
      setPhase("error");
      setMessage(locale === "zh" ? "请至少启用一个项目。" : "Enable at least one project first.");
      return;
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    setPhase("staging");
    console.info("[collection export] emergencyPdfExport (client, about to send) =", emergencyPdfExport, "websiteSlice =", websiteSlice);
    setMessage(
      (emergencyPdfExport ? (locale === "zh" ? "紧急导出：开启\n" : "Emergency export: ON\n") : "")
      + (websiteSlice ? (locale === "zh" ? "网站切片导出：开启\n" : "Website-slice export: ON\n") : "")
      + (locale === "zh" ? "正在抓取项目页面…" : "Capturing project pages..."),
    );
    setOutputPath("");
    try {
      const result = await runPortfolioCollectionExport(projects, locale, selection, emergencyPdfExport, websiteSlice, (progress) => {
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
      setOutputPath(result.outputPath);
      const excludedNote = result.excludedProjectIds.length
        ? (locale === "zh" ? `（另有 ${result.excludedProjectIds.length} 个未选中或超出上限的项目未包含）` : ` (${result.excludedProjectIds.length} unselected/over-limit project(s) excluded)`)
        : "";
      setMessage(
        (locale === "zh" ? `已生成 ${result.pages} 页：${result.outputPath}` : `Generated ${result.pages} page(s): ${result.outputPath}`) + excludedNote,
      );
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
        <button type="button" className="pdf-builder-button pdf-builder-button-primary" onClick={() => void runExport()} disabled={busy}>
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
      {/* Temporary emergency override control — see the state comment above.
          Not gated behind DEV/owner mode beyond whatever already gates this
          whole editor; intentionally visible and explicit rather than a
          hidden query param, per its own purpose. */}
      <label className={`mt-2 flex w-fit items-center gap-2 rounded border px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide ${emergencyPdfExport ? "border-peach/60 bg-peach/10 text-peach" : "border-softWhite/15 text-softWhite/55"}`}>
        <input type="checkbox" checked={emergencyPdfExport} onChange={(event) => setEmergencyPdfExport(event.target.checked)} disabled={busy || websiteSlice} />
        {locale === "zh" ? "紧急导出：允许额外的 Chromium 分段" : "Emergency export: allow extra Chromium segments"}
      </label>
      {emergencyPdfExport ? (
        <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-peach">
          {locale === "zh" ? "紧急导出：开启" : "Emergency export: ON"}
        </p>
      ) : null}
      {/* Second, independent emergency mode — see the state comment above.
          Mutually exclusive with the segment-count override above (both
          solve the same underlying symptom differently); disabling one
          while the other is on keeps that explicit rather than silently
          letting both apply at once. */}
      <label className={`mt-2 flex w-fit items-center gap-2 rounded border px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide ${websiteSlice ? "border-acidGreen/60 bg-acidGreen/10 text-acidGreen" : "border-softWhite/15 text-softWhite/55"}`}>
        <input type="checkbox" checked={websiteSlice} onChange={(event) => setWebsiteSlice(event.target.checked)} disabled={busy || emergencyPdfExport} />
        {locale === "zh" ? "紧急导出：网站切片模式（A4 横向）" : "Emergency export: website-slice mode (A4 landscape)"}
      </label>
      {websiteSlice ? (
        <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-acidGreen">
          {locale === "zh" ? "网站切片导出：开启" : "Website-slice export: ON"}
        </p>
      ) : null}
      {message ? (
        <div
          className={`absolute right-0 top-full z-50 mt-2 w-80 rounded-lg border bg-[#0b1035] px-3 py-2 text-xs leading-5 shadow-archive ${
            phase === "error" ? "border-peach/45 text-peach" : "border-softWhite/12 text-softWhite/70"
          }`}
          aria-live="polite"
        >
          <p className="break-all">{message}</p>
          {phase === "done" && outputPath ? (
            <div className="mt-2 flex gap-2">
              <button type="button" className="inline-flex items-center gap-1 rounded border border-softWhite/20 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-softWhite/80 hover:border-acidGreen hover:text-acidGreen" onClick={() => void openCollectionFile(outputPath)}>
                <FileText className="h-3 w-3" aria-hidden="true" />
                {locale === "zh" ? "打开文件" : "Open file"}
              </button>
              <button type="button" className="inline-flex items-center gap-1 rounded border border-softWhite/20 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-softWhite/80 hover:border-acidGreen hover:text-acidGreen" onClick={() => void openCollectionFolder(outputPath)}>
                <FolderOpen className="h-3 w-3" aria-hidden="true" />
                {locale === "zh" ? "打开文件夹" : "Open folder"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
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
  return <div><PanelHeading>{locale === "zh" ? "游戏经历选择" : "Game selection"}</PanelHeading><div className="mb-4 flex gap-4 text-xs"><label><input className="mr-2" type="checkbox" checked={config.gameOptions.showAchievements} onChange={(event) => setConfig((current) => ({ ...current, gameOptions: { ...current.gameOptions, showAchievements: event.target.checked } }))} />{locale === "zh" ? "成就" : "Achievements"}</label><label><input className="mr-2" type="checkbox" checked={config.gameOptions.showTags} onChange={(event) => setConfig((current) => ({ ...current, gameOptions: { ...current.gameOptions, showTags: event.target.checked } }))} />Tags</label></div><div className="space-y-2">{ordered.map((entry, index) => { const game = byId.get(entry.id); if (!game) return null; return <div className="pdf-config-card" key={entry.id}><div className="flex items-center gap-2"><label className="min-w-0 flex-1"><input className="mr-2" type="checkbox" checked={entry.enabled} onChange={(event) => setConfig((current) => ({ ...current, games: current.games.map((value) => value.id === entry.id ? { ...value, enabled: event.target.checked } : value) }))} /><span className="text-sm">{gameTitle(game, locale)}</span><span className="ml-2 text-[10px] text-softWhite/35">{formatPlaytime(game, locale)}</span></label><MoveButtons index={index} count={ordered.length} onMove={(direction) => setConfig((current) => ({ ...current, games: moveOrderedItem(current.games, index, direction) }))} /></div><select value={entry.detailLevel} onChange={(event) => setConfig((current) => ({ ...current, games: current.games.map((value) => value.id === entry.id ? { ...value, detailLevel: event.target.value as typeof entry.detailLevel } : value) }))} className="mt-2 w-full rounded bg-[#0b1035] px-3 py-2 text-xs"><option value="metadata">{locale === "zh" ? "仅元数据" : "Metadata only"}</option><option value="summary">{locale === "zh" ? "摘要" : "Summary"}</option><option value="detail">{locale === "zh" ? "摘要 + 详情" : "Summary + detail"}</option></select></div>; })}</div></div>;
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

