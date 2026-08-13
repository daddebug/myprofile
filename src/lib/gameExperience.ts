import { useSyncExternalStore } from "react";
import { gameArchiveItems, homeGameArchiveIds } from "../data/gameArchive";
import { getPublishedGameExperience } from "./publishedPortfolio";

export const GAME_EXPERIENCE_SCHEMA_VERSION = 1 as const;
export const GAME_EXPERIENCE_STORAGE_KEY = "dilida-portfolio:game-experience-library:v1";
export const GAME_HOMEPAGE_LIMIT = 6;
export const GAME_EXPERIENCE_CHANGE_EVENT = "dilida:game-experience-change";

export type GameVisibility = "public" | "hidden" | "draft";
export type AchievementMode = "exact" | "percentage" | "unavailable" | "none";

export type LocalizedGameTag = { id: string; zh: string; en: string };

export type GameExperienceRecord = {
  schemaVersion: 1;
  id: string;
  identity: {
    canonicalTitle: string;
    titleZh?: string;
    titleEn: string;
    originalTitle?: string;
    releaseYear?: number;
    editionName?: string;
    platformIds?: string[];
    externalProvider?: string;
    externalGameId?: string;
  };
  stats: {
    playtimeHours?: number;
    playtimeLabelZh?: string;
    playtimeLabelEn?: string;
    achievementMode?: AchievementMode;
    achievementUnlocked?: number;
    achievementTotal?: number;
    achievementPercent?: number;
    completionStatusZh?: string;
    completionStatusEn?: string;
    paidAmount?: {
      amount: number;
      currency: string;
    };
  };
  presentation: {
    coverAssetId?: string;
    detectedCoverAssetId?: string;
    coverPublicPath?: string;
    coverSourceMetadata?: {
      provider: string;
      externalGameId?: string;
      sourceUrl?: string;
      retrievedAt?: string;
      attribution?: string;
    };
    tags: LocalizedGameTag[];
    homepageTagIds?: string[];
    shortSummaryZh?: string;
    shortSummaryEn?: string;
  };
  reflection: {
    whyPlayedZh: string;
    whyPlayedEn: string;
    strengthsZh: string;
    strengthsEn: string;
    weaknessesZh: string;
    weaknessesEn: string;
    contributionZh: string;
    contributionEn: string;
  };
  detail: {
    zh: string;
    en: string;
  };
  publication: {
    visibility: GameVisibility;
    showOnHomepage: boolean;
    homepageOrder: number;
    libraryOrder: number;
    archived: boolean;
  };
  createdAt: string;
  updatedAt: string;
};

export type GameExperienceStore = {
  schemaVersion: 1;
  homepageLimit: number;
  records: GameExperienceRecord[];
  updatedAt: string;
};

const englishTitles: Record<string, string> = {
  "stardew-valley": "Stardew Valley",
  "baldurs-gate-3": "Baldur's Gate 3",
  "assassins-creed-shadows": "Assassin's Creed Shadows",
  "pokemon-scarlet-violet": "Pokémon Scarlet and Violet",
  "persona-5-royal": "Persona 5 Royal",
  "mass-effect": "Mass Effect",
  "core-keeper": "Core Keeper",
  "persona-3": "Persona 3",
  "hogwarts-legacy": "Hogwarts Legacy",
  palworld: "Palworld",
  "dynasty-warriors-origins": "Dynasty Warriors: Origins",
  "path-to-nowhere": "Path to Nowhere",
  "infinity-nikki": "Infinity Nikki",
};

function stableTagId(gameId: string, tag: string, index: number) {
  return `${gameId}-tag-${index}-${tag.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")}`;
}

function parseHours(value: string) {
  const match = value.match(/^(\d+(?:\.\d+)?)h$/i);
  return match ? Number(match[1]) : undefined;
}

function parseAchievement(value?: string) {
  const match = value?.match(/(?:成就\s*)?(\d+)\s*\/\s*(\d+)/);
  if (!match) return { achievementMode: "unavailable" as const };
  const unlocked = Number(match[1]);
  const total = Number(match[2]);
  return {
    achievementMode: "exact" as const,
    achievementUnlocked: unlocked,
    achievementTotal: total,
    achievementPercent: total > 0 ? Math.round((unlocked / total) * 100) : 0,
  };
}

export function createLegacyGameExperienceStore(): GameExperienceStore {
  const timestamp = "2026-07-20T00:00:00.000Z";
  const selected = homeGameArchiveIds.slice(0, GAME_HOMEPAGE_LIMIT);
  return {
    schemaVersion: GAME_EXPERIENCE_SCHEMA_VERSION,
    homepageLimit: GAME_HOMEPAGE_LIMIT,
    updatedAt: timestamp,
    records: gameArchiveItems.map((game, libraryOrder) => {
      const homepageOrder = selected.indexOf(game.id);
      const tags = game.genreTags.map((tag, index) => ({ id: stableTagId(game.id, tag, index), zh: tag, en: "" }));
      return {
        schemaVersion: 1,
        id: `game-${game.id}`,
        identity: {
          canonicalTitle: englishTitles[game.id] ?? game.title,
          titleZh: game.title,
          titleEn: englishTitles[game.id] ?? game.title,
        },
        stats: {
          playtimeHours: parseHours(game.playtime),
          playtimeLabelZh: game.playtime,
          playtimeLabelEn: game.playtime,
          ...parseAchievement(game.achievementNote),
          completionStatusZh: game.completion,
        },
        presentation: {
          tags,
          homepageTagIds: tags.slice(0, 3).map((tag) => tag.id),
          shortSummaryZh: game.shortReview,
        },
        reflection: {
          whyPlayedZh: game.experienceNote ?? "",
          whyPlayedEn: "",
          strengthsZh: game.shortReview,
          strengthsEn: "",
          weaknessesZh: "",
          weaknessesEn: "",
          contributionZh: game.designObservation,
          contributionEn: "",
        },
        detail: { zh: "", en: "" },
        publication: {
          visibility: "public",
          showOnHomepage: homepageOrder >= 0,
          homepageOrder: homepageOrder >= 0 ? homepageOrder : libraryOrder,
          libraryOrder,
          archived: false,
        },
        createdAt: timestamp,
        updatedAt: timestamp,
      } satisfies GameExperienceRecord;
    }),
  };
}

function finiteNonNegative(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function normalizeGameExperienceRecord(record: GameExperienceRecord, index: number): GameExperienceRecord {
  const mode: AchievementMode | undefined = ["exact", "percentage", "unavailable", "none"].includes(record.stats?.achievementMode ?? "")
    ? record.stats.achievementMode
    : undefined;
  const unlocked = finiteNonNegative(record.stats?.achievementUnlocked);
  const total = finiteNonNegative(record.stats?.achievementTotal);
  const suppliedPercent = finiteNonNegative(record.stats?.achievementPercent);
  const percent = mode === "exact" && unlocked !== undefined && total !== undefined && total > 0
    ? Math.round((Math.min(unlocked, total) / total) * 100)
    : mode === "percentage" && suppliedPercent !== undefined
      ? Math.min(100, suppliedPercent)
      : undefined;
  const paidAmount = record.stats?.paidAmount;
  const normalizedPaidAmount = paidAmount
    && finiteNonNegative(paidAmount.amount) !== undefined
    && paidAmount.amount > 0
    && typeof paidAmount.currency === "string"
    && /^[A-Za-z]{3}$/.test(paidAmount.currency.trim())
    ? { amount: paidAmount.amount, currency: paidAmount.currency.trim().toUpperCase() }
    : undefined;
  const tags: LocalizedGameTag[] = [];
  const seenTags = new Set<string>();
  for (const [tagIndex, tag] of (record.presentation?.tags ?? []).entries()) {
    const zh = String(tag.zh ?? "").trim().slice(0, 24);
    const en = String(tag.en ?? "").trim().slice(0, 32);
    const fingerprint = `${zh.toLocaleLowerCase()}|${en.toLocaleLowerCase()}`;
    if ((!zh && !en) || seenTags.has(fingerprint)) continue;
    seenTags.add(fingerprint);
    tags.push({ id: tag.id || `${record.id}-tag-${tagIndex}`, zh, en });
  }
  const tagIds = new Set(tags.map((tag) => tag.id));
  const requestedHomepageTagIds = Array.isArray(record.presentation?.homepageTagIds)
    ? record.presentation.homepageTagIds
    : tags.slice(0, 3).map((tag) => tag.id);
  const homepageTagIds = [...new Set(requestedHomepageTagIds)].filter((id) => tagIds.has(id)).slice(0, 4);
  return {
    ...record,
    schemaVersion: 1,
    identity: {
      ...record.identity,
      canonicalTitle: String(record.identity?.canonicalTitle ?? record.identity?.titleEn ?? record.identity?.titleZh ?? "Untitled game").trim(),
      titleEn: String(record.identity?.titleEn ?? record.identity?.canonicalTitle ?? "Untitled game").trim(),
      titleZh: String(record.identity?.titleZh ?? "").trim() || undefined,
    },
    stats: {
      ...record.stats,
      playtimeHours: finiteNonNegative(record.stats?.playtimeHours),
      achievementMode: mode,
      achievementUnlocked: mode === "exact" ? unlocked : undefined,
      achievementTotal: mode === "exact" ? total : undefined,
      achievementPercent: percent,
      paidAmount: normalizedPaidAmount,
    },
    presentation: { ...record.presentation, tags, homepageTagIds },
    reflection: {
      whyPlayedZh: record.reflection?.whyPlayedZh ?? "",
      whyPlayedEn: record.reflection?.whyPlayedEn ?? "",
      strengthsZh: record.reflection?.strengthsZh ?? "",
      strengthsEn: record.reflection?.strengthsEn ?? "",
      weaknessesZh: record.reflection?.weaknessesZh ?? "",
      weaknessesEn: record.reflection?.weaknessesEn ?? "",
      contributionZh: record.reflection?.contributionZh ?? "",
      contributionEn: record.reflection?.contributionEn ?? "",
    },
    detail: {
      zh: record.detail?.zh ?? "",
      en: record.detail?.en ?? "",
    },
    publication: {
      visibility: ["public", "hidden", "draft"].includes(record.publication?.visibility) ? record.publication.visibility : "draft",
      showOnHomepage: Boolean(record.publication?.showOnHomepage),
      homepageOrder: finiteNonNegative(record.publication?.homepageOrder) ?? index,
      libraryOrder: finiteNonNegative(record.publication?.libraryOrder) ?? index,
      archived: Boolean(record.publication?.archived),
    },
  };
}

export function normalizeGameExperienceStore(value: unknown): GameExperienceStore | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<GameExperienceStore>;
  if (candidate.schemaVersion !== 1 || !Array.isArray(candidate.records)) return null;
  const records = candidate.records
    .filter((record): record is GameExperienceRecord => Boolean(record && typeof record === "object" && !Array.isArray(record) && record.id))
    .map(normalizeGameExperienceRecord);
  const unique = new Map(records.map((record) => [record.id, record]));
  return {
    schemaVersion: 1,
    homepageLimit: Math.max(1, Math.floor(finiteNonNegative(candidate.homepageLimit) ?? GAME_HOMEPAGE_LIMIT)),
    records: [...unique.values()],
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : new Date().toISOString(),
  };
}

function readStoredGameExperience() {
  if (typeof window === "undefined" || !import.meta.env.DEV) return null;
  const raw = window.localStorage.getItem(GAME_EXPERIENCE_STORAGE_KEY);
  if (!raw) return null;
  try { return normalizeGameExperienceStore(JSON.parse(raw)); } catch { return null; }
}

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isCanonicalPublishedGameCoverPath(
  coverAssetId: string,
  coverPublicPath: string | undefined,
): coverPublicPath is string {
  const prefix = "/images/published/game-covers/";
  if (!hasText(coverPublicPath) || !coverPublicPath.startsWith(prefix)) return false;
  const fileName = coverPublicPath.slice(prefix.length);
  return !fileName.includes("/") && fileName.replace(/\.[^./]+$/, "") === coverAssetId;
}

export function backfillPublishedGameExperienceMetadata(
  draftStore: GameExperienceStore,
  publishedStore: GameExperienceStore | null,
): GameExperienceStore {
  if (!publishedStore) return draftStore;

  const publishedById = new Map(publishedStore.records.map((record) => [record.id, record]));
  let changed = false;
  const records = draftStore.records.map((draftRecord) => {
    const publishedRecord = publishedById.get(draftRecord.id);
    const draftCoverAssetId = draftRecord.presentation.coverAssetId;
    const publishedCoverAssetId = publishedRecord?.presentation.coverAssetId;
    const publishedCoverPublicPath = publishedRecord?.presentation.coverPublicPath;
    if (
      !publishedRecord
      || !hasText(draftCoverAssetId)
      || draftCoverAssetId !== publishedCoverAssetId
      || hasText(draftRecord.presentation.coverPublicPath)
      || !isCanonicalPublishedGameCoverPath(draftCoverAssetId, publishedCoverPublicPath)
    ) {
      return draftRecord;
    }

    changed = true;
    return {
      ...draftRecord,
      presentation: {
        ...draftRecord.presentation,
        coverPublicPath: publishedCoverPublicPath,
      },
    };
  });

  return changed ? { ...draftStore, records } : draftStore;
}

let snapshotCache: { raw: string | null; store: GameExperienceStore } | null = null;

export function getGameExperienceStore(): GameExperienceStore {
  if (typeof window === "undefined") return createLegacyGameExperienceStore();
  const raw = import.meta.env.DEV ? window.localStorage.getItem(GAME_EXPERIENCE_STORAGE_KEY) : null;
  if (snapshotCache?.raw === raw) return snapshotCache.store;
  const publishedStore = normalizeGameExperienceStore(getPublishedGameExperience());
  const draftStore = readStoredGameExperience();
  const store = draftStore
    ? backfillPublishedGameExperienceMetadata(draftStore, publishedStore)
    : publishedStore ?? createLegacyGameExperienceStore();
  snapshotCache = { raw, store };
  return store;
}

export function validateGameExperienceStore(store: GameExperienceStore) {
  for (const record of store.records) {
    const stats = record.stats;
    if (stats.playtimeHours !== undefined && (!Number.isFinite(stats.playtimeHours) || stats.playtimeHours < 0)) {
      throw new Error(`${record.identity.canonicalTitle || record.id}: playtime cannot be negative.`);
    }
    if (stats.achievementMode === "exact") {
      const unlocked = stats.achievementUnlocked;
      const total = stats.achievementTotal;
      if (unlocked === undefined || total === undefined || unlocked < 0 || total <= 0 || unlocked > total) {
        throw new Error(`${record.identity.canonicalTitle || record.id}: unlocked achievements must be between 0 and the total.`);
      }
    }
    if (stats.achievementMode === "percentage" && (stats.achievementPercent === undefined || stats.achievementPercent < 0 || stats.achievementPercent > 100)) {
      throw new Error(`${record.identity.canonicalTitle || record.id}: achievement percentage must be between 0 and 100.`);
    }
    if (stats.paidAmount && (!Number.isFinite(stats.paidAmount.amount) || stats.paidAmount.amount <= 0 || !/^[A-Z]{3}$/.test(stats.paidAmount.currency))) {
      throw new Error(`${record.identity.canonicalTitle || record.id}: paid amount requires a positive amount and a three-letter currency code.`);
    }
  }
  const selected = store.records.filter((record) => record.publication.showOnHomepage && !record.publication.archived);
  if (selected.length > store.homepageLimit) throw new Error(`Homepage selection exceeds ${store.homepageLimit} games.`);
}

export function saveGameExperienceStore(store: GameExperienceStore) {
  if (!import.meta.env.DEV) throw new Error("Game Experience editing is only available in development.");
  validateGameExperienceStore(store);
  const normalized = normalizeGameExperienceStore({ ...store, updatedAt: new Date().toISOString() });
  if (!normalized) throw new Error("Invalid Game Experience collection.");
  window.localStorage.setItem(GAME_EXPERIENCE_STORAGE_KEY, JSON.stringify(normalized));
  snapshotCache = null;
  window.dispatchEvent(new Event(GAME_EXPERIENCE_CHANGE_EVENT));
  return normalized;
}

function subscribe(listener: () => void) {
  const onStorage = (event: StorageEvent) => { if (event.key === GAME_EXPERIENCE_STORAGE_KEY) listener(); };
  window.addEventListener("storage", onStorage);
  window.addEventListener(GAME_EXPERIENCE_CHANGE_EVENT, listener);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(GAME_EXPERIENCE_CHANGE_EVENT, listener);
  };
}

export function useGameExperienceStore() {
  return useSyncExternalStore(subscribe, getGameExperienceStore, createLegacyGameExperienceStore);
}

export function getHomepageGames(store: GameExperienceStore) {
  return store.records
    .filter((record) => record.publication.visibility === "public" && record.publication.showOnHomepage && !record.publication.archived)
    .sort((a, b) => a.publication.homepageOrder - b.publication.homepageOrder)
    .slice(0, store.homepageLimit);
}

export function createBlankGameRecord(): GameExperienceRecord {
  const now = new Date().toISOString();
  const id = `game-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
  return {
    schemaVersion: 1,
    id,
    identity: { canonicalTitle: "", titleZh: "", titleEn: "" },
    stats: {},
    presentation: { tags: [], homepageTagIds: [] },
    reflection: { whyPlayedZh: "", whyPlayedEn: "", strengthsZh: "", strengthsEn: "", weaknessesZh: "", weaknessesEn: "", contributionZh: "", contributionEn: "" },
    detail: { zh: "", en: "" },
    publication: { visibility: "draft", showOnHomepage: false, homepageOrder: 999, libraryOrder: 999, archived: false },
    createdAt: now,
    updatedAt: now,
  };
}

export function formatPlaytime(record: GameExperienceRecord, locale: "zh" | "en") {
  const localized = locale === "zh" ? record.stats.playtimeLabelZh : record.stats.playtimeLabelEn;
  if (localized) return localized;
  if (record.stats.playtimeHours !== undefined) return `${record.stats.playtimeHours}h`;
  return null;
}

export function formatAchievement(record: GameExperienceRecord, locale: "zh" | "en") {
  const stats = record.stats;
  if (stats.achievementMode === "none") return locale === "zh" ? "无成就系统" : "No achievements";
  if (stats.achievementMode === "exact" && stats.achievementUnlocked !== undefined && stats.achievementTotal !== undefined) {
    return `${stats.achievementUnlocked} / ${stats.achievementTotal}`;
  }
  if (stats.achievementMode === "percentage" && stats.achievementPercent !== undefined) return `${stats.achievementPercent}%`;
  return null;
}

export function formatPaidAmount(record: GameExperienceRecord, locale: "zh" | "en") {
  const paid = record.stats.paidAmount;
  if (!paid || !Number.isFinite(paid.amount) || paid.amount <= 0) return null;
  try {
    return new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-AU", {
      style: "currency",
      currency: paid.currency,
      currencyDisplay: "narrowSymbol",
      maximumFractionDigits: Number.isInteger(paid.amount) ? 0 : 2,
    }).format(paid.amount);
  } catch {
    return `${paid.currency} ${paid.amount}`;
  }
}

export function gameTitle(record: GameExperienceRecord, locale: "zh" | "en") {
  return locale === "zh" ? record.identity.titleZh || record.identity.titleEn : record.identity.titleEn || record.identity.titleZh || record.identity.canonicalTitle;
}
