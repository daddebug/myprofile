import { type FocusEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion, useInView, useReducedMotion } from "framer-motion";
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
  const cardRef = useRef<HTMLElement>(null);
  const isCardInView = useInView(cardRef, { once: false, amount: 0 });
  const hasImage = Boolean(resolvedCoverImage) && failedImageSource !== resolvedCoverImage;
  const disabled = Boolean(project.disabled || !project.href);
  const visibleTags = project.tags.slice(0, 2);
  const idle = idleMotions[index % idleMotions.length];
  const desktopActive = isDesktopMotion && isActive;
  const desktopHasActive = isDesktopMotion && hasActive;
  const shouldIdle = isDesktopMotion && !prefersReducedMotion && !hasActive && isCardInView;
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
      ref={cardRef}
      animate={motionState}
      transition={transition}
      // md:min-h reserves enough room for the tallest possible hover-active
      // state (cover + a 3-line title + a 3-line description + duration +
      // CTA, both title and description being hard-capped by line-clamp-3)
      // so no card's rendered height ever grows on hover — the carousel's
      // previous/next buttons are vertically centered against this row's
      // height, and any card growing taller pulls them down with it.
      className="group relative flex h-full min-w-0 flex-col bg-deepIndigo/84 outline outline-1 outline-softWhite/8 transition-colors duration-300 focus-within:outline-acidGreen/60 md:min-h-[520px] md:hover:outline-electricBlue/36"
      data-featured-work-card
      data-project-id={projectId}
      onPointerEnter={onActivate}
      onFocus={onActivate}
      onBlur={handleBlur}
      tabIndex={disabled ? 0 : undefined}
      aria-disabled={disabled || undefined}
    >
      {!disabled ? (
        <Link className="absolute inset-0 z-[2] focus:outline-none" to={pathFor(project.href ?? "#")} aria-label={`Open ${project.title}`} />
      ) : null}

      {/* External glow: a sibling of the card's visual/content layer, not
          nested inside it. `coverMatch` is pixel-for-pixel the same size and
          position as the sharp cover (same aspect-ratio, pinned to the
          card's top edge) — purely a positioning reference, it clips
          nothing itself. `clipFrame` is the same width as coverMatch (so
          overflow:hidden clips left/right exactly at the cover's own edges,
          no horizontal spread ever) but extends 110px above and 80px below
          it — room for blur(40px)'s falloff to fade out inside the frame
          instead of hitting a visible cutoff (asymmetric: more headroom
          above since there's open space there, less below since the title
          sits close beneath the cover). `glow` itself is inset back by
          those same 110px/80px, so it is exactly cover-sized and centered
          — it never becomes a tall box; only its blur is allowed to spill
          into the frame's built-in buffer.
          (overflow-x:hidden + overflow-y:visible on one element doesn't
          work here — browsers force the "visible" side to compute as
          "auto", which still clips; verified via computed style.) */}
      {hasImage ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-0 aspect-[16/10] md:aspect-[16/11]" aria-hidden="true" data-featured-work-glow-cover-match>
          <div className="absolute inset-x-0 -top-[110px] -bottom-[80px] overflow-hidden" data-featured-work-glow-clip-frame>
            <div
              className="absolute inset-x-0 top-[110px] bottom-[80px] opacity-0 blur-[40px] saturate-[1.3] brightness-[1.5] transition-opacity duration-[240ms] ease-out group-hover:opacity-80 group-focus-within:opacity-80 motion-reduce:transition-none"
              style={{
                backgroundImage: `url(${resolvedCoverImage})`,
                backgroundPosition: "center",
                backgroundSize: "cover",
              }}
              data-featured-work-glow
            />
          </div>
        </div>
      ) : null}

      <div className="relative z-[1] flex h-full flex-col">
        <ProjectCover
          project={project}
          image={resolvedCoverImage}
          hasImage={hasImage}
          tags={visibleTags}
          onImageError={() => setFailedImageSource(resolvedCoverImage)}
        />

        <div className="flex flex-col px-4 pb-4 pt-3.5 md:min-h-[160px] md:flex-1 md:px-6 md:pb-4 md:pt-4">
          <h3
            className="line-clamp-3 font-display text-[clamp(1.35rem,5.8vw,1.7rem)] font-semibold leading-[1.08] text-softWhite md:text-[clamp(1.45rem,1.7vw,2.15rem)] md:leading-[1.02]"
            data-featured-work-title
          >
            {project.title}
          </h3>

          <AnimatePresence initial={false}>
            {desktopActive ? (
              <motion.div
                key="details"
                className="overflow-hidden"
                data-featured-work-details
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.28, ease: "easeOut" }}
              >
                <div className="pt-3">
                  <ProjectDetails project={project} disabled={disabled} />
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </motion.article>
  );
}

function ProjectCover({
  project,
  image,
  hasImage,
  tags,
  onImageError,
}: {
  project: FeaturedProjectCardItem;
  image: string;
  hasImage: boolean;
  tags: string[];
  onImageError: () => void;
}) {
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setIsImageLoaded(false);
  }, [image]);

  useEffect(() => {
    if (imgRef.current?.complete) {
      setIsImageLoaded(true);
    }
  });

  const isLoading = hasImage && !isImageLoaded;

  return (
    <div className="relative min-w-0">
      <div
        className={`relative aspect-[16/10] overflow-hidden bg-archiveBlue/40 md:aspect-[16/11] ${isLoading ? "animate-pulse" : ""}`}
        data-featured-work-cover
      >
        {hasImage ? (
          <img
            ref={imgRef}
            src={image}
            alt={project.imageAlt}
            className={`h-full w-full object-cover transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none md:group-hover:scale-[1.03] md:group-focus-within:scale-[1.03] ${isImageLoaded ? "opacity-100" : "opacity-0"}`}
            loading="lazy"
            decoding="async"
            onLoad={() => setIsImageLoaded(true)}
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
        {tags.length ? (
          <div
            className="pointer-events-none absolute inset-x-3 bottom-3 z-[2] flex flex-wrap gap-1.5 opacity-0 transition-opacity duration-200 ease-out group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none"
            data-featured-work-tags
          >
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-[5px] border border-acidGreen/20 bg-deepIndigo/78 px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-softWhite/85 backdrop-blur-[2px]"
                data-featured-work-tag
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ProjectDetails({ project, disabled }: { project: FeaturedProjectCardItem; disabled: boolean }) {
  const { messages } = useLocale();
  return (
    <>
      <p className="line-clamp-3 whitespace-pre-line text-sm leading-6 text-softWhite/68">{project.description}</p>
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
