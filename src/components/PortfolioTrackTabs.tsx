import { getPortfolioTrackLabel, PORTFOLIO_TRACK_OPTIONS, type PortfolioTrack } from "../lib/projectMetadata";
import { usePortfolioTrack } from "../lib/portfolioTrackContext";
import { useLocale } from "../locales/LocaleContext";

// Shared by HomePage and WorkPage so both surfaces stay visually and
// behaviorally identical — a plain text row, no pill/card/button-box, styled
// after the existing LanguageSwitcher in Shell.tsx (the site's own precedent
// for lightweight text-only navigation). `onSelect` lets the caller react to
// a click (e.g. Home's smooth-scroll-to-projects) without this component
// knowing anything about scrolling itself.
export function PortfolioTrackTabs({ onSelect, className = "" }: { onSelect?: (track: PortfolioTrack) => void; className?: string }) {
  const { locale } = useLocale();
  const { activeTrack, setActiveTrack } = usePortfolioTrack();

  return (
    <nav
      className={`flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono text-[13px] font-bold uppercase tracking-[0.1em] ${className}`}
      aria-label={locale === "zh" ? "作品方向" : "Portfolio track"}
    >
      {PORTFOLIO_TRACK_OPTIONS.map((track) => {
        const isActive = track === activeTrack;
        return (
          <button
            key={track}
            type="button"
            className={`border-0 bg-transparent p-0 transition ${isActive ? "text-acidGreen" : "text-softWhite/50 hover:text-softWhite/78"}`}
            aria-pressed={isActive}
            onClick={() => {
              setActiveTrack(track);
              onSelect?.(track);
            }}
          >
            {getPortfolioTrackLabel(track)}
          </button>
        );
      })}
    </nav>
  );
}
