import type { Project, ProjectCategory } from "../types/project";

export const categories: ProjectCategory[] = [
  "UX / Product Design",
  "Game UX",
  "Indie Games",
  "Visual / UI Art",
  "Research / Case Study",
  "Experiments",
];

// ui-personal-practice (the sole entry here) was retired from the
// portfolio entirely -- its 23 UI images will resurface later as separate,
// individually-scoped projects/content instead of one "UI Practice"
// collection. Kept as an empty array (not deleted outright) since
// projectMetadata.ts's projectDefaults/archiveOrder machinery maps over
// this array generically for any future source-controlled project added
// the same way.
export const projects: Project[] = [];

export const playableProjects = projects.filter((project) => project.playable);

export const getProjectBySlug = (slug: string) =>
  projects.find((project) => project.slug === slug);

export const getAdjacentProjects = (slug: string) => {
  const index = projects.findIndex((project) => project.slug === slug);
  if (index === -1) {
    return { previous: undefined, next: undefined };
  }

  return {
    previous: projects[(index - 1 + projects.length) % projects.length],
    next: projects[(index + 1) % projects.length],
  };
};
