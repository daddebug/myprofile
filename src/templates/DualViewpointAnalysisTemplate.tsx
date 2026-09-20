import {
  TemplateContent,
  TemplateSurface,
} from "../components/template-tools/TemplateResponsiveFoundation";
import type {
  CSSProperties,
} from "react";
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
    { id: "items", labelZh: "分析要点", labelEn: "Analysis points", type: "list", required: true },
    { id: "summary", labelZh: "底部总结", labelEn: "Closing summary", type: "textarea" },
  ],
  createdAt: "2026-09-07T00:00:00.000Z",
};

type LocalizedText = { zh?: string; en?: string };
type ViewpointItem = {
  id?: string;
  label?: string | LocalizedText;
  concept?: string | LocalizedText;
  description?: string | LocalizedText;
  conclusion?: string | LocalizedText;
  title?: string | LocalizedText;
  body?: string | LocalizedText;
};

const columnGaps = {
  compact: "clamp(1rem, 1.6vw, 1.5rem)",
  standard: "clamp(1.5rem, 2.4vw, 2.25rem)",
  wide: "clamp(2rem, 3vw, 3.25rem)",
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

function parseItems(value: unknown, locale: "zh" | "en", fallbackLabel = "") {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is ViewpointItem => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    .map((item, index) => ({
      id: item.id ?? `viewpoint-${index + 1}`,
      label: localizedValue(item.label, locale) || fallbackLabel,
      concept: localizedValue(item.concept, locale) || localizedValue(item.title, locale),
      description: localizedValue(item.description, locale) || localizedValue(item.body, locale),
      conclusion: localizedValue(item.conclusion, locale),
    }))
    .filter((item) => item.label || item.concept || item.description || item.conclusion);
}

// The template's real content model is fundamentally two-sided (see
// leftItems/rightItems below) -- this just groups the flat merged list back
// into its two original sides for layout, by the *existing* label field
// (already carried on every item), rather than a flat card grid that loses
// which side each item belongs to. No new content field.
function splitIntoColumns<T extends { label: string }>(items: T[]): [T[], T[]] {
  const seenLabels: string[] = [];
  for (const item of items) {
    if (item.label && !seenLabels.includes(item.label)) seenLabels.push(item.label);
  }
  if (seenLabels.length >= 2) {
    const [firstLabel, secondLabel] = seenLabels;
    const left = items.filter((item) => item.label === firstLabel);
    const right = items.filter((item) => item.label === secondLabel);
    const leftover = items.filter((item) => item.label !== firstLabel && item.label !== secondLabel);
    for (const item of leftover) (left.length <= right.length ? left : right).push(item);
    return [left, right];
  }
  // No usable label to group by (neither side supplied one) -- split the
  // flat list roughly in half so it still reads as two columns.
  const mid = Math.ceil(items.length / 2);
  return [items.slice(0, mid), items.slice(mid)];
}

function ViewpointBlock({ item }: { item: ReturnType<typeof parseItems>[number] }) {
  return (
    <article className="dual-viewpoint__item">
      {item.concept ? <h3 className="dual-viewpoint__concept">{item.concept}</h3> : null}
      {item.description ? <p className="dual-viewpoint__description">{item.description}</p> : null}
      {item.conclusion ? <p className="dual-viewpoint__conclusion">{item.conclusion}</p> : null}
    </article>
  );
}

function ViewpointColumn({
  label,
  items,
  side,
}: {
  label: string;
  items: ReturnType<typeof parseItems>;
  side: "left" | "right";
}) {
  return (
    <div className="dual-viewpoint__column">
      {label ? <p className={`dual-viewpoint__column-label dual-viewpoint__column-label--${side}`}>{label}</p> : null}
      {items.map((item) => (
        <ViewpointBlock item={item} key={item.id} />
      ))}
    </div>
  );
}

export default function DualViewpointAnalysisTemplate({ content, locale, horizontalInset }: TemplateProps) {
  const title = localizedValue(content.title as LocalizedText | undefined, locale);
  const subtitle = localizedValue(content.subtitle as LocalizedText | undefined, locale);
  const items = Array.isArray(content.items)
    ? parseItems(content.items, locale)
    : [
        ...parseItems(content.leftItems, locale, localizedValue(content.leftLabel as LocalizedText | undefined, locale)),
        ...parseItems(content.rightItems, locale, localizedValue(content.rightLabel as LocalizedText | undefined, locale)),
      ];
  const [leftItems, rightItems] = splitIntoColumns(items);
  const leftLabel = leftItems[0]?.label ?? localizedValue(content.leftLabel as LocalizedText | undefined, locale);
  const rightLabel = rightItems[0]?.label ?? localizedValue(content.rightLabel as LocalizedText | undefined, locale);
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

        <div className="dual-viewpoint__body" style={{ "--dual-card-gap": columnGap } as CSSProperties}>
          <span className="dual-viewpoint__guide" aria-hidden="true" />
          <div className="dual-viewpoint__columns">
            <ViewpointColumn label={leftLabel} items={leftItems} side="left" />
            <ViewpointColumn label={rightLabel} items={rightItems} side="right" />
          </div>
        </div>
        {summary ? <p className="dual-viewpoint__summary">{summary}</p> : null}
      </TemplateContent>
    </TemplateSurface>
  );
}
