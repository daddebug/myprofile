import {
  TemplateContent,
  TemplateSurface,
} from "../components/template-tools/TemplateResponsiveFoundation";
import type {
  TemplateLayoutControlDefinition,
  TemplateMeta,
  TemplateProps,
} from "../lib/templateLibrary";

// Distinct from circle-summary: circle-summary is parallel judgments /
// conclusions (a closed set of verdicts). This is "what to do next" -- 3-5
// concrete solution directions, design strategies, or recommended actions,
// each with a short title and a few lines of explanation. No cards, no
// icons, no glow, no heavy borders -- plain scannable text blocks on the
// page's own background.
export const layoutControls = {
  sectionSpacing: "standard",
} as const;

export const layoutControlSchema: TemplateLayoutControlDefinition[] = [
  { key: "sectionSpacing", label: "Vertical spacing" },
];

export const templateMeta: TemplateMeta = {
  id: "solution-directions",
  nameZh: "解决方向",
  nameEn: "Solution Directions",
  descriptionZh: "并列展示 3-5 个解决方向、设计策略、改进方案或推荐动作。",
  descriptionEn: "3-5 parallel solution directions, design strategies, improvement plans, or recommended actions.",
  schema: [
    { id: "title", labelZh: "主标题", labelEn: "Title", type: "text", required: true },
    { id: "subtitle", labelZh: "副标题", labelEn: "Subtitle", type: "textarea" },
    { id: "items", labelZh: "方案项", labelEn: "Solution items", type: "list", min: 3, max: 5, required: true },
  ],
  createdAt: "2026-09-07T18:00:00.000Z",
};

type LocalizedText = { zh: string; en: string };
type SolutionDirectionItem = {
  id?: string;
  title?: string | LocalizedText;
  body?: string | LocalizedText;
};

const sectionSpacings = {
  compact: { paddingTop: "4rem", paddingBottom: "4rem" },
  standard: { paddingTop: "5.5rem", paddingBottom: "5.5rem" },
  wide: { paddingTop: "7rem", paddingBottom: "7rem" },
} as const;

const accents = ["rgba(198,255,66,0.7)", "rgba(105,226,232,0.7)", "rgba(160,160,244,0.75)"] as const;

function localizedValue(value: string | LocalizedText | undefined, locale: "zh" | "en") {
  if (typeof value === "string") return value.trim();
  return value?.[locale]?.trim() || value?.zh?.trim() || "";
}

function isSolutionDirectionItem(value: unknown): value is SolutionDirectionItem {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export default function SolutionDirectionsTemplate({ content, locale, horizontalInset }: TemplateProps) {
  const title = localizedValue(content.title as LocalizedText | undefined, locale);
  const subtitle = localizedValue(content.subtitle as LocalizedText | undefined, locale);
  const items = Array.isArray(content.items)
    ? content.items
        .filter(isSolutionDirectionItem)
        .map((item, index) => ({
          id: item.id ?? `solution-${index + 1}`,
          title: localizedValue(item.title, locale),
          body: localizedValue(item.body, locale),
        }))
        .filter((item) => item.title || item.body)
        .slice(0, 5)
    : [];

  const spacing = sectionSpacings[layoutControls.sectionSpacing as keyof typeof sectionSpacings] ?? sectionSpacings.standard;

  return (
    <TemplateSurface>
      <TemplateContent horizontalInset={horizontalInset} style={spacing}>
        {title ? (
          <header className="mx-auto max-w-[58rem] text-center">
            <h2 className="font-display text-[clamp(1.5rem,2.6vw,2.25rem)] font-semibold leading-[1.2] text-[rgba(140,225,232,0.94)]">
              {title}
            </h2>
            <span
              className="mx-auto mt-4 block h-px w-[clamp(3.5rem,8vw,6.5rem)]"
              style={{ background: "linear-gradient(90deg, transparent, rgba(148,168,210,0.55) 42%, rgba(148,168,210,0.35) 68%, transparent)" }}
              aria-hidden="true"
            />
            {subtitle ? (
              <p className="mx-auto mt-4 max-w-[48rem] text-[clamp(0.95rem,1.3vw,1.1rem)] leading-[1.65] text-softWhite/68">
                {subtitle}
              </p>
            ) : null}
          </header>
        ) : null}

        {items.length >= 3 ? (
          <div
            className={`mx-auto mt-12 grid w-full max-w-[68rem] grid-cols-1 gap-x-10 gap-y-10 md:mt-14 ${
              items.length === 3
                ? "sm:grid-cols-3"
                : items.length === 4
                  ? "sm:grid-cols-4"
                  // 5, 3+2 centered: a 6-track row lets the first three
                  // items fill row one evenly (2 tracks each) and the last
                  // two sit centered on row two (offset by one spare track
                  // on each side) instead of an uneven 5-across squeeze.
                  : "sm:grid-cols-6"
            }`}
          >
            {items.map((item, index) => (
              <div
                key={item.id}
                className={`min-w-0 ${
                  items.length === 5
                    ? index < 3
                      ? "sm:col-span-2"
                      : index === 3
                        ? "sm:col-start-2 sm:col-span-2"
                        : "sm:col-start-4 sm:col-span-2"
                    : ""
                }`}
              >
                <span
                  className="block h-[2px] w-8 rounded-full"
                  style={{ background: accents[index % accents.length] }}
                  aria-hidden="true"
                />
                {item.title ? (
                  <h3 className="mt-3 font-display text-[clamp(1.05rem,1.5vw,1.25rem)] font-semibold leading-[1.35] text-softWhite">
                    {item.title}
                  </h3>
                ) : null}
                {item.body ? (
                  <p className="mt-2.5 text-[clamp(0.92rem,1.2vw,1.02rem)] leading-[1.7] text-softWhite/74">
                    {item.body}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className={`text-center text-sm text-softWhite/46 ${title ? "mt-8" : ""}`}>
            {locale === "zh"
              ? "请至少添加 3 个有内容的解决方向。"
              : "Add at least 3 solution directions with content."}
          </p>
        )}
      </TemplateContent>
    </TemplateSurface>
  );
}
