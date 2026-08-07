import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { ImageUp, RotateCcw, Save, X } from "lucide-react";
import { useProjectCover } from "../hooks/useProjectCover";
import { removeProjectCover } from "../lib/projectCoverDb";
import {
  commitProjectCover,
  decodeProjectCover,
  stageProjectCover,
} from "../lib/portfolioContentClient";
import { useLocale } from "../locales/LocaleContext";
import type { Locale } from "../locales/types";

type ProjectCoverEditorProps = {
  projectId: string;
  locale: Locale;
  fallbackImage: string;
  variant?: "full" | "compact";
};

type SaveState = "idle" | "saving" | "saved" | "error";

const MAX_COVER_FILE_SIZE = 8 * 1024 * 1024;
const ACCEPTED_COVER_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

const coverCopy = {
  zh: {
    title: "修改封面",
    current: "当前封面",
    helper: "这张图片由项目 ID 统一管理，用于首页、Work 列表和项目详情。",
    choose: "选择图片",
    save: "保存",
    cancel: "取消",
    restore: "恢复默认封面",
    localOverride: "本地覆盖已启用",
    sharedFallback: "使用发布或目录默认封面",
    pending: "尚未保存",
    writing: "正在写入本地项目目录",
    savedToProject: "已保存到本地项目目录",
    saveFailed: "保存失败",
    confirmRestore: "恢复目录默认封面？当前本地封面记录将被移除。",
    empty: "暂无封面",
  },
  en: {
    title: "Edit cover",
    current: "Current cover",
    helper: "This image is keyed by project ID and shared by the homepage, Work list, and project detail.",
    choose: "Choose image",
    save: "Save",
    cancel: "Cancel",
    restore: "Restore default cover",
    localOverride: "Local override active",
    sharedFallback: "Using published or catalog fallback",
    pending: "Not saved",
    writing: "Writing to the local project directory",
    savedToProject: "Saved to the local project directory",
    saveFailed: "Save failed",
    confirmRestore: "Restore the catalog fallback? The current local cover record will be removed.",
    empty: "No cover",
  },
};

export function ProjectCoverEditor({
  projectId,
  locale,
  fallbackImage,
  variant = "full",
}: ProjectCoverEditorProps) {
  const { messages } = useLocale();
  const copy = coverCopy[locale];
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { image, hasLocalCover, source } = useProjectCover(projectId, fallbackImage);
  const [candidateFile, setCandidateFile] = useState<File | null>(null);
  const [candidateUrl, setCandidateUrl] = useState("");
  const [previewFailed, setPreviewFailed] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!candidateFile) {
      setCandidateUrl("");
      return undefined;
    }
    const objectUrl = URL.createObjectURL(candidateFile);
    setCandidateUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [candidateFile]);

  const previewSource = candidateUrl || image;
  const hasPreview = Boolean(previewSource) && !previewFailed;

  useEffect(() => setPreviewFailed(false), [previewSource]);

  if (!import.meta.env.DEV) return null;

  const chooseFile = () => {
    setError("");
    inputRef.current?.click();
  };

  const selectCandidate = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!ACCEPTED_COVER_TYPES.has(file.type)) {
      setError(messages.homeEditor.unsupportedFile);
      setSaveState("error");
      return;
    }
    if (file.size > MAX_COVER_FILE_SIZE) {
      setError(messages.homeEditor.fileTooLarge);
      setSaveState("error");
      return;
    }

    setError("");
    setSaveState("idle");
    setCandidateFile(file);
  };

  const cancelCandidate = () => {
    setCandidateFile(null);
    setError("");
    setSaveState("idle");
  };

  const saveCandidate = async () => {
    if (!candidateFile) return;
    setError("");
    setSaveState("saving");
    try {
      const staged = await stageProjectCover(candidateFile);
      await decodeProjectCover(staged.publicUrl);
      await commitProjectCover(projectId, staged.commitToken);
      setCandidateFile(null);
      setSaveState("saved");
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : messages.homeEditor.saveError,
      );
      setSaveState("error");
    }
  };

  const restoreFallback = async () => {
    if (!hasLocalCover || !window.confirm(copy.confirmRestore)) return;
    setError("");
    setSaveState("saving");
    try {
      await removeProjectCover(projectId);
      setCandidateFile(null);
      setSaveState("saved");
    } catch {
      setError(messages.homeEditor.saveError);
      setSaveState("error");
    }
  };

  const status = saveState === "saving"
    ? copy.writing
    : saveState === "saved"
      ? copy.savedToProject
      : saveState === "error"
        ? copy.saveFailed
        : "";

  const editorContent = (
    <div className={variant === "full" ? "grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,480px)] lg:items-center" : "grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center"}>
      <div className={variant === "compact" ? "aspect-video overflow-hidden rounded-[8px] border border-softWhite/10 bg-deepIndigo/70 sm:order-none" : "aspect-video overflow-hidden rounded-[12px] border border-softWhite/10 bg-deepIndigo/70 lg:order-2"} data-project-cover-preview>
        {hasPreview ? (
          <img src={previewSource} alt="" className="h-full w-full object-cover" onError={() => setPreviewFailed(true)} />
        ) : (
          <div className="grid h-full place-items-center px-3 text-center font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-softWhite/30">{copy.empty}</div>
        )}
      </div>

      <div className={variant === "full" ? "min-w-0 lg:order-1" : "min-w-0"}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className={variant === "full" ? "font-display text-2xl font-semibold leading-tight text-softWhite md:text-3xl" : "font-display text-base font-semibold text-softWhite"}>{copy.title}</p>
          <span className={`font-mono text-[9px] font-bold uppercase tracking-[0.1em] ${candidateFile ? "text-acidGreen" : hasLocalCover ? "text-electricBlue" : "text-softWhite/36"}`}>
            {candidateFile ? copy.pending : hasLocalCover ? copy.localOverride : copy.sharedFallback}
          </span>
        </div>
        {variant === "full" ? <p className="mt-3 max-w-2xl text-sm leading-7 text-softWhite/62 md:text-base">{copy.helper}</p> : null}
        <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.1em] text-softWhite/34">{copy.current} · {projectId}</p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" className="inline-flex items-center gap-1.5 rounded-full border border-acidGreen/55 bg-acidGreen/10 px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-acidGreen transition hover:bg-acidGreen hover:text-deepIndigo" onClick={chooseFile} data-project-cover-upload>
            <ImageUp className="h-3.5 w-3.5" aria-hidden="true" />
            {copy.choose}
          </button>
          {candidateFile ? (
            <>
              <button type="button" className="inline-flex items-center gap-1.5 rounded-full border border-acidGreen bg-acidGreen px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-deepIndigo transition hover:bg-softWhite" onClick={saveCandidate} disabled={saveState === "saving"}>
                <Save className="h-3.5 w-3.5" aria-hidden="true" />
                {copy.save}
              </button>
              <button type="button" className="inline-flex items-center gap-1.5 rounded-full border border-softWhite/14 px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-softWhite/54 transition hover:text-softWhite" onClick={cancelCandidate}>
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                {copy.cancel}
              </button>
            </>
          ) : null}
          {source === "legacy" && !candidateFile ? (
            <button type="button" className="inline-flex items-center gap-1.5 rounded-full border border-softWhite/14 px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-softWhite/54 transition hover:border-peach/50 hover:text-peach" onClick={restoreFallback} data-project-cover-remove>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              {copy.restore}
            </button>
          ) : null}
          {status ? <span className={`font-mono text-[9px] font-bold uppercase tracking-[0.1em] ${saveState === "error" ? "text-peach" : "text-softWhite/44"}`} aria-live="polite">{status}</span> : null}
        </div>
        {error ? <p className="mt-2 text-xs leading-5 text-peach">{error}</p> : null}
        <input ref={inputRef} className="hidden" type="file" accept="image/png,image/jpeg,image/webp" aria-label={copy.choose} onChange={selectCandidate} />
      </div>
    </div>
  );

  if (variant === "compact") {
    return (
      <div className="mt-3 rounded-[10px] border border-electricBlue/20 bg-archiveBlue/12 p-3" data-project-cover-editor data-project-id={projectId} lang={locale}>
        {editorContent}
      </div>
    );
  }

  return (
    <section className="border-b border-softWhite/10 bg-[#11113a] py-8 md:py-10" data-project-cover-editor data-project-id={projectId} lang={locale}>
      <div className="site-container">
        <div className="rounded-[18px] border border-electricBlue/30 bg-archiveBlue/16 p-5 shadow-archive md:p-6">{editorContent}</div>
      </div>
    </section>
  );
}
