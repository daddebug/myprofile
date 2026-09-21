import { Topolines } from "topolines/react";
import "./home-contour-background.css";

// Homepage background system, replacing every earlier dot-grid
// experiment outright (deleted, not layered underneath). Uses the
// `topolines` npm package directly rather than a hand-rolled shader, per
// explicit instruction to match its reference behavior as closely as
// possible instead of approximating it. Deliberately isolated in its own
// file/component -- HomePage.tsx only ever mounts THIS component, never
// `topolines/react` directly -- so a later background direction can
// replace it without touching project/card logic. `topolines` itself
// already owns pause-on-offscreen (IntersectionObserver), pause-on-
// hidden-tab, reduced-motion handling, and resize -- none of that needs
// reimplementing here.
//
// Full-page pass (2026-09-21): mounted once, spanning the whole
// .home-v2__content-stage (Hero through the long-form section) as ONE
// continuous field, not a per-section instance -- see HomePage.tsx.
// Tuned toward a denser, finer, calmer field per direct comparison
// against the official playground (topolines.idlee.xyz/playground) and
// its own dark-background "Relief" preset: more levels/tighter scale for
// continuous coverage (not isolated "worms"), a thinner lineWidth,
// reduced warp/speed so the motion reads as one slowly drifting terrain
// rather than fast-swimming strands, and a smaller/gentler cursor bump.
// color/opacity are the one deliberate departure from any preset --
// every official preset is tuned for a dark background, this homepage's
// is a light cream (#F7F6ED), so white lines need a much higher opacity
// than a dark-mode preset would to register any contrast at all.
const CONTOUR_COLOR = "#FFFFFF";
const CONTOUR_OPACITY = 0.6;
const CONTOUR_SCALE = 0.88;
// 16 is a real, confirmed ceiling for this installed version (topolines
// 0.3.0), not a stylistic choice -- 17 renders a fully blank canvas (no
// error, no console warning; confirmed live by bisecting props one at a
// time). Very likely a fixed-size array/loop bound baked into the
// compiled shader. Do not raise this without re-verifying against a
// live screenshot first.
const CONTOUR_LEVELS = 16;
const CONTOUR_LINE_WIDTH = 0.75;
const CONTOUR_WARP = 0.15;
const CONTOUR_SPEED = 0.008;
const CONTOUR_MOUSE_RADIUS = 0.25;
const CONTOUR_MOUSE_STRENGTH = 0.24;

export function HomeContourBackground() {
  return (
    <div className="home-contour-background" aria-hidden="true">
      <Topolines
        seed="dilida-home"
        color={CONTOUR_COLOR}
        opacity={CONTOUR_OPACITY}
        scale={CONTOUR_SCALE}
        levels={CONTOUR_LEVELS}
        lineWidth={CONTOUR_LINE_WIDTH}
        warp={CONTOUR_WARP}
        speed={CONTOUR_SPEED}
        interactive
        mouseRadius={CONTOUR_MOUSE_RADIUS}
        mouseStrength={CONTOUR_MOUSE_STRENGTH}
      />
    </div>
  );
}
