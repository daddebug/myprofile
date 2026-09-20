// Homepage 3.0, Haoqi-track Phase 3: checked once before mounting the
// R3F <Canvas> at all -- if this returns false (or the Canvas still
// throws for some other reason at runtime), HomeProjectCanvas is never
// rendered, no project ever gets marked ready via the registry, and every
// HomeProjectCard's DOM <img> simply stays at its default opacity. The
// fallback is the absence of a feature, not a special-cased branch.
export function isWebglSupported(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2") ?? canvas.getContext("webgl") ?? canvas.getContext("experimental-webgl");
    return Boolean(context);
  } catch {
    return false;
  }
}
