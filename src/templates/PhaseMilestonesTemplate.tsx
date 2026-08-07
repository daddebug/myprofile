import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  TemplateSurface,
} from "../components/template-tools/TemplateResponsiveFoundation";
import type {
  TemplateLayoutControlDefinition,
  TemplateMeta,
  TemplateProps,
} from "../lib/templateLibrary";
import { isCollectionExportCapture } from "../lib/collectionExportStaging";
import { recordTemplateFit } from "../lib/collectionMediaDiagnostics";

export const layoutControls = {
  emphasisMode: "custom",
  nodeSpacing: "standard",
  verticalSpacing: "standard",
} as const;

export const layoutControlSchema: TemplateLayoutControlDefinition[] = [
  { key: "emphasisMode", label: "Node emphasis" },
  { key: "nodeSpacing", label: "Node spacing" },
  { key: "verticalSpacing", label: "Vertical spacing" },
];

export const templateMeta: TemplateMeta = {
  id: "phase-milestones",
  nameZh: "阶段节点",
  nameEn: "Phase Milestones",
  descriptionZh: "以横向节点呈现项目阶段与重点介入位置。",
  descriptionEn:
    "A horizontal milestone sequence for project phases and intervention points.",
  schema: [
    {
      id: "heading",
      labelZh: "顶部标题",
      labelEn: "Heading",
      type: "text",
    },
    {
      id: "items",
      labelZh: "阶段节点",
      labelEn: "Milestones",
      type: "list",
      min: 3,
      max: 12,
    },
  ],
  createdAt: "2026-07-26T00:00:04.000Z",
};

type LocalizedText = { zh: string; en: string };
type MilestoneState = "outline" | "active";
type MilestoneItem = {
  id?: string;
  number?: string | LocalizedText;
  title?: string | LocalizedText;
  hoverTitle?: string | LocalizedText;
  hoverText?: string | LocalizedText;
  targetId?: string;
  state?: MilestoneState;
};

const establishedProjectTargetIds = new Set([
  "business-decision",
  "technical-direction",
  "system-scope",
  "my-entry-point",
  "function-hierarchy-optimisation",
  "production-guidelines",
  "iteration-result",
]);

const nodeGapRem = {
  compact: 1.5,
  standard: 2,
  wide: 3,
} as const;

const sectionSpacing = {
  compact: "3.5rem",
  standard: "5rem",
  wide: "6rem",
} as const;

function localizedValue(
  value: string | LocalizedText | undefined,
  locale: "zh" | "en",
) {
  if (typeof value === "string") return value.trim();
  return value?.[locale]?.trim() ?? "";
}

function isMilestoneItem(value: unknown): value is MilestoneItem {
  return Boolean(value && typeof value === "object");
}

function MilestoneNode({
  item,
  index,
  itemCount,
  locale,
  fixedWidth = false,
}: {
  item: MilestoneItem;
  index: number;
  itemCount: number;
  locale: "zh" | "en";
  fixedWidth?: boolean;
}) {
  const number = localizedValue(item.number, locale);
  const title = localizedValue(item.title, locale);
  const hoverTitle = localizedValue(item.hoverTitle, locale);
  const hoverText = localizedValue(item.hoverText, locale);
  const hasHoverContent = Boolean(hoverTitle || hoverText);
  const itemId = item.id?.trim() ?? "";
  const targetId = item.targetId?.trim()
    || (establishedProjectTargetIds.has(itemId) ? itemId : "");
  const isActive =
    String(layoutControls.emphasisMode) === "second-half"
      ? index >= Math.ceil(itemCount / 2)
      : item.state === "active";

  const content = (
    <div
      className={`relative z-10 flex min-w-0 flex-col items-center text-center ${
        fixedWidth ? "w-[190px]" : ""
      }`}
    >
      <span
        className={`grid h-[60px] w-[60px] shrink-0 place-items-center rounded-full border font-mono text-lg font-bold ${
          isActive
            ? "intervention-node-pulse border-acidGreen bg-acidGreen text-deepIndigo"
            : "border-softWhite/34 bg-[#121239] text-softWhite/50"
        }`}
      >
        {number}
      </span>
      {title || hasHoverContent ? (
        <span className="mt-4 grid h-16 w-full min-w-0 place-items-center overflow-hidden px-3 text-center">
          <span
            className={`col-start-1 row-start-1 text-xl leading-6 transition-opacity duration-200 motion-reduce:transition-none ${
              isActive
                ? "font-semibold text-softWhite/78"
                : "font-medium text-softWhite/48"
            } ${
              hasHoverContent
                ? "group-hover/timeline:opacity-0 group-focus-within/timeline:opacity-0"
                : ""
            }`}
          >
            {title}
          </span>
          {hasHoverContent ? (
            <span className="pointer-events-none col-start-1 row-start-1 flex h-full max-h-16 w-full flex-col items-center justify-center overflow-hidden text-center text-[#9FAAD2] opacity-0 transition-opacity duration-200 group-hover/timeline:opacity-100 group-focus-within/timeline:opacity-100 motion-reduce:transition-none">
              {hoverTitle ? (
                <span className="line-clamp-1 text-sm font-semibold leading-5">
                  {hoverTitle}
                </span>
              ) : null}
              {hoverText ? (
                <span
                  className={`line-clamp-2 text-xs leading-4 ${
                    hoverTitle ? "mt-0.5" : ""
                  }`}
                >
                  {hoverText}
                </span>
              ) : null}
            </span>
          ) : null}
        </span>
      ) : null}
    </div>
  );

  const scrollToTarget = (event: { preventDefault: () => void }) => {
    if (!targetId) return;
    const target = document.getElementById(targetId);
    if (!target) return;
    event.preventDefault();
    window.history.replaceState(null, "", `#${targetId}`);
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return targetId ? (
    <a
      href={`#${targetId}`}
      className="group/timeline relative z-10 block min-w-0 transition hover:brightness-125 focus-visible:outline focus-visible:outline-2 focus-visible:outline-acidGreen"
      onClick={scrollToTarget}
    >
      {content}
    </a>
  ) : (
    <span
      tabIndex={hasHoverContent ? 0 : undefined}
      className="group/timeline relative z-10 block min-w-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-acidGreen"
    >
      {content}
    </span>
  );
}

export default function PhaseMilestonesTemplate({
  content,
  locale,
  horizontalInset,
}: TemplateProps) {
  const insetStyle = { "--template-horizontal-inset": `${Math.max(0, horizontalInset ?? 0)}px` } as CSSProperties;
  const heading = localizedValue(
    content.heading as LocalizedText | undefined,
    locale,
  );
  const items = Array.isArray(content.items)
    ? content.items.filter(isMilestoneItem).slice(0, 12)
    : [];
  const isScrollable = items.length > 6;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const autoScrollFrameRef = useRef<number | null>(null);
  const autoScrollDirectionRef = useRef<-1 | 0 | 1>(0);
  const autoScrollTimeRef = useRef<number | null>(null);
  const autoScrollPositionRef = useRef(0);
  const pointerPressedRef = useRef(false);
  const reducedMotionRef = useRef(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const trackRef = useRef<HTMLDivElement | null>(null);

  // Collection export only: with more than 6 milestones the track relies on
  // the live site's horizontal-scroll affordance (isScrollable above) — a
  // one-shot PDF capture can't scroll, so nodes past the visible edge would
  // otherwise be clipped (confirmed: a real export failed with "phase-
  // milestones ... overflow=170px"). Scale only the track itself (not the
  // heading or the whole template instance) down to fit its available
  // width, exactly the same fitScale math as process-flow's own dedicated
  // fix, and disable the scroll affordance so nothing sits off-screen.
  useEffect(() => {
    if (!isCollectionExportCapture()) return;
    const viewport = scrollRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return;
    viewport.scrollLeft = 0;
    track.style.zoom = "1";
    const availableWidth = viewport.clientWidth;
    const naturalTrackWidth = track.scrollWidth;
    const fitScale = availableWidth > 0 && naturalTrackWidth > availableWidth
      ? Math.min(1, availableWidth / naturalTrackWidth)
      : 1;
    if (fitScale < 1) track.style.zoom = String(fitScale);
    const trackRect = track.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();
    const overflowAfterFit = Math.max(0, Math.round(trackRect.right - viewportRect.right));
    recordTemplateFit({
      templateInstanceId: `phase-milestones-track:${localizedValue(content.heading as LocalizedText | undefined, locale) || "untitled"}`,
      templateId: "phase-milestones",
      naturalWidth: naturalTrackWidth,
      availableWidth,
      fitScale,
      overflowAfterFit,
    });
  }, [content.heading, locale, isScrollable, items.length]);

  const gapRem =
    nodeGapRem[
      layoutControls.nodeSpacing as keyof typeof nodeGapRem
    ] ?? nodeGapRem.standard;
  const paddingBlock =
    sectionSpacing[
      layoutControls.verticalSpacing as keyof typeof sectionSpacing
    ] ?? sectionSpacing.standard;

  const updateScrollHints = useCallback(() => {
    const viewport = scrollRef.current;
    if (!viewport) return;
    if (autoScrollDirectionRef.current === 0) {
      autoScrollPositionRef.current = viewport.scrollLeft;
    }
    setCanScrollLeft(viewport.scrollLeft > 2);
    setCanScrollRight(
      viewport.scrollLeft < viewport.scrollWidth - viewport.clientWidth - 2,
    );
  }, []);

  const stopEdgeAutoScroll = useCallback(() => {
    autoScrollDirectionRef.current = 0;
    autoScrollTimeRef.current = null;
    if (autoScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = null;
    }
  }, []);

  const startEdgeAutoScroll = useCallback(
    (direction: -1 | 1) => {
      if (
        reducedMotionRef.current
        || pointerPressedRef.current
        || autoScrollDirectionRef.current === direction
      ) {
        return;
      }

      stopEdgeAutoScroll();
      autoScrollDirectionRef.current = direction;
      autoScrollPositionRef.current = scrollRef.current?.scrollLeft ?? 0;

      const step = (time: number) => {
        autoScrollFrameRef.current = null;
        const viewport = scrollRef.current;
        if (!viewport || autoScrollDirectionRef.current === 0) return;

        const elapsed =
          autoScrollTimeRef.current === null
            ? 16
            : Math.min(time - autoScrollTimeRef.current, 32);
        autoScrollTimeRef.current = time;
        const maxScrollLeft = Math.max(
          0,
          viewport.scrollWidth - viewport.clientWidth,
        );
        const nextScrollLeft = Math.min(
          maxScrollLeft,
          Math.max(
            0,
            autoScrollPositionRef.current
              + (autoScrollDirectionRef.current * 90 * elapsed) / 1000,
          ),
        );
        autoScrollPositionRef.current = nextScrollLeft;
        viewport.scrollLeft = nextScrollLeft;
        updateScrollHints();

        const reachedBoundary =
          autoScrollDirectionRef.current < 0
            ? nextScrollLeft <= 0
            : nextScrollLeft >= maxScrollLeft;
        if (reachedBoundary) {
          stopEdgeAutoScroll();
          return;
        }

        autoScrollFrameRef.current = window.requestAnimationFrame(step);
      };

      autoScrollFrameRef.current = window.requestAnimationFrame(step);
    },
    [stopEdgeAutoScroll, updateScrollHints],
  );

  const handlePointerMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (
      event.pointerType !== "mouse"
      || pointerPressedRef.current
      || reducedMotionRef.current
    ) {
      stopEdgeAutoScroll();
      return;
    }

    const viewport = scrollRef.current;
    if (!viewport) return;
    const bounds = viewport.getBoundingClientRect();
    const edgeZone = bounds.width * 0.16;
    const pointerX = event.clientX - bounds.left;

    if (pointerX <= edgeZone && canScrollLeft) {
      startEdgeAutoScroll(-1);
    } else if (pointerX >= bounds.width - edgeZone && canScrollRight) {
      startEdgeAutoScroll(1);
    } else {
      stopEdgeAutoScroll();
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const viewport = scrollRef.current;
    if (!viewport) return;
    const maxScrollLeft = viewport.scrollWidth - viewport.clientWidth;
    let nextScrollLeft: number | null = null;

    if (event.key === "ArrowLeft") {
      nextScrollLeft = viewport.scrollLeft - 222;
    } else if (event.key === "ArrowRight") {
      nextScrollLeft = viewport.scrollLeft + 222;
    } else if (event.key === "Home") {
      nextScrollLeft = 0;
    } else if (event.key === "End") {
      nextScrollLeft = maxScrollLeft;
    }

    if (nextScrollLeft === null) return;
    event.preventDefault();
    viewport.scrollTo({
      left: Math.max(0, Math.min(maxScrollLeft, nextScrollLeft)),
      behavior: reducedMotionRef.current ? "auto" : "smooth",
    });
  };

  useEffect(() => {
    if (!isScrollable) return undefined;
    const reducedMotionQuery = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    const syncReducedMotion = () => {
      reducedMotionRef.current = reducedMotionQuery.matches;
      if (reducedMotionQuery.matches) stopEdgeAutoScroll();
    };
    syncReducedMotion();
    reducedMotionQuery.addEventListener("change", syncReducedMotion);
    const frame = window.requestAnimationFrame(updateScrollHints);
    window.addEventListener("resize", updateScrollHints);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateScrollHints);
      reducedMotionQuery.removeEventListener("change", syncReducedMotion);
      stopEdgeAutoScroll();
    };
  }, [
    isScrollable,
    items.length,
    stopEdgeAutoScroll,
    updateScrollHints,
  ]);

  if (items.length < 3) {
    return (
      <TemplateSurface
        className="relative left-1/2 -translate-x-1/2"
        style={{
          width: "calc(100vw - 8px)",
          backgroundColor: "rgba(18, 18, 57, 0.78)",
        }}
      >
        <section style={{ paddingBlock }}>
          <div className="template-library-content" style={insetStyle}>
            {heading ? (
              <p className="text-center font-mono text-base font-bold uppercase tracking-[0.12em] text-acidGreen/80">
                {heading}
              </p>
            ) : null}
            <p className={heading ? "mt-8 text-center text-sm text-softWhite/46" : "text-center text-sm text-softWhite/46"}>
              {locale === "zh"
                ? "请添加至少 3 个阶段节点。"
                : "Add at least 3 milestone items."}
            </p>
          </div>
        </section>
      </TemplateSurface>
    );
  }

  const lineInset = `calc((100% - ${(items.length - 1) * gapRem}rem) / ${items.length * 2})`;

  return (
    <TemplateSurface
      className="relative left-1/2 -translate-x-1/2"
      style={{
        width: "calc(100vw - 8px)",
        backgroundColor: "rgba(18, 18, 57, 0.78)",
      }}
    >
      <section style={{ paddingBlock }}>
        <div className="template-library-content" style={insetStyle}>
          {heading ? (
            <p className="text-center font-mono text-base font-bold uppercase tracking-[0.12em] text-acidGreen/80">
              {heading}
            </p>
          ) : null}

          {isScrollable ? (
            <div className={heading ? "relative mt-10" : "relative"}>
              <div
                ref={scrollRef}
                role="region"
                aria-label={
                  locale === "zh" ? "阶段节点轨道" : "Phase milestone track"
                }
                tabIndex={0}
                className="timeline-scroll overflow-x-auto overscroll-x-contain outline-none focus-visible:ring-1 focus-visible:ring-acidGreen/50 data-[collection-export]:flex data-[collection-export]:justify-center data-[collection-export]:overflow-visible"
                data-collection-export={isCollectionExportCapture() ? "true" : undefined}
                onScroll={updateScrollHints}
                onKeyDown={handleKeyDown}
                onPointerMove={handlePointerMove}
                onPointerDown={() => {
                  pointerPressedRef.current = true;
                  stopEdgeAutoScroll();
                }}
                onPointerUp={() => {
                  pointerPressedRef.current = false;
                }}
                onPointerCancel={() => {
                  pointerPressedRef.current = false;
                }}
                onPointerLeave={() => {
                  pointerPressedRef.current = false;
                  stopEdgeAutoScroll();
                }}
              >
                <div
                  ref={trackRef}
                  className="relative grid w-max grid-flow-col auto-cols-[190px] px-3 pb-2 pt-1"
                  style={{ columnGap: `${gapRem}rem`, marginInline: isCollectionExportCapture() ? "auto" : undefined }}
                >
                  <span
                    aria-hidden="true"
                    className="absolute left-[107px] right-[107px] top-[34px] h-px bg-softWhite/18"
                  />
                  {items.map((item, index) => (
                    <MilestoneNode
                      key={item.id ?? index}
                      item={item}
                      index={index}
                      itemCount={items.length}
                      locale={locale}
                      fixedWidth
                    />
                  ))}
                </div>
              </div>
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute inset-y-0 left-0 z-20 w-12 transition-opacity motion-reduce:transition-none ${
                  canScrollLeft ? "opacity-100" : "opacity-0"
                }`}
                style={{
                  backgroundImage:
                    "linear-gradient(to right, rgba(18, 18, 57, 0.94), transparent)",
                }}
              />
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute inset-y-0 right-0 z-20 w-12 transition-opacity motion-reduce:transition-none ${
                  canScrollRight ? "opacity-100" : "opacity-0"
                }`}
                style={{
                  backgroundImage:
                    "linear-gradient(to left, rgba(18, 18, 57, 0.94), transparent)",
                }}
              />
            </div>
          ) : (
            <div className={heading ? "relative mt-10" : "relative"}>
              <span
                aria-hidden="true"
                className="absolute top-[30px] h-px bg-softWhite/18"
                style={{ left: lineInset, right: lineInset }}
              />
              <div
                className="relative grid"
                style={{
                  columnGap: `${gapRem}rem`,
                  gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
                }}
              >
                {items.map((item, index) => (
                  <MilestoneNode
                    key={item.id ?? index}
                    item={item}
                    index={index}
                    itemCount={items.length}
                    locale={locale}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </TemplateSurface>
  );
}
