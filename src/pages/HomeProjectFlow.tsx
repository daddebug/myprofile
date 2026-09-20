import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ImageUp, Loader2 } from "lucide-react";
import { ACCEPTED_COVER_TYPES, MAX_COVER_FILE_SIZE } from "../components/ProjectCoverEditor";
import { useOwnerProjectCatalog } from "../hooks/useProjectCatalog";
import { useProjectCover } from "../hooks/useProjectCover";
import { stageProjectCover, decodeProjectCover, commitProjectCover } from "../lib/portfolioContentClient";
import { useLocale } from "../locales/LocaleContext";
import type { Locale } from "../locales/types";
import type { ResolvedProjectMetadata } from "../lib/projectMetadata";
import {
  registerProjectCover,
  unregisterProjectCover,
  useProjectCoverReady,
} from "./home-webgl/homeProjectCanvasRegistry";
import "./home-project-flow.css";

// Homepage 3.0, Haoqi-track Phase 1: the DOM layout system only. No WebGL
// image plane, no shader/scroll-velocity distortion, no hover reveal, no
// route transition -- those are Phase 2-5 of that track's own plan.

// One ordered, catalog-driven flow -- no manually-bound Homepage-only slot
// array (see Phase B.1: homeProjectSlots/homeExplorationSlots are legacy/
// inert, /work's own archiveOrder control is the one Homepage-order
// system). Pool membership IS click-eligibility: owner/DEV sees every
// real, non-pending-delete project (draft included, previewable before
// publish); a real visitor or any production build only ever sees
// visibility==="public" && publicationState==="published".
function buildHomeProjectPool(
  projects: ResolvedProjectMetadata[],
  isOwner: boolean,
): ResolvedProjectMetadata[] {
  const candidates = projects.filter((project) => Boolean(project.route));
  const eligible = isOwner
    ? candidates
    : candidates.filter((project) => project.visibility === "public" && project.publicationState === "published");
  return [...eligible].sort((left, right) => left.archiveOrder - right.archiveOrder);
}

// ---------------------------------------------------------------------
// Layout grammar -- measured directly from haoqi.design's own live project
// field (getBoundingClientRect() on its real <article> elements at a
// 1440px viewport), not invented or eyeballed from a screenshot:
//
//   item                  left  top   width  height
//   Reunimos (hero)        499    96    885    537
//   Inspire Mono            56   744    553    350
//   Wasm design utils      720   744    553    350
//   VectorSymbols           609  1205    332    253
//   DarkSide               1052  1205    332    253
//   aDrive                   56  1569    332    492
//   Shore Icon              499  1569    332    492
//   Teambition              941  1569    332    492
//   FoF: See Hear Touch     609  2172    332    364
//   FoF: Design System     1052  2172    332    364
//
// Rail: leftmost edge 56, rightmost edge 1384 -> content width 1328px.
// Module: 1328/12 = 110.667px -- widths above are consistently
// n * 110.667 (885=8col, 553=5col, 332=3col) and left offsets are
// consistently (start-1) * 110.667. Row-gap, measured as the vertical
// distance between one row's bottom edge and the next row's top edge, is
// 111px in EVERY case -- exactly one column-width, not a separate
// spacing constant. The rail itself uses this same 1328px/56px figure
// (see home-project-flow.css's --home-project-rail-width/--home-project-
// rail-gutter), so colWidth at 1440 is the same 110.667px Haoqi itself
// measures -- this part of the rail sizing IS a direct measurement, not
// a personalization choice, so it stays regardless of the grammar
// history below.
//
// Deviation history (kept here so a later personalization pass knows
// exactly what changed and why, per this round's "document every
// deviation" rule): Phase 1.1 tried moving the hero to column 1 (flush
// left) and repacking every row so pairs summed to all 12 columns with
// zero empty cells, because the indented/gapped original read as "dead
// space" at this field's narrower footprint. Phase 1.3 replaced the
// grammar again with a different unequal-but-fully-packed rhythm
// (5+7/7+5/6+6/4+8/8+4). Both were real, deliberate personalization
// requests, not measurement errors -- but this round asked to recreate
// Haoqi's reference system faithfully BEFORE personalizing, so the
// table above is authoritative again and the grammar below is reverted
// to match it exactly (hero indented at column 5 with 4 empty columns
// on each side, real trailing/flanking empty cells preserved). The
// flush-left/fully-packed rhythm is not lost -- it's documented here as
// a candidate for the later Personalization Phase, not implemented now.
type GridCell = { start: number; span: number };
type LayoutRow = GridCell[];

const DESKTOP_COLUMNS = 12;
const DESKTOP_GRAMMAR: LayoutRow[] = [
  [{ start: 5, span: 8 }],
  [{ start: 1, span: 5 }, { start: 7, span: 5 }],
  [{ start: 6, span: 3 }, { start: 10, span: 3 }],
  [{ start: 1, span: 3 }, { start: 5, span: 3 }, { start: 9, span: 3 }],
  [{ start: 6, span: 3 }, { start: 10, span: 3 }],
];

// Tablet: same grammar, half the field -- its own deliberate-empty-cell
// rhythm (not a Haoqi measurement -- Haoqi has no distinct tablet
// breakpoint to measure), reverted alongside desktop for the same
// fidelity-first reason above.
const TABLET_COLUMNS = 6;
const TABLET_GRAMMAR: LayoutRow[] = [
  [{ start: 1, span: 6 }],
  [{ start: 1, span: 3 }, { start: 4, span: 3 }],
  [{ start: 2, span: 4 }],
];

const MOBILE_BREAKPOINT = 760;
const TABLET_BREAKPOINT = 1180;
// A screenshot-shaped placeholder used only until a real cover's own
// naturalWidth/naturalHeight resolves -- see useCoverAspectRatios below.
const DEFAULT_ASPECT_RATIO = 4 / 3;

type Position = { x: number; y: number; width: number; height: number };

function computeLayout(
  pool: ResolvedProjectMetadata[],
  grammar: LayoutRow[],
  columns: number,
  containerWidth: number,
  ratios: Record<string, number>,
): { positions: Map<string, Position>; totalHeight: number; colWidth: number } {
  const colWidth = containerWidth / columns;
  const positions = new Map<string, Position>();
  let cursorY = 0;
  let poolIndex = 0;
  let rowTemplateIndex = 0;
  while (poolIndex < pool.length) {
    const row = grammar[rowTemplateIndex % grammar.length];
    const rowItems = pool.slice(poolIndex, poolIndex + row.length);
    let rowHeight = 0;
    rowItems.forEach((project, i) => {
      const cell = row[i];
      const width = cell.span * colWidth;
      const ratio = ratios[project.id] ?? DEFAULT_ASPECT_RATIO;
      const height = width / ratio;
      positions.set(project.id, { x: (cell.start - 1) * colWidth, y: cursorY, width, height });
      rowHeight = Math.max(rowHeight, height);
    });
    // Row-gap = one column-width, measured directly off Haoqi's own field --
    // the same module governs horizontal AND vertical rhythm, not two
    // independently-tuned constants.
    cursorY += rowHeight + colWidth;
    poolIndex += row.length;
    rowTemplateIndex += 1;
  }
  return { positions, totalHeight: Math.max(0, cursorY - colWidth), colWidth };
}

function useElementWidth() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setWidth(el.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

function HomeProjectCoverUpload({ project, locale }: { project: ResolvedProjectMetadata; locale: Locale }) {
  const { messages } = useLocale();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  // Reuses the exact canonical cover pipeline (stageProjectCover ->
  // decodeProjectCover -> commitProjectCover) already used by /work's own
  // row-thumbnail editor and ProjectCoverEditor's compact variant -- not a
  // second upload implementation. Overlays the existing cover image; never
  // adds height/layout below the module, so Editing Mode stays
  // geometrically identical to the public static state.
  const uploadCover = async (file: File) => {
    if (!ACCEPTED_COVER_TYPES.has(file.type)) { setError(messages.homeEditor.unsupportedFile); return; }
    if (file.size > MAX_COVER_FILE_SIZE) { setError(messages.homeEditor.fileTooLarge); return; }
    setError("");
    setUploading(true);
    try {
      const staged = await stageProjectCover(file);
      await decodeProjectCover(staged.publicUrl);
      await commitProjectCover(project.id, staged.commitToken);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : messages.homeEditor.saveError);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="home-project-card__cover-edit" data-exact-export="hide">
      <button
        type="button"
        className="home-project-card__cover-edit-trigger"
        onClick={(event) => {
          event.preventDefault();
          fileInputRef.current?.click();
        }}
        disabled={uploading}
        aria-label={locale === "zh" ? `更换封面: ${project.title}` : `Replace cover: ${project.title}`}
        title={locale === "zh" ? "更换封面" : "Replace cover"}
      >
        {uploading ? <Loader2 className="home-project-card__cover-edit-icon is-spinning" aria-hidden="true" /> : <ImageUp className="home-project-card__cover-edit-icon" aria-hidden="true" />}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        className="home-project-card__cover-edit-input"
        accept="image/png,image/jpeg,image/webp"
        aria-label={locale === "zh" ? "更换封面" : "Replace cover"}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void uploadCover(file);
        }}
      />
      {error ? <span className="home-project-card__cover-edit-error" title={error}>{error}</span> : null}
    </div>
  );
}

// Static representation only: image, title, year -- no description, no
// tags, no hover reveal (explicitly deferred to the Haoqi track's own
// Phase 4). `position` is a computed {x,y,width,height} in px for the
// desktop/tablet absolute grid, or null for the mobile flow layout (plain
// stacked block, full width, browser-native reflow).
function HomeProjectCard({
  project,
  position,
  pathFor,
  isOwner,
  isEditingUI,
  locale,
  ratio,
  onRatioResolved,
}: {
  project: ResolvedProjectMetadata;
  position: Position | null;
  pathFor: (path: string) => string;
  isOwner: boolean;
  isEditingUI: boolean;
  locale: Locale;
  ratio: number;
  onRatioResolved: (projectId: string, ratio: number) => void;
}) {
  const cover = useProjectCover(project.id, project.coverImage ?? "");
  const clickable = isOwner || (project.visibility === "public" && project.publicationState === "published");
  const href = clickable ? pathFor(`/work/${project.slug}`) : null;

  // Phase 3: this element (the surface -- Phase 1.2 already made its box
  // exactly equal to the visible image edges) is the DOM measurement
  // target HomeProjectCanvas reads every frame. Registering here, not in
  // some separate WebGL-only component, keeps DOM as the one layout
  // authority -- the canvas only ever reads a rect this grid already
  // computed, never the other way around.
  const surfaceRef = useRef<HTMLElement | null>(null);
  const setSurfaceRef = (element: HTMLElement | null) => {
    surfaceRef.current = element;
  };
  useEffect(() => {
    const element = surfaceRef.current;
    if (!element || !cover.image) return undefined;
    registerProjectCover(project.id, { element, coverUrl: cover.image, ratio });
    return () => unregisterProjectCover(project.id);
  }, [project.id, cover.image, ratio]);
  // Flips exactly once the matching WebGL plane has a loaded texture and
  // a verified rect (see HomeProjectCanvas.tsx) -- true only when WebGL
  // actually took over this cover, so a load failure or unsupported
  // WebGL leaves this false forever and the DOM <img> below just stays
  // visible, which is the whole fallback, not a special-cased branch.
  const webglReady = useProjectCoverReady(project.id);

  const inner = (
    <>
      {cover.image ? (
        <img
          src={cover.image}
          alt=""
          loading="lazy"
          style={{ opacity: webglReady ? 0 : 1 }}
          onLoad={(event) => {
            const el = event.currentTarget;
            if (el.naturalWidth > 0 && el.naturalHeight > 0) onRatioResolved(project.id, el.naturalWidth / el.naturalHeight);
          }}
        />
      ) : null}
      {isEditingUI ? <HomeProjectCoverUpload project={project} locale={locale} /> : null}
    </>
  );

  // The card itself owns the absolute position (x/y/width) computed by
  // the parent's layout pass -- the grid cell, structural column-gap
  // still zero. Phase 1.2: the visible gap between adjacent modules
  // comes from `__inner`'s own padding-inline, not from the grid math --
  // this was the missing half of Phase 1's own "column-gap = 0, visual
  // gap comes from per-item padding" rule (some grammar rows already
  // reserved a whole empty column between items and read fine, but any
  // row without one, e.g. TABLET_GRAMMAR's adjacent 3+3, had images
  // touching). Image and metadata are both inside `__inner`, so they
  // always share the same left/right inset instead of the image
  // touching the cell edge while the caption doesn't (or vice versa).
  const cardStyle = position
    ? { position: "absolute" as const, left: position.x, top: position.y, width: position.width }
    : undefined;
  const surfaceStyle = position ? { height: position.height } : { aspectRatio: String(ratio) };

  return (
    <div className="home-project-card" style={cardStyle}>
      <div className="home-project-card__inner">
        {href ? (
          <Link ref={setSurfaceRef} className="home-project-card__surface" style={surfaceStyle} to={href}>{inner}</Link>
        ) : (
          <div ref={setSurfaceRef} className="home-project-card__surface home-project-card__surface--disabled" style={surfaceStyle}>{inner}</div>
        )}
        <div className="home-project-card__caption">
          <span className="home-project-card__title">{project.title}</span>
          {project.year ? <span className="home-project-card__year">{project.year}</span> : null}
        </div>
      </div>
    </div>
  );
}

export function HomeProjectFlow({
  isOwner,
  isEditingUI,
  pathFor,
}: {
  isOwner: boolean;
  isEditingUI: boolean;
  pathFor: (path: string) => string;
}) {
  const { locale } = useLocale();
  const projectCatalog = useOwnerProjectCatalog(locale);
  const [containerRef, containerWidth] = useElementWidth();
  // Resolved lazily as each real cover image finishes loading (see
  // HomeProjectCard's onLoad) -- absent entries fall back to
  // DEFAULT_ASPECT_RATIO. Updating this reflows the whole field (later
  // rows depend on earlier rows' real heights), which is the "update once
  // resolved without layout breakage" behavior this round asks for: a
  // brief settle as real covers report in, never an overlap.
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const onRatioResolved = (projectId: string, ratio: number) => {
    setRatios((current) => (current[projectId] === ratio ? current : { ...current, [projectId]: ratio }));
  };

  const pool = useMemo(
    () => buildHomeProjectPool(projectCatalog, isOwner),
    [projectCatalog, isOwner],
  );

  const isMobile = containerWidth > 0 && containerWidth < MOBILE_BREAKPOINT;
  const isTablet = containerWidth >= MOBILE_BREAKPOINT && containerWidth < TABLET_BREAKPOINT;

  const layout = useMemo(() => {
    if (isMobile || containerWidth <= 0) return null;
    const grammar = isTablet ? TABLET_GRAMMAR : DESKTOP_GRAMMAR;
    const columns = isTablet ? TABLET_COLUMNS : DESKTOP_COLUMNS;
    return computeLayout(pool, grammar, columns, containerWidth, ratios);
  }, [pool, ratios, containerWidth, isMobile, isTablet]);

  if (pool.length === 0) return null;

  const railColWidth = layout?.colWidth;
  const railStyle = railColWidth
    ? {
        backgroundImage:
          `repeating-linear-gradient(to right, var(--home-project-rail-line) 0, var(--home-project-rail-line) 1px, transparent 1px, transparent ${railColWidth}px),` +
          `repeating-linear-gradient(to bottom, var(--home-project-rail-line) 0, var(--home-project-rail-line) 1px, transparent 1px, transparent ${railColWidth}px)`,
      }
    : undefined;

  return (
    <section className="home-project-flow">
      <div
        ref={containerRef}
        className={`home-project-grid${isMobile ? " home-project-grid--mobile" : ""}`}
        style={layout ? { height: layout.totalHeight, ...railStyle } : undefined}
      >
        {pool.map((project) => (
          <HomeProjectCard
            key={project.id}
            project={project}
            position={layout?.positions.get(project.id) ?? null}
            pathFor={pathFor}
            isOwner={isOwner}
            isEditingUI={isEditingUI}
            locale={locale}
            ratio={ratios[project.id] ?? DEFAULT_ASPECT_RATIO}
            onRatioResolved={onRatioResolved}
          />
        ))}
      </div>
    </section>
  );
}



