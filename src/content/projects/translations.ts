import type { ProjectTranslationFile } from "./schema";
import { content as practiceZh } from "./ui-personal-practice/zh";
import { content as practiceEn } from "./ui-personal-practice/en";

const bySlug = (files: ProjectTranslationFile[]) =>
  Object.fromEntries(files.map((file) => [file.slug, file]));

export const zhProjectFiles = bySlug([practiceZh]);
export const enProjectFiles = bySlug([practiceEn]);

export function getProjectTranslation(slug: string, locale: "zh" | "en") {
  return (locale === "zh" ? zhProjectFiles : enProjectFiles)[slug];
}
