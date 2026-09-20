import { useEffect, useMemo, useRef, useState } from "react";
import { animate, useReducedMotion } from "framer-motion";
import { hasIntroPlayedThisSession, markIntroPlayed } from "./home-motion/introSession";
import { INTRO_APERTURE_DELAY, INTRO_APERTURE_DURATION, INTRO_EASE } from "./home-motion/motionTokens";
import "./home-intro.css";

// Opening -> transformation -> readable hold -> exit (the cinematic-scroll
// skill's product-reveal recipe structure, applied to a page-load reveal
// rather than a scroll-driven one): an ivory surface with a small
// aperture at the Hero's own focal point, which grows until it clears the
// whole viewport and the overlay is removed. Not a spinner, not a percent
// counter, not a full-screen logo -- see the MengTo build-awwwards-quality
// skill's "static first frame that remains complete without motion" rule,
// satisfied by HomeHero rendering its real, complete content underneath
// this overlay the whole time, never after it.
//
// Implemented with Framer Motion's imperative `animate()` (already the
// project's one motion library, used throughout Homepage/project modules)
// rather than adding GSAP for this one sequence -- CSS mask-image with a
// radial-gradient is the correct primitive for an "aperture growing
// outward" reveal (clip-path can only show what's INSIDE a shape, not
// punch a hole through an otherwise-opaque overlay), so the aperture
// radius is driven by a plain animated number that rewrites the mask
// string on each update rather than something Framer Motion's own
// value-interpolation of clip-path could express directly.
const FOCAL_X = "50%";
const FOCAL_Y = "36%";
// vmax so the aperture's growth is relative to the viewport regardless of
// aspect ratio; 145 safely exceeds the corner-to-focal-point distance on
// any real screen size.
const MAX_RADIUS_VMAX = 145;

function maskForRadius(radiusVmax: number): string {
  const inner = Math.max(0, radiusVmax - 1);
  return `radial-gradient(circle at ${FOCAL_X} ${FOCAL_Y}, transparent ${inner}vmax, black ${radiusVmax}vmax)`;
}

export function HomeIntroTransition({ onComplete }: { onComplete: () => void }) {
  const prefersReducedMotion = useReducedMotion();
  const overlayRef = useRef<HTMLDivElement | null>(null);
  // Read once per mount, not on every render -- this is a one-shot gate,
  // and marking it played immediately (not after the animation finishes)
  // means an interrupted/unmounted intro still won't replay on the same
  // Homepage instance re-rendering.
  const shouldPlay = useMemo(() => !prefersReducedMotion && !hasIntroPlayedThisSession(), []); // eslint-disable-line react-hooks/exhaustive-deps
  // Once the aperture finishes opening it has no further visual purpose
  // (the mask has grown past every real viewport corner) -- unmounted
  // rather than left sitting in the DOM as a no-longer-visible
  // full-viewport fixed node.
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    markIntroPlayed();
  }, []);

  useEffect(() => {
    if (!shouldPlay) {
      onComplete();
      return;
    }
    const el = overlayRef.current;
    if (!el) {
      onComplete();
      return;
    }
    el.style.maskImage = maskForRadius(0);
    el.style.webkitMaskImage = maskForRadius(0);
    const controls = animate(0, MAX_RADIUS_VMAX, {
      duration: INTRO_APERTURE_DURATION,
      delay: INTRO_APERTURE_DELAY,
      ease: INTRO_EASE,
      onUpdate: (radius) => {
        const mask = maskForRadius(radius);
        el.style.maskImage = mask;
        el.style.webkitMaskImage = mask;
      },
      onComplete: () => {
        onComplete();
        setFinished(true);
      },
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldPlay]);

  if (!shouldPlay || finished) return null;

  return <div ref={overlayRef} className="home-intro-overlay" aria-hidden="true" />;
}
