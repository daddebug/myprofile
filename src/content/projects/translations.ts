import type { ProjectTranslationFile } from "./schema";
import { content as crossZh } from "./cross-platform-game-ux/zh";
import { content as crossEn } from "./cross-platform-game-ux/en";
import { content as caseZh } from "./game-ux-case-study/zh";
import { content as caseEn } from "./game-ux-case-study/en";
import { content as jamZh } from "./from-theme-to-playable-rule/zh";
import { content as jamEn } from "./from-theme-to-playable-rule/en";
import { content as threeDCharacterZh } from "./3d-character-ui-rhythm/zh";
import { content as threeDCharacterEn } from "./3d-character-ui-rhythm/en";
import { content as ktvZh } from "./ktv-tablet-interface/zh";
import { content as ktvEn } from "./ktv-tablet-interface/en";
import { content as playableZh } from "./playable-web-game-prototype/zh";
import { content as playableEn } from "./playable-web-game-prototype/en";
import { content as visualZh } from "./visual-system-ui-art/zh";
import { content as visualEn } from "./visual-system-ui-art/en";
import { content as practiceZh } from "./ui-personal-practice/zh";
import { content as practiceEn } from "./ui-personal-practice/en";

const bySlug = (files: ProjectTranslationFile[]) =>
  Object.fromEntries(files.map((file) => [file.slug, file]));

export const zhProjectFiles = bySlug([crossZh, caseZh, threeDCharacterZh, jamZh, ktvZh, playableZh, visualZh, practiceZh]);
export const enProjectFiles = bySlug([crossEn, caseEn, threeDCharacterEn, jamEn, ktvEn, playableEn, visualEn, practiceEn]);

export function getProjectTranslation(slug: string, locale: "zh" | "en") {
  return (locale === "zh" ? zhProjectFiles : enProjectFiles)[slug];
}
