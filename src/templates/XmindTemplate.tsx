import { FileUp } from "lucide-react";
import type { TemplateMeta, TemplateProps } from "../lib/templateLibrary";
import type { ParsedXMindSheet } from "../lib/xmindImport";

// Template 3 — Xmind 拆解. Up to three imported Xmind sheets, each rendered
// as a center node with its branch nodes fanning out — a real organizational
// diagram (thin connector lines, plain rectangles), not a colorful bubble
// mind-map. The "+ 导入本地 Xmind 文件" affordance is shown per module slot;
// actual file parsing is wired up in a later step (this pass is visual only).
export const templateMeta: TemplateMeta = {
  id: "xmind-breakdown",
  nameZh: "Xmind 拆解",
  nameEn: "Xmind Breakdown",
  schema: [
    { id: "modules", labelZh: "Xmind 模块", labelEn: "Xmind modules", type: "xmind", min: 1, max: 3, required: true },
  ],
  createdAt: "2026-07-26T00:00:00.000Z",
};

function ModuleDiagram({ sheet, locale }: { sheet: ParsedXMindSheet; locale: "zh" | "en" }) {
  const root = sheet.nodes.find((node) => node.nodeType === "root") ?? sheet.nodes[0];
  const branches = sheet.nodes.filter((node) => node.id !== root?.id).sort((a, b) => a.order - b.order);
  const rowHeight = 56;
  const height = Math.max(branches.length * rowHeight, rowHeight);
  const centerY = height / 2;

  return (
    <div className="relative mt-6 w-full overflow-x-auto" style={{ height }}>
      <svg width={560} height={height} className="absolute inset-0">
        {branches.map((branch, index) => {
          const branchY = index * rowHeight + rowHeight / 2;
          return (
            <path key={branch.id} d={`M 150 ${centerY} H 210 V ${branchY} H 260`} fill="none" stroke="rgba(244,245,250,0.22)" strokeWidth={1} />
          );
        })}
      </svg>
      <div className="absolute left-0 flex w-[150px] items-center border border-acidGreen/50 bg-archiveBlue/25 px-4 py-3" style={{ top: centerY - 22 }}>
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-acidGreen">{root?.title[locale] ?? sheet.title}</p>
      </div>
      {branches.map((branch, index) => (
        <div key={branch.id} className="absolute left-[260px] w-[280px] border border-softWhite/16 bg-deepIndigo/60 px-3 py-2" style={{ top: index * rowHeight + rowHeight / 2 - 18 }}>
          <p className="text-[13px] font-medium text-softWhite/86">{branch.title[locale]}</p>
        </div>
      ))}
    </div>
  );
}

export default function XmindTemplate({ content, locale }: TemplateProps) {
  const modules = (content.modules as ParsedXMindSheet[] | undefined) ?? [];

  return (
    <div className="mx-auto max-w-4xl px-6 py-20">
      <div className="grid gap-16">
        {modules.slice(0, 3).map((sheet) => (
          <div key={sheet.id}>
            <p className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-softWhite/44">{sheet.title}</p>
            <ModuleDiagram sheet={sheet} locale={locale} />
          </div>
        ))}
        {modules.length < 3 ? (
          <button type="button" className="flex w-fit items-center gap-2 border border-dashed border-softWhite/24 px-5 py-3 font-mono text-xs uppercase tracking-[0.1em] text-softWhite/56 transition hover:border-acidGreen/60 hover:text-acidGreen">
            <FileUp className="h-4 w-4" />
            {locale === "zh" ? "导入本地 Xmind 文件" : "Import local Xmind file"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
