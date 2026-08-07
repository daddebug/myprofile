import { AnimatedLogo } from "./AnimatedLogo";

export function HomePortfolioCover() {
  return (
    <section
      className="relative overflow-hidden bg-deepIndigo text-softWhite"
      data-home-portfolio-cover
    >
      <div className="absolute inset-0 bg-grain bg-[length:18px_18px] opacity-20" />
      <div className="site-container relative flex min-h-[100svh] flex-col items-center justify-center py-10">
        <AnimatedLogo />
        <p className="mt-10 whitespace-nowrap text-center font-display text-[clamp(0.95rem,1.45vw,1.45rem)] font-semibold tracking-[0.08em] text-acidGreen">
          Dilida Duman | Game UX/UI Portfolio
        </p>
      </div>
    </section>
  );
}
