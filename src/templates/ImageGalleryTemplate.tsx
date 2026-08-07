import type { TemplateMeta, TemplateProps } from "../lib/templateLibrary";

// Template 8 — 图片展示 (1–4 张). A horizontal row of 1 to 4 images. Each
// image's caption is fully optional and independent — when a given image has
// no caption, its description row simply does not render (no reserved
// empty space), so a row of 4 images can have anywhere from 0 to 4 captions.
export const templateMeta: TemplateMeta = {
  id: "image-gallery",
  nameZh: "图片展示",
  nameEn: "Image Gallery",
  schema: [
    { id: "images", labelZh: "图片", labelEn: "Images", type: "images", min: 1, max: 4, required: true },
  ],
  createdAt: "2026-07-26T00:00:00.000Z",
};

type GalleryImage = { publicPath?: string; assetId?: string; alt?: string; caption?: { zh: string; en: string } };

export default function ImageGalleryTemplate({ content, locale }: TemplateProps) {
  const images = ((content.images as GalleryImage[] | undefined) ?? []).slice(0, 4);
  const columns = Math.max(images.length, 1);

  return (
    <div className="mx-auto max-w-5xl px-6 py-20">
      <div className="grid gap-6" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {images.map((image, index) => {
          const caption = image.caption?.[locale]?.trim();
          return (
            <div key={index}>
              <div className="aspect-[3/4] w-full border border-softWhite/12 bg-archiveBlue/16">
                {image.publicPath ? <img src={image.publicPath} alt={image.alt ?? ""} className="h-full w-full object-cover" /> : null}
              </div>
              {caption ? <p className="mt-3 text-[13px] leading-5 text-softWhite/56">{caption}</p> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
