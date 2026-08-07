import metadata from "../data/uiPracticeMetadata.json";
import { stemOf, UI_PRACTICE_DIMENSIONS } from "./uiPracticeDimensions";

export type UiPracticeCatalogItem = {
  id: string;
  filename: string;
  src: string;
  title: string;
  description: string;
  order: number;
  width?: number;
  height?: number;
};

type UiPracticeCollection = {
  version: 1;
  items: Array<{ id: string; filename: string; title: string; description: string; order: number }>;
};

// Points at the optimized WebP display assets (src/assets/ui-practice-optimized/),
// not the raw originals in src/assets/ui-practice/ — those stay in the repo
// untouched but are no longer imported, so they aren't part of the production build.
const imageModules = import.meta.glob("../assets/ui-practice-optimized/*.{png,jpg,jpeg,webp,avif}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

function filenameFromPath(path: string) {
  return path.split("/").pop() ?? path;
}

export function getUiPracticeCatalog(): UiPracticeCatalogItem[] {
  const collection = metadata as UiPracticeCollection;
  // Matched by filename stem (no extension) so metadata entries like
  // "Y3K尝试1.png" still resolve to the optimized "Y3K尝试1.webp" asset.
  const modulesByStem = new Map(Object.entries(imageModules).map(([path, src]) => [stemOf(filenameFromPath(path)), src]));
  if (collection.version !== 1 || !Array.isArray(collection.items)) return [];
  return collection.items.flatMap((item, index) => {
    const stem = stemOf(item.filename);
    const src = modulesByStem.get(stem);
    if (!src) return [];
    const dimensions = UI_PRACTICE_DIMENSIONS[stem];
    return [{
      ...item,
      src,
      order: Number.isFinite(item.order) ? item.order : index + 1,
      width: dimensions?.width,
      height: dimensions?.height,
    }];
  }).sort((a, b) => a.order - b.order);
}
