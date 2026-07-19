import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, Clock, Star } from "lucide-react";
import { PageTransition } from "../components/PageTransition";
import {
  gameArchiveCopy,
  gameArchiveFilters,
  gameArchiveItems,
  type GameArchiveFilter,
  type GameArchiveItem,
} from "../data/gameArchive";
import { useLocale } from "../locales/LocaleContext";

const archiveSurfaces = [
  "from-[#365eb6] to-[#171d50]",
  "from-[#223f91] to-[#11173e]",
  "from-[#4b67bd] to-[#1b245c]",
  "from-[#264d79] to-[#11183d]",
];

const filterKeywords: Partial<Record<GameArchiveFilter, string[]>> = {
  RPG: ["CRPG", "JRPG", "角色成长"],
  Simulation: ["模拟经营", "生存建造", "经营管线", "养成"],
  Multiplayer: ["多人"],
  Narrative: ["叙事", "角色关系", "心理学表达", "选择反馈", "演出"],
  "System Design": ["关系系统", "节奏控制", "触屏操作", "时间管理", "活动结构", "内外循环", "经营管线"],
};

function matchesFilter(game: GameArchiveItem, filter: GameArchiveFilter) {
  if (filter === "All") return true;
  if (filter === "Favorites") return game.favorite;
  if (filter === "Most Played") {
    const hours = Number.parseInt(game.playtime, 10);
    return Number.isFinite(hours) ? hours >= 190 : game.favorite;
  }
  const keywords = filterKeywords[filter] ?? [];
  return game.genreTags.some((tag) => keywords.some((keyword) => tag.includes(keyword)));
}

export function GameArchivePage() {
  const { locale } = useLocale();
  const pageCopy = gameArchiveCopy.page[locale];
  const [activeFilter, setActiveFilter] = useState<GameArchiveFilter>("All");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const visibleGames = useMemo(
    () => gameArchiveItems.filter((game) => matchesFilter(game, activeFilter)),
    [activeFilter],
  );

  return (
    <PageTransition>
      <main className="min-h-screen bg-deepIndigo pb-28 pt-16 text-softWhite md:pb-36 md:pt-24">
        <section className="site-container">
          <p className="font-mono text-[11px] font-bold tracking-[0.24em] text-acidGreen">
            {pageCopy.eyebrow}
          </p>
          <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)] lg:items-end">
            <div>
              <h1 className="max-w-5xl font-display text-[clamp(3rem,7vw,7.5rem)] font-semibold leading-[0.94] text-softWhite">
                {pageCopy.title}
              </h1>
              <p className="mt-5 font-display text-xl text-acidGreen/90 md:text-2xl">
                {pageCopy.subtitle}
              </p>
            </div>
            <p className="max-w-xl text-base leading-8 text-softWhite/62 lg:pb-1">
              {pageCopy.intro}
            </p>
          </div>

          <div className="mt-14 flex flex-wrap gap-x-10 gap-y-5 border-y border-softWhite/10 py-5 font-mono text-[11px] tracking-[0.12em] text-softWhite/56">
            <span><strong className="mr-2 text-base text-softWhite">13</strong> GAMES LOGGED</span>
            <span><strong className="mr-2 text-base text-softWhite">1,945h+</strong> RECORDED PLAY</span>
            <span><strong className="mr-2 text-base text-acidGreen">2</strong> LONG-TERM WORLDS</span>
          </div>
        </section>

        <section className="site-container mt-12">
          <div className="flex flex-wrap gap-2" aria-label="Filter game archive">
            {gameArchiveFilters.map((filter) => (
              <button
                key={filter}
                type="button"
                className={`rounded-md px-3.5 py-2 font-mono text-[10px] font-bold tracking-[0.1em] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-acidGreen/70 ${
                  activeFilter === filter
                    ? "bg-acidGreen text-deepIndigo"
                    : "bg-softWhite/[0.055] text-softWhite/58 hover:bg-softWhite/[0.09] hover:text-softWhite"
                }`}
                onClick={() => {
                  setActiveFilter(filter);
                  setExpandedId(null);
                }}
              >
                {filter}
              </button>
            ))}
          </div>

          <motion.div layout className="mt-10 grid gap-x-8 gap-y-12 md:grid-cols-2">
            <AnimatePresence mode="popLayout">
              {visibleGames.map((game, index) => {
                const isExpanded = expandedId === game.id;
                return (
                  <motion.article
                    layout
                    key={game.id}
                    className="min-w-0 border-t border-softWhite/12 pt-5"
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: prefersReducedMotion ? 0 : 0.25 }}
                  >
                    <div className="grid gap-5 sm:grid-cols-[152px_minmax(0,1fr)]">
                      <div className={`relative aspect-[4/3] overflow-hidden rounded-lg bg-gradient-to-br ${archiveSurfaces[index % archiveSurfaces.length]}`}>
                        <span className="absolute left-4 top-4 font-mono text-[10px] text-softWhite/45">
                          {String(gameArchiveItems.findIndex((item) => item.id === game.id) + 1).padStart(2, "0")}
                        </span>
                        <div className="absolute -bottom-10 -right-8 h-28 w-28 rounded-full border border-softWhite/12" aria-hidden="true" />
                        <p className="absolute bottom-4 left-4 right-4 font-display text-lg font-semibold leading-tight text-softWhite/88">
                          {game.title}
                        </p>
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.12em] text-acidGreen">
                              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                              {game.playtime}
                            </div>
                            <h2 className="mt-2 font-display text-2xl font-semibold text-softWhite">{game.title}</h2>
                          </div>
                          {game.favorite ? <Star className="h-4 w-4 shrink-0 fill-acidGreen text-acidGreen" aria-label="Favorite" /> : null}
                        </div>
                        <p className="mt-3 text-sm leading-6 text-softWhite/62">{game.shortReview}</p>
                        <div className="mt-4 flex flex-wrap gap-1.5">
                          {game.genreTags.slice(0, 3).map((tag) => (
                            <span key={tag} className="rounded bg-softWhite/[0.055] px-2 py-1 text-[10px] text-softWhite/52">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="mt-5 flex w-full items-center justify-between border-t border-softWhite/8 pt-4 text-left font-mono text-[10px] font-bold tracking-[0.12em] text-softWhite/48 transition hover:text-acidGreen focus:outline-none focus-visible:ring-2 focus-visible:ring-acidGreen/70"
                      onClick={() => setExpandedId(isExpanded ? null : game.id)}
                      aria-expanded={isExpanded}
                    >
                      <span>{isExpanded ? "CLOSE NOTES" : "OPEN DESIGN NOTES"}</span>
                      <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} aria-hidden="true" />
                    </button>

                    <AnimatePresence initial={false}>
                      {isExpanded ? (
                        <motion.div
                          initial={prefersReducedMotion ? false : { opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: prefersReducedMotion ? 0 : 0.28 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-5 rounded-lg bg-[#182252] px-5 py-5">
                            <p className="font-mono text-[10px] font-bold tracking-[0.14em] text-acidGreen">DESIGN OBSERVATION</p>
                            <p className="mt-3 text-sm leading-7 text-softWhite/70">{game.designObservation}</p>
                            {game.completion ? (
                              <p className="mt-4 border-t border-softWhite/8 pt-4 font-mono text-[10px] tracking-[0.1em] text-[#9FAAD2]">
                                COMPLETION · {game.completion}
                              </p>
                            ) : null}
                          </div>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </motion.article>
                );
              })}
            </AnimatePresence>
          </motion.div>
        </section>
      </main>
    </PageTransition>
  );
}
