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
  circleSize: "standard",
  circleSpacing: "standard",
  verticalSpacing: "standard",
} as const;

export const layoutControlSchema: TemplateLayoutControlDefinition[] = [
  { key: "circleSize", label: "Circle size" },
  { key: "circleSpacing", label: "Circle spacing" },
  { key: "verticalSpacing", label: "Vertical spacing" },
];

export const templateMeta: TemplateMeta = {
  id: "circle-summary",
  nameZh: "圆形总结",
  nameEn: "Circle Summary",
  descriptionZh: "以三至五个并列圆形呈现核心判断、设计结论或总结。",
  descriptionEn:
    "Three to five parallel circles for core judgments, design conclusions, or summaries.",
  schema: [
    {
      id: "heading",
      labelZh: "顶部标题",
      labelEn: "Heading",
      type: "text",
    },
    {
      id: "items",
      labelZh: "圆形总结",
      labelEn: "Circle summaries",
      type: "list",
      min: 3,
      max: 5,
      required: true,
    },
  ],
  createdAt: "2026-07-26T00:00:05.000Z",
};

type LocalizedText = { zh: string; en: string };
type CircleSummaryItem = {
  id?: string;
  text?: string | LocalizedText;
};

const circleSizes = {
  standard: "clamp(8.125rem, 12vw, 10.625rem)",
  smaller: "clamp(7.25rem, 10vw, 9.25rem)",
} as const;

const circleGaps = {
  compact: "2.25rem",
  standard: "3.25rem",
  wide: "4rem",
} as const;

const sectionSpacing = {
  compact: { paddingTop: "3.5rem", paddingBottom: "3.5rem" },
  standard: { paddingTop: "5rem", paddingBottom: "4.5rem" },
  wide: { paddingTop: "6rem", paddingBottom: "6rem" },
} as const;

function localizedValue(
  value: string | LocalizedText | undefined,
  locale: "zh" | "en",
) {
  if (typeof value === "string") return value.trim();
  return value?.[locale]?.trim() ?? "";
}

function isCircleSummaryItem(value: unknown): value is CircleSummaryItem {
  return Boolean(value && typeof value === "object");
}

export default function CircleSummaryTemplate({
  content,
  locale,
  horizontalInset,
}: TemplateProps) {
  const heading = localizedValue(
    content.heading as LocalizedText | undefined,
    locale,
  );
  const items = Array.isArray(content.items)
    ? content.items
        .filter(isCircleSummaryItem)
        .map((item) => ({
          id: item.id,
          text: localizedValue(item.text, locale),
        }))
        .filter((item) => item.text)
        .slice(0, 5)
    : [];

  const circleSize =
    circleSizes[layoutControls.circleSize as keyof typeof circleSizes]
    ?? circleSizes.standard;
  const circleGap =
    circleGaps[layoutControls.circleSpacing as keyof typeof circleGaps]
    ?? circleGaps.standard;
  const spacing =
    sectionSpacing[
      layoutControls.verticalSpacing as keyof typeof sectionSpacing
    ] ?? sectionSpacing.standard;

  return (
    <TemplateSurface>
      <TemplateContent horizontalInset={horizontalInset} style={spacing}>
        {heading ? (
          <h2 className="text-center font-display text-[clamp(1.25rem,2vw,1.5rem)] font-semibold leading-[1.3] text-softWhite">
            {heading}
          </h2>
        ) : null}

        {items.length >= 3 ? (
          <div
            className={`grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center ${
              heading ? "mt-8" : ""
            }`}
          >
            <span
              className="h-px w-full bg-[#5968A8]/40"
              aria-hidden="true"
            />
            <div
              className="flex flex-nowrap items-center justify-center"
              style={{ columnGap: circleGap }}
            >
              {items.map((item, index) => (
                <div
                  key={item.id ?? `${index}-${item.text}`}
                  className="flex shrink-0 items-center justify-center rounded-full bg-acidGreen/90 p-5 text-center shadow-[0_16px_40px_rgba(198,255,66,0.14),inset_0_1px_0_rgba(255,255,255,0.26)]"
                  style={{
                    width: circleSize,
                    height: circleSize,
                  }}
                >
                  <p className="text-[clamp(1.0625rem,1.4vw,1.25rem)] font-semibold leading-[1.4] text-deepIndigo">
                    {item.text}
                  </p>
                </div>
              ))}
            </div>
            <span
              className="h-px w-full bg-[#5968A8]/40"
              aria-hidden="true"
            />
          </div>
        ) : (
          <p
            className={`text-center text-sm text-softWhite/46 ${
              heading ? "mt-8" : ""
            }`}
          >
            {locale === "zh"
              ? "请至少添加 3 个有内容的总结。"
              : "Add at least 3 summaries with content."}
          </p>
        )}
      </TemplateContent>
    </TemplateSurface>
  );
}
