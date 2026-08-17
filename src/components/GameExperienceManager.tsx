import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, ImagePlus, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import type { Locale } from "../locales/types";
import {
  createBlankGameRecord,
  gameTitle,
  getGameExperienceStore,
  normalizeGameExperienceRecord,
  saveGameExperienceStore,
  validateGameExperienceStore,
  type GameExperienceRecord,
  type GameExperienceStore,
} from "../lib/gameExperience";
import { GAME_COVER_MAX_BYTES, saveGameCover, validateGameCoverFile } from "../lib/gameCoverDb";
import { useGameCover } from "../hooks/useGameCover";
import { GameExperienceAiImportPanel } from "./GameExperienceAiImportPanel";
import { markGameExperienceDeleted, markGameExperienceDirty } from "../lib/publishIntent";

type Props = { locale: Locale; store: GameExperienceStore; initialEditingId?: string | null; startWithNewGame?: boolean; onClose: () => void };

function move<T>(items: T[], from: number, to: number) {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
}

export function GameExperienceManager({ locale, store, initialEditingId = null, startWithNewGame = false, onClose }: Props) {
  const [initialNewRecord] = useState(() => {
    if (!startWithNewGame) return null;
    const record = createBlankGameRecord();
    record.publication.libraryOrder = store.records.length;
    return record;
  });
  const [draft, setDraft] = useState(() => ({ ...structuredClone(store), records: initialNewRecord ? [...structuredClone(store.records), initialNewRecord] : structuredClone(store.records) }));
  const [editingId, setEditingId] = useState<string | null>(initialEditingId ?? initialNewRecord?.id ?? null);
  const [pendingCover, setPendingCover] = useState<File | null>(null);
  const [pendingCoverPreview, setPendingCoverPreview] = useState<string | null>(null);
  const [coverError, setCoverError] = useState("");
  const [message, setMessage] = useState("");
  const [editorOriginal, setEditorOriginal] = useState<GameExperienceRecord | null>(() => {
    const initial = initialEditingId ? store.records.find((record) => record.id === initialEditingId) : null;
    return initial ? structuredClone(initial) : null;
  });
  const [libraryQuery, setLibraryQuery] = useState("");
  const [aiImportOpen, setAiImportOpen] = useState(false);
  const records = useMemo(() => [...draft.records].sort((a, b) => a.publication.libraryOrder - b.publication.libraryOrder), [draft]);
  const selectedCount = records.filter((record) => record.publication.showOnHomepage && !record.publication.archived).length;
  const editing = records.find((record) => record.id === editingId) ?? null;
  const displayedRecords = records.filter((record) => [record.identity.titleZh, record.identity.titleEn, record.identity.canonicalTitle].join(" ").toLocaleLowerCase().includes(libraryQuery.trim().toLocaleLowerCase()));

  useEffect(() => {
    if (!pendingCover) {
      setPendingCoverPreview(null);
      return;
    }
    const objectUrl = URL.createObjectURL(pendingCover);
    setPendingCoverPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [pendingCover]);

  const patchRecord = (recordId: string, patch: (record: GameExperienceRecord) => GameExperienceRecord) => {
    setDraft((current) => ({ ...current, records: current.records.map((record) => record.id === recordId ? patch(record) : record) }));
  };

  const startAdd = () => {
    const record = createBlankGameRecord();
    record.publication.libraryOrder = records.length;
    setDraft((current) => ({ ...current, records: [...current.records, record] }));
    setEditingId(record.id);
    setEditorOriginal(null);
    setPendingCover(null);
    setCoverError("");
  };

  const cancelEditor = () => {
    if (editing && !store.records.some((record) => record.id === editing.id)) {
      setDraft((current) => ({ ...current, records: current.records.filter((record) => record.id !== editing.id) }));
    } else if (editorOriginal) {
      setDraft((current) => ({ ...current, records: current.records.map((record) => record.id === editorOriginal.id ? editorOriginal : record) }));
    }
    setEditingId(null);
    setEditorOriginal(null);
    setPendingCover(null);
    setCoverError("");
  };

  const selectLocalCover = (file: File | null) => {
    setCoverError("");
    if (!file) {
      setPendingCover(null);
      return;
    }
    try {
      validateGameCoverFile(file);
      setPendingCover(file);
    } catch (error) {
      const oversized = file.size > GAME_COVER_MAX_BYTES;
      setCoverError(locale === "zh"
        ? oversized ? "图片超过 12 MB，请选择更小的文件。" : "仅支持 PNG、JPEG、WebP 或 AVIF 图片。"
        : error instanceof Error ? error.message : "Choose a valid PNG, JPEG, WebP, or AVIF image.");
    }
  };

  const saveAll = async () => {
    setMessage("");
    let next = structuredClone(draft);
    const incomplete = next.records.find((record) => !record.identity.canonicalTitle.trim() || !record.identity.titleEn.trim());
    if (incomplete) {
      setMessage(locale === "zh" ? "每条记录都需要标准名称和英文名称。" : "Every record needs a canonical and English title.");
      return;
    }
    if (editing) {
      const normalized = normalizeGameExperienceRecord(editing, editing.publication.libraryOrder);
      if (!normalized.identity.canonicalTitle || !normalized.identity.titleEn) {
        setMessage(locale === "zh" ? "请填写游戏名称。" : "Enter a game title.");
        return;
      }
      try {
        validateGameExperienceStore(next);
        let coverAssetId = normalized.presentation.coverAssetId;
        if (pendingCover) {
          const cover = await saveGameCover(normalized.id, pendingCover, coverAssetId);
          coverAssetId = cover.id;
        }
        next.records = next.records.map((record) => record.id === normalized.id ? {
          ...normalized,
          presentation: { ...normalized.presentation, coverAssetId },
          updatedAt: new Date().toISOString(),
        } : record);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Unable to save the cover.");
        return;
      }
    }
    try {
      const normalizedRecords = records.map((record, index) => ({
        ...(next.records.find((item) => item.id === record.id) ?? record),
        publication: { ...(next.records.find((item) => item.id === record.id) ?? record).publication, libraryOrder: index },
      }));
      const homepageOrderById = new Map(normalizedRecords.filter((record) => record.publication.showOnHomepage && !record.publication.archived).map((record, index) => [record.id, index]));
      const finalRecords = normalizedRecords.map((record) => ({ ...record, publication: { ...record.publication, homepageOrder: homepageOrderById.get(record.id) ?? record.publication.homepageOrder } }));
      saveGameExperienceStore({ ...next, records: finalRecords });
      // One dirty-intent capture per record, after the save actually
      // committed -- each call derives UPSERT/UNPUBLISH/null from this
      // record's live-vs-published transition; a record that was never
      // published and still isn't opens no intent at all (see
      // deriveGameExperienceIntentKind in publishIntent.ts).
      for (const record of finalRecords) markGameExperienceDirty(record);
      onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save Game Experience.");
    }
  };

  const reorder = (recordId: string, direction: -1 | 1) => {
    const from = records.findIndex((record) => record.id === recordId);
    const reordered = move(records, from, from + direction).map((record, index) => ({ ...record, publication: { ...record.publication, libraryOrder: index } }));
    setDraft((current) => ({ ...current, records: reordered }));
  };

  const deleteRecord = (recordId: string) => {
    const target = draft.records.find((record) => record.id === recordId);
    if (!target) return;
    const title = gameTitle(target, locale) || target.identity.canonicalTitle || recordId;
    const confirmed = window.confirm(locale === "zh"
      ? `确定删除“${title}”吗？\n\n只会删除这条游戏经历记录，现有封面文件会保留。`
      : `Delete “${title}”?\n\nOnly this Game Experience record will be deleted. Existing cover files will be preserved.`);
    if (!confirmed) return;

    try {
      const persisted = getGameExperienceStore();
      const existing = persisted.records.find((record) => record.id === recordId);
      if (existing) {
        saveGameExperienceStore({
          ...persisted,
          records: persisted.records.filter((record) => record.id !== recordId),
        });
        // Only opens a DELETE intent if this record was actually live in
        // production -- a record that was never published has nothing to
        // un-publish (see markGameExperienceDeleted in publishIntent.ts).
        markGameExperienceDeleted(existing);
      }
      setDraft((current) => ({ ...current, records: current.records.filter((record) => record.id !== recordId) }));
      if (editingId === recordId) setEditingId(null);
      if (editorOriginal?.id === recordId) setEditorOriginal(null);
      setMessage(locale === "zh" ? `已删除“${title}”。封面文件未删除。` : `Deleted “${title}”. Cover files were preserved.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : (locale === "zh" ? "无法删除这条游戏经历。" : "Unable to delete this Game Experience record."));
    }
  };

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-[#080b2b]/92 px-4 py-8 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={locale === "zh" ? "游戏经历管理" : "Game Experience manager"}>
      <div className="mx-auto max-w-7xl rounded-lg bg-[#111846] p-5 shadow-2xl md:p-8">
        <header className="flex items-start justify-between gap-4 border-b border-softWhite/10 pb-5">
          <div>
            <p className="font-mono text-[10px] font-bold tracking-[0.18em] text-acidGreen">GAME EXPERIENCE LIBRARY</p>
            <h2 className="mt-2 font-display text-3xl font-semibold text-softWhite">{locale === "zh" ? "管理游戏经历" : "Manage game experience"}</h2>
            <p className="mt-2 text-sm text-softWhite/55">{locale === "zh" ? `首页已选择 ${selectedCount} / ${draft.homepageLimit}` : `Homepage selected ${selectedCount} / ${draft.homepageLimit}`}</p>
          </div>
          <button type="button" className="grid h-10 w-10 place-items-center text-softWhite/60 hover:text-softWhite" onClick={onClose} aria-label={locale === "zh" ? "取消" : "Cancel"}><X /></button>
        </header>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button type="button" className="inline-flex items-center gap-2 rounded-full bg-acidGreen px-5 py-2.5 font-mono text-xs font-bold text-deepIndigo" onClick={startAdd}><Plus className="h-4 w-4" />{locale === "zh" ? "添加游戏" : "Add game"}</button>
            <button type="button" className="inline-flex items-center gap-2 rounded-full border border-acidGreen/55 px-5 py-2.5 font-mono text-xs font-bold text-acidGreen" onClick={() => setAiImportOpen(true)}><Sparkles className="h-4 w-4" />{locale === "zh" ? "AI 写入" : "AI import"}</button>
            <label className="flex items-center gap-2 font-mono text-xs text-softWhite/60">{locale === "zh" ? "首页上限" : "Homepage limit"}<input type="number" min={1} max={24} value={draft.homepageLimit} className="w-16 rounded bg-softWhite/8 px-2 py-1.5 text-softWhite" onChange={(event) => setDraft((current) => ({ ...current, homepageLimit: Math.max(1, Number(event.target.value) || 1) }))} /></label>
          </div>
          <div className="flex gap-3">
            <button type="button" className="rounded-full border border-softWhite/20 px-5 py-2.5 font-mono text-xs text-softWhite" onClick={onClose}>{locale === "zh" ? "取消" : "Cancel"}</button>
            <button type="button" className="rounded-full bg-acidGreen px-5 py-2.5 font-mono text-xs font-bold text-deepIndigo" onClick={() => void saveAll()}>{locale === "zh" ? "保存全部" : "Save all"}</button>
          </div>
        </div>
        <label className="mt-5 block max-w-md"><span className="sr-only">{locale === "zh" ? "搜索游戏记录" : "Search library records"}</span><input type="search" value={libraryQuery} onChange={(event) => setLibraryQuery(event.target.value)} placeholder={locale === "zh" ? "搜索现有游戏记录" : "Search existing records"} className="w-full rounded-full border border-softWhite/12 bg-[#0d143f] px-4 py-2.5 text-sm text-softWhite outline-none placeholder:text-softWhite/35 focus:border-acidGreen/60" /></label>
        {message ? <p className="mt-4 rounded bg-[#29315f] px-4 py-3 text-sm text-softWhite/76">{message}</p> : null}

        <div className="mt-6 grid gap-3">
          {displayedRecords.map((record) => {
            const index = records.findIndex((item) => item.id === record.id);
            return <ManagerRow key={record.id} record={record} locale={locale} selectedCount={selectedCount} limit={draft.homepageLimit} onEdit={() => { setEditingId(record.id); setEditorOriginal(structuredClone(record)); setPendingCover(null); setCoverError(""); }} onDelete={() => deleteRecord(record.id)} onMove={(direction) => reorder(record.id, direction)} onPatch={(patch) => patchRecord(record.id, patch)} disableUp={index === 0} disableDown={index === records.length - 1} />;
          })}
        </div>
      </div>

      {editing && typeof document !== "undefined" ? createPortal(
        <div className="fixed inset-0 z-[110] overflow-y-auto bg-[#070925]/90 px-4 py-8" role="dialog" aria-modal="true" aria-label={locale === "zh" ? "编辑游戏" : "Edit game"}>
          <div className="mx-auto max-w-4xl rounded-lg bg-[#151d50] p-5 md:p-8">
            <div className="flex justify-between gap-4">
              <div><p className="font-mono text-[10px] text-acidGreen">{store.records.some((record) => record.id === editing.id) ? "EDIT GAME" : "ADD GAME"}</p><h3 className="mt-2 font-display text-3xl text-softWhite">{gameTitle(editing, locale) || (locale === "zh" ? "新游戏" : "New game")}</h3></div>
              <button type="button" onClick={cancelEditor} className="text-softWhite/60"><X /></button>
            </div>

            <GameEditorForm record={editing} locale={locale} pendingCover={pendingCover} pendingCoverPreview={pendingCoverPreview} coverError={coverError} onCover={selectLocalCover} onPatch={(patch) => patchRecord(editing.id, patch)} />
            {message ? <p className="mt-5 rounded bg-[#29315f] px-4 py-3 text-sm text-softWhite/76">{message}</p> : null}
            <div className="mt-8 flex justify-end gap-3 border-t border-softWhite/10 pt-5"><button type="button" className="rounded-full border border-softWhite/20 px-5 py-2.5 text-sm text-softWhite" onClick={cancelEditor}>{locale === "zh" ? "取消" : "Cancel"}</button><button type="button" className="rounded-full bg-acidGreen px-5 py-2.5 text-sm font-bold text-deepIndigo" onClick={() => void saveAll()}>{locale === "zh" ? "保存游戏" : "Save game"}</button></div>
          </div>
        </div>,
        document.body,
      ) : null}
      {aiImportOpen ? <GameExperienceAiImportPanel locale={locale} records={records} onClose={() => setAiImportOpen(false)} onConfirm={(nextRecords) => { setDraft((current) => ({ ...current, records: nextRecords })); setMessage(locale === "zh" ? "AI 内容已写入当前待保存草稿。请检查后点击“保存全部”。" : "AI content was applied to the pending draft. Review it, then choose Save all."); }} /> : null}
    </div>
  );
}

function ManagerRow({ record, locale, selectedCount, limit, onEdit, onDelete, onMove, onPatch, disableUp, disableDown }: { record: GameExperienceRecord; locale: Locale; selectedCount: number; limit: number; onEdit: () => void; onDelete: () => void; onMove: (direction: -1 | 1) => void; onPatch: (patch: (record: GameExperienceRecord) => GameExperienceRecord) => void; disableUp: boolean; disableDown: boolean }) {
  const cover = useGameCover(record.presentation.coverAssetId, record.presentation.coverPublicPath);
  const selectionDisabled = !record.publication.showOnHomepage && selectedCount >= limit;
  return <div className="grid gap-4 rounded-lg bg-softWhite/[0.045] p-3 sm:grid-cols-[72px_minmax(0,1fr)_auto] sm:items-center">
    <div className="aspect-[3/4] overflow-hidden rounded bg-[#242d62]">{cover ? <img src={cover} alt="" className="h-full w-full object-cover" /> : null}</div>
    <div className="min-w-0"><p className="truncate font-display text-lg font-semibold text-softWhite">{gameTitle(record, locale)}</p><p className="mt-1 font-mono text-[10px] text-softWhite/45">{record.stats.playtimeLabelZh || record.stats.playtimeHours ? `${record.stats.playtimeLabelZh || record.stats.playtimeHours} · ` : ""}{record.publication.visibility.toUpperCase()}</p><div className="mt-2 flex flex-wrap gap-1">{record.presentation.tags.slice(0, 3).map((tag) => <span key={tag.id} className="rounded bg-softWhite/5 px-2 py-1 text-[10px] text-softWhite/50">{locale === "zh" ? tag.zh || tag.en : tag.en || tag.zh}</span>)}</div></div>
    <div className="flex flex-wrap items-center gap-2 sm:justify-end"><label className={`flex items-center gap-2 text-xs ${selectionDisabled ? "text-softWhite/25" : "text-softWhite/65"}`} title={selectionDisabled ? (locale === "zh" ? `首页最多选择 ${limit} 个游戏` : `Select up to ${limit} games`) : ""}><input type="checkbox" checked={record.publication.showOnHomepage} disabled={selectionDisabled} onChange={(event) => onPatch((item) => ({ ...item, publication: { ...item.publication, showOnHomepage: event.target.checked } }))} />{locale === "zh" ? "首页" : "Home"}</label><select value={record.publication.visibility} aria-label={locale === "zh" ? `${gameTitle(record, locale)} 可见性` : `${gameTitle(record, locale)} visibility`} onChange={(event) => onPatch((item) => ({ ...item, publication: { ...item.publication, visibility: event.target.value as GameExperienceRecord["publication"]["visibility"] } }))} className="rounded bg-[#0f1644] px-2 py-2 text-xs text-softWhite"><option value="public">Public</option><option value="hidden">Hidden</option><option value="draft">Draft</option></select><button type="button" aria-label={locale === "zh" ? `${gameTitle(record, locale)} 上移` : `Move ${gameTitle(record, locale)} up`} onClick={() => onMove(-1)} disabled={disableUp} className="p-2 text-softWhite/55 disabled:opacity-20"><ArrowUp className="h-4 w-4" /></button><button type="button" aria-label={locale === "zh" ? `${gameTitle(record, locale)} 下移` : `Move ${gameTitle(record, locale)} down`} onClick={() => onMove(1)} disabled={disableDown} className="p-2 text-softWhite/55 disabled:opacity-20"><ArrowDown className="h-4 w-4" /></button><button type="button" aria-label={locale === "zh" ? `编辑 ${gameTitle(record, locale)}` : `Edit ${gameTitle(record, locale)}`} onClick={onEdit} className="p-2 text-acidGreen"><Pencil className="h-4 w-4" /></button><button type="button" aria-label={locale === "zh" ? `删除 ${gameTitle(record, locale)}` : `Delete ${gameTitle(record, locale)}`} onClick={onDelete} className="p-2 text-peach"><Trash2 className="h-4 w-4" /></button><button type="button" onClick={() => onPatch((item) => ({ ...item, publication: { ...item.publication, archived: !item.publication.archived, showOnHomepage: false } }))} className="rounded px-2 py-2 font-mono text-[10px] text-softWhite/45">{record.publication.archived ? (locale === "zh" ? "恢复" : "Restore") : (locale === "zh" ? "归档" : "Archive")}</button></div>
  </div>;
}

function GameEditorForm({ record, locale, pendingCover, pendingCoverPreview, coverError, onCover, onPatch }: { record: GameExperienceRecord; locale: Locale; pendingCover: File | null; pendingCoverPreview: string | null; coverError: string; onCover: (file: File | null) => void; onPatch: (patch: (record: GameExperienceRecord) => GameExperienceRecord) => void }) {
  const cover = useGameCover(record.presentation.coverAssetId, record.presentation.coverPublicPath);
  const preview = pendingCoverPreview ?? cover;
  const field = (label: string, value: string | number | undefined, update: (value: string) => void, type = "text") => <label className="block text-xs text-softWhite/52"><span className="mb-1.5 block">{label}</span><input type={type} value={value ?? ""} onChange={(event) => update(event.target.value)} className="w-full rounded bg-[#0d143f] px-3 py-2.5 text-sm text-softWhite" /></label>;
  const area = (
    label: string,
    value: string,
    update: (value: string) => void,
    guidance?: { target: string; warningMax?: number },
  ) => {
    const characterCount = Array.from(value).length;
    const exceedsGuidance = guidance?.warningMax !== undefined && characterCount > guidance.warningMax;
    return <label className="block text-xs text-softWhite/52">
      <span className="mb-1.5 flex items-center justify-between gap-3">
        <span>{label}</span>
        {guidance ? <span className={exceedsGuidance ? "font-semibold text-amber-300" : "text-softWhite/38"}>{characterCount} 字</span> : null}
      </span>
      <textarea rows={3} value={value} onChange={(event) => update(event.target.value)} className="w-full rounded bg-[#0d143f] px-3 py-2.5 text-sm leading-6 text-softWhite" />
      {guidance ? <span className={`mt-1.5 block leading-5 ${exceedsGuidance ? "text-amber-300/90" : "text-softWhite/38"}`}>{exceedsGuidance ? `${guidance.target}；当前内容会完整保留，建议将展开说明移到“详细体验”。` : guidance.target}</span> : null}
    </label>;
  };
  const patchIdentity = (key: "canonicalTitle" | "titleZh" | "titleEn", value: string) => onPatch((item) => ({ ...item, identity: { ...item.identity, [key]: value } }));
  const patchReflection = (key: keyof GameExperienceRecord["reflection"], value: string) => onPatch((item) => ({ ...item, reflection: { ...item.reflection, [key]: value } }));
  return <div className="mt-6 space-y-7">
    <section>
      <h4 className="font-display text-xl font-semibold text-softWhite">{locale === "zh" ? "封面图片" : "Cover image"}</h4>
      <div className="mt-4 grid gap-5 md:grid-cols-[180px_minmax(0,1fr)] md:items-start">
        <div className="aspect-[3/4] overflow-hidden rounded-lg bg-[#242d62]">{preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-softWhite/25"><ImagePlus /></div>}</div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-full border border-acidGreen/50 px-4 py-2 text-xs text-acidGreen"><ImagePlus className="h-4 w-4" />{preview ? (locale === "zh" ? "替换图片" : "Replace image") : (locale === "zh" ? "上传本地图片" : "Upload image")}<input type="file" accept="image/png,image/jpeg,image/webp,image/avif" className="sr-only" onChange={(event: ChangeEvent<HTMLInputElement>) => { onCover(event.target.files?.[0] ?? null); event.currentTarget.value = ""; }} /></label>
          {preview ? <button type="button" className="rounded-full border border-softWhite/20 px-4 py-2 text-xs text-softWhite/62 hover:text-softWhite" onClick={() => { onCover(null); onPatch((item) => ({ ...item, presentation: { ...item.presentation, coverAssetId: undefined, coverPublicPath: undefined } })); }}>{locale === "zh" ? "移除图片" : "Remove image"}</button> : null}
          {pendingCover ? <p className="basis-full text-xs text-acidGreen">{locale === "zh" ? `待保存：${pendingCover.name}` : `Pending: ${pendingCover.name}`}</p> : null}
          {coverError ? <p className="basis-full text-xs leading-5 text-[#ffb5c0]" role="alert">{coverError}</p> : null}
        </div>
      </div>
    </section>
    <section className="grid gap-4 sm:grid-cols-2">{field(locale === "zh" ? "中文名称" : "Chinese title", record.identity.titleZh, (value) => patchIdentity("titleZh", value))}{field(locale === "zh" ? "英文名称" : "English title", record.identity.titleEn, (value) => patchIdentity("titleEn", value))}{field(locale === "zh" ? "标准名称" : "Canonical title", record.identity.canonicalTitle, (value) => patchIdentity("canonicalTitle", value))}{field(locale === "zh" ? "发行年份" : "Release year", record.identity.releaseYear, (value) => onPatch((item) => ({ ...item, identity: { ...item.identity, releaseYear: value ? Number(value) : undefined } })), "number")}</section>
    <section className="grid gap-4 sm:grid-cols-2">{field(locale === "zh" ? "游玩小时" : "Playtime hours", record.stats.playtimeHours, (value) => onPatch((item) => ({ ...item, stats: { ...item.stats, playtimeHours: value ? Math.max(0, Number(value)) : undefined } })), "number")}{field(locale === "zh" ? "游玩时长显示（中文）" : "Playtime label (Chinese)", record.stats.playtimeLabelZh, (value) => onPatch((item) => ({ ...item, stats: { ...item.stats, playtimeLabelZh: value || undefined } })))}<label className="block text-xs text-softWhite/52"><span className="mb-1.5 block">{locale === "zh" ? "成就状态" : "Achievement state"}</span><select value={record.stats.achievementMode ?? ""} onChange={(event) => onPatch((item) => ({ ...item, stats: { ...item.stats, achievementMode: (event.target.value || undefined) as GameExperienceRecord["stats"]["achievementMode"], achievementUnlocked: event.target.value === "exact" ? item.stats.achievementUnlocked : undefined, achievementTotal: event.target.value === "exact" ? item.stats.achievementTotal : undefined, achievementPercent: event.target.value === "percentage" ? item.stats.achievementPercent : undefined } }))} className="w-full rounded bg-[#0d143f] px-3 py-2.5 text-sm text-softWhite"><option value="">{locale === "zh" ? "未提供（不显示）" : "Not provided (hidden)"}</option><option value="exact">Exact unlocked / total</option><option value="percentage">Percentage only</option><option value="none">No achievements</option></select></label>{record.stats.achievementMode === "exact" ? <div className="grid grid-cols-2 gap-2">{field(locale === "zh" ? "已解锁" : "Unlocked", record.stats.achievementUnlocked, (value) => onPatch((item) => ({ ...item, stats: { ...item.stats, achievementUnlocked: value ? Number(value) : undefined } })), "number")}{field(locale === "zh" ? "总数" : "Total", record.stats.achievementTotal, (value) => onPatch((item) => ({ ...item, stats: { ...item.stats, achievementTotal: value ? Number(value) : undefined } })), "number")}</div> : record.stats.achievementMode === "percentage" ? field(locale === "zh" ? "完成百分比" : "Percentage", record.stats.achievementPercent, (value) => onPatch((item) => ({ ...item, stats: { ...item.stats, achievementPercent: value ? Number(value) : undefined } })), "number") : null}{field(locale === "zh" ? "付费金额" : "Paid amount", record.stats.paidAmount?.amount, (value) => onPatch((item) => ({ ...item, stats: { ...item.stats, paidAmount: value ? { amount: Number(value), currency: item.stats.paidAmount?.currency ?? "" } : undefined } })), "number")}{record.stats.paidAmount ? field(locale === "zh" ? "货币（CNY / AUD / USD）" : "Currency (CNY / AUD / USD)", record.stats.paidAmount.currency, (value) => onPatch((item) => ({ ...item, stats: { ...item.stats, paidAmount: item.stats.paidAmount ? { ...item.stats.paidAmount, currency: value.toUpperCase() } : undefined } }))) : null}</section>
    <section>
      <p className="text-xs text-softWhite/52">{locale === "zh" ? "自定义标签（中英独立）" : "Custom tags (independent locales)"}</p>
      <div className="mt-3 space-y-2">
        {record.presentation.tags.map((tag, index) => (
          <div key={tag.id} className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <input value={tag.zh} maxLength={24} onChange={(event) => onPatch((item) => ({ ...item, presentation: { ...item.presentation, tags: item.presentation.tags.map((entry) => entry.id === tag.id ? { ...entry, zh: event.target.value } : entry) } }))} className="rounded bg-[#0d143f] px-3 py-2 text-sm text-softWhite" placeholder="中文" />
            <input value={tag.en} maxLength={32} onChange={(event) => onPatch((item) => ({ ...item, presentation: { ...item.presentation, tags: item.presentation.tags.map((entry) => entry.id === tag.id ? { ...entry, en: event.target.value } : entry) } }))} className="rounded bg-[#0d143f] px-3 py-2 text-sm text-softWhite" placeholder="English" />
            <span className="flex">
              <button type="button" disabled={index === 0} onClick={() => onPatch((item) => ({ ...item, presentation: { ...item.presentation, tags: move(item.presentation.tags, index, index - 1) } }))} className="p-2 text-softWhite/45 disabled:opacity-20"><ArrowUp className="h-4 w-4" /></button>
              <button type="button" disabled={index === record.presentation.tags.length - 1} onClick={() => onPatch((item) => ({ ...item, presentation: { ...item.presentation, tags: move(item.presentation.tags, index, index + 1) } }))} className="p-2 text-softWhite/45 disabled:opacity-20"><ArrowDown className="h-4 w-4" /></button>
              <button type="button" onClick={() => onPatch((item) => ({ ...item, presentation: { ...item.presentation, tags: item.presentation.tags.filter((entry) => entry.id !== tag.id), homepageTagIds: (item.presentation.homepageTagIds ?? []).filter((id) => id !== tag.id) } }))} className="p-2 text-softWhite/45"><X className="h-4 w-4" /></button>
            </span>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => onPatch((item) => ({ ...item, presentation: { ...item.presentation, tags: [...item.presentation.tags, { id: `${item.id}-tag-${crypto.randomUUID()}`, zh: "", en: "" }] } }))} className="mt-3 inline-flex items-center gap-2 text-xs text-acidGreen"><Plus className="h-4 w-4" />{locale === "zh" ? "添加标签" : "Add tag"}</button>

      <div className="mt-6 border-t border-softWhite/10 pt-5">
        <p className="text-xs font-semibold text-softWhite">{locale === "zh" ? "首页显示标签" : "Homepage tags"}</p>
        <p className="mt-1 text-xs leading-5 text-softWhite/42">{locale === "zh" ? "选择并排序 2–4 个标签；完整标签仍保留在游戏记录中。" : "Choose and order 2–4 tags. Full-record tags remain unchanged."}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {record.presentation.tags.map((tag) => {
            const selectedIds = record.presentation.homepageTagIds ?? [];
            const selected = selectedIds.includes(tag.id);
            const disabled = !selected && selectedIds.length >= 4;
            return <button type="button" key={tag.id} disabled={disabled} onClick={() => onPatch((item) => ({ ...item, presentation: { ...item.presentation, homepageTagIds: selected ? (item.presentation.homepageTagIds ?? []).filter((id) => id !== tag.id) : [...(item.presentation.homepageTagIds ?? []), tag.id] } }))} className={`rounded-full px-3 py-2 text-xs transition disabled:opacity-25 ${selected ? "bg-acidGreen text-deepIndigo" : "bg-softWhite/[0.06] text-softWhite/58"}`}>{locale === "zh" ? tag.zh || tag.en : tag.en || tag.zh}</button>;
          })}
        </div>
        <div className="mt-3 space-y-1">
          {(record.presentation.homepageTagIds ?? []).map((tagId, index, ids) => {
            const tag = record.presentation.tags.find((item) => item.id === tagId);
            if (!tag) return null;
            return <div key={tagId} className="flex items-center justify-between rounded bg-softWhite/[0.035] px-3 py-2 text-xs text-softWhite/62"><span>{locale === "zh" ? tag.zh || tag.en : tag.en || tag.zh}</span><span><button type="button" disabled={index === 0} onClick={() => onPatch((item) => ({ ...item, presentation: { ...item.presentation, homepageTagIds: move(item.presentation.homepageTagIds ?? [], index, index - 1) } }))} className="p-1.5 disabled:opacity-20"><ArrowUp className="h-3.5 w-3.5" /></button><button type="button" disabled={index === ids.length - 1} onClick={() => onPatch((item) => ({ ...item, presentation: { ...item.presentation, homepageTagIds: move(item.presentation.homepageTagIds ?? [], index, index + 1) } }))} className="p-1.5 disabled:opacity-20"><ArrowDown className="h-3.5 w-3.5" /></button></span></div>;
          })}
        </div>
      </div>
    </section>
    <section className="grid gap-5 md:grid-cols-2"><div className="space-y-4"><h4 className="font-display text-xl text-softWhite">中文反思</h4>{area("为什么游玩", record.reflection.whyPlayedZh, (value) => patchReflection("whyPlayedZh", value), { target: "建议 30–60 字，一句说明游玩背景。" })}{area("优点", record.reflection.strengthsZh, (value) => patchReflection("strengthsZh", value), { target: "建议 60–90 字，只保留 1–2 个关键观察", warningMax: 120 })}{area("缺点", record.reflection.weaknessesZh, (value) => patchReflection("weaknessesZh", value), { target: "建议 60–90 字，只保留 1–2 个关键观察", warningMax: 120 })}{area("对我的帮助", record.reflection.contributionZh, (value) => patchReflection("contributionZh", value), { target: "建议 80–140 字，聚焦主要设计结论。" })}</div><div className="space-y-4"><h4 className="font-display text-xl text-softWhite">English reflection</h4>{area("Why I played", record.reflection.whyPlayedEn, (value) => patchReflection("whyPlayedEn", value))}{area("Strengths", record.reflection.strengthsEn, (value) => patchReflection("strengthsEn", value))}{area("Weaknesses", record.reflection.weaknessesEn, (value) => patchReflection("weaknessesEn", value))}{area("What I learned", record.reflection.contributionEn, (value) => patchReflection("contributionEn", value))}</div></section>
  </div>;
}
