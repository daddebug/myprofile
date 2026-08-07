import { useEffect, useState } from "react";
import { InlineTemplateField } from "../components/template-tools/InlineTemplateField";
import {
  TemplateContent,
  TemplateSurface,
} from "../components/template-tools/TemplateResponsiveFoundation";
import { normalizeFigmaPrototypeUrl } from "../lib/figmaEmbed";
import type {
  TemplateLayoutControlDefinition,
  TemplateMeta,
  TemplateProps,
} from "../lib/templateLibrary";
import { isCollectionExportCapture, isWebsiteSliceExportCapture } from "../lib/collectionExportStaging";
import { recordEmptySlotCollapsed, recordEmptySlotFound } from "../lib/collectionMediaDiagnostics";

// How long to wait for the iframe's own `load` event before treating the
// embed as failed. Figma's embed is a large webpack + WebGL bundle, so this
// is generous on purpose — the goal is to catch "never loads" (blocked
// network, dead file), not to rush a slow-but-working load.
const LOAD_TIMEOUT_MS = 12000;

export const layoutControls = {
  displaySize: "standard",
  sectionSpacing: "standard",
  headingGap: "standard",
  captionGap: "standard",
} as const;

export const layoutControlSchema: TemplateLayoutControlDefinition[] = [
  { key: "displaySize", label: "Display size" },
  { key: "sectionSpacing", label: "Vertical padding" },
  { key: "headingGap", label: "Heading distance" },
  { key: "captionGap", label: "Caption distance" },
];

export const templateMeta: TemplateMeta = {
  id: "figma-prototype",
  nameZh: "Figma 原型展示",
  nameEn: "Figma Prototype",
  descriptionZh: "单个大型居中展示区域，用于嵌入可交互的 Figma 原型。",
  descriptionEn: "A single large, centered display for an interactive Figma prototype.",
  schema: [
    { id: "heading", labelZh: "顶部标题", labelEn: "Heading", type: "text" },
    { id: "figmaUrl", labelZh: "Figma 链接", labelEn: "Figma URL", type: "text" },
    { id: "caption", labelZh: "说明文字", labelEn: "Caption", type: "text" },
    { id: "fallbackImage", labelZh: "备用图片", labelEn: "Fallback image", type: "image" },
  ],
  createdAt: "2026-07-28T00:00:08.000Z",
};

type LocalizedText = { zh: string; en: string };
type FallbackImage = { publicPath?: string };

const displayMaxWidths = {
  standard: "64rem",
  large: "80rem",
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
  standard: "1.375rem",
  far: "2.5rem",
} as const;

const captionGaps = {
  near: "1rem",
  standard: "1.5rem",
  far: "2.25rem",
} as const;

function localizedValue(
  value: string | LocalizedText | undefined,
  locale: "zh" | "en",
) {
  if (typeof value === "string") return value.trim();
  return value?.[locale]?.trim() ?? "";
}

export default function FigmaPrototypeTemplate({ content, locale, horizontalInset, inlineEditor }: TemplateProps) {
  const heading = localizedValue(content.heading as LocalizedText | undefined, locale);
  const figmaUrl = typeof content.figmaUrl === "string" ? content.figmaUrl.trim() : "";
  // captionTitle is deliberately no longer read: it's not a native field on
  // this template anymore. Older content that still has it in storage keeps
  // it untouched — this just never looks at it, so it never renders.
  const caption = localizedValue(content.caption as LocalizedText | undefined, locale);
  const fallbackImage = content.fallbackImage as FallbackImage | undefined;

  const displaySize =
    displayMaxWidths[layoutControls.displaySize as keyof typeof displayMaxWidths]
    ?? displayMaxWidths.standard;
  const sectionPadding =
    sectionPaddings[layoutControls.sectionSpacing as keyof typeof sectionPaddings]
    ?? sectionPaddings.standard;
  const headingGap =
    headingGaps[layoutControls.headingGap as keyof typeof headingGaps]
    ?? headingGaps.standard;
  const captionGap =
    captionGaps[layoutControls.captionGap as keyof typeof captionGaps]
    ?? captionGaps.standard;

  const result = figmaUrl ? normalizeFigmaPrototypeUrl(figmaUrl) : null;
  const embedUrl = result?.ok ? result.embedUrl : "";
  const sourceUrl = result?.ok ? result.sourceUrl : "";
  const urlError = result && !result.ok ? result.error : null;

  const hasCaptionArea = Boolean(caption);

  // Media-slot classification is based only on the raw fallbackImage field
  // (the one image-schema field this template has) — never on whether the
  // live embed happens to be showing instead. A slot with no publicPath at
  // all is genuinely empty; one with a publicPath that fails to load is a
  // real asset failure, tracked below via onError.
  const [fallbackLoadFailed, setFallbackLoadFailed] = useState(false);
  const hasFallbackReference = Boolean(fallbackImage?.publicPath);
  const figmaMediaSlotState = embedUrl ? "filled" : !hasFallbackReference ? "empty" : fallbackLoadFailed ? "failed" : "filled";
  const figmaSlotId = `figma-prototype:${heading || "untitled"}`;
  const captureMode = isCollectionExportCapture();
  const suppressFigmaPlaceholder = figmaMediaSlotState === "empty" && captureMode;
  if (suppressFigmaPlaceholder) {
    recordEmptySlotFound(figmaSlotId);
    recordEmptySlotCollapsed(figmaSlotId);
  }
  // Emergency website-slice export mode: page.pdf() cannot render a live
  // cross-origin Figma iframe meaningfully (it prints blank or hangs), and
  // this mode has no print-media CSS swap to fall back on. Never show the
  // iframe here — use the static fallback image if one is configured,
  // otherwise omit the whole media frame (zero height), matching a
  // genuinely empty slot. Normal website/owner-mode rendering (this flag
  // off) is completely unaffected.
  const websiteSliceMode = isWebsiteSliceExportCapture();
  const showIframe = Boolean(embedUrl) && !websiteSliceMode;
  const websiteSliceFallbackSrc = websiteSliceMode && !embedUrl ? fallbackImage?.publicPath : undefined;
  const suppressForWebsiteSlice = websiteSliceMode && embedUrl && !fallbackImage?.publicPath;

  // Tracks the iframe's own load outcome so the permission/starting-point
  // hint only shows for a genuine failure (never loaded within the
  // timeout) — never unconditionally, and never once `onLoad` has already
  // fired for the current embedUrl.
  const [loadState, setLoadState] = useState<"idle" | "loading" | "loaded" | "failed">("idle");

  useEffect(() => {
    if (!embedUrl) {
      setLoadState("idle");
      return;
    }
    setLoadState("loading");
    const timeoutId = window.setTimeout(() => {
      setLoadState((current) => (current === "loading" ? "failed" : current));
    }, LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timeoutId);
  }, [embedUrl]);

  return (
    <TemplateSurface>
      <TemplateContent horizontalInset={horizontalInset} style={{ paddingTop: sectionPadding, paddingBottom: sectionPadding }}>
        <div
          className="mx-auto text-center"
          style={{ maxWidth: displaySize }}
        >
          {inlineEditor ? (
            <InlineTemplateField
              value={(content.heading as LocalizedText | undefined)?.[locale] ?? ""}
              onChange={(value) => inlineEditor.onLocalizedTextChange("heading", value)}
              ariaLabel={locale === "zh" ? "模板标题" : "Template heading"}
              placeholder={locale === "zh" ? "模板标题" : "Template heading"}
              className="w-full min-w-0 break-words text-center font-display text-[clamp(1.65rem,7vw,2rem)] font-bold leading-[1.1] text-softWhite md:text-[clamp(2rem,3.2vw,3.5rem)]"
            />
          ) : heading ? (
            <h2 className="w-full min-w-0 break-words text-center font-display text-[clamp(1.65rem,7vw,2rem)] font-bold leading-[1.1] text-softWhite md:text-[clamp(2rem,3.2vw,3.5rem)]">
              {heading}
            </h2>
          ) : null}

          {suppressFigmaPlaceholder || suppressForWebsiteSlice ? null : (
          <div
            className="case-study-media-frame"
            style={{ marginTop: inlineEditor || heading ? headingGap : 0 }}
            data-media-slot-state={figmaMediaSlotState}
            data-media-slot-id={figmaSlotId}
          >
            {showIframe ? (
              <iframe
                key={embedUrl}
                src={embedUrl}
                title={heading || "Figma prototype"}
                className="absolute inset-0 h-full w-full border-0"
                loading="lazy"
                allowFullScreen
                onLoad={() => setLoadState("loaded")}
              />
            ) : websiteSliceMode ? (
              websiteSliceFallbackSrc ? (
                <img
                  src={websiteSliceFallbackSrc}
                  alt={heading || "Figma prototype fallback"}
                  className="case-study-media-image"
                  loading="lazy"
                />
              ) : null
            ) : fallbackImage?.publicPath ? (
              <img
                src={fallbackImage.publicPath}
                alt={heading || "Figma prototype fallback"}
                className="case-study-media-image"
                loading="lazy"
                onError={() => setFallbackLoadFailed(true)}
              />
            ) : (
              <span className="case-study-media-placeholder">
                {urlError
                  ? (locale === "zh" ? "链接无效" : "Invalid link")
                  : (locale === "zh" ? "尚未配置 Figma 原型" : "Figma prototype not configured")}
              </span>
            )}
          </div>
          )}
        </div>

        {hasCaptionArea ? (
          <div
            className="mx-auto px-2 text-center"
            style={{ marginTop: captionGap, maxWidth: displaySize }}
          >
            {caption ? (
              <p className="mx-auto mt-2 max-w-2xl text-sm leading-7 text-softWhite/58">{caption}</p>
            ) : null}
          </div>
        ) : null}

        {sourceUrl ? (
          <p className={hasCaptionArea ? "mt-3 text-center" : "mt-2 text-center"}>
            <a
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium text-acidGreen/75 hover:text-acidGreen"
            >
              {locale === "zh" ? "在 Figma 中打开" : "Open in Figma"}
            </a>
          </p>
        ) : null}

        {loadState === "failed" && !websiteSliceMode ? (
          <p className="mx-auto mt-3 max-w-md text-center text-xs leading-5 text-softWhite/40">
            {locale === "zh"
              ? "Figma 原型未能加载，请检查分享权限（Anyone with the link can view）和原型起点（Prototype Flow starting point）。"
              : "The Figma prototype failed to load — check the share permission (Anyone with the link can view) and the prototype's flow starting point."}
          </p>
        ) : null}
      </TemplateContent>
    </TemplateSurface>
  );
}
