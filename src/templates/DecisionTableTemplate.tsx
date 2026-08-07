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
  tableWidth: "standard",
  rowSpacing: "standard",
  headingGap: "standard",
} as const;

export const layoutControlSchema: TemplateLayoutControlDefinition[] = [
  { key: "tableWidth", label: "Table width" },
  { key: "rowSpacing", label: "Row spacing" },
  { key: "headingGap", label: "Heading distance" },
];

export const templateMeta: TemplateMeta = {
  id: "decision-table",
  nameZh: "决策表格",
  nameEn: "Decision Table",
  descriptionZh: "用于展示资源处理、设计范围、功能判断与对比结论。",
  descriptionEn:
    "Structured decisions for resources, design scope, functions, and comparisons.",
  schema: [
    {
      id: "heading",
      labelZh: "顶部标题",
      labelEn: "Heading",
      type: "text",
    },
    {
      id: "columns",
      labelZh: "表格列",
      labelEn: "Table columns",
      type: "list",
      min: 1,
      required: true,
    },
    {
      id: "rows",
      labelZh: "表格行",
      labelEn: "Table rows",
      type: "list",
      min: 1,
      max: 12,
      required: true,
    },
  ],
  createdAt: "2026-07-26T00:00:06.000Z",
};

type LocalizedText = { zh: string; en: string };
type DecisionTableColumn = {
  id?: string;
  title?: string | LocalizedText;
  zh?: string;
  en?: string;
};
type DecisionTableRow = {
  id?: string;
  cells?: Record<string, string | LocalizedText>;
  category?: string | LocalizedText;
  strategy?: string | LocalizedText;
  scope?: string | LocalizedText;
  reason?: string | LocalizedText;
};

const legacyColumnIds = ["category", "strategy", "scope", "reason"] as const;
const columnWeights: Record<string, number> = {
  category: 2,
  strategy: 2,
  scope: 3,
  reason: 3,
};

const tableWidths = {
  standard: "75rem",
  nearPage: "80rem",
} as const;

const rowPaddings = {
  compact: "1rem",
  standard: "1.25rem",
  wide: "1.5rem",
} as const;

const headingGaps = {
  near: "1.25rem",
  standard: "1.75rem",
  far: "2.5rem",
} as const;

function localizedValue(
  value: string | LocalizedText | undefined,
  locale: "zh" | "en",
) {
  if (typeof value === "string") return value.trim();
  return value?.[locale]?.trim() ?? "";
}

function isDecisionTableRow(value: unknown): value is DecisionTableRow {
  return Boolean(value && typeof value === "object");
}

function isDecisionTableColumn(value: unknown): value is DecisionTableColumn {
  return Boolean(value && typeof value === "object");
}

export default function DecisionTableTemplate({
  content,
  locale,
  horizontalInset,
}: TemplateProps) {
  const heading = localizedValue(
    content.heading as LocalizedText | undefined,
    locale,
  );
  const columns = Array.isArray(content.columns)
    ? content.columns
        .filter(isDecisionTableColumn)
        .map((column, index) => {
          const legacyColumn = column as LocalizedText;
          return {
            id: column.id ?? legacyColumnIds[index] ?? `column-${index + 1}`,
            title: localizedValue(
              column.title ?? legacyColumn,
              locale,
            ),
          };
        })
        .filter((column) => column.title)
    : [];
  const totalColumnWeight = columns.reduce(
    (total, column) => total + (columnWeights[column.id] ?? 3),
    0,
  );
  const rows = Array.isArray(content.rows)
    ? content.rows
        .filter(isDecisionTableRow)
        .map((row) => {
          const cells = Object.fromEntries(
            columns.map((column) => [
              column.id,
              localizedValue(
                row.cells?.[column.id]
                  ?? row[column.id as keyof DecisionTableRow] as
                    | string
                    | LocalizedText
                    | undefined,
                locale,
              ),
            ]),
          );
          return { id: row.id, cells };
        })
        .filter((row) =>
          columns.some((column) => Boolean(row.cells[column.id])),
        )
        .slice(0, 12)
    : [];

  const tableWidth =
    tableWidths[layoutControls.tableWidth as keyof typeof tableWidths]
    ?? tableWidths.standard;
  const rowPadding =
    rowPaddings[layoutControls.rowSpacing as keyof typeof rowPaddings]
    ?? rowPaddings.standard;
  const headingGap =
    headingGaps[layoutControls.headingGap as keyof typeof headingGaps]
    ?? headingGaps.standard;

  return (
    <TemplateSurface>
      <TemplateContent horizontalInset={horizontalInset} className="py-20">
        {heading ? (
          <h2 className="text-center font-display text-[clamp(1.25rem,2vw,1.5rem)] font-semibold leading-[1.3] text-softWhite">
            {heading}
          </h2>
        ) : null}

        <div
          className="mx-auto overflow-x-auto rounded-[20px] bg-[#151B4D]/58 shadow-[0_18px_46px_rgba(3,5,26,0.22),inset_0_1px_0_rgba(244,245,250,0.06)]"
          style={{
            marginTop: heading ? headingGap : 0,
            maxWidth: tableWidth,
          }}
        >
          {columns.length > 0 ? (
            <table className="w-full table-fixed border-collapse text-left">
              <colgroup>
                {columns.map((column) => (
                  <col
                    key={column.id}
                    style={{
                      width: `${((columnWeights[column.id] ?? 3) / totalColumnWeight) * 100}%`,
                    }}
                  />
                ))}
              </colgroup>
              <thead>
                <tr className="bg-deepIndigo/34">
                  {columns.map((column) => (
                    <th
                      key={column.id}
                      scope="col"
                      className="px-5 py-4 font-mono text-xs font-bold tracking-[0.07em] text-[#9FAAD2]"
                    >
                      {column.title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr
                    key={row.id ?? rowIndex}
                    className="border-t border-softWhite/10 align-top"
                  >
                    {columns.map((column) => {
                      const value = row.cells[column.id];
                      return (
                        <td
                          key={column.id}
                          className="px-5"
                          style={{ paddingBlock: rowPadding }}
                        >
                          {value && column.id === "strategy" ? (
                            <span className="inline-flex max-w-full rounded-full bg-acidGreen/10 px-3 py-1.5 text-sm font-semibold leading-5 text-acidGreen/78">
                              {value}
                            </span>
                          ) : value ? (
                            <p
                              className={
                                column.id === "category"
                                  ? "text-sm font-semibold leading-6 text-softWhite/82"
                                  : column.id === "reason"
                                    ? "text-sm leading-6 text-softWhite/58"
                                    : "text-sm leading-6 text-softWhite/68"
                              }
                            >
                              {value}
                            </p>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}

          {columns.length === 0 || rows.length === 0 ? (
            <p className="border-t border-softWhite/10 px-5 py-5 text-center text-sm text-softWhite/46">
              {columns.length === 0
                ? locale === "zh"
                  ? "请至少填写 1 个列标题。"
                  : "Add at least one column heading."
                : locale === "zh"
                  ? "请至少添加 1 行有内容的信息。"
                  : "Add at least one row with content."}
            </p>
          ) : null}
        </div>
      </TemplateContent>
    </TemplateSurface>
  );
}
