import type { ReactNode } from "react";
import { projectHeroTextWidth } from "../lib/caseStudyLayout";

export function ProjectHeroTitleSummary({ children }: { children: ReactNode }) {
  return <div className={`min-w-0 md:ml-5 ${projectHeroTextWidth.title}`}>{children}</div>;
}
