type BrandGeometryProps = {
  className?: string;
  compact?: boolean;
};

export function BrandGeometry({ className = "", compact = false }: BrandGeometryProps) {
  return (
    <div
      className={`pointer-events-none relative isolate overflow-hidden rounded-[28px] border border-softWhite/12 bg-archiveBlue/45 ${className}`}
      aria-hidden="true"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(52,240,37,0.22),transparent_0_12%,transparent_18%),radial-gradient(circle_at_82%_28%,rgba(42,67,199,0.78),transparent_0_22%,transparent_31%),linear-gradient(135deg,rgba(34,49,144,0.7),rgba(24,23,67,0.2))]" />
      <div className="absolute left-[8%] top-[16%] h-[34%] w-[62%] rounded-[30px] bg-electricBlue/72" />
      <div className="absolute right-[8%] top-[10%] h-[50%] w-[34%] rounded-[28px] bg-softWhite/12" />
      <div className="absolute bottom-[13%] left-[16%] h-[38%] w-[46%] rounded-[26px] bg-archiveBlue/72" />
      <div className="absolute bottom-[18%] right-[16%] h-[28%] w-[28%] rounded-full bg-acidGreen" />
      <div className="absolute left-[10%] top-[58%] h-[12%] w-[12%] rounded-full bg-softWhite/20" />
      <div className="absolute right-[26%] top-[46%] h-[18%] w-[18%] rounded-full bg-deepIndigo/60" />
      {!compact ? (
        <>
          <div className="absolute left-[34%] top-[8%] h-[10%] w-[10%] rounded-full bg-acidGreen/80" />
          <div className="absolute bottom-[8%] right-[7%] h-[14%] w-[14%] rounded-full border border-softWhite/18" />
        </>
      ) : null}
    </div>
  );
}
