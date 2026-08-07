import { ArrowRight } from "lucide-react";
import type { TemplateMeta, TemplateProps } from "../lib/templateLibrary";

// Template 7 — 前后对比. Before / a clear connecting arrow / After — not a
// plain two-image split. The connector is a real horizontal line with an
// arrow mark running through the vertical center of both images, making the
// transformation legible at a glance.
export const templateMeta: TemplateMeta = {
  id: "before-after",
  nameZh: "前后对比",
  nameEn: "Before / After",
  schema: [
    { id: "beforeImage", labelZh: "Before 图片", labelEn: "Before image", type: "image", required: true },
    { id: "afterImage", labelZh: "After 图片", labelEn: "After image", type: "image", required: true },
  ],
  createdAt: "2026-07-26T00:00:00.000Z",
};

type ImageValue = { publicPath?: string; assetId?: string; alt?: string };

function Frame({ label, image }: { label: string; image?: ImageValue }) {
  return (
    <div className="flex-1">
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-softWhite/52">{label}</p>
      <div className="mt-3 aspect-[4/3] w-full border border-softWhite/12 bg-archiveBlue/16">
        {image?.publicPath ? <img src={image.publicPath} alt={image.alt ?? ""} className="h-full w-full object-cover" /> : null}
      </div>
    </div>
  );
}

export default function BeforeAfterTemplate({ content, locale }: TemplateProps) {
  const beforeImage = content.beforeImage as ImageValue | undefined;
  const afterImage = content.afterImage as ImageValue | undefined;

  return (
    <div className="mx-auto max-w-4xl px-6 py-20">
      <div className="relative flex items-start gap-0">
        <Frame label={locale === "zh" ? "之前" : "Before"} image={beforeImage} />
        <div className="relative mt-16 flex w-20 shrink-0 items-center justify-center">
          <div className="absolute left-0 right-0 top-1/2 h-px bg-acidGreen/60" />
          <div className="relative z-10 grid h-9 w-9 place-items-center border border-acidGreen/70 bg-deepIndigo">
            <ArrowRight className="h-4 w-4 text-acidGreen" />
          </div>
        </div>
        <Frame label={locale === "zh" ? "之后" : "After"} image={afterImage} />
      </div>
    </div>
  );
}
