import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

// A single Figma Frame rendered as one complete visual board: fixed
// width x height design coordinate system (per-Frame, not a global
// constant -- FRAME_01_COVER is 2400 wide, other Frames may differ),
// scaled as ONE unit to fit its container -- never per-element vw/clamp.
// See docs/design/FIGMA_TEMPLATE_WORKFLOW.md and this task's explicit
// "one transform scale for whole board" rule.
//
//   containerWidth >= width  -> scale = 1, board renders at its natural
//                              width, centered; extra space is
//                              background only, board geometry never
//                              stretches.
//   containerWidth <  width  -> scale = containerWidth / width, the whole
//                              board (and everything inside it) shrinks
//                              uniformly via a single CSS transform.
//
// No responsive breakpoints, no independent element-level scaling in this
// first pass -- deliberately out of scope per this task.
export function ProjectArtboard({
  width,
  height,
  background,
  edgeColor,
  publishViewportMetrics = false,
  children,
}: {
  width: number;
  height: number;
  background: string;
  // Fill color for the side margins when the container is wider than
  // this board's own width -- keeps the board from reading as a
  // hard-edged box floating on a mismatched page background.
  edgeColor: string;
  publishViewportMetrics?: boolean;
  children: ReactNode;
}) {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  // Publishes this board's own live scale and its rendered left edge (in
  // viewport px) as CSS custom properties on <html> -- same pattern as
  // Shell.tsx's --site-header-height -- so page chrome that must sit
  // fixed above the board (the Back/scroll-to-top overlay buttons in
  // DynamicProjectPage.tsx) can convert a Figma (x, y) on this board
  // directly to a viewport position via
  // calc(var(--artboard-viewport-left) + var(--artboard-scale) * <x>px)
  // and calc(var(--artboard-scale) * <y>px), instead of hand-tuning a
  // fixed pixel offset that would drift out of sync with the board's own
  // responsive scale-to-fit. Only the board explicitly marked
  // publishViewportMetrics writes these shared variables; later stacked
  // Artboards cannot replace the Cover metrics.
  useEffect(() => {
    const node = outerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return undefined;
    const update = () => {
      const rect = node.getBoundingClientRect();
      const containerWidth = rect.width;
      if (containerWidth <= 0) return;
      const nextScale = Math.min(1, containerWidth / width);
      setScale(nextScale);
      const boardLeft = rect.left + (containerWidth - width * nextScale) / 2;
      if (publishViewportMetrics) {
        document.documentElement.style.setProperty("--artboard-scale", `${nextScale}`);
        document.documentElement.style.setProperty("--artboard-viewport-left", `${boardLeft}px`);
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [publishViewportMetrics, width]);

  const outerStyle: CSSProperties = {
    position: "relative",
    width: "100%",
    height: height * scale,
    overflow: "hidden",
    background: edgeColor,
  };

  const boardStyle: CSSProperties = {
    position: "absolute",
    left: "50%",
    top: 0,
    width,
    height,
    transform: `translateX(-50%) scale(${scale})`,
    transformOrigin: "top center",
    background,
    overflow: "hidden",
  };

  return (
    <div ref={outerRef} style={outerStyle} className="project-artboard">
      <div style={boardStyle}>{children}</div>
    </div>
  );
}
