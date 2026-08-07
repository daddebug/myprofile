import type { TemplateMeta, TemplateProps } from "../lib/templateLibrary";

// Template 5 — Figma 单图展示. Exactly one image, centered, framed by
// generous whitespace like a single plate in a printed document — never
// side-by-side with anything else. The caption row is only rendered when
// text exists; there is no reserved empty space beneath an uncaptioned image.
export const templateMeta: TemplateMeta = {
  id: "figma-showcase",
  nameZh: "Figma 单图展示",
  nameEn: "Figma Showcase",
  schema: [
    { id: "image", labelZh: "Figma 截图", labelEn: "Figma image", type: "image", required: true },
    { id: "caption", labelZh: "说明文字", labelEn: "Caption", type: "richtext" },
  ],
  createdAt: "2026-07-26T00:00:00.000Z",
};

export default function FigmaShowcaseTemplate({ content, locale }: TemplateProps) {
  const image = content.image as { publicPath?: string; assetId?: string; alt?: string } | undefined;
  const caption = content.caption as { zh: string; en: string } | undefined;
  const hasCaption = Boolean(caption?.[locale]?.trim());

  return (
    <div className="mx-auto max-w-4xl px-6 py-24">
      <div className="mx-auto w-full max-w-[38rem] border border-softWhite/12 bg-archiveBlue/16">
        <div className="aspect-[16/10] w-full">
          {image?.publicPath ? <img src={image.publicPath} alt={image.alt ?? ""} className="h-full w-full object-contain" /> : null}
        </div>
      </div>
      {hasCaption ? (
        <p className="mx-auto mt-6 max-w-[28rem] text-center text-[14px] leading-6 text-softWhite/56">{caption?.[locale]}</p>
      ) : null}
    </div>
  );
}
