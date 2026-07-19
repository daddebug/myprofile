import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { ImageUp, Trash2 } from "lucide-react";
import { getProjectBySlug } from "../data/projects";
import { useProjectCover } from "../hooks/useProjectCover";
import { removeProjectCover, setProjectCover } from "../lib/projectCoverDb";
import { useLocale } from "../locales/LocaleContext";
import type { Locale } from "../locales/types";

type ProjectCoverEditorProps = {
  projectId: string;
  locale: Locale;
};

type SaveState = "idle" | "saving" | "saved" | "error";

const MAX_COVER_FILE_SIZE = 20 * 1024 * 1024;
const ACCEPTED_COVER_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/avif"]);

export function ProjectCoverEditor({ projectId, locale }: ProjectCoverEditorProps) {
  const { messages } = useLocale();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const fallbackImage = getProjectBySlug(projectId)?.cover ?? "";
  const { image, hasLocalCover } = useProjectCover(projectId, fallbackImage);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState("");
  const hasPreview = Boolean(image) && !previewFailed;

  useEffect(() => setPreviewFailed(false), [image]);

  const chooseFile = () => {
    setError("");
    inputRef.current?.click();
  };

  const uploadCover = async (event: ChangeEvent<HTMLInputElement>) => {
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
    setSaveState("saving");
    try {
      await setProjectCover(projectId, file);
      setSaveState("saved");
    } catch {
      setError(messages.homeEditor.saveError);
      setSaveState("error");
    }
  };

  const removeCover = async () => {
    if (!hasLocalCover || !window.confirm(messages.homeEditor.confirmRemove)) return;

    setError("");
    setSaveState("saving");
    try {
      await removeProjectCover(projectId);
      setSaveState("saved");
    } catch {
      setError(messages.homeEditor.saveError);
      setSaveState("error");
    }
  };

  const status = saveState === "saving"
    ? messages.homeEditor.saving
    : saveState === "saved"
      ? messages.homeEditor.savedLocally
      : saveState === "error"
        ? messages.homeEditor.saveError
        : "";

  return (
    <section
      className="border-b border-softWhite/10 bg-[#11113a] py-8 md:py-10"
      data-project-cover-editor
      data-project-id={projectId}
      lang={locale}
    >
      <div className="site-container">
        <div className="rounded-[18px] border border-electricBlue/30 bg-archiveBlue/16 p-5 shadow-archive md:p-6">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,480px)] lg:items-center">
            <div className="min-w-0">
              <p className="font-display text-2xl font-semibold leading-tight text-softWhite md:text-3xl">
                {messages.homeEditor.homepageCoverTitle}
              </p>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-softWhite/62 md:text-base">
                {messages.homeEditor.homepageCoverHelper}
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full border border-acidGreen/55 bg-acidGreen/10 px-4 py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-acidGreen transition hover:bg-acidGreen hover:text-deepIndigo focus-visible:outline focus-visible:outline-2 focus-visible:outline-acidGreen"
                  onClick={chooseFile}
                  data-project-cover-upload
                >
                  <ImageUp className="h-4 w-4" aria-hidden="true" />
                  {hasPreview ? messages.homeEditor.replaceCover : messages.homeEditor.uploadCover}
                </button>
                {hasLocalCover ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-full border border-softWhite/16 px-4 py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-softWhite/64 transition hover:border-peach/55 hover:text-peach focus-visible:outline focus-visible:outline-2 focus-visible:outline-peach"
                    onClick={removeCover}
                    data-project-cover-remove
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    {messages.homeEditor.removeCover}
                  </button>
                ) : null}
                {status ? (
                  <span className={`font-mono text-[10px] font-bold uppercase tracking-[0.12em] ${saveState === "error" ? "text-peach" : "text-softWhite/46"}`} aria-live="polite">
                    {status}
                  </span>
                ) : null}
              </div>
              {error ? <p className="mt-3 text-sm leading-6 text-peach">{error}</p> : null}
              <input
                ref={inputRef}
                className="hidden"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/avif"
                aria-label={hasPreview ? messages.homeEditor.replaceCover : messages.homeEditor.uploadCover}
                onChange={uploadCover}
              />
            </div>

            <div className="aspect-video overflow-hidden rounded-[12px] border border-softWhite/10 bg-deepIndigo/70" data-project-cover-preview>
              {hasPreview ? (
                <img
                  src={image}
                  alt=""
                  className="h-full w-full object-cover"
                  onError={() => setPreviewFailed(true)}
                />
              ) : (
                <div className="grid h-full place-items-center text-center font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-softWhite/30">
                  {messages.homeEditor.emptyCover}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
