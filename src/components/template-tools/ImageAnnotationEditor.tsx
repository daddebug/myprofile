import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import type { ImageAnnotation } from "./ImageAnnotation";

const inputClass = "w-full rounded-[4px] border border-softWhite/14 bg-deepIndigo/42 px-2.5 py-2 text-xs text-softWhite outline-none focus:border-acidGreen/55";

export function ImageAnnotationEditor({
  locale,
  enabled,
  disabled,
  annotations,
  onEnabledChange,
  onAnnotationsChange,
  onUploadEvidence,
  onRemoveEvidence,
}: {
  locale: "zh" | "en";
  enabled: boolean;
  disabled: boolean;
  annotations: ImageAnnotation[];
  onEnabledChange: (enabled: boolean) => void;
  onAnnotationsChange: (annotations: ImageAnnotation[]) => void;
  onUploadEvidence: (annotationId: string) => void;
  onRemoveEvidence: (annotationId: string, evidenceId: string) => void;
}) {
  const update = (id: string, updater: (annotation: ImageAnnotation) => ImageAnnotation) => {
    onAnnotationsChange(annotations.map((annotation) => annotation.id === id ? updater(annotation) : annotation));
  };
  const add = () => onAnnotationsChange([
    ...annotations,
    {
      id: `annotation-${crypto.randomUUID()}`,
      tag: { zh: "", en: "" },
      title: { zh: "", en: "" },
      explanation: { zh: "", en: "" },
      region: { x: 35, y: 35, width: 30, height: 30 },
      evidenceImages: [],
    },
  ]);

  return (
    <section className="mt-3 rounded-[6px] border border-softWhite/10 bg-deepIndigo/34 p-3" data-exact-export="hide">
      <label className="flex items-center gap-2 text-xs font-semibold text-softWhite/78">
        <input type="checkbox" checked={enabled} disabled={disabled} onChange={(event) => onEnabledChange(event.target.checked)} />
        {locale === "zh" ? "启用图片注释" : "Enable annotation"}
      </label>
      {disabled ? <p className="mt-2 text-xs leading-5 text-peach/80">Image annotation is unavailable while hover enlarge is enabled.</p> : null}
      {!disabled && enabled ? (
        <div className="mt-3 space-y-3">
          {annotations.map((annotation, index) => (
            <div key={annotation.id} className="border-t border-softWhite/10 pt-3 first:border-0 first:pt-0">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-acidGreen">{locale === "zh" ? `注释 ${index + 1}` : `Annotation ${index + 1}`}</span>
                <div className="flex gap-1">
                  <button type="button" aria-label={locale === "zh" ? "上移" : "Move up"} disabled={index === 0} onClick={() => { const next = [...annotations]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; onAnnotationsChange(next); }}><ChevronUp size={15} /></button>
                  <button type="button" aria-label={locale === "zh" ? "下移" : "Move down"} disabled={index === annotations.length - 1} onClick={() => { const next = [...annotations]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; onAnnotationsChange(next); }}><ChevronDown size={15} /></button>
                  <button type="button" className="text-peach" aria-label={locale === "zh" ? "删除注释" : "Delete annotation"} onClick={() => onAnnotationsChange(annotations.filter((item) => item.id !== annotation.id))}><Trash2 size={15} /></button>
                </div>
              </div>
              <div className="grid gap-2 md:grid-cols-[0.75fr_1.25fr]">
                <input className={inputClass} value={annotation.tag?.[locale] ?? ""} placeholder={locale === "zh" ? "小标签 / 关键词" : "Tag / keyword"} onChange={(event) => update(annotation.id, (item) => ({ ...item, tag: { ...(item.tag ?? { zh: "", en: "" }), [locale]: event.target.value } }))} />
                <input className={inputClass} value={annotation.title[locale]} placeholder={locale === "zh" ? "标题" : "Title"} onChange={(event) => update(annotation.id, (item) => ({ ...item, title: { ...item.title, [locale]: event.target.value } }))} />
              </div>
              <input className={`${inputClass} mt-2`} value={annotation.explanation[locale]} placeholder={locale === "zh" ? "一句简短说明" : "Short explanation"} onChange={(event) => update(annotation.id, (item) => ({ ...item, explanation: { ...item.explanation, [locale]: event.target.value } }))} />
              <div className="mt-2 grid grid-cols-4 gap-2">
                {(["x", "y", "width", "height"] as const).map((field) => (
                  <label key={field} className="text-[10px] font-semibold uppercase text-softWhite/46">{field}
                    <input type="number" min="0" max="100" className={`${inputClass} mt-1`} value={annotation.region[field]} onChange={(event) => update(annotation.id, (item) => ({ ...item, region: { ...item.region, [field]: Number(event.target.value) } }))} />
                  </label>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button type="button" className="rounded-[4px] border border-softWhite/14 px-2 py-1 text-xs text-softWhite/72" onClick={() => onUploadEvidence(annotation.id)}>{locale === "zh" ? "+ 添加过程图" : "+ Add evidence image"}</button>
                {annotation.evidenceImages.map((image, evidenceIndex) => (
                  <span key={image.id} className="inline-flex items-center gap-1 text-[11px] text-softWhite/54">
                    {locale === "zh" ? `过程图 ${evidenceIndex + 1}` : `Evidence ${evidenceIndex + 1}`}
                    <button type="button" className="text-peach" aria-label={locale === "zh" ? "删除过程图" : "Remove evidence image"} onClick={() => onRemoveEvidence(annotation.id, image.id)}><Trash2 size={13} /></button>
                  </span>
                ))}
              </div>
            </div>
          ))}
          <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-acidGreen" onClick={add}><Plus size={15} />{locale === "zh" ? "添加注释" : "Add annotation"}</button>
        </div>
      ) : null}
    </section>
  );
}
