import { useState } from "react";
import {
  TemplateContent,
  TemplateSurface,
} from "../components/template-tools/TemplateResponsiveFoundation";
import type {
  TemplateLayoutControlDefinition,
  TemplateMeta,
  TemplateProps,
} from "../lib/templateLibrary";
import { InlineTemplateField } from "../components/template-tools/InlineTemplateField";
import { FloatingImagePreview } from "../components/template-tools/FloatingImagePreview";
import { isCollectionExportCapture } from "../lib/collectionExportStaging";
import { recordEmptySlotCollapsed, recordEmptySlotFound, recordModuleOmitted } from "../lib/collectionMediaDiagnostics";

export const layoutControls = {
  imageGap: "standard",
  imageSize: "standard",
  sectionSpacing: "standard",
  headingGap: "standard",
} as const;

export const layoutControlSchema: TemplateLayoutControlDefinition[] = [
  { key: "imageGap", label: "Image spacing" },
  { key: "imageSize", label: "Image size" },
  { key: "sectionSpacing", label: "Vertical padding" },
  { key: "headingGap", label: "Heading distance" },
];

export const templateMeta: TemplateMeta = {
  id: "image-row",
  nameZh: "图片横排",
  nameEn: "Image Row",
  descriptionZh: "连续展示 1–12 张图片，每行最多 4 张，每张图片下方可附独立说明。",
  descriptionEn: "A continuous group of 1–12 images, up to four per row, each with an optional caption.",
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
      min: 1,
      max: 12,
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
  startNewRow?: boolean;
  alt?: string | LocalizedText;
  caption?: string | LocalizedText;
  placeholder?: string | LocalizedText;
  suggestedAspectRatio?: string;
  suggestedImageCount?: number;
};

const gapSizes = {
  compact: "1rem",
  standard: "1.25rem",
  wide: "1.75rem",
} as const;

// A single image is given its own reasonable cap so a lone photo doesn't
// stretch edge-to-edge across the full page-width content container. Rows
// of 2-4 images intentionally have no extra cap here — they fill the same
// global content container every other template uses (--template-library-
// content-max), and column count alone is what makes each image larger or
// smaller as items are added or removed.
const singleImageMaxWidths = { standard: "64rem", large: "72rem" } as const;

// alt is no longer user-edited (see ProjectImageRowContentEditor /
// ImageRowContentEditor) — it is derived at render time so decorative
// captions never end up duplicated verbatim into both the caption text and
// the alt attribute. Existing item.alt data is left untouched in storage.
const neutralImageAlt = {
  zh: "项目界面截图",
  en: "Project interface screenshot",
} as const;

// Internal top/bottom padding only — the gap *between* stacked template
// instances is owned entirely by TemplateInstancesSection's InstanceBlock
// wrapper (--template-library-instance-gap), so this only needs to cover
// this template's own breathing room, not a whole section's worth twice.
const sectionPaddings = {
  compact: "1.5rem",
  standard: "2rem",
  wide: "3rem",
} as const;

const headingGaps = {
  near: "1.25rem",
  standard: "1.75rem",
  far: "2.5rem",
} as const;

function localizedValue(
  value: string | LocalizedText | undefined,
  locale: "zh" | "en",
) {
  if (typeof value === "string") return value.trim();
  return value?.[locale]?.trim() ?? "";
}

function isImageRowItem(value: unknown): value is ImageRowItem {
  return Boolean(value && typeof value === "object");
}

function hasImage(item: ImageRowItem) {
  return Boolean(item.image?.publicPath);
}

function hasPlaceholder(item: ImageRowItem) {
  return Boolean(localizedValue(item.placeholder, "zh") || localizedValue(item.placeholder, "en") || item.suggestedAspectRatio);
}

function RowImage({ image, imageDisplayMode, imageCropRatio, hoverPreviewMode, alt, placeholder, ratio, purpose, locale, editing, slotId }: { image?: ImageRowImage; imageDisplayMode?: "cover" | "natural"; imageCropRatio?: "16:9" | "1:1"; hoverPreviewMode?: "none" | "floating"; alt: string; placeholder: string; ratio: string; purpose: string; locale: "zh" | "en"; editing: boolean; slotId: string }) {
  const src = image?.publicPath || "";
  const [loadFailed, setLoadFailed] = useState(false);
  // "empty" (nothing was ever supposed to be here — no publicPath assigned)
  // vs "failed" (a publicPath was assigned but the browser couldn't load
  // it, e.g. a 404) are different situations for the collection export to
  // report: captureProjectPage in portfolioCollectionExportPlugin.ts reads
  // this attribute and fails loudly on "failed" instead of silently
  // shipping a missing image.
  const mediaSlotState = !src ? "empty" : loadFailed ? "failed" : "filled";
  // An intentionally empty slot must never show up as a visible "To add: …"
  // placeholder in the exported collection PDF — but only in capture mode
  // (the normal owner/editor view is unchanged), and only for "empty",
  // never "failed": a real load failure still needs to stay visible (and
  // still aborts the export server-side regardless of what renders here).
  const suppressPlaceholder = mediaSlotState === "empty" && isCollectionExportCapture();
  // Legacy items saved before imageCropRatio existed have no ratio field at
  // all — they fall back to the original 16:9 frame so old visuals never
  // shift on their own.
  const frameClassName = imageCropRatio === "1:1"
    ? "case-study-media-frame case-study-media-frame--square"
    : "case-study-media-frame";

  const previewImage = (className: string) => (
    <FloatingImagePreview src={src} alt={alt} enabled={hoverPreviewMode === "floating"} resetKey={editing} imageDisplayMode={imageDisplayMode ?? "cover"} imageCropRatio={imageCropRatio ?? "16:9"}>
      {({ onMouseEnter, onMouseLeave, previewActive }) => (
        <img
          src={src}
          alt={alt}
          className={`${className} transition-[transform,filter] duration-200 ease-out ${previewActive ? "floating-preview-trigger--active" : ""}`}
          loading="lazy"
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          onError={() => setLoadFailed(true)}
        />
      )}
    </FloatingImagePreview>
  );

  if (src && imageDisplayMode === "natural") {
    return (
      <div className="flex w-full justify-center overflow-hidden rounded-[18px] bg-[rgba(21,27,77,0.52)] shadow-[inset_0_1px_0_rgba(244,245,250,0.06)]" data-media-slot-state={mediaSlotState} data-media-slot-id={slotId}>
        {previewImage("block h-auto max-w-full object-contain")}
      </div>
    );
  }

  return (
    <div className={frameClassName} data-media-slot-state={mediaSlotState} data-media-slot-id={slotId}>
      {src ? (
        previewImage("case-study-media-image")
      ) : suppressPlaceholder ? null : (
        <div className="flex h-full w-full flex-col items-start justify-center gap-2 px-6 py-8 text-left">
          <span className="font-display text-lg font-semibold text-softWhite/88">{locale === "zh" ? `待补：${placeholder || "项目成果图"}` : `To add: ${placeholder || "project visual"}`}</span>
          {ratio ? <span className="text-xs text-acidGreen/76">{locale === "zh" ? `建议比例：${ratio}` : `Suggested ratio: ${ratio}`}</span> : null}
          {purpose ? <span className="text-sm leading-6 text-softWhite/54">{locale === "zh" ? `用途：${purpose}` : `Purpose: ${purpose}`}</span> : null}
          <span className="mt-1 text-xs font-semibold text-softWhite/42">{locale === "zh" ? "上传图片" : "Upload image"}</span>
        </div>
      )}
    </div>
  );
}

export default function ImageRowTemplate({ content, locale, horizontalInset, inlineEditor }: TemplateProps) {
  const heading = localizedValue(
    content.heading as LocalizedText | undefined,
    locale,
  );
  const rawItems = Array.isArray(content.items) ? content.items.filter(isImageRowItem) : [];
  const captureMode = isCollectionExportCapture();
  const instanceLabel = `image-row:${heading || "untitled"}`;
  if (captureMode) {
    rawItems.forEach((item, index) => {
      if (!hasImage(item)) {
        const id = `${instanceLabel}:${item.id ?? index}`;
        recordEmptySlotFound(id);
        recordEmptySlotCollapsed(id);
      }
    });
  }
  // A placeholder-only item ("待补：…") is intentional authoring content in
  // the normal owner/public view, but in the exported collection PDF it's
  // still an unfilled slot — never shown there, same as a fully empty item.
  const items = rawItems.filter((item) => inlineEditor || hasImage(item) || (hasPlaceholder(item) && !captureMode)).slice(0, 12);
  // With no items and no inline editor, there is nothing to show — render no
  // container at all rather than an empty card with a "please add an image"
  // message. In capture mode this also covers "every item in this instance
  // is empty" — the whole template instance is omitted, not left as an
  // empty row.
  if (items.length === 0 && !inlineEditor) {
    if (captureMode && rawItems.length > 0) recordModuleOmitted(instanceLabel);
    return null;
  }
  const showVirtualFirstSlot = Boolean(inlineEditor?.imageRow && items.length === 0);
  const renderedGridItems = items.length + Number(showVirtualFirstSlot);
  const storedColumns = content.columns;
  const requiresWideGrid = items.some((item) => item.imageWidthMode === "wide");
  const columns = storedColumns === 1 || storedColumns === 2 || storedColumns === 3 || storedColumns === 4
    ? storedColumns
    : Math.min(4, Math.max(1, renderedGridItems, requiresWideGrid ? 2 : 1));
  const rowAlignment = content.rowAlignment === "center" ? "center" : "start";

  const imageGap =
    gapSizes[layoutControls.imageGap as keyof typeof gapSizes]
    ?? gapSizes.standard;
  const sizeKey =
    (layoutControls.imageSize as string) === "large" ? "large" : "standard";
  const sectionPadding =
    sectionPaddings[layoutControls.sectionSpacing as keyof typeof sectionPaddings]
    ?? sectionPaddings.standard;
  const headingGap =
    headingGaps[layoutControls.headingGap as keyof typeof headingGaps]
    ?? headingGaps.standard;
  const visualSpans = [
    ...(showVirtualFirstSlot ? [1] : []),
    ...items.map((item) => item.imageWidthMode === "full" ? columns : item.imageWidthMode === "wide" ? Math.min(2, columns) : 1),
  ];
  const visualRowStarts = [
    ...(showVirtualFirstSlot ? [false] : []),
    ...items.map((item) => item.startNewRow === true || item.imageWidthMode === "full"),
  ];
  const rows: Array<Array<{ index: number; span: number }>> = [];
  let pendingRow: Array<{ index: number; span: number }> = [];
  let pendingUnits = 0;
  const commitPendingRow = () => {
    if (pendingRow.length > 0) rows.push(pendingRow);
    pendingRow = [];
    pendingUnits = 0;
  };
  visualSpans.forEach((span, index) => {
    if (visualRowStarts[index]) commitPendingRow();
    if (span === columns) {
      commitPendingRow();
      rows.push([{ index, span }]);
      return;
    }
    if (pendingUnits + span > columns) commitPendingRow();
    pendingRow.push({ index, span });
    pendingUnits += span;
  });
  commitPendingRow();
  const rowMaxWidth = (row: Array<{ index: number; span: number }>) => {
    if (row.length !== 1) return undefined;
    const visualIndex = row[0].index;
    const item = showVirtualFirstSlot ? undefined : items[visualIndex];
    if (item?.imageWidthMode === "full") return undefined;
    if (item?.imageWidthMode === "wide") return singleImageMaxWidths.large;
    return singleImageMaxWidths[sizeKey];
  };

  const renderItem = (item: ImageRowItem, index: number, isLastInRow: boolean) => {
    const caption = localizedValue(item.caption, locale);
    const placeholder = localizedValue(item.placeholder, locale);
    const alt = caption || neutralImageAlt[locale];

    return (
      <article
        key={item.id ?? index}
        className={`min-w-0 rounded-[20px] bg-[#151B4D]/52 p-3 pb-4 shadow-[0_16px_38px_rgba(3,5,26,0.2),inset_0_1px_0_rgba(244,245,250,0.06)] ${inlineEditor?.imageRow ? "relative" : ""}`}
      >
        {inlineEditor?.imageRow && item.id && index > 0 && item.imageWidthMode !== "full" ? (
          <button
            type="button"
            className={`absolute left-5 top-5 z-30 rounded-[5px] px-2.5 py-1.5 text-[11px] font-semibold shadow-sm backdrop-blur ${item.startNewRow ? "bg-acidGreen text-deepIndigo" : "bg-deepIndigo/88 text-softWhite/72"}`}
            onClick={() => inlineEditor.imageRow?.onItemChange(item.id!, { startNewRow: item.startNewRow ? false : true })}
          >
            {item.startNewRow
              ? (locale === "zh" ? "取消另起一行" : "Continue previous row")
              : (locale === "zh" ? "从这里另起一行" : "Start new row here")}
          </button>
        ) : null}
        {inlineEditor?.imageRow && item.id ? (
          <div className="relative">
            <RowImage image={item.image} imageDisplayMode={item.imageDisplayMode} imageCropRatio={item.imageCropRatio} hoverPreviewMode={item.hoverPreviewMode} alt={alt} placeholder={placeholder} ratio={item.suggestedAspectRatio ?? ""} purpose={caption} locale={locale} editing={Boolean(inlineEditor)} slotId={item.id ?? String(index)} />
            <>
              <div className="absolute right-2 top-2 z-20 flex flex-wrap justify-end gap-1.5">
                <button type="button" className="rounded-[5px] bg-deepIndigo/88 px-2.5 py-1.5 text-xs font-semibold text-softWhite shadow-sm backdrop-blur" onClick={() => inlineEditor.imageRow?.onReplaceImage(item.id!)}>
                  {hasImage(item) ? (locale === "zh" ? "替换图片" : "Replace") : (locale === "zh" ? "上传图片" : "Upload")}
                </button>
                {hasImage(item) ? (
                  <button type="button" className="rounded-[5px] bg-deepIndigo/88 px-2.5 py-1.5 text-xs font-semibold text-peach shadow-sm backdrop-blur" onClick={() => inlineEditor.imageRow?.onRemoveImage(item.id!)}>
                    {locale === "zh" ? "删除图片" : "Delete"}
                  </button>
                ) : null}
                <button
                  type="button"
                  title={locale === "zh" ? "删除整个条目（图片、说明、卡片一并移除）" : "Delete this whole item (image, caption, and card)"}
                  className="rounded-[5px] bg-deepIndigo/88 px-2.5 py-1.5 text-xs font-semibold text-peach shadow-sm backdrop-blur"
                  onClick={() => inlineEditor.imageRow?.onRemoveItem(item.id!)}
                >
                  {locale === "zh" ? "删除整项" : "Delete item"}
                </button>
              </div>
              {hasImage(item) ? (
                <div className="absolute bottom-2 left-2 z-20 flex max-w-[calc(100%_-_1rem)] flex-col gap-1 rounded-[5px] bg-deepIndigo/88 p-1 text-[11px] font-semibold shadow-sm backdrop-blur">
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      title={locale === "zh" ? "界面截图用，按 16:9 裁切填满" : "For UI screenshots, cropped to fill 16:9"}
                      className={`rounded-[3px] px-2 py-1 ${(item.imageDisplayMode ?? "cover") === "cover" && (item.imageCropRatio ?? "16:9") === "16:9" ? "bg-acidGreen text-deepIndigo" : "text-softWhite/72"}`}
                      onClick={() => inlineEditor.imageRow?.onItemChange(item.id!, { imageDisplayMode: "cover", imageCropRatio: "16:9" })}
                    >
                      {locale === "zh" ? "界面裁切" : "UI 16:9"}
                    </button>
                    <button
                      type="button"
                      title={locale === "zh" ? "图标/物品素材用，按 1:1 裁切填满" : "For icon/item assets, cropped to fill 1:1"}
                      className={`rounded-[3px] px-2 py-1 ${item.imageDisplayMode === "cover" && item.imageCropRatio === "1:1" ? "bg-acidGreen text-deepIndigo" : "text-softWhite/72"}`}
                      onClick={() => inlineEditor.imageRow?.onItemChange(item.id!, { imageDisplayMode: "cover", imageCropRatio: "1:1" })}
                    >
                      {locale === "zh" ? "图标裁切" : "Icon 1:1"}
                    </button>
                    <button
                      type="button"
                      title={locale === "zh" ? "不裁切，按原图完整显示" : "No cropping, show the full original image"}
                      className={`rounded-[3px] px-2 py-1 ${item.imageDisplayMode === "natural" ? "bg-acidGreen text-deepIndigo" : "text-softWhite/72"}`}
                      onClick={() => inlineEditor.imageRow?.onItemChange(item.id!, { imageDisplayMode: "natural" })}
                    >
                      {locale === "zh" ? "完整显示" : "Full"}
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-1 border-t border-softWhite/10 pt-1">
                    <span className="px-1 text-softWhite/48">{locale === "zh" ? "图片宽度" : "Width"}</span>
                    {(["card", "wide", "full"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        className={`rounded-[3px] px-2 py-1 ${(item.imageWidthMode ?? "card") === mode ? "bg-acidGreen text-deepIndigo" : "text-softWhite/72"}`}
                        onClick={() => inlineEditor.imageRow?.onItemChange(item.id!, { imageWidthMode: mode })}
                      >
                        {locale === "zh" ? ({ card: "标准", wide: "加宽", full: "整行" } as const)[mode] : ({ card: "Standard", wide: "Wide", full: "Full row" } as const)[mode]}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-1 border-t border-softWhite/10 pt-1">
                    <span className="px-1 text-softWhite/48">{locale === "zh" ? "悬停预览" : "Hover preview"}</span>
                    {(["none", "floating"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        className={`rounded-[3px] px-2 py-1 ${(item.hoverPreviewMode ?? "none") === mode ? "bg-acidGreen text-deepIndigo" : "text-softWhite/72"}`}
                        onClick={() => inlineEditor.imageRow?.onItemChange(item.id!, { hoverPreviewMode: mode })}
                      >
                        {locale === "zh" ? ({ none: "关闭", floating: "漂浮放大" } as const)[mode] : ({ none: "Off", floating: "Floating" } as const)[mode]}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          </div>
        ) : (
          <RowImage image={item.image} imageDisplayMode={item.imageDisplayMode} imageCropRatio={item.imageCropRatio} hoverPreviewMode={item.hoverPreviewMode} alt={alt} placeholder={placeholder} ratio={item.suggestedAspectRatio ?? ""} purpose={caption} locale={locale} editing={Boolean(inlineEditor)} slotId={item.id ?? String(index)} />
        )}
        {inlineEditor?.imageRow && item.id && hasImage(item) ? (
          <InlineTemplateField
            value={(item.caption as LocalizedText | undefined)?.[locale] ?? ""}
            onChange={(value) => inlineEditor.imageRow?.onItemChange(item.id!, { caption: { ...((item.caption as LocalizedText | undefined) ?? { zh: "", en: "" }), [locale]: value } })}
            ariaLabel={locale === "zh" ? "图片说明" : "Image caption"}
            placeholder={locale === "zh" ? "图片说明" : "Caption"}
            className="mt-4 w-full px-2 text-sm leading-6 text-softWhite/66"
          />
        ) : caption && hasImage(item) ? (
          <p className="px-2 pt-4 text-sm leading-6 text-softWhite/66">
            {caption}
          </p>
        ) : null}
        {inlineEditor?.imageRow && item.id && items.length < 12 && (columns > 1 || storedColumns === undefined) && item.imageWidthMode !== "full" && isLastInRow ? (
          <button type="button" className="ml-auto mt-3 block rounded-[5px] border border-dashed border-softWhite/20 px-2.5 py-1.5 text-xs font-semibold text-softWhite/48 transition hover:border-acidGreen/45 hover:text-acidGreen" onClick={() => inlineEditor.imageRow?.onAddItemAfter(item.id!)}>
            {locale === "zh" ? "＋ 向右" : "+ Right"}
          </button>
        ) : null}
      </article>
    );
  };

  return (
    <TemplateSurface>
      <TemplateContent horizontalInset={horizontalInset} style={{ paddingTop: sectionPadding, paddingBottom: sectionPadding }}>
        {inlineEditor ? (
          <InlineTemplateField
            value={(content.heading as LocalizedText | undefined)?.[locale] ?? ""}
            onChange={(value) => inlineEditor.onLocalizedTextChange("heading", value)}
            ariaLabel={locale === "zh" ? "顶部标题" : "Heading"}
            placeholder={locale === "zh" ? "顶部标题" : "Heading"}
            className="mx-auto w-full text-center font-display text-[clamp(1.25rem,2vw,1.5rem)] font-semibold leading-[1.3] text-softWhite"
          />
        ) : heading ? (
          <h2 className="text-center font-display text-[clamp(1.25rem,2vw,1.5rem)] font-semibold leading-[1.3] text-softWhite">
            {heading}
          </h2>
        ) : null}

        <div
          className="mx-auto flex min-w-0 flex-col"
          style={{
            marginTop: inlineEditor || heading ? headingGap : 0,
            rowGap: `calc(${imageGap} * 1.15)`,
          }}
        >
          {rows.map((row, rowIndex) => {
            const usedUnits = row.reduce((total, entry) => total + entry.span, 0);
            const singleItemRow = row.length === 1;
            const maxWidth = rowMaxWidth(row);

            return (
              <div
                key={`image-row-${rowIndex}`}
                className="grid min-w-0 items-start"
                style={{
                  width: "100%",
                  maxWidth,
                  marginInline: singleItemRow || rowAlignment === "center" ? "auto" : undefined,
                  marginRight: !singleItemRow && rowAlignment === "start" ? "auto" : undefined,
                  columnGap: imageGap,
                  gridTemplateColumns: `repeat(${usedUnits * 2}, minmax(0, 1fr))`,
                }}
              >
                {row.map((entry, entryIndex) => {
                  if (showVirtualFirstSlot && entry.index === 0) {
                    return (
                      <button
                        key="virtual-first-image"
                        type="button"
                        className="min-w-0 rounded-[20px] bg-[#151B4D]/52 p-3 pb-4 text-left shadow-[0_16px_38px_rgba(3,5,26,0.2),inset_0_1px_0_rgba(244,245,250,0.06)]"
                        style={{ gridColumn: `span ${entry.span * 2}` }}
                        onClick={() => inlineEditor?.imageRow?.onUploadFirstImage()}
                      >
                        <span className="case-study-media-frame flex h-full min-h-[11rem] w-full flex-col items-start justify-center gap-2 px-6 py-8">
                          <span className="font-display text-lg font-semibold text-softWhite/88">{locale === "zh" ? "待补图片" : "Image to add"}</span>
                          <span className="text-xs text-acidGreen/76">{locale === "zh" ? "建议比例：未设置" : "Suggested ratio: Not set"}</span>
                          <span className="mt-1 text-xs font-semibold text-softWhite/64">{locale === "zh" ? "+ 上传图片" : "+ Upload image"}</span>
                        </span>
                      </button>
                    );
                  }

                  const itemIndex = entry.index - Number(showVirtualFirstSlot);
                  const item = items[itemIndex];
                  return (
                    <div key={item.id ?? itemIndex} className="min-w-0" style={{ gridColumn: `span ${entry.span * 2}` }}>
                      {renderItem(item, itemIndex, entryIndex === row.length - 1)}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {inlineEditor?.imageRow && items.length > 0 && items.length < 12 ? (
          <div className="flex justify-center" style={{ marginTop: imageGap }}>
            <button type="button" className="rounded-[6px] border border-dashed border-softWhite/20 px-4 py-2 text-xs font-semibold text-softWhite/52 transition hover:border-acidGreen/45 hover:text-acidGreen" onClick={() => inlineEditor.imageRow?.onAddNewRow()}>
              {locale === "zh" ? "＋ 向下新建一行" : "+ Start a new row below"}
            </button>
          </div>
        ) : null}

        {inlineEditor?.imageRow?.error ? <p className="mt-3 text-center text-sm text-peach">{inlineEditor.imageRow.error}</p> : null}
      </TemplateContent>
    </TemplateSurface>
  );
}
