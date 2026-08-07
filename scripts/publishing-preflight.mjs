import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { buildPublishingPreflight } from "./publishing-preflight-lib.mjs";

const bundlePath = process.argv[2];
if (!bundlePath) {
  console.error("Usage: pnpm portfolio:preflight -- <production-export.json>");
  process.exit(1);
}

const root = process.cwd();
const bundle = JSON.parse(await readFile(path.resolve(bundlePath), "utf8"));
const manifest = await buildPublishingPreflight({ root, bundle });
const outputPath = path.join(root, "output", "publishing-preflight-manifest.json");
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(`Publishing preflight: ${manifest.ok ? "passed" : "failed"}`);
console.log(`Projects: ${manifest.projects.length}`);
console.log(`Content records: ${manifest.contentRecords.length}`);
console.log(`Assets: ${manifest.assets.length}`);
console.log(`Errors: ${manifest.issues.filter((issue) => issue.severity === "error").length}`);
console.log(`Manifest: ${outputPath}`);
if (!manifest.ok) process.exit(1);
