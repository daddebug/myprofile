import type { TemplateMeta, TemplateProps } from "../lib/templateLibrary";

// Template 6 — 表格. A plain, structured data table — hairline rules, mono
// uppercase headers, no zebra striping or rounded card wrapper. Reads like a
// spec sheet in a printed document, not a SaaS pricing table.
export const templateMeta: TemplateMeta = {
  id: "table",
  nameZh: "表格",
  nameEn: "Table",
  schema: [
    { id: "table", labelZh: "表格内容", labelEn: "Table content", type: "table", required: true },
  ],
  createdAt: "2026-07-26T00:00:00.000Z",
};

type TableValue = { columns: Array<{ zh: string; en: string }>; rows: Array<Array<{ zh: string; en: string }>> };

export default function TableTemplate({ content, locale }: TemplateProps) {
  const table = content.table as TableValue | undefined;
  const columns = table?.columns ?? [];
  const rows = table?.rows ?? [];

  return (
    <div className="mx-auto max-w-4xl px-6 py-20">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-softWhite/24">
            {columns.map((column, index) => (
              <th key={index} className="py-3 pr-6 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-softWhite/52">{column[locale]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-softWhite/10">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="py-4 pr-6 align-top text-[14px] leading-6 text-softWhite/80">{cell[locale]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
