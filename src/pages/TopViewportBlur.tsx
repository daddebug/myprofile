import "./top-viewport-blur.css";

// Whole-page viewport-edge atmosphere layer (2026-09-21). Deliberately NOT
// part of the project-cover WebGL shader (see coverShaders.ts's own removal
// comment) -- this sits above EVERYTHING scrolling underneath it (text,
// project covers, the point field, background), as ONE cheap CSS
// backdrop-filter pass, rather than N per-project GPU sampling loops. Mounts
// as a sibling of HomeFixedNav inside HomeFixedLayer, following that
// component's own established pattern (position: absolute child of the
// fixed layer, own z-index -- see home-scroll-shell.css). `pointer-events:
// none` so it never blocks the nav or scrolling content beneath it; there is
// no interactive surface here.
export function TopViewportBlur() {
  return <div className="home-top-viewport-blur" aria-hidden="true" />;
}
