import type { AnnotatedImage } from "../types/project";
import { ImageWithFallback } from "./ImageWithFallback";

type CaseStudyVisualProps = {
  image: AnnotatedImage;
  className?: string;
};

const ratioClass = {
  wide: "aspect-[16/10]",
  mobile: "aspect-[9/16]",
  square: "aspect-square",
};

export function CaseStudyVisual({ image, className = "" }: CaseStudyVisualProps) {
  const ratio = ratioClass[image.ratio ?? "wide"];
  const hasImage = Boolean(image.src);

  return (
    <figure className={`min-w-0 overflow-hidden rounded-[24px] border border-softWhite/10 bg-archiveBlue/20 p-2 ${className}`}>
      <div className="relative overflow-hidden rounded-[18px]">
        {hasImage ? (
          <ImageWithFallback
            src={image.src ?? ""}
            alt={image.alt}
            className={`${ratio} w-full object-cover`}
            placeholderClassName={`${ratio} min-h-0`}
          />
        ) : (
          <div className={`relative flex ${ratio} min-h-0 w-full items-center justify-center overflow-hidden bg-deepIndigo/76 text-softWhite`}>
            <div className="absolute left-[10%] top-[18%] h-[28%] w-[54%] rounded-[22px] bg-electricBlue/28" />
            <div className="absolute bottom-[18%] right-[12%] h-[24%] w-[34%] rounded-full bg-softWhite/8" />
            <div className="relative max-w-[72%] text-center">
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-softWhite/70">
                {image.label ?? image.alt}
              </p>
              <p className="mt-3 text-xs leading-5 text-softWhite/44">
                {image.ratio === "mobile" ? "Portrait UI / 9:16" : image.ratio === "square" ? "Square asset" : "Wide diagram / 16:10"}
              </p>
            </div>
          </div>
        )}
        {hasImage
          ? image.annotations?.map((annotation) => (
              <div
                key={`${annotation.number}-${annotation.label}`}
                data-case-annotation
                className="absolute z-10 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full border border-acidGreen/45 bg-deepIndigo/82 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-softWhite backdrop-blur md:flex"
                style={{ left: `${annotation.x}%`, top: `${annotation.y}%` }}
              >
                <span className="grid h-5 w-5 place-items-center rounded-full bg-acidGreen text-deepIndigo">
                  {annotation.number}
                </span>
                <span>{annotation.label}</span>
              </div>
            ))
          : null}
      </div>
      <figcaption className="flex min-w-0 flex-col gap-1 px-2 pt-3">
        {image.label ? (
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-softWhite/58">{image.label}</span>
        ) : null}
        {image.guidance ? <span className="text-xs leading-5 text-softWhite/42">{image.guidance}</span> : null}
        {image.annotations?.length ? (
          <div className="mt-2 grid gap-2 md:hidden">
            {image.annotations.map((annotation) => (
              <div key={`${annotation.number}-${annotation.label}-legend`} className="flex min-w-0 items-center gap-2 text-xs text-softWhite/62">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-acidGreen/45 font-mono text-[10px] text-acidGreen">
                  {annotation.number}
                </span>
                <span className="min-w-0">{annotation.label}</span>
              </div>
            ))}
          </div>
        ) : null}
      </figcaption>
    </figure>
  );
}
