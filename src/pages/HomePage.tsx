import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageTransition } from "../components/PageTransition";
import { AnimatedLogo } from "../components/AnimatedLogo";
import { FeaturedProjectCard, type FeaturedProjectCardItem } from "../components/FeaturedProjectCard";
import { HomePlayExperience } from "../components/HomePlayExperience";
import { useProjectCatalog } from "../hooks/useProjectCatalog";
import type { ResolvedProjectMetadata } from "../lib/projectMetadata";
import { useLocale } from "../locales/LocaleContext";

const homeIllustrationSrc = "/images/profile/home-illustration.webp";

type HomeProjectCardConfig = Omit<
  FeaturedProjectCardItem,
  "title" | "category" | "description" | "image" | "tags" | "duration" | "href"
> & {
  homeId: string;
};

type ResolvedHomeProjectCard = FeaturedProjectCardItem & { homeId: string };

const homeProjectGroupConfig: { title: string; projects: HomeProjectCardConfig[] }[] = [
  {
    title: "Featured Projects",
    projects: [
      {
        homeId: "cross-platform-game-ux",
        caseNumber: "CASE 01",
        imageAlt: "Cross-platform game UX cover image",
        cta: "View case",
        hoverStatement: "Change hierarchy before changing components.",
        layout: "image-left",
      },
      {
        homeId: "3d-character-ui-rhythm",
        caseNumber: "CASE 02",
        imageAlt: "3D character UI rhythm case-study cover image",
        cta: "View case",
        hoverStatement: "让信息在正确的时刻出现。",
        layout: "image-right",
      },
      {
        homeId: "interaction-profile-agent",
        caseNumber: "CASE 03",
        imageAlt: "Accumulated interaction judgment agent project placeholder",
        cta: "View case",
        status: "进行中 / IN PROGRESS",
        placeholderLabel: "IN PROGRESS",
        hoverStatement: "Preserving human interaction judgment as reusable design knowledge.",
        layout: "image-left",
      },
    ],
  },
  {
    title: "More Projects",
    projects: [
      {
        homeId: "ui-personal-practice",
        caseNumber: "CASE 04",
        imageAlt: "UI Personal Practice archive cover image",
        cta: "Open archive",
        hoverStatement: "Interface practice collected as a visual shelf.",
        layout: "image-left",
      },
      {
        homeId: "activity-design",
        caseNumber: "CASE 05",
        imageAlt: "Activity Design draft cover image",
        cta: "Coming soon",
        status: "Coming soon",
        hoverStatement: "A draft slot for activity-design work.",
        layout: "image-right",
        disabled: true,
      },
      {
        homeId: "from-theme-to-playable-rule",
        caseNumber: "CASE 06",
        imageAlt: "Game jam playable rule cover image",
        cta: "View case",
        hoverStatement: "Does the idea change what the player does?",
        layout: "image-left",
      },
    ],
  },
];

function resolveHomeProjectCard(
  config: HomeProjectCardConfig,
  catalog: ResolvedProjectMetadata[],
): ResolvedHomeProjectCard {
  const { homeId, ...card } = config;
  const metadata = catalog.find((project) => project.id === homeId);
  if (!metadata) throw new Error(`Missing shared project metadata for ${homeId}.`);

  return {
    ...card,
    homeId,
    title: metadata.title,
    category: metadata.category,
    description: metadata.summary,
    image: metadata.coverImage,
    tags: metadata.tags,
    duration: metadata.duration,
    href: metadata.route,
    disabled: card.disabled || metadata.comingSoon,
  };
}

export function HomePage() {
  const { locale } = useLocale();
  const projectCatalog = useProjectCatalog(locale);
  const [activeFeaturedIndex, setActiveFeaturedIndex] = useState<number | null>(null);
  const [activeGroupIndex, setActiveGroupIndex] = useState(0);
  const [groupDirection, setGroupDirection] = useState(1);
  const [isGroupTransitioning, setIsGroupTransitioning] = useState(false);
  const [illustrationFailed, setIllustrationFailed] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const homeProjectGroups = useMemo(() => {
    return homeProjectGroupConfig.map((group) => ({
      ...group,
      projects: group.projects.map((project) => resolveHomeProjectCard(project, projectCatalog)),
    }));
  }, [projectCatalog]);
  const homeCarouselSlides = useMemo(
    () => homeProjectGroups.map((group, index) => ({ ...group, key: `${index}-${group.title}` })),
    [homeProjectGroups],
  );
  const activeGroup = homeCarouselSlides[activeGroupIndex];
  const hasMultipleGroups = homeCarouselSlides.length > 1;
  const groupOffset = prefersReducedMotion ? 0 : groupDirection * 28;
  const projectOverviewTitle = locale === "zh" ? "项目总览" : "Project Overview";
  const previousGroupLabel = locale === "zh" ? "上一组项目" : "Previous project group";
  const nextGroupLabel = locale === "zh" ? "下一组项目" : "Next project group";

  const showProjectGroup = (direction: "previous" | "next") => {
    if (!hasMultipleGroups || isGroupTransitioning) return;

    const signedDirection = direction === "next" ? 1 : -1;
    const nextIndex = (activeGroupIndex + signedDirection + homeCarouselSlides.length) % homeCarouselSlides.length;

    setGroupDirection(signedDirection);
    setActiveFeaturedIndex(null);
    setIsGroupTransitioning(true);
    setActiveGroupIndex(nextIndex);
  };

  return (
    <PageTransition>
      <section className="relative overflow-hidden bg-deepIndigo text-softWhite">
        <div className="absolute inset-0 bg-grain bg-[length:18px_18px] opacity-20" />

        <div className="site-container relative flex min-h-[100svh] flex-col items-center justify-center py-10">
          <AnimatedLogo />
          <p className="mt-10 whitespace-nowrap text-center font-display text-[clamp(0.95rem,1.45vw,1.45rem)] font-semibold tracking-[0.08em] text-acidGreen">
            Dilida Duman | Game UX/UI Portfolio
          </p>
        </div>
      </section>

      <section className="bg-deepIndigo pb-14 pt-24 text-softWhite md:pb-20 md:pt-36 lg:pt-[156px]">
        <div className="site-container">
          <div className="mb-10 text-center md:mb-12">
            <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.24em] text-acidGreen/86">
              {projectOverviewTitle}
            </h2>
          </div>

          <div className="grid grid-cols-[3.5rem_minmax(0,1fr)_3.5rem] items-center gap-2 sm:grid-cols-[5rem_minmax(0,1fr)_5rem] lg:grid-cols-[6.5rem_minmax(0,1fr)_6.5rem]">
            <div className="justify-self-stretch">
              <ProjectGroupButton
                direction="previous"
                label={previousGroupLabel}
                disabled={!hasMultipleGroups}
                onClick={() => showProjectGroup("previous")}
              />
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={activeGroup.key}
                className="grid gap-6 md:grid-cols-2 md:gap-7 lg:grid-cols-3 xl:gap-8"
                data-featured-project-group={activeGroup.title}
                initial={{ opacity: 0, x: groupOffset }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -groupOffset }}
                transition={{ duration: prefersReducedMotion ? 0.18 : 0.34, ease: [0.22, 1, 0.36, 1] }}
                onAnimationComplete={() => setIsGroupTransitioning(false)}
                onPointerLeave={() => setActiveFeaturedIndex(null)}
              >
                {activeGroup.projects.map((project, index) => (
                  <FeaturedProjectCard
                    key={project.homeId}
                    projectId={project.homeId}
                    project={project}
                    index={index}
                    isActive={activeFeaturedIndex === index}
                    hasActive={activeFeaturedIndex !== null}
                    onActivate={() => setActiveFeaturedIndex(index)}
                    onDeactivate={() => setActiveFeaturedIndex(null)}
                  />
                ))}
              </motion.div>
            </AnimatePresence>

            <div className="justify-self-stretch">
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
