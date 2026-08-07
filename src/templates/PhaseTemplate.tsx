import type { TemplateMeta, TemplateProps } from "../lib/templateLibrary";

// Template 2 — 阶段模板. Phase marker, stage title, body copy, then a
// content/image area. The phase number sits beside a short vertical rule
// (a geometric marker, not a numbered card) to read as one step in a
// sequence of stages, matching a printed case-study document rather than a
// dashboard "step" component.
export const templateMeta: TemplateMeta = {
  id: "phase",
  nameZh: "阶段模板",
  nameEn: "Phase",
  schema: [
    { id: "phaseNumber", labelZh: "阶段编号", labelEn: "Phase number", type: "text", required: true },
    { id: "title", labelZh: "阶段标题", labelEn: "Phase title", type: "text", required: true },
    { id: "body", labelZh: "正文", labelEn: "Body", type: "richtext" },
    { id: "media", labelZh: "图片 / 内容", labelEn: "Image / content", type: "image" },
  ],
  createdAt: "2026-07-26T00:00:00.000Z",
};

export default function PhaseTemplate({ content, locale }: TemplateProps) {
  const phaseNumber = content.phaseNumber as { zh: string; en: string } | undefined;
  const title = content.title as { zh: string; en: string } | undefined;
  const body = content.body as { zh: string; en: string } | undefined;
  const media = content.media as { publicPath?: string; assetId?: string; alt?: string } | undefined;
  const hasMedia = Boolean(media?.publicPath || media?.assetId);

  return (
    <div className="mx-auto max-w-4xl px-6 py-20">
      <div className="flex items-start gap-4">
        <div className="mt-1 h-10 w-px bg-acidGreen/60" />
        <div>
          <p className="font-mono text-xs font-bold uppercase tracking-[0.22em] text-acidGreen">{phaseNumber?.[locale] ?? ""}</p>
          <h3 className="mt-2 font-display text-2xl font-semibold leading-tight text-softWhite md:text-3xl">{title?.[locale] ?? ""}</h3>
        </div>
      </div>
      {body?.[locale] ? (
        <p className="mt-8 max-w-[40rem] whitespace-pre-line pl-14 text-[16px] leading-8 text-softWhite/72">{body[locale]}</p>
      ) : null}
      {hasMedia ? (
        <div className="mt-10 pl-14">
          <div className="aspect-[16/9] w-full overflow-hidden border border-softWhite/12 bg-archiveBlue/20">
            {media?.publicPath ? <img src={media.publicPath} alt={media.alt ?? ""} className="h-full w-full object-cover" /> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
