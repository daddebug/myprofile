import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Braces, Copy, Sparkles, X } from "lucide-react";
import type { Locale } from "../locales/types";
import {
  applyGameExperienceAiPreviews,
  gameExperienceAiPrompt,
  previewGameExperienceAiImport,
  type GameExperienceAiPreview,
} from "../lib/gameExperienceAiImport";
import type { GameExperienceRecord } from "../lib/gameExperience";

export function GameExperienceAiImportPanel({
  locale,
  records,
  onConfirm,
  onClose,
}: {
  locale: Locale;
  records: GameExperienceRecord[];
  onConfirm: (records: GameExperienceRecord[]) => void;
  onClose: () => void;
}) {
  const [notes, setNotes] = useState("");
  const [response, setResponse] = useState("");
  const [previews, setPreviews] = useState<GameExperienceAiPreview[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const selectedCount = useMemo(() => previews.filter((preview) => selected.has(preview.key)).length, [previews, selected]);

  const organize = async () => {
    setError("");
    if (!notes.trim()) {
      setMessage("");
      setError(locale === "zh" ? "请先输入游戏笔记。" : "Enter your game notes first.");
      return;
    }
    try {
      await navigator.clipboard.writeText(gameExperienceAiPrompt(notes, records));
      setMessage(locale === "zh"
        ? "AI 整理请求已复制。请交给 AI，并把返回的纯 JSON 粘贴到下方。"
        : "The AI organization request was copied. Send it to AI, then paste the returned JSON below.");
    } catch {
      setError(locale === "zh" ? "无法复制 AI 请求，请检查剪贴板权限。" : "Unable to copy the AI request. Check clipboard permission.");
    }
  };

  const validate = () => {
    setError("");
    setMessage("");
    try {
      const next = previewGameExperienceAiImport(JSON.parse(response) as unknown, records);
      setPreviews(next);
      setSelected(new Set(next.map((preview) => preview.key)));
      setMessage(locale === "zh" ? "校验通过。确认前不会修改任何游戏记录。" : "Validation passed. No game record changes before confirmation.");
    } catch (reason) {
      setPreviews([]);
      setSelected(new Set());
      setError(reason instanceof Error ? reason.message : "Invalid Game Experience import JSON.");
    }
  };

  const confirm = () => {
    if (selectedCount === 0) return;
    try {
      onConfirm(applyGameExperienceAiPreviews(records, previews, selected));
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to apply the selected games.");
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[140] overflow-y-auto bg-[#070925]/94 px-4 py-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={locale === "zh" ? "AI 写入游戏经历" : "AI-assisted Game Experience import"}>
      <div className="mx-auto max-w-5xl rounded-lg border border-softWhite/10 bg-[#151d50] p-5 shadow-2xl md:p-7">
        <header className="flex items-start justify-between gap-4 border-b border-softWhite/10 pb-5">
          <div>
            <p className="font-mono text-[10px] font-bold tracking-[0.16em] text-acidGreen">AI-ASSISTED IMPORT</p>
            <h3 className="mt-2 font-display text-3xl font-semibold text-softWhite">{locale === "zh" ? "AI 写入" : "AI-assisted import"}</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-softWhite/55">{locale === "zh" ? "AI 只整理候选 JSON；标题匹配、字段校验和合并由本地规则完成。封面和资源引用永远不会进入 AI 导入。" : "AI only organizes candidate JSON. Local rules control identity matching, validation, and merging. Covers and asset references never enter AI import."}</p>
          </div>
          <button type="button" className="grid h-10 w-10 place-items-center text-softWhite/60 hover:text-softWhite" onClick={onClose} aria-label={locale === "zh" ? "关闭" : "Close"}><X /></button>
        </header>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section>
            <label className="block text-xs text-softWhite/52">
              <span className="mb-2 block">{locale === "zh" ? "自然语言笔记（可包含多个游戏）" : "Free-form notes (one or multiple games)"}</span>
              <textarea rows={14} value={notes} onChange={(event) => setNotes(event.target.value)} className="w-full resize-y rounded bg-[#0d143f] px-4 py-3 text-sm leading-6 text-softWhite outline-none focus:ring-1 focus:ring-acidGreen/55" placeholder={locale === "zh" ? "直接粘贴口述或笔记。只写你真实提到的内容。" : "Paste your spoken or written notes. Include only facts you actually stated."} />
            </label>
            <button type="button" className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-full bg-acidGreen px-5 text-sm font-bold text-deepIndigo" onClick={() => void organize()}><Copy className="h-4 w-4" />{locale === "zh" ? "整理内容" : "Organize content"}</button>
          </section>
          <section>
            <label className="block text-xs text-softWhite/52">
              <span className="mb-2 block">{locale === "zh" ? "AI 返回的结构化 JSON" : "Structured JSON returned by AI"}</span>
              <textarea rows={14} value={response} onChange={(event) => { setResponse(event.target.value); setPreviews([]); setSelected(new Set()); setError(""); }} className="w-full resize-y rounded bg-[#0d143f] px-4 py-3 font-mono text-xs leading-5 text-softWhite outline-none focus:ring-1 focus:ring-acidGreen/55" placeholder={locale === "zh" ? "粘贴 AI 返回的纯 JSON，不要包含 Markdown 代码块。" : "Paste JSON only, without a Markdown code block."} />
            </label>
            <button type="button" className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-full border border-acidGreen/55 px-5 text-sm font-semibold text-acidGreen" onClick={validate}><Braces className="h-4 w-4" />{locale === "zh" ? "校验并预览" : "Validate and preview"}</button>
          </section>
        </div>

        {error ? <p className="mt-5 whitespace-pre-wrap rounded bg-[#4a2540] px-4 py-3 text-sm leading-6 text-[#ffc3cf]" role="alert">{error}</p> : null}
        {message ? <p className="mt-5 rounded bg-[#26345f] px-4 py-3 text-sm leading-6 text-softWhite/76">{message}</p> : null}

        {previews.length ? <section className="mt-7 border-t border-softWhite/10 pt-6">
          <div className="grid gap-4">
            {previews.map((preview) => <article key={preview.key} className="rounded-lg border border-softWhite/10 bg-softWhite/[0.035] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><span className={`inline-flex rounded-full px-2.5 py-1 font-mono text-[10px] font-bold ${preview.classification === "NEW" ? "bg-electricBlue/18 text-electricBlue" : "bg-acidGreen/14 text-acidGreen"}`}>{preview.classification === "NEW" ? "NEW" : "UPDATE EXISTING"}</span><h4 className="mt-2 font-display text-xl font-semibold text-softWhite">{preview.title}</h4></div>
                <label className="inline-flex items-center gap-2 text-xs text-softWhite/70"><input type="checkbox" checked={selected.has(preview.key)} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(preview.key); else next.delete(preview.key); return next; })} />{locale === "zh" ? "应用" : "Apply"}</label>
              </div>
              <p className="mt-3 text-xs leading-5 text-softWhite/54"><strong className="text-softWhite/75">{locale === "zh" ? "将变化：" : "Changes: "}</strong>{preview.changedFields.length ? preview.changedFields.join(" · ") : (locale === "zh" ? "没有有效变化" : "No effective changes")}</p>
              {preview.classification === "UPDATE" && preview.textMerges.length ? <div className="mt-4 space-y-4">{preview.textMerges.map((merge) => <div key={merge.field}><p className="mb-2 font-mono text-[10px] text-softWhite/48">{merge.field}</p><div className="grid gap-3 md:grid-cols-3"><PreviewText label="OLD" value={merge.oldValue} empty={locale === "zh" ? "原内容为空" : "No existing copy"} /><PreviewText label="NEW INPUT" value={merge.newValue} empty={locale === "zh" ? "本次没有补充" : "No new input"} /><PreviewText label="MERGED RESULT" value={merge.mergedValue} empty={locale === "zh" ? "合并结果为空" : "No merged result"} /></div></div>)}</div> : null}
              {preview.warnings.length ? <div className="mt-4 rounded bg-[#4a3b25] px-3 py-2 text-xs leading-5 text-[#ffe2a9]">{preview.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div> : null}
              <p className="mt-3 text-[11px] text-softWhite/38">{locale === "zh" ? "封面、图片 ID 和资源路径不在本次变更范围内。" : "Covers, image IDs, and asset paths are outside this change."}</p>
            </article>)}
          </div>
          <div className="mt-5 flex justify-end gap-3 border-t border-softWhite/10 pt-5">
            <button type="button" className="rounded-full border border-softWhite/20 px-5 py-2.5 text-sm text-softWhite" onClick={onClose}>{locale === "zh" ? "取消" : "Cancel"}</button>
            <button type="button" disabled={selectedCount === 0} className="inline-flex items-center gap-2 rounded-full bg-acidGreen px-5 py-2.5 text-sm font-bold text-deepIndigo disabled:opacity-40" onClick={confirm}><Sparkles className="h-4 w-4" />{locale === "zh" ? `确认写入选中项目（${selectedCount}）` : `Apply selected games (${selectedCount})`}</button>
          </div>
        </section> : null}
      </div>
    </div>,
    document.body,
  );
}

function PreviewText({ label, value, empty }: { label: string; value: string; empty: string }) {
  return <div className="rounded bg-[#0d143f] p-3"><p className="font-mono text-[9px] font-bold tracking-[0.12em] text-acidGreen">{label}</p><p className={`mt-2 whitespace-pre-wrap text-xs leading-5 ${value ? "text-softWhite/72" : "text-softWhite/30"}`}>{value || empty}</p></div>;
}
