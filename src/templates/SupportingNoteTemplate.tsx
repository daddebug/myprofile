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
  bodyFontSize: "1.125rem",
  verticalSpacing: "2.5rem",
} as const;

export const layoutControlSchema: TemplateLayoutControlDefinition[] = [
  { key: "bodyFontSize", label: "Text size" },
  { key: "verticalSpacing", label: "Vertical spacing" },
];

export const templateMeta: TemplateMeta = {
  id: "supporting-note",
  nameZh: "补充说明",
  nameEn: "Supporting Note",
  descriptionZh: "用于章节之间的背景、前提、限制或过渡信息。",
  descriptionEn:
    "Supporting context, constraints, or transitions between case-study sections.",
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
  horizontalInset,
}: TemplateProps) {
  const body =
    (content.body as LocalizedText | undefined)?.[locale]?.trim() ?? "";

  if (!body) return null;

  const paragraphs = body
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return (
    <TemplateSurface>
      <section className="bg-transparent">
        <TemplateContent horizontalInset={horizontalInset}>
          <div
            className="w-full border-t border-softWhite/10 text-left text-softWhite/68"
            style={{
              maxWidth: "none",
              marginInline: 0,
              paddingBlock: layoutControls.verticalSpacing,
              fontSize: `clamp(1rem, 1.1vw, ${layoutControls.bodyFontSize})`,
              lineHeight: 1.85,
            }}
          >
            {paragraphs.map((paragraph, index) => (
              <p
                key={`${index}-${paragraph.slice(0, 24)}`}
                className="whitespace-pre-line"
                style={{ marginBottom: index < paragraphs.length - 1 ? 20 : 0 }}
              >
                {paragraph}
              </p>
            ))}
          </div>
        </TemplateContent>
      </section>
    </TemplateSurface>
  );
}
