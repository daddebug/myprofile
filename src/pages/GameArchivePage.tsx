import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowDown, ArrowUp, Clock, ImageIcon, Pencil, Plus, Settings2, Trophy, X } from "lucide-react";
import { GameCoverImage } from "../components/GameCoverImage";
import { GameExperienceManager } from "../components/GameExperienceManager";
import { PageTransition } from "../components/PageTransition";
import { useGameCover } from "../hooks/useGameCover";
import { useOwnerMode } from "../hooks/useOwnerMode";
import { formatAchievement, formatPaidAmount, formatPlaytime, gameTitle, useGameExperienceStore, type GameExperienceRecord } from "../lib/gameExperience";
import { useLocale } from "../locales/LocaleContext";

export function GameArchivePage() {
  const { locale } = useLocale();
  const isOwnerMode = useOwnerMode();
  const store = useGameExperienceStore();
  const [query, setQuery] = useState("");
  const [managing, setManaging] = useState(false);
  const [editRecordId, setEditRecordId] = useState<string | null>(null);
  const [startWithNewGame, setStartWithNewGame] = useState(false);
  const [isEditingGames, setIsEditingGames] = useState(isOwnerMode);
  const prefersReducedMotion = useReducedMotion();
  const visibleGames = useMemo(() => store.records
    .filter((game) => game.publication.visibility === "public" && !game.publication.archived)
    .sort((a, b) => a.publication.libraryOrder - b.publication.libraryOrder)
    .filter((game) => {
      const haystack = [gameTitle(game, locale), game.identity.canonicalTitle, ...game.presentation.tags.flatMap((tag) => [tag.zh, tag.en])].join(" ").toLocaleLowerCase();
      return haystack.includes(query.trim().toLocaleLowerCase());
    }), [locale, query, store]);
  const recordedHours = store.records.reduce((sum, game) => sum + (game.stats.playtimeHours ?? 0), 0);
  const selectedCount = store.records.filter((game) => game.publication.showOnHomepage && !game.publication.archived).length;

  useEffect(() => {
    if (isOwnerMode) setIsEditingGames(true);
  }, [isOwnerMode]);

  return <PageTransition>
    <main className="min-h-screen bg-deepIndigo pb-28 pt-16 text-softWhite md:pb-36 md:pt-24">
      {import.meta.env.DEV ? isEditingGames ? <div className="fixed right-4 top-[84px] z-[80] flex max-w-[calc(100vw-2rem)] flex-wrap justify-end gap-2 md:right-6" data-game-experience-editor-actions><button type="button" className="editor-action bg-deepIndigo/95 text-acidGreen shadow-archive" onClick={() => { setStartWithNewGame(true); setEditRecordId(null); setManaging(true); }}><Plus className="h-3.5 w-3.5" />{locale === "zh" ? "新增游戏经验" : "Add game"}</button><button type="button" className="editor-action bg-deepIndigo/95 shadow-archive" onClick={() => { setStartWithNewGame(false); setEditRecordId(null); setManaging(true); }}><Settings2 className="h-3.5 w-3.5" />{locale === "zh" ? "编辑排序" : "Edit order"}</button><span className="editor-action cursor-default bg-deepIndigo/95 text-softWhite/62">{locale === "zh" ? `首页展示：${selectedCount} / ${store.homepageLimit}` : `Homepage: ${selectedCount} / ${store.homepageLimit}`}</span><button type="button" className="editor-action bg-deepIndigo/95 shadow-archive" onClick={() => setIsEditingGames(false)}><X className="h-3.5 w-3.5" />{locale === "zh" ? "完成编辑" : "Done"}</button></div> : <button type="button" className="fixed right-4 top-[84px] z-[80] inline-flex items-center gap-2 rounded-full border border-acidGreen/55 bg-deepIndigo/95 px-4 py-2.5 font-mono text-[10px] font-bold tracking-[0.08em] text-acidGreen shadow-archive md:right-6" onClick={() => setIsEditingGames(true)}><Pencil className="h-3.5 w-3.5" />{locale === "zh" ? "编辑游戏经验" : "Edit game experience"}</button> : null}
      <section className="site-container">
        <p className="font-mono text-[11px] font-bold tracking-[0.24em] text-acidGreen">PLAY HISTORY / DESIGN NOTES</p>
        <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)] lg:items-end"><div><h1 className="max-w-5xl font-display text-[clamp(3rem,7vw,7.5rem)] font-semibold leading-[0.94] text-softWhite">{locale === "zh" ? "游戏经历" : "Game Experience"}</h1><p className="mt-5 font-display text-xl text-acidGreen/90 md:text-2xl">{locale === "zh" ? "游玩时长、成就、评测与设计观察。" : "Playtime, achievements, reviews, and design observations."}</p></div><p className="max-w-xl text-base leading-8 text-softWhite/62 lg:pb-1">{locale === "zh" ? "记录我为什么进入一款游戏、它做对了什么、留下了哪些问题，以及这些观察如何帮助我的设计判断。" : "A record of why I played, what each game does well, where it falls short, and how those observations shape my design judgment."}</p></div>
        <div className="mt-14 flex flex-wrap gap-x-10 gap-y-5 border-y border-softWhite/10 py-5 font-mono text-[11px] tracking-[0.12em] text-softWhite/56"><span><strong className="mr-2 text-base text-softWhite">{visibleGames.length}</strong>{locale === "zh" ? "款公开记录" : "PUBLIC GAMES"}</span><span><strong className="mr-2 text-base text-softWhite">{recordedHours.toLocaleString()}h+</strong>{locale === "zh" ? "已记录游玩" : "RECORDED PLAY"}</span></div>
      </section>

      <section className="site-container mt-12">
        <label className="block max-w-md"><span className="sr-only">{locale === "zh" ? "搜索游戏" : "Search games"}</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={locale === "zh" ? "按标题或标签搜索" : "Search by title or tag"} className="w-full rounded-full border border-softWhite/12 bg-softWhite/[0.04] px-5 py-3 text-sm text-softWhite outline-none placeholder:text-softWhite/35 focus:border-acidGreen/60" /></label>
        <div className="mt-12 columns-1 [column-gap:1.5rem] lg:columns-2 lg:[column-gap:1.75rem]">
          {visibleGames.map((game, index) => <GameExperienceRow key={game.id} game={game} locale={locale} index={index} owner={isEditingGames && import.meta.env.DEV} prefersReducedMotion={Boolean(prefersReducedMotion)} onManage={() => { setStartWithNewGame(false); setEditRecordId(game.id); setManaging(true); }} />)}
        </div>
      </section>
      {managing ? <GameExperienceManager locale={locale} store={store} initialEditingId={editRecordId} startWithNewGame={startWithNewGame} onClose={() => { setManaging(false); setEditRecordId(null); setStartWithNewGame(false); }} /> : null}
    </main>
  </PageTransition>;
}

function GameExperienceRow({ game, locale, index, owner, prefersReducedMotion, onManage }: { game: GameExperienceRecord; locale: "zh" | "en"; index: number; owner: boolean; prefersReducedMotion: boolean; onManage: () => void }) {
  const title = gameTitle(game, locale);
  const cover = useGameCover(game.presentation.coverAssetId, game.presentation.coverPublicPath);
  const tags = game.presentation.tags.map((tag) => locale === "zh" ? tag.zh || tag.en : tag.en || tag.zh).filter(Boolean);
  const strengths = locale === "zh" ? game.reflection.strengthsZh : game.reflection.strengthsEn;
  const weaknesses = locale === "zh" ? game.reflection.weaknessesZh : game.reflection.weaknessesEn;
  const contribution = locale === "zh" ? game.reflection.contributionZh : game.reflection.contributionEn;
  const detail = locale === "zh" ? game.detail.zh : game.detail.en;
  const playtime = formatPlaytime(game, locale);
  const achievement = formatAchievement(game, locale);
  const paidAmount = formatPaidAmount(game, locale);

  const hasBody = Boolean(strengths.trim() || weaknesses.trim() || contribution.trim() || detail.trim());

  return <motion.article className="group relative isolate mb-6 inline-block w-full break-inside-avoid overflow-hidden rounded-lg border border-[#e1e9ff]/[0.08] bg-transparent p-5 align-top shadow-[0_26px_72px_rgba(2,5,28,0.18),inset_0_1px_0_rgba(238,243,255,0.075)] transition-[transform,box-shadow] duration-200 ease-out lg:hover:!-translate-y-0.5 lg:hover:shadow-[0_30px_82px_rgba(2,5,28,0.23),inset_0_1px_0_rgba(238,243,255,0.09)] md:p-6" initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.08 }} transition={{ duration: prefersReducedMotion ? 0 : 0.4, ease: [0.22, 1, 0.36, 1] }}>
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[-2] rounded-[inherit] bg-[#2b354d]/30 backdrop-blur-[22px] backdrop-saturate-[1.04]" />
    {cover ? <>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-[-1] h-[85%] w-full overflow-hidden"
        data-game-card-ambient="lower"
        style={{ WebkitMaskImage: "linear-gradient(to bottom, #000 0%, #000 29%, rgba(0,0,0,0.7) 55%, rgba(0,0,0,0.18) 78%, transparent 100%)", maskImage: "linear-gradient(to bottom, #000 0%, #000 29%, rgba(0,0,0,0.7) 55%, rgba(0,0,0,0.18) 78%, transparent 100%)" }}
      >
        <img src={cover} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover object-center opacity-0 brightness-[1.08] blur-[50px] saturate-[0.92] transition-opacity duration-300 ease-out lg:group-hover:opacity-[0.14]" />
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-[-1] h-[42%] w-full overflow-hidden"
        data-game-card-ambient="top"
        style={{ WebkitMaskImage: "linear-gradient(to bottom, #000 0%, rgba(0,0,0,0.82) 28%, rgba(0,0,0,0.32) 66%, rgba(0,0,0,0.08) 86%, transparent 100%)", maskImage: "linear-gradient(to bottom, #000 0%, rgba(0,0,0,0.82) 28%, rgba(0,0,0,0.32) 66%, rgba(0,0,0,0.08) 86%, transparent 100%)" }}
      >
        <img src={cover} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover object-center opacity-0 brightness-[1.2] contrast-[1.04] blur-[16px] saturate-[1.05] transition-opacity duration-300 ease-out lg:group-hover:opacity-[0.29]" />
      </div>
    </> : null}
    {owner ? <div className="mb-4 flex flex-wrap items-center gap-2 rounded-[8px] border border-acidGreen/22 bg-archiveBlue/12 p-2.5 font-mono text-[9px] tracking-[0.06em] text-softWhite/55" data-game-owner-toolbar><button type="button" onClick={onManage} className="editor-action text-acidGreen"><Pencil className="h-3.5 w-3.5" />{locale === "zh" ? "编辑" : "Edit"}</button><button type="button" onClick={onManage} className="editor-action">{locale === "zh" ? `首页展示：${game.publication.showOnHomepage ? "是" : "否"}` : `Homepage: ${game.publication.showOnHomepage ? "Yes" : "No"}`}</button><button type="button" onClick={onManage} className="editor-action">{game.publication.visibility.toUpperCase()}</button><button type="button" onClick={onManage} className="editor-icon" aria-label={locale === "zh" ? "上移" : "Move up"}><ArrowUp className="h-3.5 w-3.5" /></button><button type="button" onClick={onManage} className="editor-icon" aria-label={locale === "zh" ? "下移" : "Move down"}><ArrowDown className="h-3.5 w-3.5" /></button><span className="inline-flex items-center gap-1.5 px-2"><ImageIcon className="h-3.5 w-3.5" />{game.presentation.coverAssetId || game.presentation.coverPublicPath ? (locale === "zh" ? "已有封面" : "Cover ready") : (locale === "zh" ? "缺少封面" : "No cover")}</span></div> : null}
    <header className="relative z-10 grid grid-cols-[112px_minmax(0,1fr)] gap-4 sm:grid-cols-[148px_minmax(0,1fr)]">
      <div className="min-w-0">
        <div className="aspect-video w-full overflow-hidden rounded-lg border border-softWhite/[0.09] bg-[#20285b] shadow-[5px_9px_20px_rgba(2,5,27,0.34),inset_1px_1px_0_rgba(255,255,255,0.08)]"><GameCoverImage src={cover} title={title} className="h-full w-full object-cover object-center" /></div>
        <p className="mt-2 font-mono text-[9px] tracking-[0.12em] text-softWhite/35">{String(index + 1).padStart(2, "0")} / {game.identity.releaseYear ?? "GAME EXPERIENCE"}</p>
      </div>
      <div className="min-w-0 self-start">
        <h2 className="font-display text-[26px] font-semibold leading-[1.12] text-softWhite md:text-[30px]">{title}</h2>
        {playtime || achievement || paidAmount ? <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 font-mono text-sm leading-5 tracking-[0.04em] text-acidGreen/88">{playtime ? <span className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4" />{playtime}</span> : null}{achievement ? <span className="inline-flex items-center gap-1.5 text-softWhite/56"><Trophy className="h-4 w-4" />{achievement}</span> : null}{paidAmount ? <span className="inline-flex items-center gap-1.5 text-softWhite/56">{locale === "zh" ? "付费" : "Spent"} {paidAmount}</span> : null}</div> : null}
        {tags.length ? <div className="mt-3 flex flex-wrap gap-1.5">{tags.map((tag) => <span key={tag} className="rounded bg-softWhite/[0.055] px-2 py-1 text-[13px] leading-5 text-softWhite/60">{tag}</span>)}</div> : null}
      </div>
    </header>
    {hasBody ? <div className="relative z-10 mt-5 border-t border-softWhite/[0.055] pt-4">
      {contribution.trim() ? <TakeawayBlock label={locale === "zh" ? "对我的帮助" : "What I learned"} body={contribution} /> : null}
      {strengths.trim() || weaknesses.trim() ? <div className={`grid gap-3 ${contribution.trim() ? "mt-6" : ""} ${strengths.trim() && weaknesses.trim() ? "xl:grid-cols-2" : ""}`}>
        {strengths.trim() ? <EvidenceBlock label={locale === "zh" ? "优点" : "Strengths"} body={strengths} /> : null}
        {weaknesses.trim() ? <EvidenceBlock label={locale === "zh" ? "局限" : "Limitations"} body={weaknesses} divided={Boolean(strengths.trim())} /> : null}
      </div> : null}
      {detail.trim() ? <DetailBlock label={locale === "zh" ? "详细体验" : "Detailed experience"} body={detail} className={strengths.trim() || weaknesses.trim() || contribution.trim() ? "mt-7" : ""} /> : null}
    </div> : null}
  </motion.article>;
}

function EvidenceBlock({ label, body, divided = false }: { label: string; body: string; divided?: boolean }) {
  return <section className={divided ? "xl:border-l xl:border-softWhite/[0.055] xl:pl-5" : "xl:pr-2"}>
    <h3 className="font-mono text-[11px] font-bold tracking-[0.1em] text-softWhite/45">{label}</h3>
    <p className="mt-1.5 whitespace-pre-wrap text-[15px] font-normal leading-[1.55] text-[#dbe3f5]/58">{body}</p>
  </section>;
}

function TakeawayBlock({ label, body, className = "" }: { label: string; body: string; className?: string }) {
  return <section className={`${className} rounded-md border border-softWhite/[0.065] bg-softWhite/[0.055] px-5 py-5 shadow-[0_16px_42px_rgba(2,7,27,0.1),inset_0_1px_0_rgba(248,251,255,0.075)] backdrop-blur-[14px]`}>
    <p className="font-mono text-[10px] font-bold tracking-[0.14em] text-acidGreen/72">DESIGN TAKEAWAY</p>
    <h3 className="mt-1 font-mono text-xs font-bold tracking-[0.08em] text-acidGreen">{label}</h3>
    <p className="mt-2 whitespace-pre-wrap text-[19px] font-medium leading-[1.6] text-softWhite/82">{body}</p>
  </section>;
}

function DetailBlock({ label, body, className = "" }: { label: string; body: string; className?: string }) {
  return <section className={`${className} border-t border-softWhite/[0.045] pt-5`}>
    <h3 className="font-mono text-[11px] font-bold tracking-[0.1em] text-softWhite/30">{label}</h3>
    <p className="mt-1.5 whitespace-pre-wrap text-[14px] font-normal leading-[1.75] text-[#d3dced]/42">{body}</p>
  </section>;
}
