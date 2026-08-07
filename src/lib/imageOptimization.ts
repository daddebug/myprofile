const MAX_DISPLAY_DIMENSION = 2200;
const DISPLAY_WEBP_QUALITY = 0.88;

function computeTargetDimensions(width: number, height: number, maxLongestEdge: number) {
  const longestEdge = Math.max(width, height);
  if (longestEdge <= maxLongestEdge) return { width, height };
  const scale = maxLongestEdge / longestEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function canvasToWebp(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/webp", quality);
  });
}

/**
 * Downscales and re-encodes an uploaded image for display use (never upscales,
 * preserves aspect ratio and transparency, skips animated GIFs). Returns the
 * original file unchanged if the source is a GIF or if decoding/encoding fails
 * for any reason, so callers can always store the returned blob safely.
 */
export async function optimizeUploadedImage(
  file: Blob,
  maxLongestEdge: number = MAX_DISPLAY_DIMENSION,
  quality: number = DISPLAY_WEBP_QUALITY,
): Promise<Blob> {
  if (file.type === "image/gif") return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  try {
    const { width, height } = computeTargetDimensions(bitmap.width, bitmap.height, maxLongestEdge);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, width, height);
    const optimized = await canvasToWebp(canvas, quality);
    if (!optimized || optimized.type !== "image/webp" || optimized.size === 0) return file;
    return optimized;
  } catch {
    return file;
  } finally {
    bitmap.close();
  }
}
