import { InlineTemplateField } from "../components/template-tools/InlineTemplateField";
import type {
  TemplateLayoutControlDefinition,
  TemplateMeta,
  TemplateProps,
} from "../lib/templateLibrary";
import "./supporting-note-template.css";

export const layoutControls = {
  bodyFontSize: "1.125rem",
  verticalSpacing: "2.5rem",
} as const;

export const layoutControlSchema: TemplateLayoutControlDefinition[] = [
  { key: "bodyFontSize", label: "Text size" },
  { key: "verticalSpacing", label: "Vertical spacing" },
];

export const templateMeta: TemplateMeta = {
  id: "supporting-note",
  nameZh: "影响 / 结果",
  nameEn: "Impact",
  // Restricted final-result template -- not a generic note, summary, or
  // background/rationale block. Only for already-happened, evidenced
  // outcomes (metrics, validated test results, confirmed business/UX
  // impact), placed near the narrative's ending after solution/validation.
  // See projectCodeTemplateContracts.ts's "supporting-note" contract for
  // the full AI selection rule this description must stay consistent with.
  descriptionZh: "带细边框、随内容自然增长的说明；仅用于已发生且有依据的项目结果/影响（如指标提升、可用性测试结论、已验证的业务或体验改善），不用于背景、目标、假设、预期效果或一般总结。",
  descriptionEn: "A bordered, content-driven statement -- restricted to already-happened, evidenced project results or impact (e.g. a metric change, a usability-test finding, a confirmed business/UX improvement). Not for background, goals, hypotheses, expected benefits, or a generic summary.",
  schema: [
    {
      id: "body",
      labelZh: "补充文字",
      labelEn: "Supporting text",
      type: "richtext",
    },
  ],
  createdAt: "2026-07-26T00:00:03.000Z",
};

type LocalizedText = { zh: string; en: string };

export default function SupportingNoteTemplate({
  content,
  locale,
  inlineEditor,
}: TemplateProps) {
  const body =
    (content.body as LocalizedText | undefined)?.[locale]?.trim() ?? "";

  if (!body && !inlineEditor) return null;

  return (
    <section className="portfolio2-impact">
      <div className="portfolio2-impact__panel p2-page-rail">
        {inlineEditor ? (
          <InlineTemplateField value={body} onChange={(value) => inlineEditor.onLocalizedTextChange("body", value)} ariaLabel={locale === "zh" ? "影响说明" : "Impact statement"} placeholder={locale === "zh" ? "影响说明" : "Impact statement"} className="portfolio2-impact__body" />
        ) : <p className="portfolio2-impact__body">{body}</p>}
      </div>
    </section>
  );
}
