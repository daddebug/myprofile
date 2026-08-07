import { useEffect, useRef, useState } from "react";
import { FileUp, Trash2 } from "lucide-react";
import { getProjectBodyAsset } from "../../lib/projectBodyAssetDb";

const ACCEPTED_MEDIA = new Set(["image/png", "image/jpeg", "image/webp", "image/avif", "image/gif"]);
const MAX_MEDIA_SIZE = 20 * 1024 * 1024;

/**
 * Resolves an already-uploaded project-body asset (or a not-yet-saved
 * pending File, or a published static publicPath fallback) into a
 * displayable object URL. Shared by every block editor's image preview so
 * they all read from the same asset store the same way.
 */
export function useResolvedAssetSource(assetId: string | undefined, publicPath: string | undefined, pendingFile: File | undefined) {
  const [source, setSource] = useState(publicPath ?? "");
  useEffect(() => {
    let url = "";
    if (pendingFile) {
      url = URL.createObjectURL(pendingFile);
      setSource(url);
      return () => URL.revokeObjectURL(url);
    }
    if (publicPath?.startsWith("/portfolio-assets/project-body/")) {
      setSource(publicPath);
      return undefined;
    }
    if (!assetId) {
      setSource(publicPath ?? "");
      return undefined;
    }
    let cancelled = false;
    getProjectBodyAsset(assetId)
      .then((record) => {
        if (!cancelled && record) {
          url = URL.createObjectURL(record.blob);
          setSource(url);
        } else if (!cancelled) setSource(publicPath ?? "");
      })
      .catch(() => setSource(publicPath ?? ""));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [assetId, publicPath, pendingFile]);
  return source;
}

export function isAcceptedImageFile(file: File) {
  return ACCEPTED_MEDIA.has(file.type) && file.size <= MAX_MEDIA_SIZE;
}

/**
 * Single shared upload/replace/remove control with preview, used by every
 * template that needs an image (media figures, Figma prototype poster,
 * project covers, etc.) so there is exactly one upload UI in the editor,
 * not one per template.
 */
export function ImageAssetUploader({
  source,
  onFile,
  onRemove,
  chooseLabel = "Choose image",
  replaceLabel = "Replace image",
  removeLabel = "Remove image",
  previewClassName = "aspect-video w-full",
  showPreview = true,
}: {
  source: string;
  onFile: (file: File) => void;
  onRemove?: () => void;
  chooseLabel?: string;
  replaceLabel?: string;
  removeLabel?: string;
  previewClassName?: string;
  showPreview?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="grid gap-3">
      {showPreview ? (
        <div className={`${previewClassName} overflow-hidden rounded-[8px] border border-softWhite/10 bg-deepIndigo/40`}>
          {source ? (
            <img src={source} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full place-items-center text-xs text-softWhite/30">No image yet</div>
          )}
        </div>
      ) : null}
      <input
        ref={input}
        className="hidden"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          if (!isAcceptedImageFile(file)) return;
          onFile(file);
        }}
      />
      <div className="flex flex-wrap gap-2">
        <button type="button" className="editor-action" onClick={() => input.current?.click()}>
          <FileUp className="h-3.5 w-3.5" />
          {source ? replaceLabel : chooseLabel}
        </button>
        {onRemove ? (
          <button type="button" className="editor-action text-peach" onClick={onRemove}>
            <Trash2 className="h-3.5 w-3.5" />
            {removeLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
