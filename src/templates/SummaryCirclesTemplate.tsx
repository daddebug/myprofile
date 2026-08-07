import type { TemplateMeta, TemplateProps } from "../lib/templateLibrary";

// Template 4 — 总结圆. 3–5 standalone circular nodes on a single connecting
// line — a geometric summary sequence, not a bulleted list. Each circle is a
// thin hollow ring (no fill, no card), with its insight set below it.
export const templateMeta: TemplateMeta = {
  id: "summary-circles",
  nameZh: "总结圆",
  nameEn: "Summary Circles",
  schema: [
    { id: "items", labelZh: "总结要点", labelEn: "Summary points", type: "list", min: 3, max: 5, required: true },
  ],
  createdAt: "2026-07-26T00:00:00.000Z",
};

export default function SummaryCirclesTemplate({ content, locale }: TemplateProps) {
  const items = ((content.items as Array<{ zh: string; en: string }> | undefined) ?? []).slice(0, 5);

  return (
    <div className="mx-auto max-w-4xl px-6 py-20">
      <div className="relative flex items-start justify-between">
        <div className="absolute left-[8%] right-[8%] top-[14px] h-px bg-softWhite/16" />
        {items.map((item, index) => (
          <div key={index} className="relative flex w-full flex-col items-center px-2 text-center">
            <span className="h-7 w-7 rounded-full border border-acidGreen/70 bg-deepIndigo" />
            <p className="mt-5 max-w-[9rem] text-[13px] font-medium leading-6 text-softWhite/80">{item[locale]}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
