import { projects } from "../data/projects";
import { CROSS_PLATFORM_DRAFT_STORAGE_KEY } from "./crossPlatformDraftStorage";
import { GAME_JAM_DRAFT_STORAGE_KEY } from "./gameJamDraftStorage";
import { THREE_D_CHARACTER_DRAFT_STORAGE_KEY } from "./threeDCharacterDraftStorage";

export const PROJECT_PUBLIC_META_STORAGE_KEY = "dilida-portfolio:project-public-meta:v1";
export const PROJECT_PUBLIC_META_CHANGED_EVENT = "dilida-portfolio:project-public-meta-changed";

export type ProjectLocale = "zh" | "en";
export type HomepageProjectGroup = "featured" | "more";

export type ProjectPublicMetaOverride = {
  projectId: string;
  titleZh?: string;
  titleEn?: string;
  summaryZh?: string;
  summaryEn?: string;
  tagsZh?: string[];
  tagsEn?: string[];
  categoryZh?: string;
  categoryEn?: string;
  duration?: string;
  updatedAt?: string;
};

export type ProjectCatalogItem = {
  id: string;
  route?: string;
  titleZh: string;
  titleEn: string;
  summaryZh: string;
  summaryEn: string;
  tagsZh: string[];
  tagsEn: string[];
  categoryZh: string;
  categoryEn: string;
  duration?: string;
  homepageGroup?: HomepageProjectGroup;
  homepageOrder?: number;
  archiveOrder?: number;
  coverImage: string;
  comingSoon: boolean;
};

export type ResolvedProjectMetadata = ProjectCatalogItem & {
  title: string;
  summary: string;
  tags: string[];
  category: string;
};

type PublicMetaStore = {
  version: 1;
  projects: Record<string, Omit<ProjectPublicMetaOverride, "projectId">>;
};

const featuredOrder = [
  "cross-platform-game-ux",
  "3d-character-ui-rhythm",
  "from-theme-to-playable-rule",
];

const localizedDefaults: Partial<Record<string, Partial<ProjectCatalogItem>>> = {
  "cross-platform-game-ux": {
    titleZh: "成熟手游的小程序轻量化重构",
    titleEn: "Keeping the Game, Lightening the Experience",
    summaryZh: "围绕一款成熟手游的小程序适配，参与定义更轻量、可延展的 UI 方向。",
    summaryEn: "Rethinking interaction hierarchy for a lighter game platform.",
    tagsZh: ["游戏体验", "交互"],
    tagsEn: ["GAME UX", "INTERACTION"],
    categoryZh: "游戏体验 / 交互",
    categoryEn: "GAME UX / INTERACTION",
    coverImage: "/images/projects/cross-platform/cover.webp",
    homepageGroup: "featured",
    homepageOrder: 0,
  },
  "3d-character-ui-rhythm": {
    titleZh: "从系统驱动到体验驱动：重新分配界面节奏",
    titleEn: "From System-Driven to Experience-Driven: Redistributing Interface Rhythm",
    summaryZh: "在成熟养成框架中，重新组织高频系统操作与连续角色体验之间的注意力分配。",
    summaryEn: "Reorganizing attention between frequent system operations and more continuous character and content experiences within an established progression framework.",
    tagsZh: ["系统 UI", "交互原型"],
    tagsEn: ["SYSTEM UI", "INTERACTION PROTOTYPING"],
    categoryZh: "商业项目 / 早期研发",
    categoryEn: "COMMERCIAL PROJECT / EARLY DEVELOPMENT",
    coverImage: "/images/projects/3d-character-ui/cover.webp",
    homepageGroup: "featured",
    homepageOrder: 1,
  },
  "from-theme-to-playable-rule": {
    titleZh: "让主题真正改变玩家的行动",
    titleEn: "From Theme to Playable Rule",
    summaryZh: "在 Game Jam 的有限时间里，将“反转”从叙事概念转化为玩家能够直接感知的操作规则。",
    summaryEn: "Turning an abstract Game Jam theme into a rule players can experience through action.",
    tagsZh: ["GAME DESIGN", "RAPID PROTOTYPING"],
    tagsEn: ["GAME DESIGN", "RAPID PROTOTYPING"],
    categoryZh: "Game Jam / 游戏设计 / 快速原型",
    categoryEn: "GAME JAM / GAME DESIGN / RAPID PROTOTYPING",
    homepageGroup: "more",
    homepageOrder: 2,
  },
  "ui-personal-practice": {
    titleZh: "个人 UI 练习",
    titleEn: "UI Personal Practice",
    summaryZh: "持续整理个人界面练习、交互研究与游戏 UI 视觉探索。",
    summaryEn: "A running archive of interface studies and game UI visual work.",
    tagsZh: ["UI 视觉", "个人练习"],
    tagsEn: ["UI ART", "ARCHIVE"],
    categoryZh: "UI 视觉 / 个人练习",
    categoryEn: "UI ART / PERSONAL PRACTICE",
    homepageGroup: "more",
    homepageOrder: 0,
  },
};

const archiveOrderById = new Map([
  ...featuredOrder.map((id, index) => [id, index] as const),
  ...projects
    .filter((project) => !featuredOrder.includes(project.slug))
    .map((project, index) => [project.slug, featuredOrder.length + index] as const),
]);

const projectDefaults: ProjectCatalogItem[] = projects.map((project) => {
  const localized = localizedDefaults[project.slug];
  const tags = project.tags ?? [project.category];

  return {
    id: project.slug,
    route: `/work/${project.slug}`,
    titleZh: localized?.titleZh ?? project.title,
    titleEn: localized?.titleEn ?? project.title,
    summaryZh: localized?.summaryZh ?? project.subtitle,
    summaryEn: localized?.summaryEn ?? project.subtitle,
    tagsZh: localized?.tagsZh ?? tags,
    tagsEn: localized?.tagsEn ?? tags,
    categoryZh: localized?.categoryZh ?? project.category,
    categoryEn: localized?.categoryEn ?? project.category,
    duration: project.duration || project.year,
    homepageGroup: localized?.homepageGroup,
    homepageOrder: localized?.homepageOrder,
    archiveOrder: archiveOrderById.get(project.slug),
    coverImage: localized?.coverImage ?? project.cover,
    comingSoon: false,
  };
});

const homepageOnlyDefaults: ProjectCatalogItem[] = [
  {
    id: "activity-design",
    titleZh: "活动设计",
    titleEn: "Activity Design",
    summaryZh: "活动设计项目内容整理中。",
    summaryEn: "A provisional entry for future activity-design work.",
    tagsZh: ["活动设计", "草稿"],
    tagsEn: ["ACTIVITY DESIGN", "DRAFT"],
    categoryZh: "活动设计 / 草稿",
    categoryEn: "ACTIVITY DESIGN / DRAFT",
    homepageGroup: "more",
    homepageOrder: 1,
    coverImage: "",
    comingSoon: true,
  },
  {
    id: "thermal-egg",
    titleZh: "温控游戏",
    titleEn: "Thermal Egg",
    summaryZh: "通过方向探针读取不可见的温度区域。",
    summaryEn: "Reading invisible thermal fields through directional probes.",
    tagsZh: ["可玩实验", "游戏交互"],
    tagsEn: ["PLAYABLE EXPERIMENT", "GAME INTERACTION"],
    categoryZh: "可玩实验 / 游戏交互",
    categoryEn: "PLAYABLE EXPERIMENT / GAME INTERACTION",
    homepageGroup: "more",
    homepageOrder: 2,
    coverImage: "/images/projects/thermal-egg/cover.webp",
    comingSoon: true,
  },
  {
    id: "ai-agent-ux",
    titleZh: "AI Agent UX",
    titleEn: "Designing for Intent, Not Navigation",
    summaryZh: "探索超越固定页面与流程的交互方式。",
    summaryEn: "Exploring interaction beyond fixed pages and workflows.",
    tagsZh: ["AI AGENT UX", "交互"],
    tagsEn: ["AI AGENT UX", "INTERACTION"],
    categoryZh: "AI Agent UX / 交互",
    categoryEn: "AI AGENT UX / INTERACTION",
    coverImage: "/images/projects/ai-agent/cover.webp",
    comingSoon: true,
  },
  {
    id: "interaction-profile-agent",
    route: "/work/interaction-profile-agent",
    titleZh: "从静态参考到可积累的交互判断",
    titleEn: "From Static References to Accumulated Interaction Judgment",
    summaryZh: "构建一个连接交互素材管理与设计评审的双端 Agent，将零散截图转化为包含任务、状态、动效与体验判断的可复用知识。",
    summaryEn: "A dual-sided agent that turns fragmented game UI references into reusable knowledge grounded in tasks, states, motion, and human experience judgment.",
    tagsZh: ["AI AGENT", "交互研究"],
    tagsEn: ["AI AGENT", "INTERACTION RESEARCH"],
    categoryZh: "AI AGENT / 交互研究",
    categoryEn: "AI AGENT / INTERACTION RESEARCH",
    duration: "2026 — 进行中",
    homepageGroup: "featured",
    homepageOrder: 2,
    coverImage: "",
    comingSoon: false,
  },
  {
    id: "desktop-laundromat",
    titleZh: "桌面洗衣店",
    titleEn: "Desktop Laundromat",
    summaryZh: "一个只在使用电脑时运转的小型桌面洗衣店。",
    summaryEn: "A tiny laundromat that only works while you use your computer.",
    tagsZh: ["桌面游戏", "交互概念"],
    tagsEn: ["DESKTOP GAME", "INTERACTION CONCEPT"],
    categoryZh: "桌面游戏 / 交互概念",
    categoryEn: "DESKTOP GAME / INTERACTION CONCEPT",
    coverImage: "/images/projects/desktop-laundromat/cover.webp",
    comingSoon: true,
  },
];

export const projectCatalogDefaults: ProjectCatalogItem[] = [...projectDefaults, ...homepageOnlyDefaults];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readJson(key: string): Record<string, unknown> | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "null") as unknown;
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readDraftOverrides(): Record<string, ProjectPublicMetaOverride> {
  const result: Record<string, ProjectPublicMetaOverride> = {};
  const crossPlatform = readJson(CROSS_PLATFORM_DRAFT_STORAGE_KEY);
  if (crossPlatform) {
    const sections = isRecord(crossPlatform.sections) ? crossPlatform.sections : {};
    result["cross-platform-game-ux"] = {
      projectId: "cross-platform-game-ux",
      titleZh: readString(crossPlatform.title),
      summaryZh: readString(sections.heroSubtitle),
      duration: readString(crossPlatform.projectDuration),
    };
  }

  const threeDCharacter = readJson(THREE_D_CHARACTER_DRAFT_STORAGE_KEY);
  if (threeDCharacter) {
    const hero = isRecord(threeDCharacter.hero) ? threeDCharacter.hero : {};
    result["3d-character-ui-rhythm"] = {
      projectId: "3d-character-ui-rhythm",
      titleZh: readString(hero.title),
      summaryZh: readString(hero.subtitle),
      duration: readString(hero.duration),
    };
  }

  const gameJam = readJson(GAME_JAM_DRAFT_STORAGE_KEY);
  if (gameJam) {
    const draftTitle = readString(gameJam.title);
    const draftSummary = readString(gameJam.subtitle);
    result["from-theme-to-playable-rule"] = {
      projectId: "from-theme-to-playable-rule",
      titleZh: draftTitle === "From Theme to Playable Rule" ? "让主题真正改变玩家的行动" : draftTitle,
      summaryZh: draftSummary === "A game jam retrospective on turning an abstract prompt into actions players could actually perform."
        ? "在 Game Jam 的有限时间里，将“反转”从叙事概念转化为玩家能够直接感知的操作规则。"
        : draftSummary,
      duration: readString(gameJam.duration),
    };
  }

  return result;
}

export function readProjectPublicMetaOverrides(): Record<string, ProjectPublicMetaOverride> {
  const draftOverrides = readDraftOverrides();
  const stored = readJson(PROJECT_PUBLIC_META_STORAGE_KEY);
  const storedProjects = stored?.version === 1 && isRecord(stored.projects) ? stored.projects : {};

  return Object.entries(storedProjects).reduce<Record<string, ProjectPublicMetaOverride>>((result, [projectId, value]) => {
    if (!isRecord(value)) return result;
    result[projectId] = { ...value, ...draftOverrides[projectId], projectId } as ProjectPublicMetaOverride;
    return result;
  }, { ...draftOverrides });
}

export function setProjectPublicMetaOverride(
  projectId: string,
  patch: Omit<ProjectPublicMetaOverride, "projectId" | "updatedAt">,
) {
  if (typeof window === "undefined") return;
  const current = readJson(PROJECT_PUBLIC_META_STORAGE_KEY);
  const storedProjects = current?.version === 1 && isRecord(current.projects) ? current.projects : {};
  const projectsValue = Object.entries(storedProjects).reduce<PublicMetaStore["projects"]>((result, [id, value]) => {
    if (isRecord(value)) result[id] = value as Omit<ProjectPublicMetaOverride, "projectId">;
    return result;
  }, {});
  const previous = isRecord(projectsValue[projectId]) ? projectsValue[projectId] : {};
  const nextStore: PublicMetaStore = {
    version: 1,
    projects: {
      ...projectsValue,
      [projectId]: { ...previous, ...patch, updatedAt: new Date().toISOString() },
    },
  };
  window.localStorage.setItem(PROJECT_PUBLIC_META_STORAGE_KEY, JSON.stringify(nextStore));
  window.dispatchEvent(new CustomEvent(PROJECT_PUBLIC_META_CHANGED_EVENT, { detail: { projectId } }));
}

export function resolveProjectCatalog(locale: ProjectLocale): ResolvedProjectMetadata[] {
  const overrides = readProjectPublicMetaOverrides();
  return projectCatalogDefaults.map((item) => {
    const override = overrides[item.id];
    return {
      ...item,
      duration: override?.duration ?? item.duration,
      title: locale === "zh" ? override?.titleZh ?? item.titleZh : override?.titleEn ?? item.titleEn,
      summary: locale === "zh" ? override?.summaryZh ?? item.summaryZh : override?.summaryEn ?? item.summaryEn,
      tags: locale === "zh" ? override?.tagsZh ?? item.tagsZh : override?.tagsEn ?? item.tagsEn,
      category: locale === "zh" ? override?.categoryZh ?? item.categoryZh : override?.categoryEn ?? item.categoryEn,
    };
  });
}
