import { caseStudyLayout } from "../lib/caseStudyLayout";
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

export const layoutControls = {
  // Internal reading width for the right-column copy only — independent of
  // this template's outer width (see horizontalInset in TemplateProps).
  textMaxWidth: "52rem",
  bodyFontSize: "1.25rem",
  lineHeight: "1.75",
  headingSpacing: "1.5rem",
} as const;

export const layoutControlSchema: TemplateLayoutControlDefinition[] = [
  { key: "textMaxWidth", label: "Right copy max width" },
  { key: "bodyFontSize", label: "Body font size" },
  { key: "lineHeight", label: "Body line height" },
  { key: "headingSpacing", label: "Statement to body spacing" },
];

export const templateMeta: TemplateMeta = {
  id: "statement-longform",
  nameZh: "观点长文",
  nameEn: "Statement / Longform",
  descriptionZh: "大型章节标题、核心观点与解释正文。",
  descriptionEn:
    "A large chapter title paired with a core statement and supporting copy.",
  schema: [
    {
      id: "sectionNumber",
      labelZh: "章节编号",
      labelEn: "Section number",
      type: "text",
    },
    {
      id: "leftTitle",
      labelZh: "左侧大型标题",
      labelEn: "Large left title",
      type: "text",
    },
    {
      id: "statement",
      labelZh: "核心观点",
      labelEn: "Core statement",
      type: "text",
    },
    {
      id: "body",
      labelZh: "解释正文",
      labelEn: "Supporting body",
      type: "richtext",
    },
  ],
  createdAt: "2026-07-26T00:00:01.000Z",
};

type LocalizedText = { zh: string; en: string };

function localizedValue(
  content: TemplateProps["content"],
  key: string,
  locale: TemplateProps["locale"],
) {
  return (content[key] as LocalizedText | undefined)?.[locale]?.trim() ?? "";
}

function localizedRawValue(
  content: TemplateProps["content"],
  key: string,
  locale: TemplateProps["locale"],
) {
  return (content[key] as LocalizedText | undefined)?.[locale] ?? "";
}

export default function StatementLongformTemplate({
  content,
  locale,
  horizontalInset,
  inlineEditor,
}: TemplateProps) {
  const sectionNumber = localizedValue(content, "sectionNumber", locale);
  const leftTitle = localizedValue(content, "leftTitle", locale);
  const statement = localizedValue(content, "statement", locale);
  const body = localizedValue(content, "body", locale);
  const hasLeftComposition = Boolean(inlineEditor || sectionNumber || leftTitle);
  const hasRightCopy = Boolean(inlineEditor || statement || body);

  if (!hasLeftComposition && !hasRightCopy) return null;

  return (
    <TemplateSurface>
      <TemplateContent
        horizontalInset={horizontalInset}
        // Bottom padding is deliberately its own fixed value, not the shared
        // --template-library-section-spacing (also used for this template's
        // own top padding, and by XMindBreakdownTemplate) — shrinking that
        // variable would also shrink spacing this template doesn't own.
        // 3rem matches the "standard" tier already established for gaps
        // between stacked template instances.
        className="pt-[var(--template-library-section-spacing)] pb-12"
      >
        <div
          className={
            hasLeftComposition && hasRightCopy
              // Local to this template — not caseStudyLayout.majorGrid, which
              // CrossPlatformDraftPage/ThreeDCharacterUiDraftPage also use for
              // their own legacy chapter headers with different proportions.
              ? "grid min-w-0 items-start gap-8 xl:grid-cols-[minmax(280px,0.72fr)_minmax(0,1.55fr)] xl:gap-x-[clamp(32px,4vw,56px)]"
              : "min-w-0"
          }
        >
          {hasLeftComposition ? (
            // No min-height, no translate-y: both columns sit in the same
            // grid row with items-start, so they start at the same top
            // without needing an offset to compensate for one. No min-height
            // also means this column never forces the row taller than its
            // own content, so a short title next to long body copy doesn't
            // leave a tall empty gap below it.
            <div className="relative isolate min-w-0 self-start">
              {inlineEditor ? (
                <InlineTemplateField
                  value={localizedRawValue(content, "sectionNumber", locale)}
                  onChange={(value) => inlineEditor.onLocalizedTextChange("sectionNumber", value)}
                  ariaLabel={locale === "zh" ? "章节编号" : "Section number"}
                  placeholder="01"
                  className={`${caseStudyLayout.majorNumber} pointer-events-auto w-[1.8em]`}
                  style={{ pointerEvents: "auto" }}
                />
              ) : sectionNumber ? (
                <span aria-hidden="true" className={caseStudyLayout.majorNumber}>{sectionNumber}</span>
              ) : null}
              <div className="relative z-10 ml-[clamp(40px,4vw,70px)] min-w-0">
                {inlineEditor ? (
                  <InlineTemplateField
                    value={localizedRawValue(content, "leftTitle", locale)}
                    onChange={(value) => inlineEditor.onLocalizedTextChange("leftTitle", value)}
                    ariaLabel={locale === "zh" ? "左侧标题" : "Left title"}
                    placeholder={locale === "zh" ? "左侧标题" : "Left title"}
                    className={`${caseStudyLayout.majorTitle} w-full xl:[inline-size:3.2em] xl:[max-inline-size:3.2em] xl:[line-break:strict] xl:[word-break:normal] xl:[overflow-wrap:normal]`}
                    style={{ lineBreak: "strict", wordBreak: "normal", overflowWrap: "normal" }}
                  />
                ) : leftTitle ? (
                  <h2
                    className={`${caseStudyLayout.majorTitle} xl:[inline-size:3.2em] xl:[max-inline-size:3.2em] xl:[line-break:strict] xl:[word-break:normal] xl:[overflow-wrap:normal]`}
                    style={{
                      lineBreak: "strict",
                      wordBreak: "normal",
                      overflowWrap: "normal",
                    }}
                  >
                    {leftTitle}
                  </h2>
                ) : null}
              </div>
            </div>
          ) : null}

          {hasRightCopy ? (
            <div className="min-w-0 self-start">
              <div
                className={`${caseStudyLayout.majorCopy} xl:max-w-[calc(100%-2.5rem)]`}
              >
                {inlineEditor ? (
                  <InlineTemplateField
                    value={localizedRawValue(content, "statement", locale)}
                    onChange={(value) => inlineEditor.onLocalizedTextChange("statement", value)}
                    ariaLabel={locale === "zh" ? "核心观点" : "Core statement"}
                    placeholder={locale === "zh" ? "核心观点" : "Core statement"}
                    className={`${caseStudyLayout.majorHeading} w-full`}
                  />
                ) : statement ? (
                  <h3 className={caseStudyLayout.majorHeading}>{statement}</h3>
                ) : null}
                {inlineEditor ? (
                  <div style={{ marginTop: statement || localizedRawValue(content, "statement", locale) ? layoutControls.headingSpacing : 0 }}>
                    <InlineTemplateField
                      value={localizedRawValue(content, "body", locale)}
                      onChange={(value) => inlineEditor.onLocalizedTextChange("body", value)}
                      ariaLabel={locale === "zh" ? "解释正文" : "Supporting body"}
                      placeholder={locale === "zh" ? "解释正文" : "Supporting body"}
                      className="w-full whitespace-pre-wrap text-softWhite/70"
                      style={{ fontSize: `clamp(1.05rem, 1.15vw, ${layoutControls.bodyFontSize})`, lineHeight: layoutControls.lineHeight }}
                    />
                  </div>
                ) : body ? (
                  <div style={{ marginTop: statement ? layoutControls.headingSpacing : 0 }}>
                    {body
                      .split(/\n\s*\n/)
                      .filter(Boolean)
                      .map((paragraph, index) => (
                        <p
                          key={`${index}-${paragraph.slice(0, 24)}`}
                          className={`${index ? "mt-6" : ""} text-softWhite/70`}
                          style={{
                            fontSize: `clamp(1.05rem, 1.15vw, ${layoutControls.bodyFontSize})`,
                            lineHeight: layoutControls.lineHeight,
                          }}
                        >
                          {paragraph}
                        </p>
                      ))}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </TemplateContent>
    </TemplateSurface>
  );
}
