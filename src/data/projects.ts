import type { Project, ProjectCategory } from "../types/project";

export const categories: ProjectCategory[] = [
  "UX / Product Design",
  "Game UX",
  "Indie Games",
  "Visual / UI Art",
  "Research / Case Study",
  "Experiments",
];

export const projects: Project[] = [
  {
    slug: "ui-personal-practice",
    title: "UI Personal Practice",
    subtitle: "A running visual archive of personal UI exercises, interface studies, and game UI explorations.",
    category: "Visual / UI Art",
    type: "UI Art",
    year: "2026",
    cover: "",
    images: [],
    summary:
      "A growing collection of personal UI practice pieces managed by dropping images into the project and arranging them locally.",
    background:
      "This archive is designed as a visual shelf for interface practice rather than a formal case study.",
    role: "UI designer, visual designer",
    timeline: "Ongoing",
    tools: ["Figma", "Photoshop", "Illustrator"],
    designGoals: [
      "Keep UI screenshots large and readable.",
      "Preserve original image proportions.",
      "Make future image additions easy to manage.",
    ],
    process: [
      "Drop image files into the UI practice folder.",
      "Open the local edit mode to adjust order and optional text.",
      "Save metadata back into the project source.",
    ],
    highlights: ["UI art practice", "Visual archive", "Local metadata workflow"],
    blocks: [],
  },
];

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
