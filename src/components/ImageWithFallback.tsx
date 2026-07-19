import { useMemo, useState } from "react";
import { ImageOff } from "lucide-react";

type ImageWithFallbackProps = {
  src: string;
  alt: string;
  className?: string;
  placeholderClassName?: string;
};

export function ImageWithFallback({
  src,
  alt,
  className = "",
  placeholderClassName = "",
}: ImageWithFallbackProps) {
  const [failed, setFailed] = useState(false);
  const shortLabel = useMemo(() => {
    const words = alt
      .replace(/\s+(cover|preview|screenshot)$/i, "")
      .split(/\s+/)
      .filter(Boolean);
    return words
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase())
      .join("");
  }, [alt]);

  if (failed || !src) {
    return (
      <div
        className={`relative flex min-h-64 items-center justify-center overflow-hidden bg-deepIndigo text-softWhite ${placeholderClassName}`}
      >
        <div className="absolute left-[10%] top-[16%] h-[34%] w-[58%] rounded-[26px] bg-electricBlue/70" />
        <div className="absolute right-[10%] top-[12%] h-[48%] w-[34%] rounded-[24px] bg-softWhite/10" />
        <div className="absolute bottom-[15%] left-[16%] h-[36%] w-[44%] rounded-[24px] bg-archiveBlue/76" />
        <div className="absolute bottom-[20%] right-[18%] h-[24%] w-[24%] rounded-full bg-acidGreen" />
        <div className="relative flex max-w-72 flex-col items-center gap-3 rounded-[18px] border border-softWhite/14 bg-deepIndigo/70 px-5 py-6 text-center backdrop-blur">
          <ImageOff className="h-7 w-7 text-acidGreen" aria-hidden="true" />
          <span className="font-mono text-xs font-bold tracking-[0.12em] text-acidGreen">{shortLabel || "DD"}</span>
          <span className="text-sm font-semibold leading-6 text-softWhite/82">{alt}</span>
        </div>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
