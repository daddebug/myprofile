// Export-only, in-page image right-sizing for the PDF capture pipeline.
//
// Root cause this addresses: Chromium's page.pdf() always embeds a raster
// <img> at its full natural/decoded pixel resolution, flattened to raw
// FlateDecode samples, regardless of how small the image is actually
// displayed on the page — so a source screenshot far larger than its CSS
// display box balloons the PDF for no visual benefit. The fix belongs here,
// upstream of print, not as a post-hoc rewrite of the finished PDF's image
// objects (see the "Fix upstream root causes" rule in CLAUDE.md).
//
// This function runs ONLY inside page.evaluate() — i.e. only inside the
// disposable, headless Playwright tab used for one capture, and only for
// the few seconds between layout settling and page.pdf() being called. It:
// - never touches IndexedDB, localStorage, or any file the owner edits;
// - never changes DOM structure, layout, typography, or link targets;
// - resizes purely based on each image's own real rendered CSS box size,
//   with no awareness of image "type" (photo/UI/graphic) or which project
//   it belongs to.
//
// Must stay a single self-contained, zero-argument function: Playwright's
// page.evaluate(fn) (no-arg overload) requires fn to accept no parameters,
// and serializes it via Function.prototype.toString() to re-execute the
// source in the browser — so it cannot close over any outer-scope
// variable, only its own locals.
export async function resizeOversizedExportImages(): Promise<void> {
  const retinaFactor = 2; // headroom above 1x CSS pixels so UI screenshots and small text stay sharp on screen
  const oversizeRatio = 1.2; // only resize when the source is at least ~20% above the retina-safe target
  const images = Array.from(document.images);
  for (const img of images) {
    const rect = img.getBoundingClientRect();
    const cssWidth = rect.width;
    const cssHeight = rect.height;
    if (!cssWidth || !cssHeight) continue; // hidden/collapsed — nothing to size against
    if (!img.naturalWidth || !img.naturalHeight) continue; // failed/unloaded — leave untouched

    const targetWidth = cssWidth * retinaFactor;
    const targetHeight = cssHeight * retinaFactor;
    const oversizedWidth = img.naturalWidth > targetWidth * oversizeRatio;
    const oversizedHeight = img.naturalHeight > targetHeight * oversizeRatio;
    if (!oversizedWidth && !oversizedHeight) continue; // not meaningfully oversized — leave untouched

    // A single uniform scale (the tighter of the two axes) keeps the
    // resized bitmap's own aspect ratio identical to the source's —
    // never stretches to fill the CSS box, which may itself crop the
    // image via object-fit; that cropping behavior is unaffected since it
    // happens at render time against whatever bitmap the <img> holds.
    const scale = Math.min(targetWidth / img.naturalWidth, targetHeight / img.naturalHeight);
    if (scale >= 1) continue;
    const newWidth = Math.max(1, Math.round(img.naturalWidth * scale));
    const newHeight = Math.max(1, Math.round(img.naturalHeight * scale));

    try {
      const canvas = document.createElement("canvas");
      canvas.width = newWidth;
      canvas.height = newHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.drawImage(img, 0, 0, newWidth, newHeight);
      const dataUrl = canvas.toDataURL("image/png");

      // Pin the rendered box to its already-measured CSS size before
      // swapping the bitmap — some images are sized purely by their own
      // intrinsic resolution (no explicit CSS width/height), and shrinking
      // the underlying bitmap would otherwise shrink the rendered layout
      // too. This inline style is a no-op for images already constrained
      // by CSS, and a safety pin for the rest.
      img.style.width = `${cssWidth}px`;
      img.style.height = `${cssHeight}px`;
      // srcset/sizes take priority over src for responsive images — clear
      // them so the browser can't revert to the original-resolution
      // resource on the next layout pass.
      img.removeAttribute("srcset");
      img.removeAttribute("sizes");
      img.src = dataUrl;
      await img.decode?.().catch(() => undefined);
    } catch {
      // Canvas read/draw failed (e.g. a tainted canvas) — leave this one
      // image exactly as it was rather than risk a broken export.
    }
  }
}
