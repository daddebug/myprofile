import { getPortfolioTrackLabel, PORTFOLIO_TRACK_OPTIONS, type PortfolioTrack } from "../lib/projectMetadata";
import { resolveHomeTrack, usePortfolioTrack, type ActivePortfolioTrack } from "../lib/portfolioTrackContext";
import { useLocale } from "../locales/LocaleContext";

// Shared by HomePage and WorkPage so both surfaces stay visually and
// behaviorally identical -- a plain text row, no pill/card/button-box, styled
// after the existing LanguageSwitcher in layouts/Shell.tsx (the site's own
// precedent for lightweight text-only navigation).
//
// Reuses projectMetadata.ts's own PORTFOLIO_TRACK_OPTIONS/getPortfolioTrackLabel
// (the owner-editor's existing single source of truth) instead of a second,
// hardcoded label map. getPortfolioTrackLabel() returns one combined
// "EN / 中文" string (right for the always-English admin editor); the public
// site shows one language at a time everywhere else, so the locale-specific
// half is derived by splitting that same canonical string on its own " / "
// separator -- not a duplicate translation, just picking the half that
// matches the current route locale.
//
// The leading "ALL / 全部" tab is presentation-only public navigation state
// (ActivePortfolioTrack, not PortfolioTrack) -- it has no entry in
// projectMetadata.ts's real track vocabulary and is deliberately labelled
// here directly rather than through getPortfolioTrackLabel, which only
// knows about real tracks (plus "Unclassified" for the owner editor).
const ALL_TAB_VALUE = "all" as const;
const ALL_TAB_LABEL = { zh: "全部", en: "ALL" };
const TRACK_TABS: ActivePortfolioTrack[] = [ALL_TAB_VALUE, ...PORTFOLIO_TRACK_OPTIONS];

function tabLabel(value: ActivePortfolioTrack, locale: "zh" | "en"): string {
  if (value === ALL_TAB_VALUE) return locale === "zh" ? ALL_TAB_LABEL.zh : ALL_TAB_LABEL.en;
  const [en, zh] = getPortfolioTrackLabel(value as PortfolioTrack).split(" / ");
  return locale === "zh" ? (zh ?? en) : en;
}

export function PortfolioTrackTabs({
  onSelect,
  className = "",
  showAllTab = true,
}: {
  onSelect?: (track: ActivePortfolioTrack) => void;
  className?: string;
  showAllTab?: boolean;
}) {
  const { locale } = useLocale();
  const { activeTrack, setActiveTrack } = usePortfolioTrack();
  const tabs = showAllTab ? TRACK_TABS : PORTFOLIO_TRACK_OPTIONS;
  // Home (showAllTab=false) has no ALL tab of its own -- resolve "all" to
  // the first real Track for highlighting only, without touching the
  // shared context (see resolveHomeTrack).
  const displayActiveTrack = showAllTab ? activeTrack : resolveHomeTrack(activeTrack);

  return (
    <nav
      data-portfolio-track-tabs
      className={`flex flex-wrap items-center justify-center gap-x-10 gap-y-3 py-1 font-sans text-lg font-bold uppercase tracking-[0.12em] md:gap-x-14 md:text-2xl ${className}`}
      aria-label={locale === "zh" ? "作品方向" : "Portfolio track"}
    >
      {tabs.map((track) => {
        const isActive = track === displayActiveTrack;
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
            {tabLabel(track, locale)}
          </button>
        );
      })}
    </nav>
  );
}
