import {
  TemplateContent,
  TemplateSurface,
} from "../components/template-tools/TemplateResponsiveFoundation";
import type {
  TemplateLayoutControlDefinition,
  TemplateMeta,
  TemplateProps,
} from "../lib/templateLibrary";
import "./process-flow-template.css";

export const layoutControls = {} as const;
export const layoutControlSchema: TemplateLayoutControlDefinition[] = [];

export const templateMeta: TemplateMeta = {
  id: "process-flow",
  nameZh: "流程模板",
  nameEn: "Process Flow",
  descriptionZh: "以六个块面步骤和粗方向箭头呈现折线路径流程。",
  descriptionEn:
    "A six-step folded path using structured cards and substantial directional arrows.",
  schema: [
    {
      id: "heading",
      labelZh: "模板主标题",
      labelEn: "Heading",
      type: "text",
    },
    {
      id: "items",
      labelZh: "流程步骤",
      labelEn: "Process steps",
      type: "list",
      min: 6,
      max: 6,
      required: true,
    },
  ],
  createdAt: "2026-07-31T00:00:10.000Z",
};

type LocalizedText = { zh: string; en: string };
type ProcessFlowItem = {
  id?: string;
  number?: string | LocalizedText;
  title?: string | LocalizedText;
  description?: string | LocalizedText;
};

function localizedValue(
  value: string | LocalizedText | undefined,
  locale: "zh" | "en",
) {
  if (typeof value === "string") return value.trim();
  return value?.[locale]?.trim() ?? "";
}

function isProcessFlowItem(value: unknown): value is ProcessFlowItem {
  return Boolean(value && typeof value === "object");
}

const stepPositions = [
  "process-flow-step-1",
  "process-flow-step-2",
  "process-flow-step-3",
  "process-flow-step-4",
  "process-flow-step-5",
  "process-flow-step-6",
] as const;

const arrows = [
  { className: "process-flow-arrow-1", direction: "down" },
  { className: "process-flow-arrow-2", direction: "right" },
  { className: "process-flow-arrow-3", direction: "up" },
  { className: "process-flow-arrow-4", direction: "right" },
  { className: "process-flow-arrow-5", direction: "down" },
] as const;

export default function ProcessFlowTemplate({
  content,
  locale,
}: TemplateProps) {
  const heading = localizedValue(
    content.heading as LocalizedText | undefined,
    locale,
  );
  const items = Array.isArray(content.items)
    ? content.items.filter(isProcessFlowItem).slice(0, 6)
    : [];

  if (items.length !== 6) {
    return (
      <TemplateSurface>
        <TemplateContent
          horizontalInset={0}
          className="process-flow-content py-[var(--template-library-section-spacing)]"
        >
          <p className="text-center text-sm text-softWhite/46">
            {locale === "zh"
              ? "请补全 6 个流程步骤。"
              : "Complete all 6 process steps."}
          </p>
        </TemplateContent>
      </TemplateSurface>
    );
  }

  return (
    <TemplateSurface>
      <TemplateContent
        horizontalInset={0}
        className="process-flow-content py-[var(--template-library-section-spacing)]"
      >
        {heading ? (
          <h2 className="w-full text-center font-display text-[clamp(1.5rem,2.5vw,2rem)] font-semibold leading-[1.25] text-softWhite">
            {heading}
          </h2>
        ) : null}

        <div className={`process-flow-viewport ${heading ? "mt-10" : ""}`}>
          <div className="process-flow-grid">
            {items.map((item, index) => {
              const number = localizedValue(item.number, locale);
              const title = localizedValue(item.title, locale);
              const description = localizedValue(item.description, locale);

              return (
                <article
                  key={item.id ?? `process-flow-${index + 1}`}
                  className={`process-flow-card ${stepPositions[index]}`}
                >
                  {number ? <span className="process-flow-number">{number}</span> : null}
                  {title ? <h3>{title}</h3> : null}
                  {description ? <p>{description}</p> : null}
                </article>
              );
            })}

            {arrows.map((arrow) => (
              <span
                key={arrow.className}
                className={`process-flow-arrow ${arrow.className} is-${arrow.direction}`}
                aria-hidden="true"
              />
            ))}
          </div>
        </div>
      </TemplateContent>
    </TemplateSurface>
  );
}
