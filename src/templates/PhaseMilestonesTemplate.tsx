import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  TemplateContent,
  TemplateSurface,
} from "../components/template-tools/TemplateResponsiveFoundation";
import type {
  TemplateLayoutControlDefinition,
  TemplateMeta,
  TemplateProps,
} from "../lib/templateLibrary";
import "./phase-milestones-template.css";

export const layoutControls = {
  emphasisMode: "custom",
  nodeSpacing: "standard",
  verticalSpacing: "standard",
} as const;

export const layoutControlSchema: TemplateLayoutControlDefinition[] = [
  { key: "emphasisMode", label: "Node emphasis" },
  { key: "nodeSpacing", label: "Node spacing" },
  { key: "verticalSpacing", label: "Vertical spacing" },
];

export const templateMeta: TemplateMeta = {
  id: "phase-milestones",
  nameZh: "阶段节点",
  nameEn: "Phase Milestones",
  descriptionZh: "以横向节点呈现项目阶段与重点介入位置。",
  descriptionEn:
    "A horizontal milestone sequence for project phases and intervention points.",
  schema: [
    {
      id: "heading",
      labelZh: "顶部标题",
      labelEn: "Heading",
      type: "text",
    },
    {
      id: "items",
      labelZh: "阶段节点",
      labelEn: "Milestones",
      type: "list",
      min: 3,
      max: 5,
    },
  ],
  createdAt: "2026-07-26T00:00:04.000Z",
};

type LocalizedText = { zh: string; en: string };
type MilestoneState = "outline" | "active";
type MilestoneItem = {
  id?: string;
  number?: string | LocalizedText;
  title?: string | LocalizedText;
  hoverTitle?: string | LocalizedText;
  hoverText?: string | LocalizedText;
  targetId?: string;
  state?: MilestoneState;
};

const columnGapRem = {
  compact: 1.5,
  standard: 2,
  wide: 3,
} as const;

const sectionSpacing = {
  compact: "2.25rem",
  standard: "3rem",
  wide: "4rem",
} as const;

function localizedValue(
  value: string | LocalizedText | undefined,
  locale: "zh" | "en",
) {
  if (typeof value === "string") return value.trim();
  return value?.[locale]?.trim() ?? "";
}

function isMilestoneItem(value: unknown): value is MilestoneItem {
  return Boolean(value && typeof value === "object");
}

// Number is always derived from position, never from stored data or the
// content schema -- see templateMeta.schema (unchanged) and the owner
// editor, which no longer exposes a number field at all.
function displayNumber(index: number) {
  return String(index + 1).padStart(2, "0");
}

function MilestoneItemColumn({
  item,
  index,
  itemCount,
  locale,
  revealed,
}: {
  item: MilestoneItem;
  index: number;
  itemCount: number;
  locale: "zh" | "en";
  revealed: boolean;
}) {
  const title = localizedValue(item.title, locale);
  // Reuses the existing hoverText field -- no schema change, no new
  // content field. hoverTitle and targetId remain on the type/data for
  // backward compatibility with existing published instances, but this
  // template no longer displays or acts on them.
  //
  // Per the 2026-09-08 PSD re-sync, the description is no longer one
  // wrapped paragraph -- it's up to 3 short bullet rows (dot + line). The
  // owner authors this the same way the Hero title's manual line breaks
  // work: a literal newline in the existing text starts a new row.
  // Existing content with no newline still renders (as a single row that
  // wraps if long); see docs/design/psd-template-spec.json's NODE_DESC
  // dataMappingNote.
  const descriptionRows = localizedValue(item.hoverText, locale)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3);
  const isActive =
    String(layoutControls.emphasisMode) === "second-half"
      ? index >= Math.ceil(itemCount / 2)
      : item.state === "active";
  // Staggered one-time reveal on first viewport entry (see the
  // IntersectionObserver in the default export). Starts already-revealed
  // under prefers-reduced-motion, so there is no delayed pop-in for those
  // users.
  const revealDelayMs = index * 90;

  return (
    <div
      className={`phase-milestones__item ${isActive ? "is-active" : ""} ${revealed ? "is-revealed" : ""}`}
    >
      <span
        className="phase-milestones__number"
        style={{ transitionDelay: revealed ? `${revealDelayMs}ms` : "0ms" }}
      >
        {displayNumber(index)}
      </span>
      {title ? (
        <p
          className="phase-milestones__title"
          style={{ transitionDelay: revealed ? `${revealDelayMs + 70}ms` : "0ms" }}
        >
          {title}
        </p>
      ) : null}
      {descriptionRows.length > 0 ? (
        <div
          className="phase-milestones__description"
          style={{ transitionDelay: revealed ? `${revealDelayMs + 120}ms` : "0ms" }}
        >
          {descriptionRows.map((row, rowIndex) => (
            <div className="phase-milestones__description-row" key={rowIndex}>
              <span className="phase-milestones__description-dot" aria-hidden="true" />
              <span className="phase-milestones__description-text">{row}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function PhaseMilestonesTemplate({
  content,
  locale,
  horizontalInset,
}: TemplateProps) {
  const heading = localizedValue(
    content.heading as LocalizedText | undefined,
    locale,
  );
  const items = Array.isArray(content.items)
    ? content.items.filter(isMilestoneItem).slice(0, 5)
    : [];

  // One-time, sequential "light up" of the items the first time this
  // section enters the viewport (see MilestoneItemColumn's per-index
  // reveal delay). Disconnects after firing once; starts already-revealed
  // under prefers-reduced-motion so there is no delayed pop-in for those
  // users.
  const sectionRef = useRef<HTMLElement | null>(null);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const node = sectionRef.current;
    if (!node) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setRevealed(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const gapRem =
    columnGapRem[
      layoutControls.nodeSpacing as keyof typeof columnGapRem
    ] ?? columnGapRem.standard;
  const paddingBlock =
    sectionSpacing[
      layoutControls.verticalSpacing as keyof typeof sectionSpacing
    ] ?? sectionSpacing.standard;

  if (items.length < 3) {
    return (
      <TemplateSurface className="phase-milestones">
        <TemplateContent horizontalInset={horizontalInset} style={{ paddingBlock }}>
          <p className="text-center text-sm text-softWhite/46">
            {locale === "zh"
              ? "请添加至少 3 个阶段节点。"
              : "Add at least 3 milestone items."}
          </p>
        </TemplateContent>
      </TemplateSurface>
    );
  }

  return (
    <TemplateSurface className="phase-milestones">
      <section ref={sectionRef} aria-label={heading || undefined}>
        <TemplateContent horizontalInset={horizontalInset} style={{ paddingBlock }}>
          <div
            className="phase-milestones__track"
            style={{ "--phase-count": items.length } as CSSProperties}
          >
            <span className="phase-milestones__line" aria-hidden="true">
              <span className="phase-milestones__beam" />
            </span>
            <div
              className="phase-milestones__items"
              style={{ columnGap: `${gapRem}rem` }}
            >
              {items.map((item, index) => (
                <MilestoneItemColumn
                  key={item.id ?? index}
                  item={item}
                  index={index}
                  itemCount={items.length}
                  locale={locale}
                  revealed={revealed}
                />
              ))}
            </div>
          </div>
        </TemplateContent>
      </section>
    </TemplateSurface>
  );
}
