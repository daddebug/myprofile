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
import "./concept-diagnosis-cards-template.css";

// A separate template from dual-viewpoint-analysis -- that one is the
// card-free, two-column opportunity/challenge text layout. This one is for
// 2-5 independent concept/diagnosis cards shown side by side, each a real
// visual block (icon + concept bar + conclusion bar), not a text column.
export const layoutControls = {
  cardGap: "standard",
  sectionSpacing: "standard",
} as const;

export const layoutControlSchema: TemplateLayoutControlDefinition[] = [
  { key: "cardGap", label: "Card spacing" },
  { key: "sectionSpacing", label: "Vertical spacing" },
];

export const templateMeta: TemplateMeta = {
  id: "concept-diagnosis-cards",
  nameZh: "概念诊断卡",
  nameEn: "Concept Diagnosis Cards",
  descriptionZh: "并列展示 3-5 个独立的概念或诊断结论，每张卡带图标、核心概念条与结论条。",
  descriptionEn: "3-5 side-by-side concept or diagnosis cards, each with an icon, a core-concept bar, and a conclusion bar.",
  schema: [
    { id: "title", labelZh: "主标题", labelEn: "Title", type: "text", required: true },
    { id: "items", labelZh: "诊断卡片", labelEn: "Diagnosis cards", type: "list", min: 3, max: 5, required: true },
  ],
  createdAt: "2026-09-07T12:00:00.000Z",
};

type LocalizedText = { zh?: string; en?: string };
type DiagnosisCardItem = {
  id?: string;
  label?: string | LocalizedText;
  title?: string | LocalizedText;
  description?: string | LocalizedText;
  conclusion?: string | LocalizedText;
  icon?: { id?: string; name?: string; title?: string; svgPath?: string };
};

const cardGaps = {
  compact: "clamp(1.25rem, 2vw, 1.75rem)",
  standard: "clamp(1.75rem, 2.6vw, 2.5rem)",
  wide: "clamp(2.25rem, 3.4vw, 3.25rem)",
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
    .filter((item): item is DiagnosisCardItem => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    .map((item, index) => ({
      id: item.id ?? `diagnosis-${index + 1}`,
      label: localizedValue(item.label, locale),
      title: localizedValue(item.title, locale),
      description: localizedValue(item.description, locale),
      conclusion: localizedValue(item.conclusion, locale),
      icon: item.icon?.svgPath ? item.icon : undefined,
    }))
    .filter((item) => item.label || item.title || item.description || item.conclusion)
    .slice(0, 5);
}

const defaultIcons = [
  <><circle cx="20" cy="23" r="5" /><circle cx="44" cy="23" r="5" /><circle cx="32" cy="43" r="5" /><path d="m24 26 5 11m11-11-5 11M25 23h14" /></>,
  <><path d="M13 18h16v13H18v15h11M51 18H35v13h11v15H35" /><path d="M26 38h12" /></>,
  <><path d="M14 47 29 32l8 7 13-20" /><path d="M42 19h8v8" /><circle cx="14" cy="47" r="3" /></>,
  <><circle cx="32" cy="32" r="10" /><path d="M12 25V12h13M39 12h13v13M52 39v13H39M25 52H12V39" /></>,
  <><path d="M32 13v38M17 20h30M21 20l-8 16h16l-8-16M43 20l-8 16h16l-8-16" /></>,
];

const accents = ["lime", "cyan", "violet"] as const;

function DiagnosisCard({ item, index }: { item: ReturnType<typeof parseItems>[number]; index: number }) {
  const accent = accents[index % accents.length];
  return (
    <article className="concept-cards__card" data-accent={accent}>
      {item.label ? <p className="concept-cards__label">{item.label}</p> : null}
      {item.icon ? (
        <img className="concept-cards__icon" src={item.icon.svgPath} alt="" />
      ) : (
        <svg className="concept-cards__icon" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{defaultIcons[index % defaultIcons.length]}</svg>
      )}
      {item.title ? <h3 className="concept-cards__title">{item.title}</h3> : null}
      {item.description ? <p className="concept-cards__description">{item.description}</p> : null}
      {item.conclusion ? <p className="concept-cards__conclusion">{item.conclusion}</p> : null}
    </article>
  );
}

export default function ConceptDiagnosisCardsTemplate({ content, locale, horizontalInset }: TemplateProps) {
  const title = localizedValue(content.title as LocalizedText | undefined, locale);
  const items = parseItems(content.items, locale);
  const cardGap = cardGaps[layoutControls.cardGap as keyof typeof cardGaps] ?? cardGaps.standard;
  const spacing = sectionSpacings[layoutControls.sectionSpacing as keyof typeof sectionSpacings] ?? sectionSpacings.standard;

  if (items.length < 2) return null;

  return (
    <TemplateSurface className="concept-cards">
      <TemplateContent horizontalInset={horizontalInset} style={spacing}>
        {title ? (
          <header className="concept-cards__header">
            <h2 className="concept-cards__heading">{title}</h2>
            <span className="concept-cards__rule" aria-hidden="true" />
          </header>
        ) : null}

        <div className="concept-cards__grid" data-count={items.length} style={{ "--card-gap": cardGap } as CSSProperties}>
          {items.map((item, index) => (
            <DiagnosisCard item={item} index={index} key={item.id} />
          ))}
        </div>
      </TemplateContent>
    </TemplateSurface>
  );
}
