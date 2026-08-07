import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, "dist");
const markerFile = path.join(root, "private", "privacy-markers.private.txt");
const forbidden = [
  "/private/resume",
  "__local-private/resume",
  "resume.zh.private.json",
  "resume.en.private.json",
  "PRIVATE RESUME",
  "IMPORT EXISTING RESUME PDF",
  "One Pager Doc in Dark Green Bright Green Friendly Corporate Style.pdf",
  "dilida-portfolio-private-resume-assets",
  "__local-private/resume/export",
];

try {
  const localMarkers = (await fs.readFile(markerFile, "utf8")).split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  forbidden.push(...localMarkers);
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

async function filesIn(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const value = path.join(directory, entry.name);
    return entry.isDirectory() ? filesIn(value) : [value];
  }));
  return nested.flat();
}

const failures = [];
for (const file of await filesIn(dist)) {
  const bytes = await fs.readFile(file);
  const text = bytes.toString("utf8");
  for (const marker of forbidden) {
    if (marker && text.includes(marker)) failures.push(`${path.relative(dist, file)} contains ${JSON.stringify(marker)}`);
  }
}

const publishedPath = path.join(dist, "publishedPortfolio.json");
try {
  const published = await fs.readFile(publishedPath, "utf8");
  if (/privateResume|resumeDocument|resume\.zh\.private|resume\.en\.private/i.test(published)) failures.push("publishedPortfolio.json contains resume data");
} catch {}

if (failures.length) {
  console.error("Production privacy verification failed:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}
console.log(`Production privacy verification passed (${forbidden.length} marker${forbidden.length === 1 ? "" : "s"}).`);
