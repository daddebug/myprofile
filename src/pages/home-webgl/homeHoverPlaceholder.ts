// Homepage 3.0 -- hover-only temporary asset generator. Deliberately
// scoped to hover art alone (per explicit instruction: this pass makes
// ZERO layout/composition changes, restores the previous Homepage visual
// baseline, and adds only the square-cell hover reveal on top of it). No
// project has real alternate-state hover art yet, so every card gets a
// generated placeholder here -- swapping in real hover art later only
// ever means replacing this file's output for that project id, never
// touching HomeProjectFlow.tsx's layout.
const PLACEHOLDER_PALETTE = [
  { bg: "#2f3d2a", fg: "#f4f3e8" }, // dark forest green
  { bg: "#5b6b61", fg: "#f7f6ed" }, // gray-green
  { bg: "#414f63", fg: "#eef1f5" }, // desaturated blue
  { bg: "#2b2b28", fg: "#efe9da" }, // charcoal
  { bg: "#7a5f47", fg: "#f7f1e6" }, // muted warm accent
];

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function wrapLines(text: string, maxChars: number, maxLines: number): string[] {
  const hasSpaces = text.includes(" ");
  const units = hasSpaces ? text.split(" ") : text.split("");
  const lines: string[] = [];
  let current = "";
  for (const unit of units) {
    const next = current ? (hasSpaces ? `${current} ${unit}` : `${current}${unit}`) : unit;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = unit;
      if (lines.length === maxLines - 1) break;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  if (lines.length > maxLines) lines.length = maxLines;
  return lines;
}

// Square-shaped by default (Haoqi-style hover cells are square) -- but
// takes explicit width/height so it renders at the SAME aspect ratio as
// the card's own real footprint (the baseline layout's own width/height,
// unchanged by this pass), so the WebGL cover-crop never has to crop this
// placeholder itself.
export function buildHoverPlaceholder(options: {
  index: number;
  title: string;
  category: string;
  width: number;
  height: number;
}): string {
  const { index, title, category, width, height } = options;
  const palette = PLACEHOLDER_PALETTE[(index + 1) % PLACEHOLDER_PALETTE.length];
  const indexLabel = String(index + 1).padStart(2, "0");
  const categoryLines = category
    .split("/")
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 2);
  const titleLines = wrapLines(title, 10, 2);

  const shapeCx = width * 0.8;
  const shapeCy = height * 0.24;
  const shapeR = Math.min(width, height) * 0.15;
  const strokeWidth = Math.max(1.5, width * 0.004);

  const indexSize = Math.max(18, height * 0.14);
  const categorySize = Math.max(10, height * 0.042);
  const titleSize = Math.max(13, height * 0.06);
  const padX = width * 0.09;

  const categoryMarkup = categoryLines
    .map(
      (line, i) =>
        `<text x="${padX}" y="${height * 0.36 + i * categorySize * 1.5}" font-family="Inter, 'Noto Sans SC', sans-serif" font-size="${categorySize}" letter-spacing="2" fill="${palette.fg}" fill-opacity="0.68">${escapeXml(line)}</text>`,
    )
    .join("");
  const titleMarkup = titleLines
    .map(
      (line, i) =>
        `<text x="${padX}" y="${height * 0.86 + i * titleSize * 1.3}" font-family="Inter, 'Noto Sans SC', sans-serif" font-weight="600" font-size="${titleSize}" fill="${palette.fg}">${escapeXml(line)}</text>`,
    )
    .join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect width="${width}" height="${height}" fill="${palette.bg}"/>` +
    `<circle cx="${shapeCx}" cy="${shapeCy}" r="${shapeR}" fill="none" stroke="${palette.fg}" stroke-opacity="0.32" stroke-width="${strokeWidth}"/>` +
    `<text x="${padX}" y="${height * 0.2}" font-family="'IBM Plex Mono', monospace" font-size="${indexSize}" font-weight="700" fill="${palette.fg}" fill-opacity="0.92">${indexLabel}</text>` +
    categoryMarkup +
    titleMarkup +
    `</svg>`;

  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}
