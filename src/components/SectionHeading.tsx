type SectionHeadingProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  align?: "left" | "center";
  dark?: boolean;
};

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = "left",
  dark = false,
}: SectionHeadingProps) {
  const wrapperClass =
    align === "center" ? "mx-auto max-w-3xl text-center" : "max-w-3xl";

  return (
    <div className={wrapperClass}>
      <div className={`mb-4 flex ${align === "center" ? "justify-center" : ""}`}>
        {eyebrow ? (
          <p
            className={`font-mono text-sm font-bold tracking-[0.02em] ${
              dark ? "text-acidGreen" : "text-acidGreen"
            }`}
          >
            / {eyebrow}
          </p>
        ) : null}
      </div>
      <h2
        className={`font-display text-[clamp(2.2rem,5vw,5.4rem)] leading-[0.98] ${
          dark ? "text-softWhite" : "text-softWhite"
        }`}
      >
        {title}
      </h2>
      {subtitle ? (
        <p
          className={`mt-4 max-w-2xl text-base leading-7 md:text-lg ${
            dark ? "text-softWhite/74" : "text-softWhite/68"
          }`}
        >
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}
