import type { Locale } from "../../locales/types";

export type LocalizedProjectImage =
  | { shared: string }
  | { zh: string; en: string };

export type ProjectTranslationFile = {
  slug: string;
  locale: Locale;
  status: "complete" | "todo";
  hero?: {
    durationLabel: string;
  };
  image?: LocalizedProjectImage;
  images: Record<string, LocalizedProjectImage>;
};
