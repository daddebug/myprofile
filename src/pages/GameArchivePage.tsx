import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowDown, ArrowUp, ChevronDown, Clock, ImageIcon, Pencil, Plus, Settings2, Trophy, X } from "lucide-react";
import { GameCoverImage } from "../components/GameCoverImage";
import { GameExperienceManager } from "../components/GameExperienceManager";
import { PageTransition } from "../components/PageTransition";
import { useGameCover } from "../hooks/useGameCover";
import { useOwnerMode } from "../hooks/useOwnerMode";
import { formatAchievement, formatPlaytime, gameTitle, useGameExperienceStore, type GameExperienceRecord } from "../lib/gameExperience";
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
  const [expandedGameId, setExpandedGameId] = useState<string | null>(null);
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
        <div className="mt-12 space-y-14 md:space-y-16">
          {visibleGames.map((game, index) => <GameExperienceRow key={game.id} game={game} locale={locale} index={index} owner={isEditingGames && import.meta.env.DEV} prefersReducedMotion={Boolean(prefersReducedMotion)} expanded={expandedGameId === game.id} onToggle={() => setExpandedGameId((current) => current === game.id ? null : game.id)} onManage={() => { setStartWithNewGame(false); setEditRecordId(game.id); setManaging(true); }} />)}
        </div>
      </section>
      {managing ? <GameExperienceManager locale={locale} store={store} initialEditingId={editRecordId} startWithNewGame={startWithNewGame} onClose={() => { setManaging(false); setEditRecordId(null); setStartWithNewGame(false); }} /> : null}
    </main>
  </PageTransition>;
}

function GameExperienceRow({ game, locale, index, owner, prefersReducedMotion, expanded, onToggle, onManage }: { game: GameExperienceRecord; locale: "zh" | "en"; index: number; owner: boolean; prefersReducedMotion: boolean; expanded: boolean; onToggle: () => void; onManage: () => void }) {
  const title = gameTitle(game, locale);
  const cover = useGameCover(game.presentation.coverAssetId, game.presentation.coverPublicPath);
  const tags = game.presentation.tags.map((tag) => locale === "zh" ? tag.zh || tag.en : tag.en || tag.zh).filter(Boolean);
  const whyPlayed = locale === "zh" ? game.reflection.whyPlayedZh : game.reflection.whyPlayedEn;
  const strengths = locale === "zh" ? game.reflection.strengthsZh : game.reflection.strengthsEn;
  const contribution = locale === "zh" ? game.reflection.contributionZh : game.reflection.contributionEn;
  const detail = locale === "zh" ? game.detail.zh : game.detail.en;
  const hasDetail = detail.trim().length > 0;
  const detailsId = `game-experience-details-${game.id}`;

  return <motion.article className="relative border-t border-softWhite/12 pt-5 md:pt-6" initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.08 }} transition={{ duration: prefersReducedMotion ? 0 : 0.4, ease: [0.22, 1, 0.36, 1] }}>
    {owner ? <div className="mb-4 flex flex-wrap items-center gap-2 rounded-[8px] border border-acidGreen/22 bg-archiveBlue/12 p-2.5 font-mono text-[9px] tracking-[0.06em] text-softWhite/55" data-game-owner-toolbar><button type="button" onClick={onManage} className="editor-action text-acidGreen"><Pencil className="h-3.5 w-3.5" />{locale === "zh" ? "编辑" : "Edit"}</button><button type="button" onClick={onManage} className="editor-action">{locale === "zh" ? `首页展示：${game.publication.showOnHomepage ? "是" : "否"}` : `Homepage: ${game.publication.showOnHomepage ? "Yes" : "No"}`}</button><button type="button" onClick={onManage} className="editor-action">{game.publication.visibility.toUpperCase()}</button><button type="button" onClick={onManage} className="editor-icon" aria-label={locale === "zh" ? "上移" : "Move up"}><ArrowUp className="h-3.5 w-3.5" /></button><button type="button" onClick={onManage} className="editor-icon" aria-label={locale === "zh" ? "下移" : "Move down"}><ArrowDown className="h-3.5 w-3.5" /></button><span className="inline-flex items-center gap-1.5 px-2"><ImageIcon className="h-3.5 w-3.5" />{game.presentation.coverAssetId || game.presentation.coverPublicPath ? (locale === "zh" ? "已有封面" : "Cover ready") : (locale === "zh" ? "缺少封面" : "No cover")}</span></div> : null}
    <div className="grid gap-x-7 gap-y-5 md:grid-cols-[210px_minmax(0,0.8fr)_minmax(280px,1.2fr)] md:gap-x-6 lg:grid-cols-[210px_minmax(0,0.72fr)_minmax(360px,1.18fr)] lg:gap-x-7 xl:grid-cols-[210px_300px_minmax(0,1fr)]">
      <div>
        <div className="aspect-video w-[180px] max-w-full overflow-hidden rounded-lg bg-[#20285b] md:w-full"><GameCoverImage src={cover} title={title} className="h-full w-full object-cover object-center" /></div>
        <p className="mt-2 font-mono text-[9px] tracking-[0.12em] text-softWhite/35">{String(index + 1).padStart(2, "0")} / {game.identity.releaseYear ?? "GAME EXPERIENCE"}</p>
      </div>
      <div className="min-w-0">
        <h2 className="max-w-2xl font-display text-[22px] font-semibold leading-[1.12] text-softWhite md:text-2xl">{title}</h2>
        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 font-mono text-[11px] tracking-[0.06em] text-acidGreen/88"><span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{formatPlaytime(game, locale)}</span><span className="inline-flex items-center gap-1.5 text-softWhite/52"><Trophy className="h-3.5 w-3.5" />{formatAchievement(game, locale)}</span></div>
        {tags.length ? <div className="mt-2.5 flex flex-wrap gap-1.5">{tags.map((tag) => <span key={tag} className="rounded bg-softWhite/[0.055] px-2 py-1 text-[10px] leading-4 text-softWhite/56">{tag}</span>)}</div> : null}
        {whyPlayed.trim() ? <SummaryBlock label={locale === "zh" ? "为什么游玩" : "Why I played"} body={whyPlayed} className="mt-4" /> : null}
      </div>
      <div className="min-w-0 md:pl-1">
        {strengths.trim() ? <SummaryBlock label={locale === "zh" ? "优点" : "Strengths"} body={strengths} extended /> : null}
        {contribution.trim() ? <SummaryBlock label={locale === "zh" ? "对我的帮助" : "What I learned"} body={contribution} emphasized extended className={strengths.trim() ? "mt-4" : ""} /> : null}
        {hasDetail ? <button type="button" aria-expanded={expanded} aria-controls={detailsId} onClick={onToggle} className="mt-4 inline-flex items-center gap-1.5 font-mono text-[10px] font-bold tracking-[0.08em] text-acidGreen transition hover:text-softWhite focus:outline-none focus-visible:ring-2 focus-visible:ring-acidGreen/70"><span>{expanded ? (locale === "zh" ? "收起详情" : "Hide details") : (locale === "zh" ? "查看详情" : "View details")}</span><ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" /></button> : null}
      </div>
      {expanded && hasDetail ? <div id={detailsId} className="border-t border-softWhite/10 bg-archiveBlue/10 px-4 py-5 md:col-span-3 md:px-6"><p className="whitespace-pre-wrap text-sm leading-7 text-softWhite/74">{detail}</p></div> : null}
    </div>
  </motion.article>;
}

function SummaryBlock({ label, body, emphasized = false, extended = false, className = "" }: { label: string; body: string; emphasized?: boolean; extended?: boolean; className?: string }) {
  return <section className={`${className} ${emphasized ? "border-l-2 border-acidGreen/55 pl-3.5" : ""}`}>
    <h3 className={`font-mono text-[10px] font-bold tracking-[0.1em] ${emphasized ? "text-acidGreen" : "text-softWhite/45"}`}>{label}</h3>
    <p className={`mt-1 text-sm leading-5 text-softWhite/68 ${extended ? "line-clamp-2 xl:line-clamp-5" : "line-clamp-2"}`}>{body}</p>
  </section>;
}
