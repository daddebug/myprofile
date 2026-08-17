// Shared helper: measures every real <img> element's natural (decoded)
// pixel size and actual CSS-rendered display size across a set of real
// project routes, at the same 1440px capture width the canonical
// renderer uses. Read-only DOM measurement — never generates a PDF, never
// touches page content. Used by both the size-audit script and the PDF
// image optimizer (to know each embedded image's real display size before
// deciding whether to downsample it).
import fs from "node:fs/promises";
import path from "node:path";

export async function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe") : undefined,
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try the next standard Chrome location.
    }
  }
  throw new Error("Google Chrome was not found in a standard Windows installation path.");
}

// Returns [{ route, images: [{ src, naturalWidth, naturalHeight, cssWidth, cssHeight }] }]
export async function measureProjectImages(projectRoutes, origin, { browser: providedBrowser } = {}) {
  const { chromium } = await import("playwright-core");
  const browser = providedBrowser ?? (await chromium.launch({ headless: true, executablePath: await findChrome() }));
  const results = [];
  try {
    for (const route of projectRoutes) {
      // A tall fixed viewport (taller than any real project page) so every
      // image is "in view" immediately — otherwise loading="lazy" images
      // below the fold never fetch and never report a real natural size.
      const page = await browser.newPage({ viewport: { width: 1440, height: 16000 }, deviceScaleFactor: 1 });
      try {
        await page.goto(`${origin}${route}`, { waitUntil: "networkidle", timeout: 45000 });
        await page.evaluate(async () => {
          await Promise.all(Array.from(document.images).map((img) => img.decode().catch(() => undefined)));
        });
        await page.waitForTimeout(300);
        const measured = await page.evaluate(() => Array.from(document.querySelectorAll("img")).map((img) => {
          const rect = img.getBoundingClientRect();
          return {
            src: img.currentSrc || img.src,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
            cssWidth: Math.round(rect.width),
            cssHeight: Math.round(rect.height),
          };
        }).filter((entry) => entry.naturalWidth > 0 && entry.cssWidth > 0));
        results.push({ route, images: measured });
      } finally {
        await page.close().catch(() => undefined);
      }
    }
  } finally {
    if (!providedBrowser) await browser.close().catch(() => undefined);
  }
  return results;
}

// Convenience: builds the "widthxheight" -> displayed CSS width map the
// optimizer consumes directly (first-match wins; exact natural-pixel-size
// matching is a reliable key since Chromium's print pipeline embeds
// images at their natural decoded resolution).
export function buildDomSizeMap(domReport) {
  const map = new Map();
  for (const { images } of domReport) {
    for (const img of images) {
      const key = `${img.naturalWidth}x${img.naturalHeight}`;
      if (!map.has(key)) map.set(key, img.cssWidth);
    }
  }
  return map;
}
