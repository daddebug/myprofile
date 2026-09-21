// Homepage cover shader. `uCoverScale` reproduces CSS
// `object-fit: cover`'s crop math (no stretching, natural proportions
// preserved) -- needed because THIS project's Phase 1 grid assigns a
// fixed grid-span box independent of the cover's own aspect ratio,
// unlike Haoqi's own DOM (its placeholder's `aspect-ratio` CSS always
// equals the image's natural ratio by construction, so its shader never
// needs a crop step at all -- see haoqi-design-teardown.md section 3).
// The former scroll-velocity curl/UV deformation has been removed. Cover
// position belongs to the Lenis-driven elastic lanes; this shader owns
// sampling, the square-cell hover reveal, and image-only edge blur.
export const COVER_VERTEX_SHADER = `
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 clipPosition = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = clipPosition;
}
`;

export const COVER_FRAGMENT_SHADER = `
uniform sampler2D uMap;
uniform sampler2D uMapHover;
uniform float uHasHoverMap;
// Haoqi-style square-cell hover reveal (2026-09-21 rework -- the earlier
// version was a plain uniform mix(base,hover,uHoverMix) across the WHOLE
// plane at once, confirmed NOT a real cell reveal). uHoverProgress is a
// LINEAR 0..1 clock driven from JS over a fixed ~0.42s window since the
// last hover-state change (see HOVER_REVEAL_DURATION_SECONDS in
// HomeProjectCanvas.tsx); uHoverFrom/uHoverTarget are each always 0 or 1
// (the mix value this plane is animating FROM/TO). Per-cell delay +
// cosine easing are computed HERE, per fragment, from uHoverProgress --
// JS never computes or smooths a single blended value itself.
uniform float uHoverProgress;
uniform float uHoverFrom;
uniform float uHoverTarget;
uniform vec2 uRectPixelSize;
uniform float uElasticOffset;
uniform float uElasticOverscan;
uniform float uViewportHeight;
uniform float uAtmosphereEnabled;
uniform float uAtmosphereStrength;
uniform vec2 uCoverScale;
varying vec2 vUv;

// ~18px square cells, measured in real on-screen CSS pixels (uRectPixelSize
// is the plane's own actual rect size in px, set every frame from the same
// DOM getBoundingClientRect() this whole bridge already uses -- see
// HomeProjectCanvas.tsx) -- not UV-space cells, so cell size stays visually
// constant regardless of a given card's own authored footprint size.
const float HOVER_CELL_SIZE_PX = 18.0;
// Fraction of the total reveal window each individual cell's own local
// fade takes -- the remaining (1.0 - this) fraction is spent staggering
// cell START times by distance from center, so the ripple as a whole
// still finishes in exactly one HOVER_REVEAL_DURATION_SECONDS window.
const float HOVER_CELL_LOCAL_WINDOW = 0.3;

// Same formula as Three.js's own sRGBTransferOETF (IEC 61966-2-1) --
// see this file's own top comment for why it's written out explicitly
// rather than via "#include <colorspace_fragment>" (that include
// reproducibly broke this material -- confirmed by toggling it).
vec3 linearToSRGB(vec3 value) {
  vec3 low = value * 12.92;
  vec3 high = pow(value, vec3(1.0 / 2.4)) * 1.055 - vec3(0.055);
  return mix(high, low, vec3(lessThanEqual(value, vec3(0.0031308))));
}

vec3 sampleCover(vec2 uv, float hoverMix) {
  vec2 sampleUv = clamp(uv, 0.0, 1.0);
  if (hoverMix < 0.001) return texture2D(uMap, sampleUv).rgb;
  return mix(texture2D(uMap, sampleUv).rgb, texture2D(uMapHover, sampleUv).rgb, hoverMix);
}

// Distributed disk sampling follows the reference's image-space blur rather
// than blending a handful of visibly separated copies of the image.
vec3 progressiveBlur(vec2 uv, float hoverMix, vec2 radiusUv) {
  vec3 color = vec3(0.0);
  for (int i = 0; i < 40; i++) {
    float fi = float(i);
    float angle = fi * 2.39996323;
    float radius = sqrt((fi + 0.5) / 40.0);
    vec2 direction = vec2(cos(angle), sin(angle));
    vec2 offset = direction * radiusUv * radius;
    color += sampleCover(uv + offset, hoverMix);
    color += sampleCover(uv - offset, hoverMix);
  }
  return color / 80.0;
}

void main() {
  // The mesh is vertically overscanned and shifted, but drawing is clipped
  // to the original DOM media rect so it cannot cover captions or neighbors.
  float height = max(uRectPixelSize.y, 1.0);
  float imageV = 0.5 + (vUv.y - 0.5) * (1.0 + 2.0 * uElasticOverscan / height);
  float cardV = imageV - uElasticOffset / height;
  if (cardV < 0.0 || cardV > 1.0) discard;
  vec2 imageUv = vec2(vUv.x, imageV);
  vec2 cardUv = vec2(vUv.x, cardV);
  // Media rendering fix (2026-09-21): uCoverScale is already the correct
  // object-fit:cover SAMPLE-RANGE fraction (<=1 on the axis being cropped,
  // computed in applyCoverScale -- HomeProjectCanvas.tsx). Multiplying
  // shrinks the sampled UV window on that axis (a true crop, proportions
  // preserved); the previous DIVIDE here did the opposite -- it EXPANDED
  // the sampled window beyond [0,1] on the non-cropped axis's counterpart,
  // so most of the plane's UV range clamped to the texture's edge pixel
  // instead of sampling a real proportional crop. That read as visible
  // horizontal stretch/compression once card footprints stopped closely
  // matching their source image's own ratio (previously near-invisible,
  // since uCoverScale was then always close to (1,1)).
  vec2 uv = (imageUv - 0.5) * uCoverScale + 0.5;
  uv = clamp(uv, 0.0, 1.0);

  vec4 baseColor = texture2D(uMap, uv);
  vec4 hoverColor = texture2D(uMapHover, uv);

  // Center-origin square-cell reveal: which cell this fragment belongs to
  // (in real screen pixels, not UV space -- see HOVER_CELL_SIZE_PX above),
  // that cell's distance from the plane's own center (0 = center cell,
  // ~1 = a corner cell), a start-delay proportional to that distance (so
  // the reveal visibly ripples outward from the center, not a simultaneous
  // whole-image fade), and a per-cell cosine ease over its own local
  // window. Every fragment inside the same cell shares an identical
  // dist/eased value (floor() is per-cell, not per-pixel), so each square
  // reveals as one flat unit, exactly like the reference.
  vec2 cellCoord = floor(cardUv * uRectPixelSize / HOVER_CELL_SIZE_PX);
  vec2 cellCount = max(ceil(uRectPixelSize / HOVER_CELL_SIZE_PX), vec2(1.0));
  vec2 cellCenterFrac = (cellCoord + 0.5) / cellCount;
  float dist = clamp(length(cellCenterFrac - 0.5) / length(vec2(0.5)), 0.0, 1.0);
  float cellStart = dist * (1.0 - HOVER_CELL_LOCAL_WINDOW);
  float cellLocalT = clamp((uHoverProgress - cellStart) / HOVER_CELL_LOCAL_WINDOW, 0.0, 1.0);
  float eased = 0.5 - 0.5 * cos(cellLocalT * 3.14159265);
  float cellMix = mix(uHoverFrom, uHoverTarget, eased) * uHasHoverMap;

  vec3 blended = mix(baseColor.rgb, hoverColor.rgb, cellMix);
  // Top-edge atmosphere sampling REMOVED (2026-09-21): a dense per-fragment
  // disk-sample blur (progressiveBlur, 80 taps) triggered across a second
  // (top-proximity) screen region caused real runtime instability -- likely
  // many on-screen cards' top edges simultaneously entering the expensive
  // branch at once during scroll, on top of the bottom region already
  // doing the same work. The top viewport-edge effect now lives entirely
  // outside this shader as a single CSS backdrop-filter layer
  // (TopViewportBlur.tsx) -- one viewport-level effect instead of N
  // per-project GPU sampling passes. Bottom progressive blur is UNCHANGED.
  float viewportY = gl_FragCoord.y / max(uViewportHeight, 1.0);
  float bottomProximity = 1.0 - smoothstep(0.0, 0.28, viewportY);
  float radiusPx = uAtmosphereEnabled * (32.0 + 8.0 * uAtmosphereStrength) * bottomProximity;
  if (radiusPx > 0.06) {
    vec2 radiusUv = uCoverScale * radiusPx / max(uRectPixelSize, vec2(1.0));
    blended = progressiveBlur(uv, cellMix, radiusUv);
  }
  float alpha = mix(baseColor.a, hoverColor.a, cellMix);
  gl_FragColor = vec4(linearToSRGB(blended), alpha);
}
`;
