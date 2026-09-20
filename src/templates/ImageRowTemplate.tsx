import { useState, type CSSProperties } from "react";
import {
  TemplateSurface,
} from "../components/template-tools/TemplateResponsiveFoundation";
import type {
  TemplateLayoutControlDefinition,
  TemplateMeta,
  TemplateProps,
} from "../lib/templateLibrary";
import { InlineTemplateField } from "../components/template-tools/InlineTemplateField";
import { FloatingImagePreview } from "../components/template-tools/FloatingImagePreview";
import { ImageAnnotationLayer, normalizeImageAnnotations, type ImageAnnotation } from "../components/template-tools/ImageAnnotation";
import { ImageAnnotationEditor } from "../components/template-tools/ImageAnnotationEditor";
import { isCollectionExportCapture } from "../lib/collectionExportStaging";
import { recordEmptySlotCollapsed, recordEmptySlotFound, recordModuleOmitted } from "../lib/collectionMediaDiagnostics";
import {
  DOUBLE_IMAGE_ROW_FRAME_HEIGHT,
  DOUBLE_IMAGE_ROW_FRAME_WIDTH,
  DOUBLE_IMAGE_ROW_SLOTS,
  type ImageRowSlotGeometry,
  toFramePercent,
} from "./imageRowLayout";
import "./image-row-template.css";

export const layoutControls = {} as const;

export const layoutControlSchema: TemplateLayoutControlDefinition[] = [];

export const templateMeta: TemplateMeta = {
  id: "image-row",
  nameZh: "双图",
  nameEn: "Double Image",
  descriptionZh: "严格两张图的并排展示。数据不是恰好两张时，仅在编辑器中标记为 legacy/incompatible，线上不渲染，也不自动重排。",
  descriptionEn: "Strictly two images side by side. An instance with any other item count is marked legacy/incompatible in the editor only -- it renders nothing on the live site and is never auto-repaginated.",
  schema: [
    {
      id: "heading",
      labelZh: "顶部标题",
      labelEn: "Heading",
      type: "text",
    },
    {
      id: "items",
      labelZh: "图片",
      labelEn: "Images",
      type: "images",
      min: 2,
      max: 2,
    },
  ],
  createdAt: "2026-07-27T00:00:07.000Z",
};

type LocalizedText = { zh: string; en: string };
type ImageRowImage = {
  publicPath?: string;
};
type ImageRowItem = {
  id?: string;
  image?: ImageRowImage;
  imageDisplayMode?: "cover" | "natural";
  imageCropRatio?: "16:9" | "1:1";
  imageWidthMode?: "card" | "wide" | "full";
  hoverPreviewMode?: "none" | "floating";
  annotationEnabled?: boolean;
  annotations?: ImageAnnotation[];
  startNewRow?: boolean;
  alt?: string | LocalizedText;
  caption?: string | LocalizedText;
  placeholder?: string | LocalizedText;
  suggestedAspectRatio?: string;
  suggestedImageCount?: number;
};

type VisualImageRowItem = {
  item?: ImageRowItem;
  isVirtualFirstSlot?: boolean;
};

// Legacy data (authored before Portfolio 2.0 locked Double Image to exactly
// two slots) may carry far more items than that -- read defensively, but
// this is only ever a display cap for the legacy-marker list in the
// editor, never a target the renderer repaginates into.
const LEGACY_ITEM_DISPLAY_CAP = 12;

const neutralImageAlt = {
  zh: "项目界面截图",
  en: "Project interface screenshot",
} as const;

function localizedValue(value: string | LocalizedText | undefined, locale: "zh" | "en") {
  if (typeof value === "string") return value.trim();
  return value?.[locale]?.trim() ?? "";
}

function localizedObject(value: string | LocalizedText | undefined): LocalizedText {
  if (typeof value === "string") return { zh: value, en: value };
  return value ?? { zh: "", en: "" };
}

function isImageRowItem(value: unknown): value is ImageRowItem {
  return Boolean(value && typeof value === "object");
}

function hasImage(item: ImageRowItem) {
  return Boolean(item.image?.publicPath);
}

const slotStyle = (slot: ImageRowSlotGeometry, frameWidth: number, frameHeight: number): CSSProperties => ({
  left: toFramePercent(slot.x, frameWidth),
  top: toFramePercent(slot.y, frameHeight),
  width: toFramePercent(slot.width, frameWidth),
  height: toFramePercent(slot.height, frameHeight),
});

const captionStyle = (
  slot: ImageRowSlotGeometry,
  frameWidth: number,
  frameHeight: number,
): CSSProperties => {
  const top = slot.y + slot.height + 9;
  const maxHeight = Math.max(0, frameHeight - top - 8);

  return {
    left: toFramePercent(slot.x, frameWidth),
    top: toFramePercent(top, frameHeight),
    width: toFramePercent(slot.width, frameWidth),
    "--template-image-row-caption-max-height": `${maxHeight}px`,
  } as CSSProperties;
};

function ImageFrame({
  item,
  locale,
  editing,
  slotId,
}: {
  item: ImageRowItem;
  locale: "zh" | "en";
  editing: boolean;
  slotId: string;
}) {
  const src = item.image?.publicPath || "";
  const [loadFailed, setLoadFailed] = useState(false);
  const mediaSlotState = !src ? "empty" : loadFailed ? "failed" : "filled";
  // Outside the editor, an empty slot must render nothing -- no default
  // "Image pending" copy or suggested-ratio hint on the live site.
  const suppressPlaceholder = mediaSlotState === "empty" && (!editing || isCollectionExportCapture());
  const placeholder = localizedValue(item.placeholder, locale);
  const caption = localizedValue(item.caption, locale);
  const alt = caption || neutralImageAlt[locale];
  const displayMode = item.imageDisplayMode === "natural" ? "natural" : "cover";
  const annotationActive = !editing && item.annotationEnabled === true && item.hoverPreviewMode !== "floating";
  const annotations = normalizeImageAnnotations(item.annotations);

  if (!src) {
    return (
      <div className="image-row-media-frame" data-media-slot-state={mediaSlotState} data-media-slot-id={slotId}>
        {suppressPlaceholder ? null : (
          <div className="image-row-placeholder">
            <span>{placeholder || (locale === "zh" ? "待补图片" : "Image pending")}</span>
            {item.suggestedAspectRatio ? (
              <span>{locale === "zh" ? `建议比例：${item.suggestedAspectRatio}` : `Suggested ratio: ${item.suggestedAspectRatio}`}</span>
            ) : null}
          </div>
        )}
      </div>
    );
  }

  const imageClassName = `image-row-media ${displayMode === "natural" ? "image-row-media--contain" : "image-row-media--cover"}`;

  return (
    <div className="image-row-media-frame" data-media-slot-state={mediaSlotState} data-media-slot-id={slotId}>
      {item.hoverPreviewMode === "floating" ? (
        <FloatingImagePreview
          src={src}
          alt={alt}
          enabled={!editing}
          resetKey={editing}
          imageDisplayMode={displayMode}
          imageCropRatio={item.imageCropRatio ?? "16:9"}
        >
          {({ onMouseEnter, onMouseLeave, previewActive }) => (
            <img
              src={src}
              alt={alt}
              className={`${imageClassName} ${previewActive ? "floating-preview-trigger--active" : ""}`}
              loading="lazy"
              onMouseEnter={onMouseEnter}
              onMouseLeave={onMouseLeave}
              onError={() => setLoadFailed(true)}
            />
          )}
        </FloatingImagePreview>
      ) : (
        <img
          src={src}
          alt={alt}
          className={imageClassName}
          loading="lazy"
          onError={() => setLoadFailed(true)}
        />
      )}
      <ImageAnnotationLayer annotations={annotations} locale={locale} enabled={annotationActive} />
    </div>
  );
}

function ImageSlot({
  visualItem,
  slot,
  frameWidth,
  frameHeight,
  locale,
  inlineEditor,
  canAddItem,
}: {
  visualItem: VisualImageRowItem;
  slot: ImageRowSlotGeometry;
  frameWidth: number;
  frameHeight: number;
  locale: "zh" | "en";
  inlineEditor: TemplateProps["inlineEditor"];
  canAddItem: boolean;
}) {
  const editor = inlineEditor?.imageRow;
  const [annotationPanelOpen, setAnnotationPanelOpen] = useState(false);
  const item = visualItem.item;
  const slotId = item?.id ?? "virtual-first-image";
  const caption = item ? localizedValue(item.caption, locale) : "";
  const captionObject = localizedObject(item?.caption);
  const hasRealImage = item ? hasImage(item) : false;

  return (
    <>
      <div className="image-row-slot" style={slotStyle(slot, frameWidth, frameHeight)}>
        {visualItem.isVirtualFirstSlot ? (
          <button
            type="button"
            className="image-row-media-frame image-row-virtual-button"
            onClick={() => editor?.onUploadFirstImage()}
          >
            <span>{locale === "zh" ? "+ 上传图片" : "+ Upload image"}</span>
          </button>
        ) : item ? (
          <>
            <ImageFrame item={item} locale={locale} editing={Boolean(inlineEditor)} slotId={slotId} />
            {editor && item.id ? (
              <>
                <div className="image-row-editor-controls" data-exact-export="hide">
                  <button
                    type="button"
                    className="inline-template-chip"
                    onClick={() => editor.onReplaceImage(item.id!)}
                  >
                    {hasRealImage ? (locale === "zh" ? "替换" : "Replace") : (locale === "zh" ? "上传" : "Upload")}
                  </button>
                  {hasRealImage ? (
                    <button
                      type="button"
                      className="inline-template-chip inline-template-chip--danger"
                      onClick={() => editor.onRemoveImage(item.id!)}
                    >
                      {locale === "zh" ? "移除图片" : "Remove image"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="inline-template-chip inline-template-chip--danger"
                    onClick={() => editor.onRemoveItem(item.id!)}
                  >
                    {locale === "zh" ? "删除槽位" : "Delete slot"}
                  </button>
                </div>
                <div className="image-row-editor-secondary-controls" data-exact-export="hide">
                  {hasRealImage ? (
                    <>
                      <button
                        type="button"
                        className={`inline-template-chip ${(item.imageDisplayMode ?? "cover") === "cover" ? "inline-template-chip--active" : ""}`}
                        onClick={() => editor.onItemChange(item.id!, { imageDisplayMode: "cover", imageCropRatio: "16:9" })}
                      >
                        {locale === "zh" ? "裁切" : "Crop"}
                      </button>
                      <button
                        type="button"
                        className={`inline-template-chip ${item.imageDisplayMode === "natural" ? "inline-template-chip--active" : ""}`}
                        onClick={() => editor.onItemChange(item.id!, { imageDisplayMode: "natural" })}
                      >
                        {locale === "zh" ? "完整" : "Full"}
                      </button>
                      <button
                        type="button"
                        className={`inline-template-chip ${item.hoverPreviewMode === "floating" ? "inline-template-chip--active" : ""}`}
                        onClick={() => editor.onItemChange(item.id!, { hoverPreviewMode: item.hoverPreviewMode === "floating" ? "none" : "floating" })}
                      >
                        {locale === "zh" ? "悬停预览" : "Preview"}
                      </button>
                      <button
                        type="button"
                        className={`inline-template-chip ${annotationPanelOpen ? "inline-template-chip--active" : ""}`}
                        onClick={() => setAnnotationPanelOpen((open) => !open)}
                      >
                        {locale === "zh" ? "标注" : "Annotate"}
                      </button>
                    </>
                  ) : null}
                  {canAddItem ? (
                    <button
                      type="button"
                      className="inline-template-chip"
                      onClick={() => editor.onAddItemAfter(item.id!)}
                    >
                      {locale === "zh" ? "后面添加" : "Add after"}
                    </button>
                  ) : null}
                </div>
                {annotationPanelOpen && hasRealImage ? (
                  <div className="image-row-annotation-editor-popover" data-exact-export="hide">
                    <ImageAnnotationEditor
                      locale={locale}
                      enabled={item.annotationEnabled === true}
                      disabled={item.hoverPreviewMode === "floating"}
                      annotations={normalizeImageAnnotations(item.annotations)}
                      onEnabledChange={(annotationEnabled) => editor.onItemChange(item.id!, { annotationEnabled })}
                      onAnnotationsChange={(annotations) => editor.onItemChange(item.id!, { annotations })}
                      onUploadEvidence={(annotationId) => editor.onUploadAnnotationEvidence(item.id!, annotationId)}
                      onRemoveEvidence={(annotationId, evidenceId) => editor.onRemoveAnnotationEvidence(item.id!, annotationId, evidenceId)}
                    />
                  </div>
                ) : null}
              </>
            ) : null}
          </>
        ) : null}
      </div>

      {item && (caption || editor?.onItemChange) ? (
        <div className="image-row-caption-region" style={captionStyle(slot, frameWidth, frameHeight)}>
          {editor && item.id ? (
            <InlineTemplateField
              value={captionObject[locale] ?? ""}
              onChange={(value) => editor.onItemChange(item.id!, { caption: { ...captionObject, [locale]: value } })}
              ariaLabel={locale === "zh" ? "图片说明" : "Image caption"}
              placeholder={locale === "zh" ? "图片说明" : "Caption"}
              className="image-row-editor-caption"
            />
          ) : caption ? (
            <p>{caption}</p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

// Legacy data authored before Double Image was locked to exactly two
// slots (or an in-progress edit that has drifted away from 2) is never
// auto-repaginated. In the editor it shows as a plain, clearly-labeled
// list so the owner can trim it back down to two; on the live site the
// whole instance renders nothing.
function LegacyIncompatibleNotice({
  rawItems,
  locale,
  inlineEditor,
}: {
  rawItems: ImageRowItem[];
  locale: "zh" | "en";
  inlineEditor: TemplateProps["inlineEditor"];
}) {
  const editor = inlineEditor?.imageRow;
  return (
    <div className="image-row-legacy-notice" data-exact-export="hide">
      <p className="image-row-legacy-notice__label">
        {locale === "zh"
          ? `旧数据不兼容：Double Image 现在只支持严格两张图，当前有 ${rawItems.length} 张，需要手动整理`
          : `Legacy/incompatible: Double Image now requires exactly two images, this instance has ${rawItems.length} -- edit it down manually`}
      </p>
      <div className="image-row-legacy-notice__list">
        {rawItems.map((item, index) => (
          <div className="image-row-legacy-notice__item" key={item.id ?? index}>
            <div className="image-row-media-frame image-row-legacy-notice__thumb" data-media-slot-state={hasImage(item) ? "filled" : "empty"}>
              {hasImage(item) ? <img className="image-row-media image-row-media--cover" src={item.image!.publicPath} alt="" loading="lazy" /> : null}
            </div>
            {editor && item.id ? (
              <button type="button" className="inline-template-chip inline-template-chip--danger" onClick={() => editor.onRemoveItem(item.id!)}>
                {locale === "zh" ? "删除" : "Remove"}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ImageRowTemplate({ content, locale, inlineEditor }: TemplateProps) {
  const heading = localizedValue(
    content.heading as LocalizedText | undefined,
    locale,
  );
  const rawItems = Array.isArray(content.items) ? content.items.filter(isImageRowItem).slice(0, LEGACY_ITEM_DISPLAY_CAP) : [];
  const captureMode = isCollectionExportCapture();
  const instanceLabel = `image-row:${heading || "untitled"}`;
  const isStrict2 = rawItems.length === 2;
  // 0 or 1 items is a normal in-progress authoring state on the way to 2,
  // not incompatible legacy data -- only >2 is unambiguously legacy
  // (old single/triple variants never stored fewer than 1, so this is
  // the only count that can't just be "still adding the second image").
  const isLegacyIncompatible = rawItems.length > 2;

  if (captureMode) {
    rawItems.forEach((item, index) => {
      if (!hasImage(item)) {
        const id = `${instanceLabel}:${item.id ?? index}`;
        recordEmptySlotFound(id);
        recordEmptySlotCollapsed(id);
      }
    });
  }

  if (!inlineEditor) {
    // Live site: only a fully-filled, exactly-2 instance ever renders.
    // Anything else (legacy item counts, or a still-empty in-progress
    // instance) renders nothing -- never repaginated, never partially
    // shown.
    const readyForProduction = isStrict2 && rawItems.every(hasImage);
    if (!readyForProduction) {
      if (captureMode && rawItems.length > 0) recordModuleOmitted(instanceLabel);
      return null;
    }

    const visualItems: VisualImageRowItem[] = rawItems.map((item) => ({ item }));

    return (
      <TemplateSurface className="image-row-template p2-page-rail">
        <div
          className="image-row-frame"
          aria-label={heading || (locale === "zh" ? "图片组" : "Image group")}
        >
          {visualItems.map((visualItem, index) => (
            <ImageSlot
              key={visualItem.item?.id ?? `image-row-${index}`}
              visualItem={visualItem}
              slot={DOUBLE_IMAGE_ROW_SLOTS[index]}
              frameWidth={DOUBLE_IMAGE_ROW_FRAME_WIDTH}
              frameHeight={DOUBLE_IMAGE_ROW_FRAME_HEIGHT}
              locale={locale}
              inlineEditor={inlineEditor}
              canAddItem={false}
            />
          ))}
        </div>
      </TemplateSurface>
    );
  }

  // Editor / local preview: an over-2-count instance is marked
  // legacy/incompatible and shown as a plain editable list instead of
  // being forced into the Figma double-image geometry. 0 or 1 items
  // still uses the normal slot UI below (in-progress authoring).
  if (isLegacyIncompatible) {
    return <LegacyIncompatibleNotice rawItems={rawItems} locale={locale} inlineEditor={inlineEditor} />;
  }

  const visualItems: VisualImageRowItem[] = rawItems.length > 0
    ? rawItems.map((item) => ({ item }))
    : [{ isVirtualFirstSlot: true }];

  return (
    <>
      <TemplateSurface className="image-row-template p2-page-rail">
        <div
          className="image-row-frame"
          aria-label={heading || (locale === "zh" ? "图片组" : "Image group")}
        >
          {visualItems.map((visualItem, index) => (
            <ImageSlot
              key={visualItem.item?.id ?? `image-row-${index}`}
              visualItem={visualItem}
              slot={DOUBLE_IMAGE_ROW_SLOTS[index]}
              frameWidth={DOUBLE_IMAGE_ROW_FRAME_WIDTH}
              frameHeight={DOUBLE_IMAGE_ROW_FRAME_HEIGHT}
              locale={locale}
              inlineEditor={inlineEditor}
              canAddItem={rawItems.length < 2}
            />
          ))}
        </div>
      </TemplateSurface>
      {inlineEditor?.imageRow?.error ? <p className="image-row-error" data-exact-export="hide">{inlineEditor.imageRow.error}</p> : null}
    </>
  );
}
