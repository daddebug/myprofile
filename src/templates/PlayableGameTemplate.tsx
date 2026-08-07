import { useState } from "react";
import { ExternalLink, Image as ImageIcon, Maximize, Play, Plus, RefreshCw, Square, Trash2 } from "lucide-react";
import { InlineTemplateField } from "../components/template-tools/InlineTemplateField";
import { TemplateContent, TemplateSurface } from "../components/template-tools/TemplateResponsiveFoundation";
import type { TemplateLayoutControlDefinition, TemplateMeta, TemplateProps } from "../lib/templateLibrary";

type LocalizedText = { zh: string; en: string };
type GameReference = { gameId: string; entryPublicPath: string; originalFileName: string; displayName?: string; fileCount: number; totalBytes: number; createdAt?: string };
type CoverReference = { coverId: string; publicUrl: string; format: string; size: number };
type ControlItem = { id: string; key?: LocalizedText; action?: LocalizedText };

export const layoutControls = {} as const;
export const layoutControlSchema: TemplateLayoutControlDefinition[] = [];
export const templateMeta: TemplateMeta = {
  id: "playable-game",
  nameZh: "可玩游戏",
  nameEn: "Playable Game",
  descriptionZh: "上传或嵌入同源的浏览器可玩原型。",
  descriptionEn: "A locally persisted, browser-playable game prototype.",
  schema: [
    { id: "heading", labelZh: "顶部标题", labelEn: "Heading", type: "text" },
    { id: "description", labelZh: "游戏说明", labelEn: "Game description", type: "textarea" },
    { id: "game", labelZh: "游戏文件", labelEn: "Game build", type: "game" },
    { id: "cover", labelZh: "启动封面", labelEn: "Launch cover", type: "image", required: false },
    { id: "controls", labelZh: "操作说明", labelEn: "Controls", type: "list", required: false },
    { id: "versionLabel", labelZh: "版本说明", labelEn: "Version label", type: "text", required: false },
    { id: "status", labelZh: "项目状态", labelEn: "Project status", type: "select", required: false },
  ],
  createdAt: "2026-08-02T16:30:00.000Z",
};

const statuses = ["prototype", "in-development", "complete", "archived"] as const;
const ratios = { "16:9": "16 / 9", "4:3": "4 / 3", auto: "16 / 9" } as const;
const text = (value: unknown, locale: "zh" | "en") => value && typeof value === "object" && !Array.isArray(value) ? String((value as Record<string, unknown>)[locale] ?? "") : "";
const isGame = (value: unknown): value is GameReference => Boolean(value && typeof value === "object" && !Array.isArray(value) && typeof (value as GameReference).gameId === "string" && typeof (value as GameReference).entryPublicPath === "string");
const isCover = (value: unknown): value is CoverReference => Boolean(value && typeof value === "object" && !Array.isArray(value) && typeof (value as CoverReference).coverId === "string" && typeof (value as CoverReference).publicUrl === "string");

export default function PlayableGameTemplate({ content, locale, horizontalInset, inlineEditor }: TemplateProps) {
  const [running, setRunning] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [existingGamesOpen, setExistingGamesOpen] = useState(false);
  const [coverLoadFailed, setCoverLoadFailed] = useState(false);
  const game = isGame(content.game) ? content.game : null;
  const cover = isCover(content.cover) ? content.cover : null;
  // The cover is explicitly optional (schema: required: false) and this
  // section always renders real content (the play button/loader) whether
  // or not it's present, so an absent cover is never tracked as a media
  // slot at all (nothing to collapse — there's no blank frame to begin
  // with). A cover that WAS referenced (even partially — coverId without a
  // resolved publicUrl) and failed to fully resolve is still a real asset
  // failure, tracked the same as any other media slot.
  const rawCover = content.cover as { coverId?: string; publicUrl?: string } | undefined;
  const hasCoverReference = Boolean(rawCover?.coverId || rawCover?.publicUrl);
  const coverMediaSlotState = !hasCoverReference ? null : cover?.publicUrl ? (coverLoadFailed ? "failed" : "filled") : "failed";
  const coverSlotId = `playable-game-cover:${game?.gameId ?? (text(content.heading, locale) || "untitled")}`;
  const controls = Array.isArray(content.controls) ? content.controls.filter((item): item is ControlItem => Boolean(item && typeof item === "object")) : [];
  const aspectRatio = content.aspectRatio === "4:3" || content.aspectRatio === "auto" ? content.aspectRatio : "16:9";
  const status = statuses.includes(content.status as typeof statuses[number]) ? content.status as typeof statuses[number] : "prototype";
  const editor = inlineEditor?.playableGame;

  const updateControl = (id: string, field: "key" | "action", value: string) => {
    editor?.onContentChange({
      controls: controls.map((item) => item.id === id
        ? { ...item, [field]: { zh: text(item[field], "zh"), en: text(item[field], "en"), [locale]: value } }
        : item),
    });
  };

  const fullscreen = () => document.querySelector(`[data-playable-game="${game?.gameId}"]`)?.requestFullscreen?.();
  const formatCreatedAt = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-AU", { dateStyle: "medium" }).format(date);
  };
  const stageLabels = locale === "zh"
    ? { reading: "正在读取文件", checking: "正在检查网页入口", copying: "正在复制游戏文件", verifying: "正在验证运行文件", saving: "正在保存版本" }
    : { reading: "Reading files", checking: "Checking web entry", copying: "Copying game files", verifying: "Verifying runtime files", saving: "Saving version" };

  return <TemplateSurface>
    <TemplateContent horizontalInset={horizontalInset}>
      {inlineEditor ? <InlineTemplateField value={text(content.heading, locale)} onChange={(value) => inlineEditor.onLocalizedTextChange("heading", value)} ariaLabel={locale === "zh" ? "顶部标题" : "Heading"} className="w-full text-center font-display text-3xl font-semibold text-softWhite" /> : text(content.heading, locale) ? <h2 className="text-center font-display text-3xl font-semibold text-softWhite">{text(content.heading, locale)}</h2> : null}
      {inlineEditor ? <InlineTemplateField value={text(content.description, locale)} onChange={(value) => inlineEditor.onLocalizedTextChange("description", value)} ariaLabel={locale === "zh" ? "游戏说明" : "Game description"} className="mx-auto mt-5 w-full max-w-4xl text-center text-base leading-8 text-[#9FAAD2]" /> : text(content.description, locale) ? <p className="mx-auto mt-5 max-w-4xl whitespace-pre-wrap text-center text-base leading-8 text-[#9FAAD2]">{text(content.description, locale)}</p> : null}

      <section className="mx-auto mt-8 max-w-[80rem] overflow-hidden rounded-[8px] bg-[#111746]/72 ring-1 ring-inset ring-softWhite/8" data-playable-game={game?.gameId}>
        <div className="relative grid w-full place-items-center bg-[#0d1238]" style={{ aspectRatio: ratios[aspectRatio] }} data-media-slot-state={coverMediaSlotState} data-media-slot-id={coverSlotId}>
          {!running && cover ? <img src={cover.publicUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" onError={() => setCoverLoadFailed(true)} /> : null}
          {!running && cover ? <div className="absolute inset-0 bg-[#090d2b]/45" aria-hidden="true" /> : null}
          {running && game ? <iframe key={reloadKey} src={game.entryPublicPath} title={text(content.heading, locale) || "Playable game"} className="absolute inset-0 h-full w-full border-0 print:hidden" sandbox="allow-scripts allow-same-origin allow-pointer-lock" allow="fullscreen; gamepad" allowFullScreen /> : <div className="relative flex max-w-3xl flex-col items-center gap-4 px-6 text-center"><Play className="h-10 w-10 text-acidGreen" aria-hidden="true" /><p className="text-sm text-softWhite/62">{game ? (locale === "zh" ? "点击开始加载可玩版本" : "Start to load the playable build") : (locale === "zh" ? "可玩版本待补" : "Playable build to be added")}</p>{game ? <button type="button" className="editor-action border-acidGreen text-acidGreen" onClick={() => setRunning(true)}>{locale === "zh" ? "开始游戏" : "Start game"}</button> : null}{editor ? <div className="grid justify-items-center gap-3"><p className="text-sm font-semibold text-softWhite">{locale === "zh" ? "添加可玩游戏" : "Add playable game"}</p><div className="flex flex-wrap justify-center gap-2"><button type="button" className="editor-action border-acidGreen text-acidGreen" disabled={editor.busy} onClick={editor.onChooseFolder}>{locale === "zh" ? "选择网页游戏文件夹（推荐）" : "Choose web game folder (recommended)"}</button><button type="button" className="editor-action" disabled={editor.busy} onClick={editor.onChooseZip}>{locale === "zh" ? "选择 ZIP 文件" : "Choose ZIP file"}</button><button type="button" className="editor-action" disabled={editor.busy} onClick={() => setExistingGamesOpen((open) => !open)}>{game ? (locale === "zh" ? "选择其他现有游戏" : "Choose another saved game") : (locale === "zh" ? "选择现有游戏" : "Choose saved game")}</button></div><p className="max-w-2xl text-xs leading-5 text-softWhite/48">{locale === "zh" ? "可以直接选择 Unity WebGL 导出的文件夹，无需手动压缩。系统会自动寻找 index.html、Build 和 TemplateData。" : "Select an exported Unity WebGL folder directly. No manual ZIP is needed; the system finds index.html, Build, and TemplateData."}</p>{editor.stage ? <p className="text-sm text-acidGreen">{stageLabels[editor.stage]}</p> : null}</div> : null}</div>}
          {running && game ? <div className="absolute inset-0 hidden flex-col items-center justify-center gap-3 bg-[#0d1238] px-6 text-center print:flex"><Play className="h-8 w-8 text-acidGreen" aria-hidden="true" /><p className="text-sm text-softWhite">Playable prototype available on the web</p></div> : null}
        </div>
        {game ? <div className="flex flex-wrap items-center justify-between gap-3 border-t border-softWhite/10 px-4 py-3"><p className="text-xs text-softWhite/48">{game.originalFileName} · {game.fileCount} files · {(game.totalBytes / 1048576).toFixed(1)} MiB</p><div className="flex gap-2">{running ? <button type="button" className="editor-action" onClick={() => setRunning(false)}><Square className="h-3.5 w-3.5" />{locale === "zh" ? "停止" : "Stop"}</button> : null}<button type="button" className="editor-action" onClick={() => { setRunning(true); setReloadKey((value) => value + 1); }}><RefreshCw className="h-3.5 w-3.5" />{locale === "zh" ? "重新加载" : "Reload"}</button><button type="button" className="editor-action" onClick={fullscreen}><Maximize className="h-3.5 w-3.5" />{locale === "zh" ? "全屏" : "Fullscreen"}</button><a className="editor-action" href={game.entryPublicPath} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" />{locale === "zh" ? "新标签页" : "New tab"}</a></div></div> : null}
      </section>

      {editor && existingGamesOpen ? <div className="mx-auto mt-4 max-w-[80rem] rounded-[8px] bg-softWhite/[0.035] p-4 ring-1 ring-inset ring-softWhite/10">{editor.availableGames.length ? <div className="grid gap-3">{editor.availableGames.map((saved) => <div key={saved.gameId} className="flex flex-wrap items-center justify-between gap-4 border-b border-softWhite/10 pb-3 last:border-0 last:pb-0"><div className="min-w-0"><p className="font-semibold text-softWhite">{saved.displayName}</p><p className="mt-1 break-all text-xs text-softWhite/48">{saved.originalFileName} · {saved.fileCount} files · {(saved.totalBytes / 1048576).toFixed(1)} MiB · {formatCreatedAt(saved.createdAt)}</p></div><button type="button" className="editor-action border-acidGreen text-acidGreen" disabled={editor.busy || saved.gameId === game?.gameId} onClick={async () => { await editor.onUseSavedBuild(saved.gameId); setExistingGamesOpen(false); }}>{saved.gameId === game?.gameId ? (locale === "zh" ? "已绑定" : "Bound") : (locale === "zh" ? "绑定" : "Bind")}</button></div>)}</div> : <p className="text-sm text-softWhite/60">{locale === "zh" ? "暂无现有游戏构建，可上传 ZIP 创建新版本。" : "No saved game builds. Upload a ZIP to create a new version."}</p>}</div> : null}
      {editor ? <div className="mx-auto mt-4 flex max-w-[80rem] flex-wrap items-center justify-center gap-3"><button type="button" className="editor-action" disabled={editor.busy} onClick={editor.onChooseCover}><ImageIcon className="h-3.5 w-3.5" />{cover ? (locale === "zh" ? "替换启动封面" : "Replace cover") : (locale === "zh" ? "上传启动封面" : "Upload cover")}</button><select value={status} onChange={(event) => editor.onContentChange({ status: event.target.value })} className="editor-action bg-deepIndigo">{statuses.map((value) => <option key={value} value={value}>{value}</option>)}</select><select value={aspectRatio} onChange={(event) => editor.onContentChange({ aspectRatio: event.target.value })} className="editor-action bg-deepIndigo"><option value="16:9">16:9</option><option value="4:3">4:3</option><option value="auto">Auto</option></select>{editor.error ? <span className="text-sm text-peach">{editor.error}</span> : null}</div> : null}
      {(text(content.versionLabel, locale) || inlineEditor) ? <div className="mx-auto mt-4 max-w-md">{inlineEditor ? <InlineTemplateField value={text(content.versionLabel, locale)} onChange={(value) => inlineEditor.onLocalizedTextChange("versionLabel", value)} ariaLabel={locale === "zh" ? "版本说明" : "Version label"} className="w-full text-center font-mono text-xs text-acidGreen" /> : <p className="text-center font-mono text-xs text-acidGreen">{text(content.versionLabel, locale)}</p>}</div> : null}
      {(controls.length || editor) ? <div className="mx-auto mt-6 max-w-3xl"><dl className="grid gap-2 sm:grid-cols-2">{controls.map((item, index) => <div key={item.id ?? index} className="relative flex gap-3 border-t border-softWhite/10 py-3 pr-8">{editor ? <><dt className="min-w-16"><InlineTemplateField value={text(item.key, locale)} onChange={(value) => updateControl(item.id, "key", value)} ariaLabel={locale === "zh" ? "按键" : "Key"} className="w-full font-mono text-sm font-bold text-acidGreen" /></dt><dd className="flex-1"><InlineTemplateField value={text(item.action, locale)} onChange={(value) => updateControl(item.id, "action", value)} ariaLabel={locale === "zh" ? "操作" : "Action"} className="w-full text-sm text-softWhite/62" /></dd><button type="button" className="absolute right-0 top-3 text-softWhite/45 hover:text-peach" title={locale === "zh" ? "删除操作说明" : "Remove control"} onClick={() => editor.onContentChange({ controls: controls.filter((control) => control.id !== item.id) })}><Trash2 className="h-4 w-4" /></button></> : <><dt className="font-mono text-sm font-bold text-acidGreen">{text(item.key, locale)}</dt><dd className="text-sm text-softWhite/62">{text(item.action, locale)}</dd></>}</div>)}</dl>{editor ? <button type="button" className="editor-action mt-3" onClick={() => editor.onContentChange({ controls: [...controls, { id: `control-${Date.now()}`, key: { zh: "", en: "" }, action: { zh: "", en: "" } }] })}><Plus className="h-3.5 w-3.5" />{locale === "zh" ? "添加操作说明" : "Add control"}</button> : null}</div> : null}
    </TemplateContent>
  </TemplateSurface>;
}
