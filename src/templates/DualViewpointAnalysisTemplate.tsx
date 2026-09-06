import {
  TemplateContent,
  TemplateSurface,
} from "../components/template-tools/TemplateResponsiveFoundation";
import type {
  TemplateLayoutControlDefinition,
  TemplateMeta,
  TemplateProps,
} from "../lib/templateLibrary";
import "./dual-viewpoint-analysis-template.css";

export const layoutControls = {
  columnGap: "standard",
  sectionSpacing: "standard",
} as const;

export const layoutControlSchema: TemplateLayoutControlDefinition[] = [
  { key: "columnGap", label: "Column spacing" },
  { key: "sectionSpacing", label: "Vertical spacing" },
];

export const templateMeta: TemplateMeta = {
  id: "dual-viewpoint-analysis",
  nameZh: "双列观点分析",
  nameEn: "Dual Viewpoint Analysis",
  descriptionZh: "用于呈现机遇与挑战、优点与问题、现状与方向等高层判断。",
  descriptionEn: "Two aligned viewpoints for opportunities, challenges, strengths, risks, or strategic directions.",
  schema: [
    { id: "title", labelZh: "主标题", labelEn: "Title", type: "text", required: true },
    { id: "subtitle", labelZh: "副标题", labelEn: "Subtitle", type: "textarea" },
    { id: "leftLabel", labelZh: "左列标签", labelEn: "Left label", type: "text", required: true },
    { id: "leftItems", labelZh: "左列观点", labelEn: "Left viewpoints", type: "list", min: 1, max: 4, required: true },
    { id: "rightLabel", labelZh: "右列标签", labelEn: "Right label", type: "text", required: true },
    { id: "rightItems", labelZh: "右列观点", labelEn: "Right viewpoints", type: "list", min: 1, max: 4, required: true },
    { id: "summary", labelZh: "底部总结", labelEn: "Closing summary", type: "textarea" },
  ],
  createdAt: "2026-09-07T00:00:00.000Z",
};

type LocalizedText = { zh?: string; en?: string };
type ViewpointItem = {
  id?: string;
  title?: string | LocalizedText;
  body?: string | LocalizedText;
  icon?: { id?: string; name?: string; title?: string; svgPath?: string };
};

const columnGaps = {
  compact: "clamp(2.5rem, 6vw, 5rem)",
  standard: "clamp(4rem, 8vw, 7.5rem)",
  wide: "clamp(5rem, 10vw, 9rem)",
} as const;

const sectionSpacings = {
  compact: { paddingTop: "4rem", paddingBottom: "4rem" },
  standard: { paddingTop: "5.5rem", paddingBottom: "5.5rem" },
  wide: { paddingTop: "7rem", paddingBottom: "7rem" },
} as const;

function localizedValue(value: string | LocalizedText | undefined, locale: "zh" | "en") {
  if (typeof value === "string") return value.trim();
  return value?.[locale]?.trim() || value?.zh?.trim() || "";
}

function parseItems(value: unknown, locale: "zh" | "en") {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is ViewpointItem => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    .map((item, index) => ({
      id: item.id ?? `viewpoint-${index + 1}`,
      title: localizedValue(item.title, locale),
      body: localizedValue(item.body, locale),
      icon: item.icon?.svgPath ? item.icon : undefined,
    }))
    .filter((item) => item.title || item.body)
    .slice(0, 4);
}

function ViewpointColumn({
  side,
  label,
  items,
}: {
  side: "left" | "right";
  label: string;
  items: ReturnType<typeof parseItems>;
}) {
  const defaultIcon = side === "left"
    ? <><circle cx="20" cy="23" r="5" /><circle cx="44" cy="23" r="5" /><circle cx="32" cy="43" r="5" /><path d="m24 26 5 11m11-11-5 11M25 23h14" /></>
    : <><path d="M13 18h16v13H18v15h11M51 18H35v13h11v15H35" /><path d="M26 38h12" /></>;
  return (
    <section className={`dual-viewpoint__column dual-viewpoint__column--${side}`}>
      {label ? <p className="dual-viewpoint__label">{label}</p> : null}
      <div className="dual-viewpoint__items">
        {items.map((item) => (
          <article className="dual-viewpoint__item" key={item.id}>
            <div className="dual-viewpoint__item-heading">
              {item.icon ? (
                <img className="dual-viewpoint__icon" src={item.icon.svgPath} alt="" />
              ) : (
                <svg className="dual-viewpoint__icon" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{defaultIcon}</svg>
              )}
              {item.title ? <h3 className="dual-viewpoint__item-title">{item.title}</h3> : null}
            </div>
            <span className="dual-viewpoint__item-rule" aria-hidden="true" />
            {item.body ? <p className="dual-viewpoint__item-body">{item.body}</p> : null}
          </article>
        ))}
      </div>
    </section>
  );
}

export default function DualViewpointAnalysisTemplate({ content, locale, horizontalInset }: TemplateProps) {
  const title = localizedValue(content.title as LocalizedText | undefined, locale);
  const subtitle = localizedValue(content.subtitle as LocalizedText | undefined, locale);
  const leftLabel = localizedValue(content.leftLabel as LocalizedText | undefined, locale);
  const rightLabel = localizedValue(content.rightLabel as LocalizedText | undefined, locale);
  const leftItems = parseItems(content.leftItems, locale);
  const rightItems = parseItems(content.rightItems, locale);
  const summary = localizedValue(content.summary as LocalizedText | undefined, locale);
  const columnGap = columnGaps[layoutControls.columnGap as keyof typeof columnGaps] ?? columnGaps.standard;
  const spacing = sectionSpacings[layoutControls.sectionSpacing as keyof typeof sectionSpacings] ?? sectionSpacings.standard;

  return (
    <TemplateSurface className="dual-viewpoint">
      <TemplateContent horizontalInset={horizontalInset} style={spacing}>
        <header className="dual-viewpoint__header">
          {title ? <h2 className="dual-viewpoint__title">{title}</h2> : null}
          {title ? <span className="dual-viewpoint__rule" aria-hidden="true" /> : null}
          {subtitle ? <p className="dual-viewpoint__subtitle">{subtitle}</p> : null}
        </header>

        <div className="dual-viewpoint__body" style={{ columnGap }}>
          <span className="dual-viewpoint__guide" aria-hidden="true" />
          <ViewpointColumn side="left" label={leftLabel} items={leftItems} />
          <ViewpointColumn side="right" label={rightLabel} items={rightItems} />
        </div>
        {summary ? <p className="dual-viewpoint__summary">{summary}</p> : null}
      </TemplateContent>
    </TemplateSurface>
  );
}
