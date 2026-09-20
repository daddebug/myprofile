// Homepage 3.0, Haoqi-track Phase 3 (cover crop) + Phase 4 (scroll-
// velocity UV distortion). `uCoverScale` reproduces CSS
// `object-fit: cover`'s crop math (no stretching, natural proportions
// preserved) -- needed because THIS project's Phase 1 grid assigns a
// fixed grid-span box independent of the cover's own aspect ratio,
// unlike Haoqi's own DOM (its placeholder's `aspect-ratio` CSS always
// equals the image's natural ratio by construction, so its shader never
// needs a crop step at all -- see haoqi-design-teardown.md section 3).
// That's a real, disclosed architectural difference rooted in an
// already-approved earlier phase, not an oversight.
//
// Phase 4.1 audit (haoqi-design-teardown.md section 4.2, GLSL extracted
// directly off the live compiled GPU program): the distortion below now
// matches the confirmed reference algorithm exactly --
//   - unsigned velocity (`Math.abs`), normalized 0..1 (not signed -1..1
//     -- corrects this round's original Phase 4 spec, which asked for a
//     signed effect; the real site has none)
//   - horizontal multiplicative squeeze (`uvScale = 1 - profile*curl`),
//     not a vertical additive offset
//   - squeeze pivots on the VIEWPORT's own horizontal center
//     (`screenUv.x - 0.5`), not each card's local center -- so an
//     off-center card is pulled asymmetrically toward screen-center,
//     exactly like the reference
//   - distortion is applied to the absolute screen-space UV FIRST, and
//     the card-local (then cover-cropped) UV is derived from that
//     already-distorted coordinate afterward -- same order as the
//     reference's `applyCurl(vUv)` -> `localUv`
//
// Vertex shader still does the standard MVP transform for POSITIONING
// (Phase 3's plane geometry/camera are unchanged) rather than Haoqi's
// literal `gl_Position = vec4(position,1.0)` on a full-viewport quad
// per layer -- that's a deliberate, disclosed deviation: the teardown
// itself flags the full-screen-quad-per-layer approach as the one part
// of the reference it does NOT recommend copying (N visible covers = N
// full-screen overdraws), and recommends instead scaling the quad to
// its actual rect -- which is exactly what this file already did before
// this round's fix, so it's kept as-is.
export const COVER_VERTEX_SHADER = `
varying vec2 vUv;
varying vec2 vScreenUv;
void main() {
  vUv = uv;
  vec4 clipPosition = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vScreenUv = vec2(
    0.5 + (clipPosition.x / clipPosition.w) * 0.5,
    0.5 - (clipPosition.y / clipPosition.w) * 0.5
  );
  gl_Position = clipPosition;
}
`;

export const COVER_FRAGMENT_SHADER = `
uniform sampler2D uMap;
uniform vec2 uCoverScale;
uniform float uCurlStrength;
uniform vec2 uRectOrigin;
uniform vec2 uRectSize;
varying vec2 vUv;
varying vec2 vScreenUv;

// Same formula as Three.js's own sRGBTransferOETF (IEC 61966-2-1) --
// see this file's own top comment for why it's written out explicitly
// rather than via "#include <colorspace_fragment>" (that include
// reproducibly broke this material -- confirmed by toggling it).
vec3 linearToSRGB(vec3 value) {
  vec3 low = value * 12.92;
  vec3 high = pow(value, vec3(1.0 / 2.4)) * 1.055 - vec3(0.055);
  return mix(high, low, vec3(lessThanEqual(value, vec3(0.0031308))));
}

void main() {
  // Confirmed reference algorithm (haoqi-design-teardown.md 4.2):
  // profile = 0 at viewport vertical center, 1 at top/bottom edges.
  float centered = 2.0 * vScreenUv.y - 1.0;
  float profile = 1.0 - sqrt(max(0.0, 1.0 - centered * centered));
  float uvScale = 1.0 - profile * uCurlStrength;
  float distortedScreenX = (vScreenUv.x - 0.5) * uvScale + 0.5;

  // Only X is reconstructed from absolute screen space (the squeeze
  // pivots on the viewport's own center, per the reference). Y is left
  // as the plane's own native UV -- PlaneGeometry's v=0-at-bottom
  // convention doesn't match vScreenUv's v=0-at-top convention, and
  // Y was never meant to be touched by this distortion anyway (the
  // confirmed reference only ever modifies screenUv.x; screenUv.y only
  // ever feeds the profile above, never the sample position). Rebuilding
  // Y from screen space instead of vUv.y is what caused a real vertical
  // flip during testing -- confirmed by direct visual inspection, fixed
  // by leaving vUv.y alone.
  float localU = (distortedScreenX - uRectOrigin.x) / uRectSize.x;
  vec2 localUv = vec2(localU, vUv.y);
  vec2 uv = (localUv - 0.5) / uCoverScale + 0.5;
  uv = clamp(uv, 0.0, 1.0);

  vec4 sampledColor = texture2D(uMap, uv);
  gl_FragColor = vec4(linearToSRGB(sampledColor.rgb), sampledColor.a);
}
`;

