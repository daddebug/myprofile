import { stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const publishedIds = [
  "project-1ua2677",
  "project-1ied3i",
  "project-e51ezw",
  "project-1op4ad7",
  "googo-ai-pt5mwd",
  "case-odvwa3",
];
const localNames = [
  "project-cover-mu7ohxlj-56fb4c87-8011-4a37-bc69-5d4ae4a848bf",
  "project-cover-mtprguen-43dead57-d379-4ad9-860a-fc53dee95957",
  "project-cover-mu9ltec1-84ea361f-6a79-4d1a-bc17-216a3eb2e333",
  "project-cover-muaji4rl-8000a749-eacf-4787-9260-69d7b574dedc",
  "project-cover-muajj7so-8da534ef-2aec-4858-bd91-1a771152eb87",
  "project-cover-muajjxxm-a3143079-4456-4964-8b11-748b625d99a7",
];
const paths = [
  ...publishedIds.map((id) => `/images/published/covers/${id}.png`),
  ...localNames.map((name) => `/portfolio-assets/project-covers/${name}.png`),
];
const manifest = {};

for (const publicPath of paths) {
  const sourcePath = path.join("public", publicPath.slice(1));
  const { width } = await sharp(sourcePath).metadata();
  const variants = [];
  for (const targetWidth of [640, 1280, 1920]) {
    if (targetWidth > 1280 && width < 1600) continue;
    const variantPath = publicPath.replace(/\.png$/, `-w${targetWidth}.webp`);
    const outputPath = path.join("public", variantPath.slice(1));
    await sharp(sourcePath)
      .resize({ width: targetWidth, withoutEnlargement: true })
      .webp({ quality: 82, effort: 5 })
      .toFile(outputPath);
    variants.push({ width: targetWidth, path: variantPath, bytes: (await stat(outputPath)).size });
  }
  manifest[publicPath] = variants;
  console.log(`${publicPath}: ${variants.map((variant) => `${variant.width}px=${variant.bytes}B`).join(", ")}`);
}

await writeFile("src/pages/home-webgl/home-cover-derivatives.json", `${JSON.stringify(manifest, null, 2)}\n`);
