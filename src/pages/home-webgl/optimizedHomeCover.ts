import variantsByPath from "./home-cover-derivatives.json";

type Variant = { width: number; path: string; bytes: number };
const variants = variantsByPath as Record<string, Variant[]>;

export function optimizedHomeCoverUrl(url: string, displayWidth: number, pixelRatio = window.devicePixelRatio || 1): string {
  if (!url) return url;
  let pathname: string;
  try {
    pathname = new URL(url, window.location.href).pathname;
  } catch {
    return url;
  }
  const choices = variants[pathname];
  if (!choices?.length) return url;
  const requiredWidth = displayWidth * pixelRatio;
  return choices.find((choice) => choice.width >= requiredWidth)?.path ?? choices[choices.length - 1].path;
}
