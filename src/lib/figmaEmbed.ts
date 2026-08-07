const FIGMA_HOSTS = new Set(["figma.com", "www.figma.com", "embed.figma.com"]);

// Query parameters Figma documents as safe to carry into an Embed Kit 2.0 URL.
// Anything not in this list (tracking params, unknown junk, etc.) is stripped.
const SAFE_EMBED_PARAMS = [
  "node-id",
  "starting-point-node-id",
  "scaling",
  "content-scaling",
  "page-id",
  "viewport-controls",
  "hotspot-hints",
  "hide-ui",
];

// Figma's Embed Kit 2.0 rejects any embed.figma.com URL missing this param
// with "Not a valid embed context" (confirmed against a real prototype link
// in a real browser — the page loads but renders nothing except the Figma
// logo, which is exactly the "white area" symptom). It identifies the
// embedding site, not the user's link, so we set it ourselves rather than
// reading it from the pasted URL.
const EMBED_HOST = "dilida-portfolio";

export type FigmaPrototypeUrlError =
  | "invalid-url"
  | "unsupported-host"
  | "not-a-prototype-url"
  | "missing-file-key";

export type FigmaPrototypeUrlResult =
  | { ok: true; sourceUrl: string; embedUrl: string }
  | { ok: false; error: FigmaPrototypeUrlError };

const ERROR_MESSAGES: Record<FigmaPrototypeUrlError, string> = {
  "invalid-url": "Enter a valid URL.",
  "unsupported-host": "This must be a figma.com, www.figma.com, or embed.figma.com link.",
  "not-a-prototype-url": "This looks like a Figma design/file link, not a prototype link. Open the file in Figma, click Present (or Share), and copy the prototype link from there.",
  "missing-file-key": "This Figma prototype link is missing its file key.",
};

export function figmaPrototypeUrlErrorMessage(error: FigmaPrototypeUrlError) {
  return ERROR_MESSAGES[error];
}

/**
 * Validates a pasted Figma prototype URL and derives an Embed Kit 2.0
 * (embed.figma.com/proto/...) URL from it. Only figma.com/proto/... links are
 * accepted — design/file URLs are rejected with a specific error so the
 * editor can explain why. The embed URL keeps only a documented allowlist of
 * query parameters; the source URL is preserved as-is for the visible
 * "open in Figma" link.
 */
export function normalizeFigmaPrototypeUrl(input: string): FigmaPrototypeUrlResult {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return { ok: false, error: "invalid-url" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, error: "invalid-url" };

  const hostname = url.hostname.toLowerCase();
  if (!FIGMA_HOSTS.has(hostname)) return { ok: false, error: "unsupported-host" };

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments[0] !== "proto") return { ok: false, error: "not-a-prototype-url" };

  const fileKey = segments[1];
  if (!fileKey) return { ok: false, error: "missing-file-key" };
  const fileName = segments[2];

  const embedPath = fileName ? `/proto/${fileKey}/${fileName}` : `/proto/${fileKey}`;
  const embedUrl = new URL(embedPath, "https://embed.figma.com");
  for (const param of SAFE_EMBED_PARAMS) {
    const value = url.searchParams.get(param);
    if (value) embedUrl.searchParams.set(param, value);
  }
  embedUrl.searchParams.set("embed-host", EMBED_HOST);

  return { ok: true, sourceUrl: url.toString(), embedUrl: embedUrl.toString() };
}
