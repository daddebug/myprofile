import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Star } from "lucide-react";
import { Link } from "react-router-dom";
import { gameArchiveCopy, gameArchiveItems, homeGameArchiveIds } from "../data/gameArchive";
import { useLocale } from "../locales/LocaleContext";

const albumPositions = [
  "md:left-[0%] md:top-[68px]",
  "md:left-[14%] md:top-[2px]",
  "md:left-[28%] md:top-[86px]",
  "md:left-[43%] md:top-[28px]",
  "md:left-[58%] md:top-[92px]",
  "md:left-[72%] md:top-[4px]",
  "md:right-[0%] md:top-[76px]",
];

const albumRotations = [-5, 2, -2, 4, -3, 3, -2];

const albumSurfaces = [
  "from-[#345eac] to-[#1b285e]",
  "from-[#273d8f] to-[#121c50]",
  "from-[#4569c9] to-[#1d245b]",
  "from-[#223b84] to-[#10173f]",
  "from-[#536fd0] to-[#20265f]",
  "from-[#31467f] to-[#10193c]",
  "from-[#294f78] to-[#111a42]",
];

export function HomePlayExperience() {
  const prefersReducedMotion = useReducedMotion();
  const { pathFor } = useLocale();
  const games = homeGameArchiveIds
    .map((id) => gameArchiveItems.find((game) => game.id === id))
    .filter((game): game is (typeof gameArchiveItems)[number] => Boolean(game));

  return (
    <motion.div
      className="mt-24 w-full md:mt-32"
      initial={prefersReducedMotion ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.16 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.55, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="mx-auto max-w-3xl px-4 text-center">
        <p className="font-mono text-[11px] font-bold tracking-[0.24em] text-acidGreen">
          {gameArchiveCopy.home.eyebrow}
        </p>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-softWhite/66 md:text-lg">
          {gameArchiveCopy.home.intro}
        </p>
      </div>

      <div className="mt-12 overflow-x-auto px-4 pb-5 md:mt-14 md:overflow-visible md:px-6">
        <div className="flex min-w-max items-start pr-4 md:relative md:mx-auto md:block md:h-[350px] md:min-w-0 md:max-w-[1240px] md:pr-0">
          {games.map((game, index) => {
            const isFavorite = game.favorite;
            return (
              <motion.article
                key={game.id}
                className={`relative -ml-3 h-[218px] w-[164px] shrink-0 overflow-hidden rounded-lg border bg-gradient-to-br p-4 shadow-[0_18px_42px_rgba(3,7,30,0.32)] first:ml-0 md:absolute md:h-[244px] md:w-[184px] ${
                  albumPositions[index]
                } ${albumSurfaces[index]} ${
                  isFavorite ? "z-20 border-acidGreen/55" : "border-softWhite/10"
                }`}
                style={{ marginTop: index % 2 === 0 ? 22 : 0, rotate: albumRotations[index] }}
                whileHover={
                  prefersReducedMotion
                    ? undefined
                    : {
                        y: -8,
                        scale: 1.025,
                        rotate: albumRotations[index],
                        zIndex: 30,
                        boxShadow: "0 24px 52px rgba(3, 7, 30, 0.48)",
                      }
                }
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full border border-softWhite/10" aria-hidden="true" />
                <div className="absolute bottom-10 left-0 right-0 h-px bg-softWhite/10" aria-hidden="true" />
                <div className="relative flex h-full flex-col">
                  <div className="flex items-start justify-between font-mono text-[10px] tracking-[0.14em] text-softWhite/50">
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    {isFavorite ? <Star className="h-3.5 w-3.5 fill-acidGreen text-acidGreen" aria-hidden="true" /> : null}
                  </div>
                  <div className="mt-auto">
                    {isFavorite ? (
                      <p className="mb-2 font-mono text-[9px] font-bold tracking-[0.16em] text-acidGreen">
                        {gameArchiveCopy.home.favoriteLabel}
                      </p>
                    ) : null}
                    <h3 className="font-display text-xl font-semibold leading-tight text-softWhite md:text-[22px]">
                      {game.title}
                    </h3>
                    <p className="mt-2 font-mono text-[11px] text-acidGreen/88">{game.playtime}</p>
                    <p className="mt-2 text-[12px] leading-5 text-softWhite/62">{game.experienceNote}</p>
                  </div>
                </div>
              </motion.article>
            );
          })}
        </div>
      </div>

      <div className="mx-auto mt-8 max-w-2xl px-5 text-center md:mt-4">
        <p className="font-mono text-[10px] font-bold tracking-[0.18em] text-acidGreen">
          {gameArchiveCopy.home.favoriteLabel} · 无期迷途
        </p>
        <p className="mt-3 text-sm leading-6 text-softWhite/60 md:text-base">
          {gameArchiveCopy.home.favoriteDescription}
        </p>
        <Link
          to={pathFor("/play")}
          className="group mt-7 inline-flex items-center gap-2 rounded-full border border-acidGreen/70 bg-deepIndigo/48 px-7 py-3 font-mono text-xs font-bold tracking-[0.12em] text-acidGreen transition duration-300 hover:border-acidGreen hover:bg-acidGreen hover:text-deepIndigo hover:shadow-[0_0_24px_rgba(52,255,56,0.14)] focus:outline-none focus-visible:ring-2 focus-visible:ring-acidGreen/70 focus-visible:ring-offset-2 focus-visible:ring-offset-deepIndigo"
        >
          {gameArchiveCopy.home.cta}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
        </Link>
      </div>
    </motion.div>
  );
}
