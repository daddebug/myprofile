import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowDown, ArrowLeft, ArrowRight, X } from "lucide-react";
import {
  TemplateContent,
  TemplateSurface,
} from "../components/template-tools/TemplateResponsiveFoundation";
import type {
  TemplateLayoutControlDefinition,
  TemplateMeta,
  TemplateProps,
} from "../lib/templateLibrary";
import type { NormalizedXMindBranch, NormalizedXMindDocument } from "../lib/xmindImport";

export const layoutControls = {
  displayMode: "double",
} as const;

export const layoutControlSchema: TemplateLayoutControlDefinition[] = [
  {
    key: "displayMode",
    label: "Display mode",
    type: "select",
    options: [
      { label: "Single", value: "single" },
      { label: "Double", value: "double" },
    ],
  },
];

export const templateMeta: TemplateMeta = {
  id: "xmind-breakdown",
  nameZh: "XMind / 系统拆解",
  nameEn: "XMind / System Breakdown",
  descriptionZh: "复用现有案例中的系统分支与双竞品拆解展示。",
  descriptionEn:
    "Reuses the established system-branch and paired-reference breakdown layouts.",
  schema: [
    {
      id: "sectionTitle",
      labelZh: "章节标题",
      labelEn: "Section title",
      type: "text",
    },
    {
      id: "documentOne",
      labelZh: "第一个 XMind",
      labelEn: "First XMind",
      type: "xmind",
    },
    {
      id: "documentTwo",
      labelZh: "第二个 XMind",
      labelEn: "Second XMind",
      type: "xmind",
    },
    {
      id: "referenceOneTitle",
      labelZh: "参照一标题",
      labelEn: "Reference one title",
      type: "text",
    },
    {
      id: "referenceOneCategory",
      labelZh: "参照一分类与状态",
      labelEn: "Reference one category and status",
      type: "text",
    },
    {
      id: "referenceOneSummary",
      labelZh: "参照一总结",
      labelEn: "Reference one summary",
      type: "richtext",
    },
    {
      id: "referenceOneFocus",
      labelZh: "参照一分析重点",
      labelEn: "Reference one focus",
      type: "richtext",
    },
    {
      id: "referenceTwoTitle",
      labelZh: "参照二标题",
      labelEn: "Reference two title",
      type: "text",
    },
    {
      id: "referenceTwoCategory",
      labelZh: "参照二分类与状态",
      labelEn: "Reference two category and status",
      type: "text",
    },
    {
      id: "referenceTwoSummary",
      labelZh: "参照二总结",
      labelEn: "Reference two summary",
      type: "richtext",
    },
    {
      id: "referenceTwoFocus",
      labelZh: "参照二分析重点",
      labelEn: "Reference two focus",
      type: "richtext",
    },
  ],
  createdAt: "2026-07-26T00:00:02.000Z",
};

// Single mode's compact 3-column detail-row grid needs far more usable
// width than double mode's paired reference cards ever did. The shared
// per-template default (see templateLayoutDefaults.ts) was tuned for
// double mode's cards, so single mode caps how much of it applies to
// itself here rather than lowering the shared default (which would also
// narrow double mode).
const SINGLE_MODE_HORIZONTAL_INSET_CAP = 40;

type LocalizedText = { zh: string; en: string };

function localizedValue(
  content: TemplateProps["content"],
  key: string,
  locale: TemplateProps["locale"],
) {
  return (content[key] as LocalizedText | undefined)?.[locale]?.trim() ?? "";
}

function documentValue(
  content: TemplateProps["content"],
  key: string,
) {
  const value = content[key] as NormalizedXMindDocument | undefined;
  return value?.branches?.length ? value : undefined;
}

function SingleBreakdown({
  document,
  locale,
  stableDialogLayout = false,
}: {
  document: NormalizedXMindDocument;
  locale: TemplateProps["locale"];
  stableDialogLayout?: boolean;
}) {
  const shouldReduceMotion = useReducedMotion();
  const [selectedBranchId, setSelectedBranchId] = useState(
    () => document.branches[0]?.id ?? "",
  );
  const selectedBranch = useMemo(
    () =>
      document.branches.find((branch) => branch.id === selectedBranchId)
      ?? document.branches[0],
    [document.branches, selectedBranchId],
  );

  useEffect(() => {
    if (
      !document.branches.some((branch) => branch.id === selectedBranchId)
    ) {
      setSelectedBranchId(document.branches[0]?.id ?? "");
    }
  }, [document.branches, selectedBranchId]);

  return (
    <section className={`overflow-hidden rounded-[22px] border border-[rgba(85,145,255,0.62)] bg-[rgba(43,67,156,0.28)] shadow-[0_0_0_1px_rgba(80,135,255,0.16),0_0_28px_rgba(55,115,255,0.28),inset_0_0_32px_rgba(60,100,230,0.08)] backdrop-blur-lg ${stableDialogLayout ? "md:flex md:min-h-0 md:flex-1 md:flex-col" : ""}`}>
      <div className="border-b border-[rgba(145,178,255,0.18)] px-5 py-5 md:px-7 md:py-6">
        <span
          className="mb-3 block h-[3px] w-9 rounded-full bg-acidGreen/80"
          aria-hidden="true"
        />
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-acidGreen/72">
            {locale === "zh" ? "系统分支" : "System branches"}
          </p>
          <p className="font-mono text-[10px] tracking-[0.1em] text-white/[0.58]">
            {locale === "zh"
              ? `共 ${document.branches.length} 个分支`
              : `${document.branches.length} branches`}
          </p>
        </div>
        <div
          className="mt-4 flex flex-wrap gap-2.5"
          role="tablist"
          aria-label={document.centerTopic}
        >
          {document.branches.map((branch) => {
            const selected = branch.id === selectedBranch?.id;
            return (
              <button
                key={branch.id}
                type="button"
                role="tab"
                aria-selected={selected}
                className={`rounded-full px-4 py-2 text-sm font-semibold leading-5 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-acidGreen ${
                  selected
                    ? "bg-acidGreen text-deepIndigo shadow-[0_8px_24px_rgba(198,255,66,0.16)]"
                    : "bg-archiveBlue/38 text-softWhite/58 hover:bg-archiveBlue/68 hover:text-softWhite"
                }`}
                onClick={() => setSelectedBranchId(branch.id)}
              >
                {branch.title}
              </button>
            );
          })}
        </div>
      </div>

      {selectedBranch ? (
        <div className={`rounded-b-[20px] border-t border-[rgba(125,165,255,0.22)] bg-[rgba(25,42,112,0.32)] px-5 py-7 md:px-7 md:py-9 ${stableDialogLayout ? "md:min-h-0 md:flex-1" : ""}`}>
          <div className={`grid min-w-0 items-center gap-5 lg:grid-cols-[minmax(9rem,0.2fr)_2rem_minmax(0,0.8fr)] lg:gap-7 ${stableDialogLayout ? "md:h-full md:min-h-0" : ""}`}>
            <div className="w-full max-w-[13rem] justify-self-center rounded-[12px] border border-[rgba(76,166,255,0.68)] bg-[rgba(39,82,156,0.36)] px-4 py-5 text-center shadow-[0_0_18px_rgba(52,145,255,0.24),inset_0_0_18px_rgba(60,130,255,0.08)]">
              <p className="font-display text-base font-semibold leading-snug text-acidGreen md:text-lg">
                {selectedBranch.title}
              </p>
            </div>
            <ArrowRight
              className="mx-auto !hidden h-5 w-5 text-[#9FAAD2]/55 lg:!block"
              aria-hidden="true"
            />
            <ArrowDown
              className="mx-auto !block h-5 w-5 text-[#9FAAD2]/55 lg:!hidden"
              aria-hidden="true"
            />

            <div className={`min-w-0 ${stableDialogLayout ? "md:h-full md:min-h-0" : ""}`}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={selectedBranch.id}
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={
                    shouldReduceMotion
                      ? { opacity: 0 }
                      : { opacity: 0, y: -6 }
                  }
                  transition={{
                    duration: shouldReduceMotion ? 0 : 0.2,
                    ease: "easeOut",
                  }}
                  className={`divide-y divide-[rgba(145,178,255,0.18)] border-y border-[rgba(145,178,255,0.18)] ${stableDialogLayout ? "md:h-full md:overflow-y-auto md:pr-2" : ""}`}
                >
                  {selectedBranch.groups.map((group, groupIndex) => (
                    <div
                      key={group.id}
                      className="grid min-w-0 gap-3 py-5 md:grid-cols-[2rem_minmax(11rem,0.68fr)_minmax(0,1.32fr)] md:gap-5"
                    >
                      <span className="font-mono text-[10px] leading-6 text-white/[0.58]">
                        {String(groupIndex + 1).padStart(2, "0")}
                      </span>
                      {group.title ? (
                        <h4 className="font-display text-base font-semibold leading-6 text-softWhite/88">
                          {group.title}
                        </h4>
                      ) : null}
                      {group.items.length ? (
                        <ul className="grid min-w-0 gap-2">
                          {group.items.map((item, itemIndex) => (
                            <li
                              key={`${group.id}-${itemIndex}`}
                              className="relative pl-4 text-sm leading-6 text-white/[0.78] before:absolute before:left-0 before:top-[0.68rem] before:h-1 before:w-1 before:rounded-full before:bg-acidGreen/68"
                            >
                              {item}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ))}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

// Single mode's content area: a real single-XMind mind map (root branch ->
// its groups -> their items), not a table/column layout. Deliberately local
// to single mode -- double mode's modal (SingleBreakdown, below) keeps its
// own existing detail-row layout untouched.
type MindMapRect = { x: number; y: number; width: number; height: number };

// Node positions come from real flexbox layout (see MindMapBreakdown), not
// hardcoded coordinates, so connector lines are measured off the actual
// rendered DOM after every layout-affecting change rather than assumed.
function useMindMapNodeRects(canvasRef: RefObject<HTMLDivElement | null>, layoutKey: string) {
  const [rects, setRects] = useState<Map<string, MindMapRect>>(new Map());

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const measure = () => {
      const canvasRect = canvas.getBoundingClientRect();
      const next = new Map<string, MindMapRect>();
      canvas.querySelectorAll<HTMLElement>("[data-mindmap-node]").forEach((el) => {
        const key = el.dataset.mindmapNode;
        if (!key) return;
        const rect = el.getBoundingClientRect();
        next.set(key, {
          x: rect.left - canvasRect.left,
          y: rect.top - canvasRect.top,
          width: rect.width,
          height: rect.height,
        });
      });
      setRects(next);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [canvasRef, layoutKey]);

  return rects;
}

// Plain mouse-drag horizontal scroll for the canvas -- native touch/trackpad
// scrolling on the overflow-x-auto viewport already works on its own and is
// left alone; this only adds click-and-drag for mouse users.
function useMindMapDragScroll(viewportRef: RefObject<HTMLDivElement | null>) {
  const dragState = useRef({ dragging: false, startX: 0, startScrollLeft: 0 });

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse") return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    dragState.current = { dragging: true, startX: event.clientX, startScrollLeft: viewport.scrollLeft };
    viewport.setPointerCapture(event.pointerId);
  }, [viewportRef]);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    if (!viewport || !dragState.current.dragging) return;
    viewport.scrollLeft = dragState.current.startScrollLeft - (event.clientX - dragState.current.startX);
  }, [viewportRef]);

  const endDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragState.current.dragging) return;
    dragState.current.dragging = false;
    viewportRef.current?.releasePointerCapture(event.pointerId);
  }, [viewportRef]);

  return { onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerLeave: endDrag };
}

function mindMapConnectorPath(from: MindMapRect, to: MindMapRect) {
  const x1 = from.x + from.width;
  const y1 = from.y + from.height / 2;
  const x2 = to.x;
  const y2 = to.y + to.height / 2;
  const bend = Math.max(24, (x2 - x1) / 2);
  return `M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}`;
}

function MindMapNode({
  dataKey,
  kind,
  emphasized,
  dimmed,
  onMouseEnter,
  onMouseLeave,
  children,
}: {
  dataKey: string;
  kind: "root" | "branch" | "leaf";
  emphasized?: boolean;
  dimmed?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  children: ReactNode;
}) {
  // Width lives per-kind (not a shared cap) so root/branch/leaf can each
  // occupy their own real share of the full-width canvas below -- this is
  // what lets the tree span the whole content area instead of huddling at
  // its shrink-to-fit content width on the left.
  const shapeClass = kind === "leaf"
    ? "w-full min-w-[200px] max-w-[260px] md:min-w-[240px] md:max-w-[320px] rounded-2xl px-4 py-2.5 text-left text-[13px] font-medium leading-5"
    : kind === "branch"
      ? "min-w-[140px] max-w-[180px] rounded-full px-5 py-3 text-center text-sm font-semibold md:text-[15px]"
      : "min-w-[140px] max-w-[200px] rounded-full px-6 py-3.5 text-center text-base font-semibold md:py-4 md:text-lg";
  // Same translucent-blue-on-dark language as the rest of the page (see
  // ReferenceCard's bg-[rgba(35,58,140,...)] below) instead of opaque white
  // cards -- nodes should read as part of the page's own gradient, not
  // components pasted on top of it. Lime stays reserved for root (the
  // section's own anchor point) and interaction feedback (emphasized/hover),
  // never a default state on every node.
  // Root also lights up (not just branch/leaf) whenever any branch is the
  // active chain -- see MindMapBreakdown, which passes emphasized={true} on
  // root for as long as any group is hovered, so the whole root->branch->leaf
  // path reads as one connected chain instead of just the one hovered node.
  const toneClass = kind === "root"
    ? `border ${emphasized ? "border-acidGreen/70 bg-[rgba(46,64,150,0.56)] shadow-[0_0_22px_rgba(52,240,37,0.22)]" : "border-acidGreen/40 bg-[rgba(46,64,150,0.42)] shadow-[0_0_16px_rgba(52,240,37,0.12)]"} text-softWhite`
    : kind === "branch"
      ? `border bg-[rgba(41,58,138,0.38)] text-softWhite/92 ${emphasized ? "border-acidGreen/70 bg-[rgba(41,58,138,0.52)] shadow-[0_0_14px_rgba(52,240,37,0.14)]" : "border-[rgba(148,168,255,0.16)]"}`
      : `border bg-[rgba(58,78,168,0.26)] text-softWhite/78 ${emphasized ? "border-acidGreen/60 bg-[rgba(58,78,168,0.38)]" : "border-[rgba(148,168,255,0.12)]"}`;
  return (
    <div
      data-mindmap-node={dataKey}
      className={`relative z-10 shrink-0 transition-all duration-200 ${shapeClass} ${toneClass} ${dimmed ? "opacity-45" : ""}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </div>
  );
}

// Root / branch / leaf sit in three fixed-percentage grid columns spanning
// the FULL canvas width (20% / 35% / 45%, each content-centered) so the
// tree's horizontal position tracks real viewport width instead of the
// nodes' own shrink-to-fit content size -- that percentage split is what
// puts root, branch, and leaf centers at roughly 10%, 37.5%, and 77.5% of
// the content width. Horizontal scroll only ever appears if a node's own
// min-width genuinely can't fit its column at a given viewport (min-w-0 on
// each cell prevents CSS grid's default content-blowout from forcing
// scroll on its own).
function MindMapBreakdown({ branch }: { branch: NormalizedXMindBranch }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [hoveredGroupId, setHoveredGroupId] = useState<string | null>(null);
  const rects = useMindMapNodeRects(canvasRef, branch.id);
  const dragHandlers = useMindMapDragScroll(viewportRef);

  useEffect(() => {
    if (viewportRef.current) viewportRef.current.scrollLeft = 0;
  }, [branch.id]);

  return (
    <div
      ref={viewportRef}
      className="cursor-grab overflow-x-auto active:cursor-grabbing"
      {...dragHandlers}
    >
      <div
        ref={canvasRef}
        className="relative grid w-full grid-cols-[20%_35%_45%] items-stretch gap-y-8 py-6 md:gap-y-10 md:py-8"
        style={{ gridTemplateRows: `repeat(${branch.groups.length}, minmax(0, auto))` }}
      >
        <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
          {branch.groups.map((group) => {
            const from = rects.get("root");
            const to = rects.get(`branch:${group.id}`);
            if (!from || !to) return null;
            // Three tiers, not two: this group's own connector (active, lime),
            // some OTHER group's connector while one is active (dimmed further
            // so the active chain reads as clearly singled out), and the
            // resting state when nothing is hovered at all.
            const active = hoveredGroupId === group.id;
            const recede = hoveredGroupId !== null && !active;
            return (
              <path
                key={`root-${group.id}`}
                d={mindMapConnectorPath(from, to)}
                fill="none"
                stroke={active ? "rgba(52,240,37,0.65)" : recede ? "rgba(159,170,210,0.14)" : "rgba(159,170,210,0.42)"}
                strokeWidth={active ? 1.5 : 1}
                strokeDasharray={active ? undefined : "1.5 5"}
                strokeLinecap="round"
              />
            );
          })}
          {branch.groups.flatMap((group) =>
            group.items.map((_, itemIndex) => {
              const from = rects.get(`branch:${group.id}`);
              const to = rects.get(`leaf:${group.id}:${itemIndex}`);
              if (!from || !to) return null;
              const active = hoveredGroupId === group.id;
              const recede = hoveredGroupId !== null && !active;
              return (
                <path
                  key={`branch-${group.id}-${itemIndex}`}
                  d={mindMapConnectorPath(from, to)}
                  fill="none"
                  stroke={active ? "rgba(52,240,37,0.65)" : recede ? "rgba(159,170,210,0.1)" : "rgba(159,170,210,0.32)"}
                  strokeWidth={active ? 1.5 : 1}
                  strokeDasharray={active ? undefined : "1.5 5"}
                  strokeLinecap="round"
                />
              );
            }),
          )}
        </svg>

        <div className="col-start-1 row-span-full flex min-w-0 items-center justify-center px-2">
          {/* Root lights up with the rest of the chain for as long as any
              branch is hovered -- it's the one node every chain shares, so it
              never dims even when a specific branch is active. */}
          <MindMapNode dataKey="root" kind="root" emphasized={hoveredGroupId !== null}>
            {branch.title}
          </MindMapNode>
        </div>

        {branch.groups.map((group, rowIndex) => {
          const active = hoveredGroupId === group.id;
          const recede = hoveredGroupId !== null && !active;
          return (
          <Fragment key={group.id}>
            <div
              className="col-start-2 flex min-w-0 items-center justify-center px-2"
              style={{ gridRow: rowIndex + 1 }}
            >
              <MindMapNode
                dataKey={`branch:${group.id}`}
                kind="branch"
                emphasized={active}
                dimmed={recede}
                onMouseEnter={() => setHoveredGroupId(group.id)}
                onMouseLeave={() => setHoveredGroupId(null)}
              >
                {group.title}
              </MindMapNode>
            </div>
            {group.items.length ? (
              <div
                className="col-start-3 flex min-w-0 flex-col items-center justify-center gap-y-3 px-2"
                style={{ gridRow: rowIndex + 1 }}
              >
                {group.items.map((item, itemIndex) => (
                  <MindMapNode
                    key={`${group.id}-${itemIndex}`}
                    dataKey={`leaf:${group.id}:${itemIndex}`}
                    kind="leaf"
                    emphasized={active}
                    dimmed={recede}
                    onMouseEnter={() => setHoveredGroupId(group.id)}
                    onMouseLeave={() => setHoveredGroupId(null)}
                  >
                    {item}
                  </MindMapNode>
                ))}
              </div>
            ) : null}
          </Fragment>
          );
        })}
      </div>
    </div>
  );
}

// Mirrors MindMapBreakdown's grid geometry exactly (same columns/row
// template/gaps) but with no connectors, hover state, or scroll wrapper --
// it exists purely so every tab's natural content height can be measured at
// once. SingleXMindBreakdown takes the tallest of these as a fixed minimum
// height for every tab, so switching tabs never changes this section's own
// height (and never moves anything below it). Kept in sync by hand with
// MindMapBreakdown's own grid classes since the two must always agree on
// geometry for the measurement to mean anything.
function MindMapHeightProbe({
  branch,
  onMeasured,
}: {
  branch: NormalizedXMindBranch;
  onMeasured: (branchId: string, height: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => onMeasured(branch.id, el.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [branch, onMeasured]);

  return (
    <div
      ref={ref}
      className="invisible absolute inset-x-0 top-0 grid w-full grid-cols-[20%_35%_45%] items-stretch gap-y-8 py-6 md:gap-y-10 md:py-8"
      style={{ gridTemplateRows: `repeat(${branch.groups.length}, minmax(0, auto))` }}
    >
      <div className="col-start-1 row-span-full flex min-w-0 items-center justify-center px-2">
        <MindMapNode dataKey={`__probe_root_${branch.id}`} kind="root">
          {branch.title}
        </MindMapNode>
      </div>
      {branch.groups.map((group, rowIndex) => (
        <Fragment key={group.id}>
          <div
            className="col-start-2 flex min-w-0 items-center justify-center px-2"
            style={{ gridRow: rowIndex + 1 }}
          >
            <MindMapNode dataKey={`__probe_branch_${group.id}`} kind="branch">
              {group.title}
            </MindMapNode>
          </div>
          {group.items.length ? (
            <div
              className="col-start-3 flex min-w-0 flex-col items-center justify-center gap-y-3 px-2"
              style={{ gridRow: rowIndex + 1 }}
            >
              {group.items.map((item, itemIndex) => (
                <MindMapNode
                  key={`${group.id}-${itemIndex}`}
                  dataKey={`__probe_leaf_${group.id}_${itemIndex}`}
                  kind="leaf"
                >
                  {item}
                </MindMapNode>
              ))}
            </div>
          ) : null}
        </Fragment>
      ))}
    </div>
  );
}

// Single mode's own renderer -- deliberately not shared with SingleBreakdown
// (which stays exactly as-is for double mode's detail modal). Single mode
// must not inherit double mode's decorative bar, branch-count label, or
// card/modal-oriented spacing; it mirrors the original direct-view layout
// (see XMindBranchViewer.tsx) instead, with its own compact padding.
function SingleXMindBreakdown({
  document,
  locale,
}: {
  document: NormalizedXMindDocument;
  locale: TemplateProps["locale"];
}) {
  const shouldReduceMotion = useReducedMotion();
  const [selectedBranchId, setSelectedBranchId] = useState(
    () => document.branches[0]?.id ?? "",
  );
  const selectedBranch = useMemo(
    () =>
      document.branches.find((branch) => branch.id === selectedBranchId)
      ?? document.branches[0],
    [document.branches, selectedBranchId],
  );

  // Fixed minimum height for the content area, taken from whichever tab's
  // mind map is tallest (measured via the hidden probes below), so switching
  // tabs never changes this section's own height or shifts anything below
  // it. Recomputed from the full set of probe heights on every measurement
  // (not just ratcheted up) so it also tracks back down correctly if the
  // viewport gets narrower and reflows every tab's content shorter.
  const [stableHeight, setStableHeight] = useState<number | null>(null);
  const probeHeightsRef = useRef<Map<string, number>>(new Map());
  const handleProbeMeasured = useCallback((branchId: string, height: number) => {
    probeHeightsRef.current.set(branchId, height);
    const max = Math.max(...probeHeightsRef.current.values());
    setStableHeight((prev) => (prev === null || Math.abs(prev - max) > 0.5 ? max : prev));
  }, []);

  useEffect(() => {
    if (
      !document.branches.some((branch) => branch.id === selectedBranchId)
    ) {
      setSelectedBranchId(document.branches[0]?.id ?? "");
    }
  }, [document.branches, selectedBranchId]);

  // One-time "these are switchable" affordance: steps a brief highlight
  // through the tabs left-to-right the first time this row scrolls into
  // view, then never again (introPlayedRef guards a second viewport-enter,
  // e.g. from scrolling away and back). Purely a transient visual cue --
  // doesn't touch selection state.
  const [introIndex, setIntroIndex] = useState(-1);
  const introPlayedRef = useRef(false);
  const introTimeoutsRef = useRef<number[]>([]);
  useEffect(() => () => {
    introTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
  }, []);
  const playIntroOnce = useCallback(() => {
    if (introPlayedRef.current || shouldReduceMotion) return;
    introPlayedRef.current = true;
    const stepMs = 380;
    document.branches.forEach((_, i) => {
      introTimeoutsRef.current.push(
        window.setTimeout(() => setIntroIndex(i), i * stepMs),
      );
    });
    introTimeoutsRef.current.push(
      window.setTimeout(() => setIntroIndex(-1), document.branches.length * stepMs + 250),
    );
  }, [document.branches, shouldReduceMotion]);

  return (
    <section>
      <div className="pt-2 text-center">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-acidGreen/72">
          {locale === "zh" ? "系统分支" : "System branches"}
        </p>
        <motion.div
          className="mx-auto mt-6 flex w-full max-w-[34rem] flex-wrap items-center justify-center gap-x-3 gap-y-3 md:justify-between"
          role="tablist"
          aria-label={document.centerTopic}
          viewport={{ once: true, amount: 0.4 }}
          onViewportEnter={playIntroOnce}
        >
          {document.branches.map((branch, index) => {
            const selected = branch.id === selectedBranch?.id;
            return (
              <button
                key={branch.id}
                type="button"
                role="tab"
                aria-selected={selected}
                className={`relative rounded-full px-6 py-2.5 text-base font-semibold leading-6 transition-all duration-300 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-acidGreen ${
                  selected
                    ? "text-deepIndigo"
                    // The thin lime ring on hover previews "this can become
                    // active" without actually switching anything -- the real
                    // switch (pill + mind-map content) only commits on click.
                    : "bg-[rgba(41,58,138,0.4)] text-softWhite/62 ring-1 ring-transparent hover:-translate-y-px hover:bg-[rgba(41,58,138,0.68)] hover:text-softWhite hover:ring-acidGreen/35"
                } ${introIndex === index ? "-translate-y-[2px] shadow-[0_0_0_1px_rgba(244,245,250,0.28)]" : ""}`}
                onClick={() => setSelectedBranchId(branch.id)}
              >
                {selected ? (
                  <motion.span
                    layoutId={`xmind-tab-pill-${document.fileName}`}
                    className="absolute inset-0 rounded-full bg-acidGreen"
                    transition={shouldReduceMotion ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 32 }}
                  >
                    {/* Breathing lives on this separate, non-layoutId glow
                        layer (pure opacity pulse -- a value motion tweens
                        smoothly) rather than on the pill itself, so it never
                        fights the pill's own position/size FLIP transition
                        when the active tab changes. Kept faint -- a hint, not
                        a flash. */}
                    {!shouldReduceMotion ? (
                      <motion.span
                        className="absolute -inset-1.5 rounded-full bg-acidGreen blur-md"
                        animate={{ opacity: [0.14, 0.32, 0.14] }}
                        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                        aria-hidden="true"
                      />
                    ) : null}
                    <span className="absolute inset-0 rounded-full shadow-[0_8px_24px_rgba(198,255,66,0.16)]" />
                  </motion.span>
                ) : null}
                <span className="relative">{branch.title}</span>
              </button>
            );
          })}
        </motion.div>
      </div>

      {/* Hidden measurement pass: every tab's natural height, all at once,
          feeding stableHeight above. Zero footprint in normal layout (each
          probe is absolutely positioned) and invisible. */}
      <div className="relative" aria-hidden="true">
        {document.branches.map((branchOption) => (
          <MindMapHeightProbe
            key={branchOption.id}
            branch={branchOption}
            onMeasured={handleProbeMeasured}
          />
        ))}
      </div>

      {selectedBranch ? (
        <div
          className="mt-4 flex items-center justify-center pb-2"
          style={{ minHeight: stableHeight !== null ? `${stableHeight}px` : undefined }}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={selectedBranch.id}
              className="w-full"
              initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={
                shouldReduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, y: -6 }
              }
              transition={{
                duration: shouldReduceMotion ? 0 : 0.2,
                ease: "easeOut",
              }}
            >
              <MindMapBreakdown branch={selectedBranch} />
            </motion.div>
          </AnimatePresence>
        </div>
      ) : null}
    </section>
  );
}

function ReferenceCard({
  index,
  title,
  category,
  summary,
  focus,
  locale,
  onOpen,
}: {
  index: number;
  title: string;
  category: string;
  summary: string;
  focus: string;
  locale: TemplateProps["locale"];
  onOpen: () => void;
}) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.button
      type="button"
      className="group relative flex min-h-[15rem] min-w-0 flex-col overflow-hidden rounded-[18px] border border-[rgba(145,178,255,0.18)] bg-[rgba(35,58,140,0.34)] p-5 text-left shadow-[0_14px_34px_rgba(3,5,26,0.24),inset_0_1px_0_rgba(244,245,250,0.08)] ring-1 ring-inset ring-softWhite/5 transition-colors hover:bg-[rgba(35,58,140,0.46)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-acidGreen md:p-6"
      onClick={onOpen}
      whileHover={shouldReduceMotion ? undefined : { y: -6, scale: 1.015 }}
      whileTap={shouldReduceMotion ? undefined : { scale: 0.99 }}
      transition={{
        duration: shouldReduceMotion ? 0 : 0.22,
        ease: "easeOut",
      }}
    >
      <div className="flex items-center gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] border border-acidGreen/40 bg-acidGreen/10 font-mono text-xs font-bold text-acidGreen">
          {String(index + 1).padStart(2, "0")}
        </span>
        <p className="font-mono text-xs font-bold tracking-[0.1em] text-white/[0.58]">
          {locale === "zh" ? "拆解入口" : "BREAKDOWN ENTRY"}
        </p>
      </div>
      {title ? (
        <h3 className="mt-4 break-words font-display text-[clamp(1.45rem,2.2vw,1.85rem)] leading-tight text-softWhite">
          {title}
        </h3>
      ) : null}
      {category || summary ? (
        <div className="mt-4 border-l-2 border-acidGreen/20 pl-3">
          <p className="font-mono text-xs tracking-[0.08em] text-white/[0.58]">
            {locale === "zh" ? "参考定位" : "REFERENCE POSITIONING"}
          </p>
          {category ? (
            <p className="mt-1 text-sm font-semibold leading-5 text-softWhite/70">
              {category}
            </p>
          ) : null}
          {summary ? (
            <p className={`${category ? "mt-2" : "mt-1"} text-sm leading-5 text-white/[0.78]`}>
              {summary}
            </p>
          ) : null}
        </div>
      ) : null}
      {focus ? (
        <div className="mt-3 border-l-2 border-acidGreen/20 pl-3">
          <p className="font-mono text-xs tracking-[0.08em] text-white/[0.58]">
            {locale === "zh" ? "拆解关注点" : "BREAKDOWN FOCUS"}
          </p>
          <p className="mt-1 text-sm leading-5 text-white/[0.78]">{focus}</p>
        </div>
      ) : null}
      <span className="mt-auto inline-flex w-fit items-center gap-2 self-end rounded-full border border-acidGreen/50 bg-acidGreen/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.06em] text-acidGreen transition-colors group-hover:border-acidGreen group-hover:bg-acidGreen group-hover:text-deepIndigo">
        {locale === "zh" ? "查看拆解" : "View breakdown"}
        <span
          className="transition-transform group-hover:translate-x-1"
          aria-hidden="true"
        >
          →
        </span>
      </span>
    </motion.button>
  );
}

export default function XMindBreakdownTemplate({
  content,
  locale,
  horizontalInset = 0,
}: TemplateProps) {
  const shouldReduceMotion = useReducedMotion();
  const sectionTitle = localizedValue(content, "sectionTitle", locale);
  const documentOne = documentValue(content, "documentOne");
  const documentTwo = documentValue(content, "documentTwo");
  // Per-instance mode: an explicit content.displayMode always wins (this is
  // the key layoutControlSchema already advertises). Instances authored
  // before this field existed have no such value, so they fall back to the
  // one unambiguous structural fact about them — whether a second, real
  // XMind document was ever attached — rather than to the old file-wide
  // `layoutControls.displayMode` constant, which forced every instance into
  // whatever mode the template file happened to be built with.
  const explicitDisplayMode =
    content.displayMode === "single" || content.displayMode === "double"
      ? content.displayMode
      : undefined;
  const displayMode: "single" | "double" =
    explicitDisplayMode ?? (documentTwo ? "double" : "single");
  const [openDocument, setOpenDocument] =
    useState<NormalizedXMindDocument | null>(null);

  const references = [
    documentOne
      ? {
          document: documentOne,
          title: localizedValue(content, "referenceOneTitle", locale),
          category: localizedValue(content, "referenceOneCategory", locale),
          summary: localizedValue(content, "referenceOneSummary", locale),
          focus: localizedValue(content, "referenceOneFocus", locale),
        }
      : null,
    documentTwo
      ? {
          document: documentTwo,
          title: localizedValue(content, "referenceTwoTitle", locale),
          category: localizedValue(content, "referenceTwoCategory", locale),
          summary: localizedValue(content, "referenceTwoSummary", locale),
          focus: localizedValue(content, "referenceTwoFocus", locale),
        }
      : null,
  ].filter(Boolean) as Array<{
    document: NormalizedXMindDocument;
    title: string;
    category: string;
    summary: string;
    focus: string;
  }>;

  if (displayMode === "single" && !documentOne) return null;
  if (displayMode === "double" && !references.length) return null;

  const effectiveHorizontalInset =
    displayMode === "single"
      ? Math.min(horizontalInset, SINGLE_MODE_HORIZONTAL_INSET_CAP)
      : horizontalInset;

  return (
    <TemplateSurface>
      <TemplateContent
        horizontalInset={effectiveHorizontalInset}
        className="pt-[16px] pb-[16px]"
      >
        {sectionTitle ? (
          <div className="text-center">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-acidGreen/68">
              {locale === "zh" ? "核心分析框架" : "CORE ANALYSIS FRAMEWORK"}
            </p>
            <h2 className="mt-2.5 w-full text-center font-display text-[clamp(1.35rem,2.3vw,1.75rem)] font-semibold leading-[1.3] text-softWhite">
              {sectionTitle}
            </h2>
            <span className="mx-auto mt-3 block h-px w-14 bg-acidGreen/45" aria-hidden="true" />
          </div>
        ) : null}

        <div className={sectionTitle ? "mt-6 md:mt-8" : ""}>
          {displayMode === "single" && documentOne ? (
            <SingleXMindBreakdown document={documentOne} locale={locale} />
          ) : null}

          {displayMode === "double" ? (
            <section className="overflow-hidden rounded-[22px] border border-[rgba(85,145,255,0.62)] bg-[rgba(43,67,156,0.28)] shadow-[0_0_0_1px_rgba(80,135,255,0.16),0_0_28px_rgba(55,115,255,0.28),inset_0_0_32px_rgba(60,100,230,0.08)] backdrop-blur-lg">
              <div className="border-b border-[rgba(145,178,255,0.18)] px-5 py-5 md:px-7 md:py-6">
                <span
                  className="mb-3 block h-[3px] w-9 rounded-full bg-acidGreen/80"
                  aria-hidden="true"
                />
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-acidGreen/72">
                    {locale === "zh" ? "参照框架" : "Reference framework"}
                  </p>
                  <p className="font-mono text-[10px] tracking-[0.1em] text-white/[0.58]">
                    {locale === "zh" ? `共 ${references.length} 个入口` : `${references.length} entries`}
                  </p>
                </div>
              </div>
              <div className="rounded-b-[20px] border-t border-[rgba(125,165,255,0.22)] bg-[rgba(25,42,112,0.32)] grid w-full gap-6 p-5 sm:grid-cols-2 sm:items-stretch md:p-7 lg:gap-8">
                {references.map((reference, index) => (
                  <ReferenceCard
                    key={`${reference.document.fileName}-${index}`}
                    index={index}
                    title={reference.title}
                    category={reference.category}
                    summary={reference.summary}
                    focus={reference.focus}
                    locale={locale}
                    onOpen={() => setOpenDocument(reference.document)}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>

        {typeof document !== "undefined"
          ? createPortal(
              <AnimatePresence>
                {openDocument ? (
                  <motion.div
                    className="fixed inset-0 z-[140] flex items-center justify-center overflow-y-auto bg-[#070A28]/80 p-4 backdrop-blur-md md:p-8"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
                    onMouseDown={(event) => {
                      if (event.target === event.currentTarget) {
                        setOpenDocument(null);
                      }
                    }}
                    role="presentation"
                  >
                    <motion.article
                      className="relative my-auto max-h-[calc(100vh-2rem)] w-full max-w-6xl overflow-y-auto rounded-[30px] bg-[#111746]/95 p-6 shadow-[0_36px_100px_rgba(2,4,24,0.68),inset_0_1px_0_rgba(244,245,250,0.12)] ring-1 ring-inset ring-softWhite/5 md:flex md:h-[min(46rem,calc(100vh-4rem))] md:max-h-none md:flex-col md:overflow-hidden md:p-10"
                      initial={
                        shouldReduceMotion
                          ? { opacity: 0 }
                          : { opacity: 0, y: 24, scale: 0.97 }
                      }
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={
                        shouldReduceMotion
                          ? { opacity: 0 }
                          : { opacity: 0, y: 16, scale: 0.98 }
                      }
                      transition={{
                        duration: shouldReduceMotion ? 0 : 0.28,
                        ease: "easeOut",
                      }}
                      onMouseDown={(event) => event.stopPropagation()}
                    >
                      <div className="mb-6 flex shrink-0 items-center justify-between gap-4">
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 text-sm font-semibold text-acidGreen"
                          onClick={() => setOpenDocument(null)}
                        >
                          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                          {locale === "zh"
                            ? "返回双排展示"
                            : "Back to references"}
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-softWhite/10 text-[#9FAAD2] transition hover:bg-softWhite/20 hover:text-softWhite focus-visible:outline focus-visible:outline-2 focus-visible:outline-acidGreen"
                          aria-label={locale === "zh" ? "关闭拆解" : "Close breakdown"}
                          onClick={() => setOpenDocument(null)}
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                      <SingleBreakdown
                        document={openDocument}
                        locale={locale}
                        stableDialogLayout
                      />
                    </motion.article>
                  </motion.div>
                ) : null}
              </AnimatePresence>,
              document.body,
            )
          : null}
      </TemplateContent>
    </TemplateSurface>
  );
}
