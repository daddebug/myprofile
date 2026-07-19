import { type FocusEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { useProjectCover } from "../hooks/useProjectCover";
import { useLocale } from "../locales/LocaleContext";

export type FeaturedProjectCardItem = {
  caseNumber: string;
  category: string;
  title: string;
  duration?: string;
  description: string;
  image: string;
  imageAlt: string;
  tags: string[];
  cta: string;
  displayCta?: string;
  status?: string;
  placeholderLabel?: string;
  href?: string;
  hoverStatement: string;
  layout: "image-left" | "image-right";
  disabled?: boolean;
};

type FeaturedProjectCardProps = {
  projectId: string;
  project: FeaturedProjectCardItem;
  index: number;
  isActive: boolean;
  hasActive: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
};

const idleMotions = [
  { y: [0, -2, 0], scale: [1, 1.004, 1], duration: 7.8, delay: 0 },
  { y: [0, 2, 0], scale: [1, 1.006, 1], duration: 9.2, delay: 1.1 },
  { y: [0, -3, 0], scale: [1, 1.004, 1], duration: 8.4, delay: 2.2 },
];

export function FeaturedProjectCard({
  projectId,
  project,
  index,
  isActive,
  hasActive,
  onActivate,
  onDeactivate,
}: FeaturedProjectCardProps) {
  const [failedImageSource, setFailedImageSource] = useState("");
  const { pathFor } = useLocale();
  const { image: resolvedCoverImage } = useProjectCover(projectId, project.image);
  const [isDesktopMotion, setIsDesktopMotion] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const hasImage = Boolean(resolvedCoverImage) && failedImageSource !== resolvedCoverImage;
  const disabled = Boolean(project.disabled || !project.href);
  const visibleTags = project.tags.slice(0, 2);
  const idle = idleMotions[index % idleMotions.length];
  const desktopActive = isDesktopMotion && isActive;
  const desktopHasActive = isDesktopMotion && hasActive;
  const shouldIdle = isDesktopMotion && !prefersReducedMotion && !hasActive;
  const motionState = shouldIdle
    ? { y: idle.y, scale: idle.scale, opacity: 1 }
    : desktopActive
      ? { y: -5, scale: 1.02, opacity: 1 }
      : desktopHasActive
        ? { y: 0, scale: 0.99, opacity: 0.72 }
        : { y: 0, scale: 1, opacity: 1 };
  const transition = shouldIdle
    ? { duration: idle.duration, delay: idle.delay, repeat: Infinity, ease: "easeInOut" as const }
    : { duration: 0.28, ease: "easeOut" as const };

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 768px)");
    const syncDesktopMotion = () => setIsDesktopMotion(mediaQuery.matches);

    syncDesktopMotion();
    mediaQuery.addEventListener("change", syncDesktopMotion);

    return () => mediaQuery.removeEventListener("change", syncDesktopMotion);
  }, []);

  const handleBlur = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      onDeactivate();
    }
  };

  return (
    <motion.article
      animate={motionState}
      transition={transition}
      className="group relative flex min-w-0 flex-col overflow-hidden bg-deepIndigo/84 outline outline-1 outline-softWhite/8 transition-colors duration-300 focus-within:outline-acidGreen/60 md:min-h-[500px] md:hover:outline-electricBlue/36"
      data-featured-work-card
      onPointerEnter={onActivate}
      onFocus={onActivate}
      onBlur={handleBlur}
      tabIndex={disabled ? 0 : undefined}
      aria-disabled={disabled || undefined}
    >
      {!disabled ? (
        <Link className="absolute inset-0 z-20 focus:outline-none" to={pathFor(project.href ?? "#")} aria-label={`Open ${project.title}`} />
      ) : null}

      <ProjectCover project={project} image={resolvedCoverImage} hasImage={hasImage} onImageError={() => setFailedImageSource(resolvedCoverImage)} />

      <div className="relative flex flex-1 flex-col px-5 pb-5 pt-4 md:min-h-[160px] md:px-6 md:pb-4 md:pt-4">
        <div
          className={`relative z-10 transition-[top,transform] duration-300 ease-out md:absolute md:inset-x-6 ${
            isActive ? "md:top-4 md:translate-y-0" : "md:top-1/2 md:-translate-y-1/2"
          }`}
          data-featured-work-default
        >
          <h3
            className="font-display text-[clamp(1.45rem,1.7vw,2.15rem)] font-semibold leading-[1.02] text-softWhite transition duration-300 md:max-w-[13ch]"
            data-featured-work-title
          >
            {project.title}
          </h3>

          <div className={`mt-4 flex flex-wrap gap-x-3 gap-y-2 transition duration-300 md:mt-3 ${isActive ? "md:opacity-30" : "md:opacity-100"}`}>
            {visibleTags.map((tag) => (
              <span key={tag} className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-softWhite/44" data-featured-work-tag>
                {tag}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-5 md:hidden" data-featured-work-mobile-details>
          <ProjectDetails project={project} disabled={disabled} />
        </div>

        <motion.div
          className="pointer-events-none absolute inset-x-0 bottom-0 hidden px-6 pb-4 pt-16 md:block"
          data-featured-work-details
          initial={false}
          animate={desktopActive ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          aria-hidden={!desktopActive}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-deepIndigo via-deepIndigo/88 to-deepIndigo/0" />
          <div className="relative">
            <ProjectDetails project={project} disabled={disabled} />
          </div>
        </motion.div>
      </div>
    </motion.article>
  );
}

function ProjectCover({
  project,
  image,
  hasImage,
  onImageError,
}: {
  project: FeaturedProjectCardItem;
  image: string;
  hasImage: boolean;
  onImageError: () => void;
}) {
  return (
    <div className="relative min-w-0">
      <div className="relative aspect-[16/11] overflow-hidden bg-archiveBlue/40" data-featured-work-cover>
        {image ? (
          <img
            src={image}
            alt={project.imageAlt}
            className="h-full w-full object-cover brightness-[0.72] transition-[filter,transform] duration-500 ease-out group-hover:brightness-100 group-focus-within:brightness-100 motion-reduce:transition-none md:group-hover:scale-[1.03] md:group-focus-within:scale-[1.03]"
            loading="lazy"
            onError={onImageError}
          />
        ) : null}
        <div className={`absolute inset-0 grid place-items-center ${hasImage ? "invisible" : "visible"}`} aria-hidden={hasImage}>
          {project.placeholderLabel ? (
            <span className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-softWhite/30">
              {project.placeholderLabel}
            </span>
          ) : (
            <span className="font-display text-[clamp(5.2rem,10vw,8.5rem)] font-semibold leading-none text-softWhite/18">X</span>
          )}
        </div>
        <div
          className="pointer-events-none absolute inset-0 bg-[#263f9f]/38 opacity-100 transition-opacity duration-500 ease-out group-hover:opacity-0 group-focus-within:opacity-0 motion-reduce:transition-none"
          data-featured-work-cover-tint
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

function ProjectDetails({ project, disabled }: { project: FeaturedProjectCardItem; disabled: boolean }) {
  const { messages } = useLocale();
  return (
    <>
      <p className="line-clamp-2 whitespace-pre-line text-sm leading-6 text-softWhite/68">{project.description}</p>
      {project.duration ? (
        <p className="mt-3 font-mono text-[10px] font-medium tracking-[0.08em] text-[#9FAAD2]">
          {project.duration}
        </p>
      ) : null}
      {disabled ? (
        <span className="mt-4 inline-flex font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-softWhite/44">
          {project.status ?? "Coming soon"}
        </span>
      ) : (
        <span className="mt-4 inline-flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-acidGreen">
          {project.displayCta ?? messages.project.viewProject}
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      )}
    </>
  );
}
