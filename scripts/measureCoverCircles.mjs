// Companion to measureCoverReference.mjs: connected-component labeling of
// the acid-green mask to get each circle's real center + radius (the
// circles don't overlap each other, so flood-fill blobs map 1:1 to circles
// — unlike the panels, which do overlap and can't be blob-separated this
// way).
import sharp from "sharp";

const inputPath = process.argv[2];
const { data, info } = await sharp(inputPath).raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;

function pixelAt(x, y) {
  const idx = (y * width + x) * channels;
  return { r: data[idx], g: data[idx + 1], b: data[idx + 2] };
}
function isAcidGreen(p) {
  return p.g > 140 && p.g - p.r > 40 && p.g - p.b > 60;
}

// Only scan the graphic region (above the title/TOC) so TOC-node green
// circles and title text don't get picked up as "graphic" circles.
const scanBox = { x0: 0, y0: 0, x1: width, y1: 600 };

const visited = new Uint8Array(width * height);
const blobs = [];
for (let y = scanBox.y0; y < scanBox.y1; y++) {
  for (let x = scanBox.x0; x < scanBox.x1; x++) {
    const idx = y * width + x;
    if (visited[idx]) continue;
    if (!isAcidGreen(pixelAt(x, y))) continue;
    // BFS flood fill
    const stack = [[x, y]];
    visited[idx] = 1;
    let minX = x, maxX = x, minY = y, maxY = y, count = 0;
    while (stack.length) {
      const [cx, cy] = stack.pop();
      count++;
      if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
      const neighbors = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
      for (const [nx, ny] of neighbors) {
        if (nx < scanBox.x0 || nx >= scanBox.x1 || ny < scanBox.y0 || ny >= scanBox.y1) continue;
        const nIdx = ny * width + nx;
        if (visited[nIdx]) continue;
        if (!isAcidGreen(pixelAt(nx, ny))) continue;
        visited[nIdx] = 1;
        stack.push([nx, ny]);
      }
    }
    if (count > 30) {
      blobs.push({
        cx: Math.round((minX + maxX) / 2),
        cy: Math.round((minY + maxY) / 2),
        r: Math.round(((maxX - minX) + (maxY - minY)) / 4),
        pixelCount: count,
        bbox: { minX, maxX, minY, maxY },
      });
    }
  }
}
blobs.sort((a, b) => a.cx - b.cx);
console.log(JSON.stringify(blobs, null, 2));
