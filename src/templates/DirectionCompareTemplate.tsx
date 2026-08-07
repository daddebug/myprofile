import { useState } from "react";
import { InlineTemplateField } from "../components/template-tools/InlineTemplateField";
import { FloatingImagePreview } from "../components/template-tools/FloatingImagePreview";
import {
  TemplateContent,
  TemplateSurface,
} from "../components/template-tools/TemplateResponsiveFoundation";
import type {
  TemplateLayoutControlDefinition,
  TemplateMeta,
  TemplateProps,
} from "../lib/templateLibrary";
import { isCollectionExportCapture } from "../lib/collectionExportStaging";
import { recordEmptySlotCollapsed, recordEmptySlotFound } from "../lib/collectionMediaDiagnostics";
import "./direction-compare-template.css";

type LocalizedText = { zh: string; en: string };
type CompareImage = { imageId?: string; publicPath?: string; hoverPreviewMode?: "none" | "floating" };
type CompareSide = "left" | "right";
type Direction = "left-to-right" | "right-to-left" | "none";
type DirectionCompareEditor = NonNullable<NonNullable<TemplateProps["inlineEditor"]>["directionCompare"]> & {
  status?: string;
};

export const layoutControlSchema: TemplateLayoutControlDefinition[] = [];

export const templateMeta: TemplateMeta = {
  id: "direction-compare",
  nameZh: "前后 / 方案对比",
  nameEn: "Before / Direction Compare",
  descriptionZh: "并列比较两个方向、方案或优化前后的关键界面。",
  descriptionEn: "Compare two directions, proposals, or before-and-after outcomes.",
  schema: [
    { id: "heading", labelZh: "顶部标题", labelEn: "Heading", type: "text" },
    { id: "leftLabel", labelZh: "左侧标签", labelEn: "Left label", type: "text" },
    { id: "rightLabel", labelZh: "右侧标签", labelEn: "Right label", type: "text" },
    { id: "leftTitle", labelZh: "左侧标题", labelEn: "Left title", type: "text" },
    { id: "rightTitle", labelZh: "右侧标题", labelEn: "Right title", type: "text" },
    { id: "leftDescription", labelZh: "左侧说明", labelEn: "Left description", type: "textarea" },
    { id: "rightDescription", labelZh: "右侧说明", labelEn: "Right description", type: "textarea" },
    { id: "leftImage", labelZh: "左侧图片", labelEn: "Left image", type: "image" },
    { id: "rightImage", labelZh: "右侧图片", labelEn: "Right image", type: "image" },
    { id: "direction", labelZh: "方向", labelEn: "Direction", type: "select" },
  ],
  createdAt: "2026-08-03T00:00:12.000Z",
};

function localized(value: unknown, locale: "zh" | "en") {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const text = (value as LocalizedText)[locale];
  return typeof text === "string" ? text : "";
}

function imageValue(value: unknown): CompareImage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const image = value as CompareImage;
  return typeof image.publicPath === "string" && image.publicPath ? image : null;
}

function directionValue(value: unknown): Direction {
  return value === "right-to-left" || value === "none" ? value : "left-to-right";
}

function CompareUnit({
  side,
  content,
  locale,
  inlineEditor,
}: {
  side: CompareSide;
  content: TemplateProps["content"];
  locale: "zh" | "en";
  inlineEditor: TemplateProps["inlineEditor"];
}) {
  const capitalized = side === "left" ? "left" : "right";
  const labelField = `${capitalized}Label`;
  const titleField = `${capitalized}Title`;
  const descriptionField = `${capitalized}Description`;
  const imageField = `${capitalized}Image`;
  const label = localized(content[labelField], locale);
  const title = localized(content[titleField], locale);
  const description = localized(content[descriptionField], locale);
  const image = imageValue(content[imageField]);
  const editor = inlineEditor?.directionCompare as DirectionCompareEditor | undefined;

  // Raw-data classification, not just "did this component manage to
  // resolve a displayable image": imageValue() above only counts a
  // publicPath, but an imageId with no (yet) resolved publicPath is still
  // a real reference — a staging/decode failure, never silently treated as
  // an empty slot. Only when NEITHER field is present is this genuinely
  // empty.
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const rawImage = content[imageField] as { imageId?: string; publicPath?: string } | undefined;
  const hasImageReference = Boolean(rawImage?.imageId || rawImage?.publicPath);
  const mediaSlotState = image ? (imageLoadFailed ? "failed" : "filled") : hasImageReference ? "failed" : "empty";
  const mediaSlotId = `direction-compare-${side}:${title || label || "untitled"}`;
  const captureMode = isCollectionExportCapture();
  const suppressEmptyImageShell = mediaSlotState === "empty" && captureMode;
  if (suppressEmptyImageShell) {
    recordEmptySlotFound(mediaSlotId);
    recordEmptySlotCollapsed(mediaSlotId);
  }

  // A genuinely empty side (no image reference at all) must not reserve
  // the image-shell's fixed 16:9 aspect-ratio height with a dashed-border
  // blank box in the exported collection PDF — but only in capture mode;
  // the normal owner/editor view keeps showing it exactly as before, and a
  // "failed" slot (a reference that didn't resolve) still renders its
  // placeholder and still aborts the export server-side.
  if (suppressEmptyImageShell) {
    return (
      <article className={`direction-compare__unit direction-compare__unit--${side}`}>
        <div className="direction-compare__copy">
          {title ? <h3 className="direction-compare__title">{title}</h3> : null}
          {description ? <p className="direction-compare__description">{description}</p> : null}
        </div>
      </article>
    );
  }

  return (
    <article className={`direction-compare__unit direction-compare__unit--${side}`}>
      <div className="direction-compare__image-shell" data-media-slot-state={mediaSlotState} data-media-slot-id={mediaSlotId}>
        {(label || inlineEditor) ? (
          <div className="direction-compare__label">
            {inlineEditor ? (
              <InlineTemplateField
                value={label}
                onChange={(value) => inlineEditor.onLocalizedTextChange(labelField, value)}
                ariaLabel={locale === "zh" ? `${side === "left" ? "左" : "右"}侧标签` : `${side} label`}
                placeholder={locale === "zh" ? "标签" : "Label"}
                className="direction-compare__label-input"
              />
            ) : label}
          </div>
        ) : null}

        {image ? (
          <FloatingImagePreview src={image.publicPath ?? ""} alt={title || label} enabled={image.hoverPreviewMode === "floating"} resetKey={Boolean(inlineEditor)} imageDisplayMode="cover" imageCropRatio="16:9">
            {({ onMouseEnter, onMouseLeave, previewActive }) => (
              <img
                className={`direction-compare__image ${previewActive ? "floating-preview-trigger--active" : ""}`}
                src={image.publicPath}
                alt={title || label}
                loading="lazy"
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
                onError={() => setImageLoadFailed(true)}
              />
            )}
          </FloatingImagePreview>
        ) : inlineEditor ? (
          <button type="button" className="direction-compare__empty" onClick={() => editor?.onUploadImage(side)}>
            <span>{locale === "zh" ? "待补对比图片" : "Comparison image to add"}</span>
            <strong>{locale === "zh" ? "+ 上传图片" : "+ Upload image"}</strong>
          </button>
        ) : (
          <div className="direction-compare__empty direction-compare__empty--display" aria-hidden="true" />
        )}

        {inlineEditor && image ? (
          <div className="direction-compare__image-actions">
            <button type="button" onClick={() => editor?.onUploadImage(side)}>{locale === "zh" ? "替换" : "Replace"}</button>
            <button type="button" className="direction-compare__remove" onClick={() => editor?.onRemoveImage(side)}>{locale === "zh" ? "删除" : "Remove"}</button>
            <span className="direction-compare__preview-label">{locale === "zh" ? "悬停预览" : "Hover"}</span>
            {(["none", "floating"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className={image.hoverPreviewMode === mode || (mode === "none" && image.hoverPreviewMode !== "floating") ? "is-active" : ""}
                onClick={() => editor?.onImageSettingChange(side, { hoverPreviewMode: mode })}
              >
                {locale === "zh" ? ({ none: "关闭", floating: "漂浮" } as const)[mode] : ({ none: "Off", floating: "Float" } as const)[mode]}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="direction-compare__copy">
        {inlineEditor ? (
          <InlineTemplateField
            value={title}
            onChange={(value) => inlineEditor.onLocalizedTextChange(titleField, value)}
            ariaLabel={locale === "zh" ? `${side === "left" ? "左" : "右"}侧标题` : `${side} title`}
            placeholder={locale === "zh" ? "方案标题" : "Direction title"}
            className="direction-compare__title direction-compare__title--editing"
          />
        ) : title ? <h3 className="direction-compare__title">{title}</h3> : null}

        {inlineEditor ? (
          <InlineTemplateField
            value={description}
            onChange={(value) => inlineEditor.onLocalizedTextChange(descriptionField, value)}
            ariaLabel={locale === "zh" ? `${side === "left" ? "左" : "右"}侧说明` : `${side} description`}
            placeholder={locale === "zh" ? "简短说明" : "Short description"}
            className="direction-compare__description direction-compare__description--editing"
          />
        ) : description ? <p className="direction-compare__description">{description}</p> : null}
      </div>
    </article>
  );
}

export default function DirectionCompareTemplate({ content, locale, horizontalInset, inlineEditor }: TemplateProps) {
  const heading = localized(content.heading, locale);
  const direction = directionValue(content.direction);
  const editor = inlineEditor?.directionCompare as DirectionCompareEditor | undefined;

  return (
    <TemplateSurface>
      <TemplateContent horizontalInset={horizontalInset} className="direction-compare">
        {inlineEditor ? (
          <InlineTemplateField
            value={heading}
            onChange={(value) => inlineEditor.onLocalizedTextChange("heading", value)}
            ariaLabel={locale === "zh" ? "顶部标题" : "Heading"}
            placeholder={locale === "zh" ? "方案对比" : "Direction comparison"}
            className="direction-compare__heading direction-compare__heading--editing"
          />
        ) : heading ? <h2 className="direction-compare__heading">{heading}</h2> : null}

        <div className={`direction-compare__grid direction-compare__grid--${direction}`}>
          <CompareUnit side="left" content={content} locale={locale} inlineEditor={inlineEditor} />
          {direction !== "none" ? <span className="direction-compare__direction" aria-hidden="true" /> : null}
          {inlineEditor?.directionCompare ? (
            <div className="direction-compare__direction-control" aria-label={locale === "zh" ? "对比方向" : "Comparison direction"}>
              {(["left-to-right", "right-to-left", "none"] as const).map((value) => (
                <button key={value} type="button" className={direction === value ? "is-active" : ""} onClick={() => inlineEditor.directionCompare?.onDirectionChange(value)}>
                  {locale === "zh" ? ({ "left-to-right": "向右", "right-to-left": "向左", none: "无" } as const)[value] : ({ "left-to-right": "Right", "right-to-left": "Left", none: "None" } as const)[value]}
                </button>
              ))}
            </div>
          ) : null}
          <CompareUnit side="right" content={content} locale={locale} inlineEditor={inlineEditor} />
        </div>
        {editor?.status ? <p className="direction-compare__status">{editor.status}</p> : null}
        {editor?.error ? <p className="direction-compare__error">{editor.error}</p> : null}
      </TemplateContent>
    </TemplateSurface>
  );
}
