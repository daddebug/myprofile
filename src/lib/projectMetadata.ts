import { projects } from "../data/projects";
import { getPublishedPublicMetadata } from "./publishedPortfolio";
import { getAllStagedProjectIds, getStagedPublicMetaEntry, isCollectionStagingMode } from "./collectionExportStaging";
import { hydrateTranslations } from "./translationHydration";

export const PROJECT_PUBLIC_META_STORAGE_KEY = "dilida-portfolio:project-public-meta:v1";
export const PROJECT_PUBLIC_META_CHANGED_EVENT = "dilida-portfolio:project-public-meta-changed";

export type ProjectLocale = "zh" | "en";
export type ProjectCollectionGroup = "work" | "play";
export type ProjectVisibility = "public" | "hidden";
export type ProjectPublicationState = "draft" | "published" | "coming-soon";

export type ProjectPublicMetaOverride = {
  projectId: string;
  isDynamic?: boolean;
  slug?: string;
  route?: string;
  titleZh?: string;
  titleEn?: string;
  summaryZh?: string;
  summaryEn?: string;
  tagsZh?: string[];
  tagsEn?: string[];
  categoryZh?: string;
  categoryEn?: string;
  duration?: string;
  archiveOrder?: number;
  featured?: boolean;
  group?: ProjectCollectionGroup;
  visibility?: ProjectVisibility;
  publicationState?: ProjectPublicationState;
  templateId?: string;
  templateVersionUsed?: number;
  year?: string;
  role?: string;
  collaborators?: string[];
  tools?: string[];
  coverImage?: string;
  updatedAt?: string;
};

export type ProjectCatalogItem = {
  id: string;
  slug: string;
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
  archiveOrder: number;
  featured: boolean;
  group: ProjectCollectionGroup;
  visibility: ProjectVisibility;
  publicationState: ProjectPublicationState;
  coverImage: string;
  comingSoon: boolean;
  isDynamic?: boolean;
  templateId?: string;
  templateVersionUsed?: number;
  year?: string;
  role?: string;
  collaborators?: string[];
  tools?: string[];
};

export type ResolvedProjectMetadata = ProjectCatalogItem & {
  title: string;
  summary: string;
  tags: string[];
  category: string;
};

export type PublicMetaStore = {
  version: 1;
  projects: Record<string, Omit<ProjectPublicMetaOverride, "projectId">>;
};

type ProjectCollectionExportStore = PublicMetaStore & {
  projectIds: string[];
};

const archiveLeadingOrder: string[] = [];

const localizedDefaults: Partial<Record<string, Partial<ProjectCatalogItem>>> = {
  "ui-personal-practice": {
    titleZh: "个人 UI 练习",
    titleEn: "UI Personal Practice",
    summaryZh: "持续整理个人界面练习、交互研究与游戏 UI 视觉探索。",
    summaryEn: "A running archive of interface studies and game UI visual work.",
    tagsZh: ["UI 视觉", "个人练习"],
    tagsEn: ["UI ART", "ARCHIVE"],
    categoryZh: "UI 视觉 / 个人练习",
    categoryEn: "UI ART / PERSONAL PRACTICE",
  },
};

const archiveOrderById = new Map([
  ...archiveLeadingOrder.map((id, index) => [id, index] as const),
  ...projects
    .filter((project) => !archiveLeadingOrder.includes(project.slug))
    .map((project, index) => [project.slug, archiveLeadingOrder.length + index] as const),
]);

const featuredProjectIds = new Set([
  "ui-personal-practice",
  "activity-design",
]);

const projectDefaults: ProjectCatalogItem[] = projects.map((project) => {
  const localized = localizedDefaults[project.slug];
  const tags = project.tags ?? [project.category];

  return {
    id: project.slug,
    slug: project.slug,
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
    archiveOrder: archiveOrderById.get(project.slug) ?? Number.MAX_SAFE_INTEGER,
    featured: featuredProjectIds.has(project.slug),
    group: "work",
    visibility: "public",
    publicationState: "published",
    coverImage: localized?.coverImage ?? project.cover,
    comingSoon: false,
  };
});

const supplementalProjectDefaults: ProjectCatalogItem[] = [];

export const projectCatalogDefaults: ProjectCatalogItem[] = [...projectDefaults, ...supplementalProjectDefaults];

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

function canonicalizeStoredOverride(value: Record<string, unknown>) {
  const { homepageGroup: _legacyHomepageGroup, homepageOrder: _legacyHomepageOrder, ...canonical } = value;
  return canonical as Omit<ProjectPublicMetaOverride, "projectId">;
}

function readStoredProjects(value: Record<string, unknown> | null): PublicMetaStore["projects"] {
  if (value?.version !== 1 || !isRecord(value.projects)) return {};
  return Object.entries(value.projects).reduce<PublicMetaStore["projects"]>((result, [projectId, project]) => {
    if (isRecord(project)) result[projectId] = canonicalizeStoredOverride(project);
    return result;
  }, {});
}

// During a collection export capture (?collectionExport=1&collectionJob=...),
// this browser's own localStorage is Playwright's separate, empty profile —
// a dynamic project's catalog entry never lived there to begin with. Overlay
// whatever staged metadata has already been fetched for this page's project
// (collectionExportStaging.ts) on top of whatever real localStorage has, so
// the project resolves instead of silently falling out of the catalog and
// redirecting to /work. A no-op outside collection export mode.
function readStoredProjectsWithStaging(): PublicMetaStore["projects"] {
  const stored = readStoredProjects(readJson(PROJECT_PUBLIC_META_STORAGE_KEY));
  if (!isCollectionStagingMode()) return stored;
  const merged = { ...stored };
  for (const projectId of getAllStagedProjectIds()) {
    const staged = getStagedPublicMetaEntry(projectId);
    if (staged) merged[projectId] = canonicalizeStoredOverride(staged);
  }
  return merged;
}

function writeProjectStore(projectsValue: PublicMetaStore["projects"], projectId?: string) {
  if (typeof window === "undefined") return;
  const nextStore: PublicMetaStore = { version: 1, projects: projectsValue };
  window.localStorage.setItem(PROJECT_PUBLIC_META_STORAGE_KEY, JSON.stringify(nextStore));
  window.dispatchEvent(new CustomEvent(PROJECT_PUBLIC_META_CHANGED_EVENT, { detail: { projectId } }));
}

function readDynamicProjectDefaults(): ProjectCatalogItem[] {
  const published = Object.fromEntries(
    Object.entries(getPublishedPublicMetadata()).map(([projectId, value]) => {
      const { projectId: _projectId, ...project } = value;
      return [projectId, project];
    }),
  );
  const stored = import.meta.env.DEV ? readStoredProjectsWithStaging() : {};
  const projectsValue = { ...published, ...stored };
  return Object.entries(projectsValue).flatMap(([projectId, value]) => {
    if (!value.isDynamic || typeof value.slug !== "string" || typeof value.route !== "string") return [];
    if (!value.titleZh || !value.summaryZh) return [];
    return [{
      id: projectId,
      slug: value.slug,
      route: value.route,
      titleZh: value.titleZh,
      titleEn: value.titleEn ?? "",
      summaryZh: value.summaryZh,
      summaryEn: value.summaryEn ?? "",
      tagsZh: value.tagsZh ?? [],
      tagsEn: value.tagsEn ?? [],
      categoryZh: value.categoryZh ?? "",
      categoryEn: value.categoryEn ?? "",
      duration: value.duration,
      archiveOrder: value.archiveOrder ?? Number.MAX_SAFE_INTEGER,
      featured: value.featured ?? false,
      group: value.group ?? "work",
      visibility: value.visibility ?? "hidden",
      publicationState: value.publicationState ?? "draft",
      coverImage: value.coverImage ?? "",
      comingSoon: value.publicationState === "coming-soon",
      isDynamic: true,
      templateId: value.templateId,
      templateVersionUsed: value.templateVersionUsed,
      year: value.year,
      role: value.role,
      collaborators: value.collaborators,
      tools: value.tools,
    }];
  });
}

export function readProjectPublicMetaOverrides(): Record<string, ProjectPublicMetaOverride> {
  const publishedOverrides = getPublishedPublicMetadata();
  if (!import.meta.env.DEV) return publishedOverrides;

  const storedProjects = readStoredProjectsWithStaging();
  const storedOverrides = Object.entries(storedProjects).reduce<Record<string, ProjectPublicMetaOverride>>((result, [projectId, value]) => {
    result[projectId] = { ...value, projectId };
    return result;
  }, {});

  const projectIds = new Set([
    ...Object.keys(publishedOverrides),
    ...Object.keys(storedOverrides),
  ]);
  return Object.fromEntries([...projectIds].map((projectId) => {
    const published = publishedOverrides[projectId];
    const stored = storedOverrides[projectId];
    // Translation Persistence fix -- a stored override that already
    // carries an explicit (possibly stale-empty) titleEn/summaryEn/
    // categoryEn key would otherwise shadow published english forever,
    // even when its own zh still matches published zh exactly. Hydrate
    // the stored override against published BEFORE it gets spread on top,
    // so only a genuinely empty local en with matching zh ever inherits;
    // any other stored field (including a real, non-empty local en, or an
    // en left empty because zh has since changed) is spread through
    // unchanged, same as before this fix.
    const hydratedStored = stored ? hydrateTranslations(stored, published) : stored;
    return [
      projectId,
      {
        ...published,
        ...hydratedStored,
        projectId,
      },
    ];
  }));
}

export function setProjectPublicMetaOverride(
  projectId: string,
  patch: Omit<ProjectPublicMetaOverride, "projectId" | "updatedAt">,
) {
  if (typeof window === "undefined") return;
  const projectsValue = readStoredProjects(readJson(PROJECT_PUBLIC_META_STORAGE_KEY));
  const previous = isRecord(projectsValue[projectId]) ? projectsValue[projectId] : {};
  writeProjectStore({
    ...projectsValue,
    [projectId]: { ...previous, ...patch, updatedAt: new Date().toISOString() },
  }, projectId);
}

// Removes the override entry entirely (not just clearing its fields). For a
// dynamic project (created via the New Project wizard), this is what makes
// it disappear from the catalog for good — readDynamicProjectDefaults()
// only returns entries that still exist in this store. For a static,
// source-controlled project (defined in projects.ts), this only reverts any
// owner edits; the catalog row itself is compiled into the app and cannot
// be removed at runtime.
export function removeProjectPublicMetaOverride(projectId: string) {
  if (typeof window === "undefined") return;
  const projectsValue = readStoredProjects(readJson(PROJECT_PUBLIC_META_STORAGE_KEY));
  if (!(projectId in projectsValue)) return;
  const { [projectId]: _removed, ...rest } = projectsValue;
  writeProjectStore(rest, projectId);
}

export function setProjectArchiveOrder(projectIds: string[]) {
  if (typeof window === "undefined") return;
  const projectsValue = readStoredProjects(readJson(PROJECT_PUBLIC_META_STORAGE_KEY));
  const updatedAt = new Date().toISOString();
  const nextProjects = { ...projectsValue };
  projectIds.forEach((projectId, archiveOrder) => {
    nextProjects[projectId] = { ...nextProjects[projectId], archiveOrder, updatedAt };
  });
  writeProjectStore(nextProjects);
}

export function setProjectFeatured(projectId: string, featured: boolean) {
  setProjectPublicMetaOverride(projectId, { featured });
}

export function getProjectPublicMetaStoreSnapshot(): PublicMetaStore {
  return { version: 1, projects: structuredClone(readStoredProjects(readJson(PROJECT_PUBLIC_META_STORAGE_KEY))) };
}

export function restoreProjectPublicMetaStore(snapshot: PublicMetaStore) {
  if (typeof window === "undefined" || !import.meta.env.DEV) return;
  writeProjectStore(structuredClone(snapshot.projects));
}

export function createDynamicProject(record: ProjectCatalogItem) {
  if (typeof window === "undefined" || !import.meta.env.DEV) throw new Error("Project creation is available only in local development.");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.id) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.slug)) {
    throw new Error("Project ID and slug must use lowercase kebab-case.");
  }
  const catalog = resolveProjectCatalog("en");
  if (catalog.some((project) => project.id === record.id)) throw new Error("This project ID already exists.");
  if (catalog.some((project) => project.slug === record.slug)) throw new Error("This slug already exists.");
  const store = getProjectPublicMetaStoreSnapshot();
  store.projects[record.id] = {
    isDynamic: true,
    slug: record.slug,
    route: `/work/${record.slug}`,
    titleZh: record.titleZh,
    titleEn: record.titleEn,
    summaryZh: record.summaryZh,
    summaryEn: record.summaryEn,
    tagsZh: record.tagsZh,
    tagsEn: record.tagsEn,
    categoryZh: record.categoryZh,
    categoryEn: record.categoryEn,
    duration: record.duration,
    archiveOrder: record.archiveOrder,
    featured: record.featured,
    group: "work",
    visibility: record.visibility,
    publicationState: record.publicationState,
    templateId: record.templateId,
    templateVersionUsed: record.templateVersionUsed,
    year: record.year,
    role: record.role,
    collaborators: record.collaborators,
    tools: record.tools,
    coverImage: record.coverImage,
    updatedAt: new Date().toISOString(),
  };
  writeProjectStore(store.projects, record.id);
}

export function getProjectCollectionExportStore(): ProjectCollectionExportStore {
  const allDefaults = [...projectCatalogDefaults, ...readDynamicProjectDefaults()];
  const canonicalProjectIds = new Set(allDefaults.map((project) => project.id));
  const projectsValue = Object.fromEntries(
    Object.entries(readProjectPublicMetaOverrides())
      .filter(([projectId]) => canonicalProjectIds.has(projectId))
      .map(([projectId, value]) => {
        const { projectId: _projectId, ...project } = value;
        return [projectId, canonicalizeStoredOverride(project)];
      }),
  );
  return {
    version: 1,
    projectIds: allDefaults.map((project) => project.id),
    projects: projectsValue,
  };
}

export function resolveProjectCatalog(locale: ProjectLocale): ResolvedProjectMetadata[] {
  const overrides = readProjectPublicMetaOverrides();
  const builtInIds = new Set(projectCatalogDefaults.map((project) => project.id));
  const dynamicDefaults = readDynamicProjectDefaults().filter((project) => !builtInIds.has(project.id));
  return [...projectCatalogDefaults, ...dynamicDefaults].map((item) => {
    const override = overrides[item.id];
    const merged = { ...item, ...override, id: item.id };
    const publicationState = merged.publicationState;
    return {
      ...merged,
      publicationState,
      comingSoon: publicationState === "coming-soon",
      title:
        locale === "zh"
          ? merged.titleZh
          : merged.titleEn.trim() || merged.titleZh,
      summary:
        locale === "zh"
          ? merged.summaryZh
          : merged.summaryEn.trim() || merged.summaryZh,
      tags: locale === "zh" ? merged.tagsZh : merged.tagsEn,
      category:
        locale === "zh"
          ? merged.categoryZh
          : merged.categoryEn.trim() || merged.categoryZh,
    };
  });
}
