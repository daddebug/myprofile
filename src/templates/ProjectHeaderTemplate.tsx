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

export const layoutControls = {
  titleFontSize: "7.25rem",
  titleMaxWidth: "78rem",
  summaryMaxWidth: "70rem",
  topSpacing: "4rem",
  bottomSpacing: "5rem",
  textAlignment: "left" as "left" | "center" | "right",
} as const;

export const layoutControlSchema: TemplateLayoutControlDefinition[] = [
  { key: "titleFontSize", label: "Title font size" },
  { key: "titleMaxWidth", label: "Title max width" },
  { key: "summaryMaxWidth", label: "Summary max width" },
  { key: "topSpacing", label: "Top spacing" },
  { key: "bottomSpacing", label: "Bottom spacing" },
  {
    key: "textAlignment",
    label: "Text alignment",
    type: "select",
    options: [
      { label: "Left", value: "left" },
      { label: "Center", value: "center" },
      { label: "Right", value: "right" },
    ],
  },
];

export const templateMeta: TemplateMeta = {
  id: "project-header",
  nameZh: "项目标题",
  nameEn: "Project Header",
  descriptionZh: "用于项目开头的分类、日期、项目主标题与摘要层级。",
  descriptionEn:
    "The project-opening hierarchy for category, date, title, and summary.",
  schema: [
    {
      id: "category",
      labelZh: "分类",
      labelEn: "Category",
      type: "text",
      required: true,
    },
    {
      id: "duration",
      labelZh: "日期 / 周期",
      labelEn: "Date / duration",
      type: "text",
    },
    {
      id: "title",
      labelZh: "项目主标题",
      labelEn: "Project title",
      type: "text",
      required: true,
    },
    {
      id: "summary",
      labelZh: "简短摘要",
      labelEn: "Short summary",
      type: "richtext",
    },
  ],
  createdAt: "2026-07-26T00:00:00.000Z",
};

type LocalizedText = { zh: string; en: string };

export default function ProjectHeaderTemplate({
  content,
  locale,
  horizontalInset,
}: TemplateProps) {
  const category =
    (content.category as LocalizedText | undefined)?.[locale]?.trim() ?? "";
  const duration =
    (content.duration as LocalizedText | undefined)?.[locale]?.trim() ?? "";
  const title =
    (content.title as LocalizedText | undefined)?.[locale]?.trim() ?? "";
  const summary =
    (content.summary as LocalizedText | undefined)?.[locale]?.trim() ?? "";
  const alignedMargin =
    layoutControls.textAlignment === "center"
      ? "auto"
      : layoutControls.textAlignment === "right"
        ? "0 0 0 auto"
        : "0";

  return (
    <TemplateSurface
      style={{
        "--template-title-font-size": layoutControls.titleFontSize,
      }}
    >
      <TemplateContent
        horizontalInset={horizontalInset}
        style={{
          paddingTop: layoutControls.topSpacing,
          paddingBottom: layoutControls.bottomSpacing,
          textAlign: layoutControls.textAlignment,
        }}
      >
        <div className={caseStudyLayout.heroComposition}>
          <div className="max-w-none">
            {category ? (
              <p className={caseStudyLayout.category}>{category}</p>
            ) : null}
            {title ? (
              <h2
                className={`${caseStudyLayout.heroTitle} template-library-project-title [text-wrap:balance]`}
                style={{
                  maxWidth: layoutControls.titleMaxWidth,
                  marginInline: alignedMargin,
                }}
              >
                {title}
              </h2>
            ) : null}
            {summary ? (
              <p
                className={`${caseStudyLayout.subtitle} w-full whitespace-pre-line`}
                style={{
                  maxWidth: layoutControls.summaryMaxWidth,
                  marginInline: alignedMargin,
                }}
              >
                {summary}
              </p>
            ) : null}
          </div>
          {duration ? (
            <div className={caseStudyLayout.durationPosition}>
              <p className={caseStudyLayout.durationText}>{duration}</p>
            </div>
          ) : null}
        </div>
      </TemplateContent>
    </TemplateSurface>
  );
}
