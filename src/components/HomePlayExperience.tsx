import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useGameCover } from "../hooks/useGameCover";
import { formatPlaytime, gameTitle, getHomepageGames, useGameExperienceStore, type GameExperienceRecord } from "../lib/gameExperience";
import { useLocale } from "../locales/LocaleContext";
import { GameCoverImage } from "./GameCoverImage";

const albumPositions = [
  "md:left-[2%] md:top-[72px]",
  "md:left-[17%] md:top-[8px]",
  "md:left-[32%] md:top-[94px]",
  "md:left-[47%] md:top-[30px]",
  "md:left-[62%] md:top-[100px]",
  "md:left-[77%] md:top-[10px]",
];

const albumRotations = [-5, 2, -2, 4, -3, 3];

export function HomePlayExperience() {
  const prefersReducedMotion = useReducedMotion();
  const { locale, pathFor } = useLocale();
  const games = getHomepageGames(useGameExperienceStore());

  return (
    <motion.div className="mt-24 w-full md:mt-32" initial={prefersReducedMotion ? false : { opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.16 }} transition={{ duration: prefersReducedMotion ? 0 : 0.55, ease: [0.22, 1, 0.36, 1] }}>
      <div className="mx-auto max-w-3xl px-4 text-center">
        <p className="font-mono text-[11px] font-bold tracking-[0.24em] text-acidGreen">PLAY EXPERIENCE</p>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-softWhite/66 md:text-lg">{locale === "zh" ? "我把长期游玩经验整理成游戏系统、交互节奏和玩家体验观察。" : "Long-term play distilled into observations about game systems, interaction rhythm, and player experience."}</p>
      </div>

      <div className="mt-12 overflow-x-auto px-4 pb-5 md:mt-14 md:overflow-visible md:px-6">
        <div className="flex min-w-max items-start pr-4 md:relative md:mx-auto md:block md:h-[350px] md:min-w-0 md:max-w-[1000px] md:pr-0">
          {games.map((game, index) => <AlbumGameCard key={game.id} game={game} locale={locale} index={index} prefersReducedMotion={Boolean(prefersReducedMotion)} />)}
        </div>
      </div>

      <div className="mx-auto mt-8 max-w-2xl px-5 text-center md:mt-4">
        <Link to={pathFor("/play")} className="group inline-flex items-center gap-2 rounded-full border border-acidGreen/70 bg-deepIndigo/48 px-7 py-3 font-mono text-xs font-bold tracking-[0.12em] text-acidGreen transition duration-300 hover:border-acidGreen hover:bg-acidGreen hover:text-deepIndigo focus:outline-none focus-visible:ring-2 focus-visible:ring-acidGreen/70 focus-visible:ring-offset-2 focus-visible:ring-offset-deepIndigo">
          {locale === "zh" ? "查看完整游戏经历" : "View full game log"}<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
        </Link>
      </div>
    </motion.div>
  );
}

function AlbumGameCard({ game, locale, index, prefersReducedMotion }: { game: GameExperienceRecord; locale: "zh" | "en"; index: number; prefersReducedMotion: boolean }) {
  const title = gameTitle(game, locale);
  const cover = useGameCover(game.presentation.coverAssetId, game.presentation.coverPublicPath);
  const selectedIds = game.presentation.homepageTagIds ?? [];
  const tags = selectedIds.map((id) => game.presentation.tags.find((tag) => tag.id === id)).filter(Boolean).map((tag) => locale === "zh" ? tag!.zh || tag!.en : tag!.en || tag!.zh).filter(Boolean).slice(0, 4);
  const playtime = formatPlaytime(game, locale);
  return <motion.article
    className={`relative -ml-3 h-[218px] w-[164px] shrink-0 overflow-hidden rounded-lg border border-softWhite/10 bg-[#182252] shadow-[0_18px_42px_rgba(3,7,30,0.32)] first:ml-0 md:absolute md:h-[244px] md:w-[184px] ${albumPositions[index] ?? albumPositions[albumPositions.length - 1]}`}
    style={{ marginTop: index % 2 === 0 ? 22 : 0, rotate: albumRotations[index] ?? 0 }}
    whileHover={prefersReducedMotion ? undefined : { y: -8, scale: 1.025, rotate: albumRotations[index] ?? 0, zIndex: 30, boxShadow: "0 24px 52px rgba(3, 7, 30, 0.48)" }}
    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
  >
    <GameCoverImage src={cover} title={title} className="absolute inset-0 h-full w-full object-cover" />
    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(9,13,48,0.08)_18%,rgba(9,13,48,0.88)_78%,rgba(9,13,48,0.98))]" aria-hidden="true" />
    <div className="relative flex h-full flex-col justify-end p-4">
      <h3 className="font-display text-lg font-semibold leading-tight text-softWhite md:text-xl">{title}</h3>
      {playtime ? <p className="mt-1.5 font-mono text-[10px] text-acidGreen/90">{playtime}</p> : null}
      {tags.length ? <div className="mt-2 flex flex-wrap gap-1">{tags.map((tag) => <span key={tag} className="rounded bg-deepIndigo/68 px-1.5 py-0.5 text-[9px] leading-4 text-softWhite/66">{tag}</span>)}</div> : null}
    </div>
  </motion.article>;
}
