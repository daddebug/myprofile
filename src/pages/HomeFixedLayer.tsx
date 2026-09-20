import type { PropsWithChildren } from "react";
import "./home-scroll-shell.css";

// Homepage 3.0, Haoqi-track Phase 2.1: viewport-pinned layer for chrome
// that must never scroll with the page -- fixed nav now, the scroll
// indicator, and (Phase 3) the WebGL canvas slot. Matches the reference's
// own confirmed structure: fixed nav + canvas sit outside/behind the
// scrollable content, not inside it. `pointer-events: none` on the layer
// itself so it never blocks clicks on the scrolling content beneath it;
// each interactive child re-enables pointer-events on itself.
export function HomeFixedLayer({ children }: PropsWithChildren) {
  return <div className="home-fixed-layer">{children}</div>;
}
