import { InlineTemplateField } from "../components/template-tools/InlineTemplateField";
import type {
  TemplateLayoutControlDefinition,
  TemplateMeta,
  TemplateProps,
} from "../lib/templateLibrary";

import "./statement-longform-template.css";

type LocalizedText = { zh?: string; en?: string };

function localized(content: TemplateProps["content"], key: string, locale: "zh" | "en") {
  return (content[key] as LocalizedText | undefined)?.[locale] ?? "";
}
export const layoutControls = {
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
  nameZh: "正文",
  nameEn: "Body",
  descriptionZh: "动态高度的章节标签、重点句与正文。",
  descriptionEn: "A dynamic-height label, lead sentence, and body section.",
  schema: [
    {
      id: "sectionNumber",
      labelZh: "旧章节编号（自动编号已不使用）",
      labelEn: "Legacy section number (unused by auto numbering)",
      type: "text",
    },
    {
      id: "leftTitle",
      labelZh: "章节标签 / Kicker",
      labelEn: "Section label / Kicker",
      type: "text",
    },
    {
      id: "statement",
      labelZh: "核心观点",
      labelEn: "Headline",
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

export default function StatementLongformTemplate({
  content,
  locale,
  inlineEditor,
}: TemplateProps) {
  const kicker = localized(content, "leftTitle", locale);
  const headline = localized(content, "statement", locale);
  const body = localized(content, "body", locale);
  const field = (key: string, value: string, className: string, placeholder: string) => inlineEditor ? (
    <InlineTemplateField value={value} onChange={(next) => inlineEditor.onLocalizedTextChange(key, next)} ariaLabel={placeholder} placeholder={placeholder} className={className} />
  ) : value.trim() ? key === "statement" ? <h2 className={className}>{value}</h2> : <p className={className}>{value}</p> : null;
  return (
    <section className="portfolio2-body">
      <div className="p2-page-rail">
        {field("leftTitle", kicker, "portfolio2-body__kicker", locale === "zh" ? "章节标签" : "Section label")}
        {field("statement", headline, "portfolio2-body__headline", locale === "zh" ? "重点句" : "Lead sentence")}
        {field("body", body, "portfolio2-body__copy", locale === "zh" ? "正文" : "Body")}
      </div>
    </section>
  );
}
