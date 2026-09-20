// Shared entry-choreography timing/easing for the Homepage's opening
// sequence -- one definition reused by HomeIntroTransition and HomeHero
// so their sequencing stays in sync without duplicated magic numbers.
// Not a general-purpose motion system: this file only covers the specific
// values the intro/hero modules need, added as later modules need their
// own (see home-motion/scrollVelocity.ts, home-motion/webglProjectBridge.ts
// once Phase C/D build them).

// Product-reveal-recipe style easing (web-design-studio's cinematic-scroll
// skill): a fast-out/slow-settle curve, not a bare `ease`/`linear` literal.
export const INTRO_EASE: [number, number, number, number] = [0.65, 0, 0.35, 1];

export const INTRO_APERTURE_DELAY = 0.15;
export const INTRO_APERTURE_DURATION = 1.05;
// The content beneath settles (scale/opacity) slightly after the aperture
// starts opening, so the reveal reads as "the page arrives," not two
// unrelated effects firing at once.
export const INTRO_CONTENT_SETTLE_DELAY = 0.3;
export const INTRO_CONTENT_SETTLE_DURATION = 0.9;

