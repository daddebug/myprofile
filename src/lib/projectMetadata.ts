import { projects } from "../data/projects";
import { getPublishedPublicMetadata } from "./publishedPortfolio";
import { getAllStagedProjectIds, getStagedPublicMetaEntry, isCollectionStagingMode } from "./collectionExportStaging";
import { hydrateTranslations } from "./translationHydration";
import { listDirtyIntents } from "./dirtyIntentStore";

export const PROJECT_PUBLIC_META_STORAGE_KEY = "dilida-portfolio:project-public-meta:v1";
export const PROJECT_PUBLIC_META_CHANGED_EVENT = "dilida-portfolio:project-public-meta-changed";

// Cover's shortDescription (summaryZh/summaryEn) is a concise Cover
// subtitle, not body copy -- this is the single source of truth for its
// length limit, enforced identically at every entry point that can write
// it (EDIT PROJECT INFO's own save validation, Project Code's AI-apply
// validation) rather than re-implemented per call site and risking drift.
// Never used to silently truncate; every caller must block the write and
// surface a clear error instead.
export const COVER_SHORT_DESCRIPTION_MAX = { zh: 55, en: 110 } as const;

export function coverShortDescriptionOverLimit(locale: "zh" | "en", value: string): boolean {
  return value.trim().length > COVER_SHORT_DESCRIPTION_MAX[locale];
}

export type ProjectLocale = "zh" | "en";
export type ProjectCollectionGroup = "work" | "play";
export type ProjectVisibility = "public" | "hidden";
export type ProjectPublicationState = "draft" | "published" | "coming-soon";

// Phase 1 of the proposed public-facing category nav (owner-editable only —
// see PROJECT_STATUS.md/TASKS.md for scope). Deliberately separate from the
// existing free-text categoryZh/categoryEn (a descriptive subtitle, not a
// closed taxonomy): each project belongs to exactly one Track, or none.
// Additive-only — absent/undefined on any pre-existing project means
// Unclassified, never inferred from categoryZh/categoryEn/tags.
export type PortfolioTrack = "ux-ui" | "ue" | "game-design" | "ai-product";

export const PORTFOLIO_TRACK_OPTIONS: PortfolioTrack[] = ["ux-ui", "ue", "game-design", "ai-product"];

const PORTFOLIO_TRACK_LABELS: Record<PortfolioTrack, string> = {
  "ux-ui": "UX/UI / 用户体验与界面",
  "ue": "UE / 交互设计",
  "game-design": "GAME DESIGN / 游戏设计",
  "ai-product": "AI PRODUCT / AI产品",
};

export const UNCLASSIFIED_PORTFOLIO_TRACK_LABEL = "UNCLASSIFIED / 未分类";

export function getPortfolioTrackLabel(track: PortfolioTrack | null | undefined): string {
  return track ? PORTFOLIO_TRACK_LABELS[track] : UNCLASSIFIED_PORTFOLIO_TRACK_LABEL;
}

// One base accent per project (Hero and Footer both derive from it via
// color-mix -- see project-web-sections.css's .project-cover-section and
// [data-project-portfolio-footer] rules). Runtime fallback only: an old
// project with no stored projectThemeColor resolves to this here, in
// resolveProjectCatalog, rather than being batch-written onto every
// existing project's stored override.
export const DEFAULT_PROJECT_THEME_COLOR = "#9FCB98";

export const PROJECT_THEME_COLOR_PRESETS: { labelZh: string; labelEn: string; hex: string }[] = [
  { labelZh: "鼠尾草绿", labelEn: "Sage", hex: "#A7C99B" },
  { labelZh: "雾蓝", labelEn: "Mist Blue", hex: "#AFC9D8" },
  { labelZh: "浅丁香紫", labelEn: "Soft Lilac", hex: "#C7B8D5" },
  { labelZh: "暖桃", labelEn: "Warm Peach", hex: "#E2B8A0" },
  { labelZh: "青柠雾", labelEn: "Lime Mist", hex: "#CBD59B" },
  { labelZh: "柔和绿", labelEn: "Soft Green", hex: "#9FCB98" },
];

export type ProjectPublicMetaOverride = {
  projectId: string;
  isDynamic?: boolean;
  slug?: string;
  route?: string;
  titleZh?: string;
  titleEn?: string;
  // Hero's independent two-line title structure (Figma: TITLE_LINE_01,
  // TITLE_LINE_02 -- two separate text layers, not one string split on
  // "\n"). Optional and additive: absent on any project that hasn't been
  // edited through the new EDIT PROJECT INFO fields yet -- see
  // resolveProjectCatalog's compat fallback (line1 = titleZh/titleEn as a
  // whole, line2 empty). Owner decides the split; never inferred.
  // Named <field><Zh|En> (Zh/En as a suffix, not "titleZhLine1") so
  // translationHydration.ts's existing generic fooZh/fooEn sibling-pair
  // matching picks these up automatically -- same Translation Persistence
  // safety net titleZh/titleEn already get, no extra code needed there.
  titleLine1Zh?: string;
  titleLine1En?: string;
  titleLine2Zh?: string;
  titleLine2En?: string;
  summaryZh?: string;
  summaryEn?: string;
  tagsZh?: string[];
  tagsEn?: string[];
  categoryZh?: string;
  categoryEn?: string;
  duration?: string;
  archiveOrder?: number;
  featured?: boolean;
  portfolioTrack?: PortfolioTrack | null;
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
  // One base accent hex (e.g. "#9FCB98") that the project page's Hero and
  // Footer both derive from via color-mix -- see DEFAULT_PROJECT_THEME_COLOR
  // and PROJECT_THEME_COLOR_PRESETS above. Absent means "use the runtime
  // fallback", not "no color" -- never batch-written onto existing projects.
  projectThemeColor?: string | null;
  updatedAt?: string;
  // Stamped only by the real publish pipeline (assemblePublishedOutput.mjs)
  // when this project's catalog entry is actually NEW or UPDATED in a
  // publish run -- never by draft autosave or metadata edits. Absent on
  // any project that hasn't been through that pipeline since this field
  // was added; that is a valid, expected state, not an error. See
  // ProjectEndSections.tsx for how the absence is displayed.
  lastPublishedAt?: string;
};

export type ProjectCatalogItem = {
  id: string;
  slug: string;
  route?: string;
  titleZh: string;
  titleEn: string;
  titleLine1Zh?: string;
  titleLine1En?: string;
  titleLine2Zh?: string;
  titleLine2En?: string;
  summaryZh: string;
  summaryEn: string;
  tagsZh: string[];
  tagsEn: string[];
  categoryZh: string;
  categoryEn: string;
  duration?: string;
  archiveOrder: number;
  featured: boolean;
  portfolioTrack?: PortfolioTrack | null;
  group: ProjectCollectionGroup;
  visibility: ProjectVisibility;
  publicationState: ProjectPublicationState;
  coverImage: string;
  projectThemeColor?: string | null;
  comingSoon: boolean;
  isDynamic?: boolean;
  templateId?: string;
  templateVersionUsed?: number;
  year?: string;
  role?: string;
  collaborators?: string[];
  tools?: string[];
  lastPublishedAt?: string;
  // Stamped on every override write (writeProjectStore) -- unlike
  // lastPublishedAt, this reflects any local edit, not only a real publish.
  // Already present at runtime on every override-backed project (set*
  // functions in this file all stamp it); was missing from this type only
  // because nothing had read it back until /work's Project Control Center
  // needed a real "last updated" column.
  updatedAt?: string;
};

export type ResolvedProjectMetadata = ProjectCatalogItem & {
  title: string;
  // Hero's own two-line title (see ProjectPublicMetaOverride's
  // titleLine1Zh/etc. comment). Locale-resolved, same compat fallback as
  // `title` itself: an explicit line field wins; otherwise falls back to
  // the whole titleZh/titleEn for that locale, with titleLine2 empty.
  // titleLine2 is "" (never a placeholder) when there is no second line --
  // the web-native Cover renders nothing for it, not a blank line.
  titleLine1: string;
  titleLine2: string;
  summary: string;
  tags: string[];
  category: string;
  // Always a concrete hex here (never null/undefined) -- resolveProjectCatalog
  // applies DEFAULT_PROJECT_THEME_COLOR as the runtime fallback below.
  projectThemeColor: string;
};

export type PublicMetaStore = {
  version: 1;
  projects: Record<string, Omit<ProjectPublicMetaOverride, "projectId">>;
};

type ProjectCollectionExportStore = PublicMetaStore & {
  projectIds: string[];
};

const archiveLeadingOrder: string[] = [];

const localizedDefaults: Partial<Record<string, Partial<ProjectCatalogItem>>> = {};

const archiveOrderById = new Map([
  ...archiveLeadingOrder.map((id, index) => [id, index] as const),
  ...projects
    .filter((project) => !archiveLeadingOrder.includes(project.slug))
    .map((project, index) => [project.slug, archiveLeadingOrder.length + index] as const),
]);

const featuredProjectIds = new Set([
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
  const projectIds = new Set([...Object.keys(published), ...Object.keys(stored)]);
  const projectsValue = Object.fromEntries(
    [...projectIds].map((projectId) => [
      projectId,
      { ...(published[projectId] ?? {}), ...(stored[projectId] ?? {}) },
    ]),
  );
  return Object.entries(projectsValue).flatMap(([projectId, value]) => {
    if (!value.isDynamic || typeof value.slug !== "string" || typeof value.route !== "string") return [];
    if (!value.titleZh || !value.summaryZh) return [];
    return [{
      id: projectId,
      slug: value.slug,
      route: value.route,
      titleZh: value.titleZh,
      titleEn: value.titleEn ?? "",
      titleLine1Zh: value.titleLine1Zh,
      titleLine1En: value.titleLine1En,
      titleLine2Zh: value.titleLine2Zh,
      titleLine2En: value.titleLine2En,
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
      projectThemeColor: value.projectThemeColor,
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
    titleLine1Zh: record.titleLine1Zh,
    titleLine1En: record.titleLine1En,
    titleLine2Zh: record.titleLine2Zh,
    titleLine2En: record.titleLine2En,
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

// Owner Catalog Source-of-Truth Fix (ported from the worktree's own
// lifecycle-safety work): a project the owner has locally marked for
// deletion (an open DELETE dirty intent) must never enter a publish or
// PDF/Collection/Static-HTML export payload -- that gate must live HERE, at
// the one place every export path already gets its project list from,
// rather than be re-implemented (or forgotten) per export call site. Two-
// phase deletion deliberately leaves the project's local draft/metadata
// completely intact while the intent is only pending (see
// deletePortfolioProject.ts), so this filters the CATALOG the export sees,
// never the underlying stored data itself.
function excludePendingDeletionProjects<T extends { id: string }>(items: T[]): T[] {
  const deletedIds = new Set(
    listDirtyIntents("project").filter((entry) => entry.kind === "DELETE").map((entry) => entry.entityId),
  );
  return items.filter((item) => !deletedIds.has(item.id));
}

export function getProjectCollectionExportStore(): ProjectCollectionExportStore {
  const allDefaults = excludePendingDeletionProjects([...projectCatalogDefaults, ...readDynamicProjectDefaults()]);
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

// Hero's two-line title, locale-resolved with the same "explicit field
// wins, otherwise fall back to the whole title with an empty line2" rule
// as ProjectPublicMetaOverride's titleLine1Zh/etc. comment describes. EN
// mirrors `title`'s own existing pattern below (merged.titleEn.trim() ||
// merged.titleZh): when there's no real English content at all, EN
// borrows the WHOLE Chinese resolution (both lines), not just line1.
function resolveTitleLines(
  locale: ProjectLocale,
  merged: Pick<ProjectCatalogItem, "titleZh" | "titleEn" | "titleLine1Zh" | "titleLine1En" | "titleLine2Zh" | "titleLine2En">,
): { titleLine1: string; titleLine2: string } {
  // `??` only falls back on null/undefined, not on an explicit "" -- but
  // DynamicProjectCodePanel.tsx's AI-apply path deliberately WRITES ""
  // (not undefined) to titleLine1Zh/titleLine1En as its own "fall back to
  // the whole title" signal whenever the whole title changes (see that
  // file's own comment: "cleared here so that locale cleanly falls back to
  // 'whole title -> line 1, line 2 empty'"). Without this blank-aware
  // check, that explicit "" was taken literally as "line 1 is the empty
  // string", producing a real title in titleZh/titleEn that never reached
  // heroTitleLines/<h1> at all. titleLine2 needs no equivalent fix -- ""
  // is already its own correct resolved value, not a sentinel.
  const zhLine1 = merged.titleLine1Zh && merged.titleLine1Zh.trim() ? merged.titleLine1Zh : merged.titleZh;
  const zhLine2 = merged.titleLine2Zh ?? "";
  const enLine1 = merged.titleLine1En && merged.titleLine1En.trim() ? merged.titleLine1En : merged.titleEn;
  const enLine2 = merged.titleLine2En ?? "";
  // Symmetric with the EN branch below: a genuinely blank whole title for
  // the current locale falls back to the other locale's resolution instead
  // of rendering nothing. Never triggers for a normal project with a real
  // titleZh -- only closes the previously one-sided gap where an empty
  // titleZh (e.g. from a bad metadata write) silently produced zero title
  // lines instead of falling back like an empty titleEn already did.
  if (locale === "zh") {
    if (!merged.titleZh.trim()) return { titleLine1: enLine1, titleLine2: enLine2 };
    return { titleLine1: zhLine1, titleLine2: zhLine2 };
  }
  if (!merged.titleEn.trim()) return { titleLine1: zhLine1, titleLine2: zhLine2 };
  return { titleLine1: enLine1, titleLine2: enLine2 };
}

export function resolveProjectCatalog(locale: ProjectLocale): ResolvedProjectMetadata[] {
  const overrides = readProjectPublicMetaOverrides();
  const builtInIds = new Set(projectCatalogDefaults.map((project) => project.id));
  const dynamicDefaults = readDynamicProjectDefaults().filter((project) => !builtInIds.has(project.id));
  return [...projectCatalogDefaults, ...dynamicDefaults].map((item) => {
    const override = overrides[item.id];
    const merged = { ...item, ...override, id: item.id };
    const publicationState = merged.publicationState;
    const titleLines = resolveTitleLines(locale, merged);
    return {
      ...merged,
      publicationState,
      projectThemeColor: merged.projectThemeColor ?? DEFAULT_PROJECT_THEME_COLOR,
      comingSoon: publicationState === "coming-soon",
      title:
        locale === "zh"
          ? merged.titleZh.trim() || merged.titleEn
          : merged.titleEn.trim() || merged.titleZh,
      titleLine1: titleLines.titleLine1,
      titleLine2: titleLines.titleLine2,
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
