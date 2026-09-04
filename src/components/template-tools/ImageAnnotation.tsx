import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import "./image-annotation.css";

export type LocalizedAnnotationText = { zh: string; en: string };

export type AnnotationEvidenceImage = {
  id: string;
  imageId?: string;
  publicPath?: string;
};

export type ImageAnnotation = {
  id: string;
  tag?: LocalizedAnnotationText;
  title: LocalizedAnnotationText;
  explanation: LocalizedAnnotationText;
  region: { x: number; y: number; width: number; height: number };
  evidenceImages: AnnotationEvidenceImage[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeLocalizedText(value: unknown): LocalizedAnnotationText {
  if (!isRecord(value)) return { zh: "", en: "" };
  return {
    zh: typeof value.zh === "string" ? value.zh : "",
    en: typeof value.en === "string" ? value.en : "",
  };
}

export function normalizeImageAnnotations(value: unknown): ImageAnnotation[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!isRecord(candidate) || typeof candidate.id !== "string" || !isRecord(candidate.region)) return [];
    const { x, y, width, height } = candidate.region;
    if (
      typeof x !== "number" || !Number.isFinite(x)
      || typeof y !== "number" || !Number.isFinite(y)
      || typeof width !== "number" || !Number.isFinite(width)
      || typeof height !== "number" || !Number.isFinite(height)
    ) return [];
    const evidenceImages = Array.isArray(candidate.evidenceImages)
      ? candidate.evidenceImages.flatMap((image) => {
          if (!isRecord(image) || typeof image.id !== "string") return [];
          return [{
            id: image.id,
            ...(typeof image.imageId === "string" ? { imageId: image.imageId } : {}),
            ...(typeof image.publicPath === "string" ? { publicPath: image.publicPath } : {}),
          }];
        })
      : [];
    return [{
      id: candidate.id,
      tag: normalizeLocalizedText(candidate.tag),
      title: normalizeLocalizedText(candidate.title),
      explanation: normalizeLocalizedText(candidate.explanation),
      region: { x, y, width, height },
      evidenceImages,
    }];
  });
}

function localized(value: LocalizedAnnotationText | undefined, locale: "zh" | "en") {
  return value?.[locale]?.trim() || value?.[locale === "zh" ? "en" : "zh"]?.trim() || "";
}

function clampRegion(region: ImageAnnotation["region"]) {
  const width = Math.max(4, Math.min(100, region.width));
  const height = Math.max(4, Math.min(100, region.height));
  return {
    x: Math.max(0, Math.min(100 - width, region.x)),
    y: Math.max(0, Math.min(100 - height, region.y)),
    width,
    height,
  };
}

export function ImageAnnotationLayer({
  annotations,
  locale,
  enabled,
}: {
  annotations: ImageAnnotation[];
  locale: "zh" | "en";
  enabled: boolean;
}) {
  const available = annotations.filter((annotation) => annotation.evidenceImages.some((image) => image.publicPath));
  const [hoveredId, setHoveredId] = useState("");
  const [openId, setOpenId] = useState("");
  const [evidenceIndex, setEvidenceIndex] = useState(0);
  const active = available.find((annotation) => annotation.id === openId);
  const activeIndex = available.findIndex((annotation) => annotation.id === openId);
  const evidence = active?.evidenceImages.filter((image) => image.publicPath) ?? [];

  useEffect(() => {
    if (!enabled) {
      setHoveredId("");
      setOpenId("");
    }
  }, [enabled]);

  useEffect(() => {
    if (!openId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenId("");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openId]);

  if (!enabled || available.length === 0) return null;

  return (
    <>
      <div className="image-annotation-layer" data-exact-export="hide">
        {available.map((annotation, index) => {
          const region = clampRegion(annotation.region);
          const focused = hoveredId === annotation.id;
          return (
            <button
              key={annotation.id}
              type="button"
              className={`image-annotation-hotspot ${focused ? "image-annotation-hotspot--focused" : ""}`}
              style={{ left: `${region.x}%`, top: `${region.y}%`, width: `${region.width}%`, height: `${region.height}%` }}
              aria-label={localized(annotation.title, locale) || `${locale === "zh" ? "注释" : "Annotation"} ${index + 1}`}
              onMouseEnter={() => setHoveredId(annotation.id)}
              onMouseLeave={() => setHoveredId("")}
              onFocus={() => setHoveredId(annotation.id)}
              onBlur={() => setHoveredId("")}
              onClick={() => {
                setEvidenceIndex(0);
                setOpenId(annotation.id);
              }}
            >
              <span>{index + 1}</span>
            </button>
          );
        })}
      </div>
      {active && typeof document !== "undefined" ? createPortal(
        <div className="image-annotation-detail-root" data-exact-export="hide">
          <button type="button" className="image-annotation-detail-dismiss" aria-label={locale === "zh" ? "关闭注释" : "Close annotation"} onClick={() => setOpenId("")} />
          <aside className="image-annotation-detail" aria-label={locale === "zh" ? "图片注释详情" : "Image annotation detail"}>
            <button type="button" className="image-annotation-detail-close" aria-label={locale === "zh" ? "关闭" : "Close"} onClick={() => setOpenId("")}>
              <X size={18} />
            </button>
            <p className="image-annotation-detail-label">{localized(active.tag, locale) || (locale === "zh" ? "设计注释" : "DESIGN NOTE")}</p>
            <h3>{localized(active.title, locale)}</h3>
            {localized(active.explanation, locale) ? <p>{localized(active.explanation, locale)}</p> : null}
            {evidence.length ? (
              <div className="image-annotation-evidence">
                <img src={evidence[evidenceIndex]?.publicPath} alt={localized(active.title, locale)} />
                {evidence.length > 1 ? (
                  <div className="image-annotation-evidence-nav">
                    <button type="button" aria-label={locale === "zh" ? "上一张" : "Previous image"} onClick={() => setEvidenceIndex((index) => (index - 1 + evidence.length) % evidence.length)}><ChevronLeft size={18} /></button>
                    <span>{evidenceIndex + 1} / {evidence.length}</span>
                    <button type="button" aria-label={locale === "zh" ? "下一张" : "Next image"} onClick={() => setEvidenceIndex((index) => (index + 1) % evidence.length)}><ChevronRight size={18} /></button>
                  </div>
                ) : null}
              </div>
            ) : null}
            {available.length > 1 ? (
              <div className="image-annotation-switcher">
                <button type="button" onClick={() => { setEvidenceIndex(0); setOpenId(available[(activeIndex - 1 + available.length) % available.length].id); }}><ChevronLeft size={16} />{locale === "zh" ? "上一条" : "Previous"}</button>
                <button type="button" onClick={() => { setEvidenceIndex(0); setOpenId(available[(activeIndex + 1) % available.length].id); }}>{locale === "zh" ? "下一条" : "Next"}<ChevronRight size={16} /></button>
              </div>
            ) : null}
          </aside>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
