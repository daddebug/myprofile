import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageTransition } from "../components/PageTransition";
import { HomePortfolioCover } from "../components/HomePortfolioCover";
import { FeaturedProjectCard, type FeaturedProjectCardItem } from "../components/FeaturedProjectCard";
import { HomePlayExperience } from "../components/HomePlayExperience";
import { useProjectCatalog } from "../hooks/useProjectCatalog";
import type { ResolvedProjectMetadata } from "../lib/projectMetadata";
import { useLocale } from "../locales/LocaleContext";

const homeIllustrationSrc = "/images/profile/home-illustration.webp";

type ResolvedHomeProjectCard = FeaturedProjectCardItem & { projectId: string };

// How many boundary cards get cloned onto each end of the rail, and (since
// each button click advances by exactly one visible group) how far a click
// moves the scroll position — the two are the same number by construction,
// which is what makes the clone buffer exactly wide enough for one click's
// worth of travel before a reset is needed.
const VISIBLE_COUNT = 3;

type CarouselSlide = {
  project: ResolvedHomeProjectCard;
  renderKey: string;
  logicalIndex: number;
};

function resolveHomeProjectCard(project: ResolvedProjectMetadata, index: number): ResolvedHomeProjectCard {
  return {
    projectId: project.id,
    caseNumber: `CASE ${String(index + 1).padStart(2, "0")}`,
    title: project.title,
    category: project.category,
    description: project.summary,
    image: project.coverImage,
    imageAlt: `${project.title} cover image`,
    tags: project.tags,
    duration: project.duration,
    href: project.route,
    cta: "View project",
    status: project.comingSoon ? "Coming soon" : undefined,
    placeholderLabel: project.comingSoon ? "COMING SOON" : undefined,
    hoverStatement: project.summary,
    layout: index % 2 === 0 ? "image-left" : "image-right",
    disabled: project.comingSoon || !project.route,
  };
}

export function HomePage() {
  const { locale } = useLocale();
  const projectCatalog = useProjectCatalog(locale);
  const [activeFeaturedIndex, setActiveFeaturedIndex] = useState<number | null>(null);
  // Tracks the nearest card's LOGICAL project index (0..homeProjects.length-1)
  // — used for the mobile "01/08" indicator and hover glow, never the
  // render index below, so it reads the same whether the nearest card is a
  // real slide or one of the cloned boundary slides representing it.
  const [activeProjectIndex, setActiveProjectIndex] = useState(0);
  const [illustrationFailed, setIllustrationFailed] = useState(false);
  const projectRailRef = useRef<HTMLDivElement>(null);
  const pointerFocusRef = useRef(false);
  // The rail's current target position in RENDER-index space (position
  // within extendedProjects, not within homeProjects) — a ref, not state,
  // because it must be readable synchronously inside the same click handler
  // that also kicks off a smooth-scroll animation whose intermediate onScroll
  // events would otherwise race a state-based value (see the two-clicks bug
  // this replaced). Each click moves it by exactly one VISIBLE_COUNT step in
  // either direction, with no modulo — the illusion of looping comes from
  // silently re-pointing the rail at the equivalent real position once a
  // click's smooth-scroll has carried it onto a cloned boundary card, not
  // from wrapping the index itself.
  const renderIndexRef = useRef(VISIBLE_COUNT);
  const settleTimeoutRef = useRef<number | undefined>(undefined);
  const prefersReducedMotion = useReducedMotion();
  const homeProjects = useMemo(() => {
    return projectCatalog
      .filter((project) => project.featured && project.visibility === "public")
      .sort((left, right) => left.archiveOrder - right.archiveOrder)
      .map(resolveHomeProjectCard);
  }, [projectCatalog]);
  const hasMultipleGroups = homeProjects.length > 3;
  // Clone the last/first VISIBLE_COUNT real cards onto the opposite ends of
  // the rail so scrolling one click past either real boundary lands on a
  // card that looks identical to where a silent, unanimated reset will put
  // it — e.g. real [1,2,3,4,5,6,7,8] renders as [6,7,8, 1..8, 1,2,3]. Skipped
  // entirely when there's nothing to loop (<=VISIBLE_COUNT real cards).
  const extendedProjects = useMemo<CarouselSlide[]>(() => {
    const real = homeProjects.map((project, logicalIndex) => ({ project, renderKey: `real-${project.projectId}`, logicalIndex }));
    if (homeProjects.length <= VISIBLE_COUNT) return real;
    const prepend = homeProjects.slice(-VISIBLE_COUNT).map((project, i) => ({
      project,
      renderKey: `prepend-${project.projectId}-${i}`,
      logicalIndex: homeProjects.length - VISIBLE_COUNT + i,
    }));
    const append = homeProjects.slice(0, VISIBLE_COUNT).map((project, i) => ({
      project,
      renderKey: `append-${project.projectId}-${i}`,
      logicalIndex: i,
    }));
    return [...prepend, ...real, ...append];
  }, [homeProjects]);
  const projectOverviewTitle = locale === "zh" ? "项目总览" : "Project Overview";
  const previousGroupLabel = locale === "zh" ? "上一组项目" : "Previous project group";
  const nextGroupLabel = locale === "zh" ? "下一组项目" : "Next project group";

  const scrollToRenderIndex = (renderIndex: number, instant = false) => {
    const rail = projectRailRef.current;
    const item = rail?.querySelector<HTMLElement>(`[data-carousel-index="${renderIndex}"]`);
    if (!rail || !item) return;
    const firstItem = rail.querySelector<HTMLElement>("[data-carousel-index]");
    const railOffset = firstItem?.offsetLeft ?? 0;
    rail.scrollTo({ left: item.offsetLeft - railOffset, behavior: instant || prefersReducedMotion ? "auto" : "smooth" });
  };

  useEffect(() => {
    setActiveProjectIndex((current) => Math.min(current, Math.max(0, homeProjects.length - 1)));
    const startRenderIndex = hasMultipleGroups ? VISIBLE_COUNT : 0;
    renderIndexRef.current = startRenderIndex;
    // Instant — this is the initial mount / project-list-change position,
    // landing on the middle real block's first item, not a user-triggered
    // transition, so it must never animate.
    scrollToRenderIndex(startRenderIndex, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeProjects, hasMultipleGroups]);

  const showProjectGroup = (direction: "previous" | "next") => {
    if (!hasMultipleGroups) return;
    const target = renderIndexRef.current + (direction === "next" ? VISIBLE_COUNT : -VISIBLE_COUNT);
    renderIndexRef.current = target;
    setActiveFeaturedIndex(null);
    scrollToRenderIndex(target);
  };

  const syncActiveProject = () => {
    const rail = projectRailRef.current;
    if (!rail) return;
    const items = [...rail.querySelectorAll<HTMLElement>("[data-carousel-index]")];
    if (!items.length) return;
    const railOffset = items[0].offsetLeft;
    const nearest = items.reduce((best, item) => Math.abs(item.offsetLeft - railOffset - rail.scrollLeft) < Math.abs(best.offsetLeft - railOffset - rail.scrollLeft) ? item : best);
    setActiveProjectIndex(Number(nearest.dataset.logicalIndex ?? 0));

    if (!hasMultipleGroups) return;
    const renderIndex = Number(nearest.dataset.carouselIndex ?? 0);
    const total = homeProjects.length;
    window.clearTimeout(settleTimeoutRef.current);
    // Debounced so this only fires once scrolling has actually settled
    // (button-triggered smooth scroll or a manual drag) — every scroll
    // event along the way re-arms it, matching the "wait for the smooth
    // scroll to finish" requirement rather than resetting mid-animation.
    settleTimeoutRef.current = window.setTimeout(() => {
      let resetTo: number | null = null;
      if (renderIndex < VISIBLE_COUNT) resetTo = renderIndex + total;
      else if (renderIndex >= VISIBLE_COUNT + total) resetTo = renderIndex - total;
      if (resetTo === null) return;
      renderIndexRef.current = resetTo;
      // Instant — the clone and the real card it stands in for are visually
      // identical, so this repositioning is imperceptible.
      scrollToRenderIndex(resetTo, true);
    }, 160);
  };

  return (
    <PageTransition>
      <HomePortfolioCover />

      <section className="bg-deepIndigo pb-14 pt-24 text-softWhite md:pb-20 md:pt-36 lg:pt-[156px]">
        <div className="site-container">
          <div className="mb-10 text-center md:mb-12">
            <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.24em] text-acidGreen/86">
              {projectOverviewTitle}
            </h2>
          </div>

          <div className="xl:grid xl:grid-cols-[6.5rem_minmax(0,1fr)_6.5rem] xl:items-center xl:gap-2">
            <div className="hidden justify-self-stretch xl:block">
              <ProjectGroupButton
                direction="previous"
                label={previousGroupLabel}
                disabled={!hasMultipleGroups}
                onClick={() => showProjectGroup("previous")}
              />
            </div>

            <div className="min-w-0">
              <div
                ref={projectRailRef}
                className="home-project-rail flex snap-x snap-mandatory gap-3.5 overflow-x-auto md:gap-7 xl:gap-8"
                data-featured-project-group={homeProjects.map((project) => project.projectId).join("-") || "empty"}
                aria-label={locale === "zh" ? "精选项目，可横向滑动" : "Featured projects, horizontally scrollable"}
                onScroll={syncActiveProject}
                onPointerLeave={() => setActiveFeaturedIndex(null)}
                onPointerDown={() => {
                  pointerFocusRef.current = true;
                }}
                onFocusCapture={(event) => {
                  const item = (event.target as HTMLElement).closest<HTMLElement>("[data-carousel-index]");
                  if (!item) return;
                  const logicalIndex = Number(item.dataset.logicalIndex ?? 0);
                  const focusFromPointer = pointerFocusRef.current;
                  pointerFocusRef.current = false;
                  if (!focusFromPointer) {
                    item.scrollIntoView({ block: "nearest", inline: "start", behavior: prefersReducedMotion ? "auto" : "smooth" });
                  }
                  setActiveProjectIndex(logicalIndex);
                }}
              >
                {extendedProjects.map((slide, renderIndex) => (
                  <div key={slide.renderKey} className="home-project-slide snap-start" data-carousel-index={renderIndex} data-logical-index={slide.logicalIndex}>
                  <FeaturedProjectCard
                    projectId={slide.project.projectId}
                    project={slide.project}
                    index={slide.logicalIndex}
                    isActive={activeFeaturedIndex === slide.logicalIndex}
                    hasActive={activeFeaturedIndex !== null}
                    onActivate={() => setActiveFeaturedIndex(slide.logicalIndex)}
                    onDeactivate={() => setActiveFeaturedIndex(null)}
                  />
                  </div>
                ))}
              </div>
              {homeProjects.length ? (
                <div className="mt-5 flex items-center justify-center gap-3 font-mono text-[10px] font-bold tracking-[0.14em] text-softWhite/52 xl:hidden" aria-live="polite" aria-atomic="true">
                  <span className="text-acidGreen">{String(activeProjectIndex + 1).padStart(2, "0")}</span>
                  <span aria-hidden="true">/</span>
                  <span>{String(homeProjects.length).padStart(2, "0")}</span>
                </div>
              ) : null}
            </div>

            <div className="hidden justify-self-stretch xl:block">
              <ProjectGroupButton
                direction="next"
                label={nextGroupLabel}
                disabled={!hasMultipleGroups}
                onClick={() => showProjectGroup("next")}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="flex min-h-[82vh] flex-col items-center justify-center bg-deepIndigo px-4 pb-32 pt-20 text-softWhite md:min-h-[88vh] md:px-6 md:pb-40 md:pt-24">
        <motion.p
          className="max-w-5xl text-center font-display text-[clamp(2.25rem,5vw,5.9rem)] leading-[1.02] text-softWhite/86"
          initial={prefersReducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.45 }}
          transition={{ duration: prefersReducedMotion ? 0.01 : 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          Games are built from the small experiences we choose to refine.
        </motion.p>

        <HomePlayExperience />

        <motion.div
          className="mt-[96px] grid h-[88px] w-[88px] place-items-center overflow-hidden rounded-full border border-softWhite/12 bg-archiveBlue/24 md:mt-[112px] md:h-24 md:w-24 lg:h-28 lg:w-28"
          initial={prefersReducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: prefersReducedMotion ? 0.01 : 0.42, ease: "easeOut" }}
          data-home-illustration-slot
        >
          {!illustrationFailed ? (
            <img
              src={homeIllustrationSrc}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
              onError={() => setIllustrationFailed(true)}
            />
          ) : (
            <span className="h-2 w-2 rounded-full bg-acidGreen/24" aria-hidden="true" />
          )}
        </motion.div>
      </section>
    </PageTransition>
  );
}

function ProjectGroupButton({
  direction,
  label,
  disabled,
  onClick,
}: {
  direction: "previous" | "next";
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  const isPrevious = direction === "previous";
  const Icon = isPrevious ? ChevronLeft : ChevronRight;

  return (
    <button
      type="button"
      className={`group grid h-24 w-full place-items-center border-0 bg-transparent text-softWhite/62 shadow-none transition-colors duration-200 focus:outline-none focus-visible:text-softWhite focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-softWhite/70 sm:h-32 lg:h-40 ${
        disabled ? "cursor-not-allowed opacity-20" : "hover:text-softWhite"
      }`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
    >
      <Icon
        className={`h-20 w-11 stroke-[2.6] transition-transform duration-200 motion-reduce:transform-none motion-reduce:transition-none sm:h-24 sm:w-14 lg:h-32 lg:w-20 ${
          disabled
            ? ""
            : isPrevious
              ? "group-hover:-translate-x-1 group-hover:scale-105 group-focus-visible:-translate-x-1 group-focus-visible:scale-105"
              : "group-hover:translate-x-1 group-hover:scale-105 group-focus-visible:translate-x-1 group-focus-visible:scale-105"
        }`}
        aria-hidden="true"
      />
    </button>
  );
}
