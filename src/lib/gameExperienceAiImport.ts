import {
  createBlankGameRecord,
  gameTitle,
  type GameExperienceRecord,
} from "./gameExperience";

type LocalizedInput = { zh?: string; en?: string };

type AchievementInput =
  | { mode: "exact"; unlocked: number; total: number }
  | { mode: "percentage"; percent: number }
  | { mode: "none" };

export type GameExperienceAiGame = {
  title: string;
  titleZh?: string;
  titleEn?: string;
  releaseYear?: number;
  platformIds?: string[];
  playtimeHours?: number;
  playtimeLabel?: LocalizedInput;
  achievement?: AchievementInput;
  paidAmount?: { amount: number; currency: string };
  completionStatus?: LocalizedInput;
  tags?: Array<{ zh?: string; en?: string }>;
  shortSummary?: LocalizedInput;
  whyPlayed?: LocalizedInput;
  strengths?: LocalizedInput;
  weaknesses?: LocalizedInput;
  contribution?: LocalizedInput;
  detail?: LocalizedInput;
  warnings?: string[];
};

export type GameExperienceAiDocument = {
  version: 1;
  games: GameExperienceAiGame[];
};

export type GameExperienceAiPreview = {
  key: string;
  classification: "NEW" | "UPDATE";
  title: string;
  existingRecordId?: string;
  changedFields: string[];
  warnings: string[];
  textMerges: Array<{
    field: string;
    oldValue: string;
    newValue: string;
    mergedValue: string;
  }>;
  result: GameExperienceRecord;
};

const rootFields = new Set(["version", "games"]);
const gameFields = new Set([
  "title", "titleZh", "titleEn", "releaseYear", "platformIds", "playtimeHours",
  "playtimeLabel", "achievement", "paidAmount", "completionStatus", "tags",
  "shortSummary", "whyPlayed", "strengths", "weaknesses", "contribution", "detail", "warnings",
]);
const localizedFields = new Set(["zh", "en"]);

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unknownFields(value: Record<string, unknown>, allowed: Set<string>, path: string, errors: string[]) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`${path}.${key}: unsupported field.`);
  }
}

function optionalText(value: unknown, path: string, errors: string[]) {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    errors.push(`${path}: expected text.`);
    return undefined;
  }
  return value.trim() || undefined;
}

// Internal-process / verification language that must never reach a field
// the user copies into a resume, form, or published page. Deliberately
// broad (Chinese + English) since the source is model output, not a fixed
// vocabulary the model always uses the same way. This list is the
// deterministic backstop for the prompt's instruction to keep this
// language out of visible fields - it is what actually blocks the bad
// text from reaching storage/publish if the model doesn't comply, not
// just a display-time cosmetic filter. Never applied to `warnings`, which
// is the one field this language legitimately belongs in.
const FORBIDDEN_TEXT_PATTERNS: RegExp[] = [
  /待确认/, /需核实/, /需确认/, /语音转写/, /可能是/, /猜测为/, /未确认/,
  /内部备注/, /推理过程/, /数据异常/, /核验/, /识别为.{0,6}(?:小时|年|个)/,
  /\bTBD\b/i, /\bto be confirmed\b/i, /\btranscribed as\b/i,
  /\bneeds? (?:confirmation|verification)\b/i, /\bunconfirmed\b/i, /\bunclear\b/i,
];

function containsForbiddenProcessLanguage(value: string) {
  return FORBIDDEN_TEXT_PATTERNS.some((pattern) => pattern.test(value));
}

// Same contract as optionalText, plus: if the model wrote internal
// verification/uncertainty language into a content field, drop the value
// (never partially keep it - a title or description with the process
// language stripped out is often still nonsensical) and record why in
// `notes`, which the caller folds into the game's own `warnings` - visible
// only in the AI-import preview, never merged into any published field.
function contentText(value: unknown, path: string, errors: string[], notes: string[]) {
  const text = optionalText(value, path, errors);
  if (text === undefined) return undefined;
  if (containsForbiddenProcessLanguage(text)) {
    notes.push(`${path}: dropped - contained internal verification/uncertainty language instead of a clean value.`);
    return undefined;
  }
  return text;
}

function localized(value: unknown, path: string, errors: string[], notes: string[]): LocalizedInput | undefined {
  if (value === undefined) return undefined;
  if (!isObject(value)) {
    errors.push(`${path}: expected { zh, en }.`);
    return undefined;
  }
  unknownFields(value, localizedFields, path, errors);
  return {
    zh: contentText(value.zh, `${path}.zh`, errors, notes),
    en: contentText(value.en, `${path}.en`, errors, notes),
  };
}

function finiteNumber(value: unknown, path: string, errors: string[], min = 0) {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < min) {
    errors.push(`${path}: expected a number greater than or equal to ${min}.`);
    return undefined;
  }
  return value;
}

function parseGame(value: unknown, index: number, errors: string[]): GameExperienceAiGame | null {
  const path = `games[${index}]`;
  if (!isObject(value)) {
    errors.push(`${path}: expected an object.`);
    return null;
  }
  unknownFields(value, gameFields, path, errors);
  // Dropped-content notes fold into this game's own `warnings` below -
  // visible in the AI-import preview only, never merged into a published
  // field (see buildResult/previewGameExperienceAiImport: `warnings` is
  // never written into the stored GameExperienceRecord).
  const notes: string[] = [];
  const title = contentText(value.title, `${path}.title`, errors, notes);
  if (!title) errors.push(`${path}.title: a game title explicitly present in the input is required.`);

  const platformIds = value.platformIds === undefined ? undefined : Array.isArray(value.platformIds)
    ? value.platformIds.map((entry, itemIndex) => optionalText(entry, `${path}.platformIds[${itemIndex}]`, errors)).filter((entry): entry is string => Boolean(entry))
    : (errors.push(`${path}.platformIds: expected a text array.`), undefined);

  let achievement: AchievementInput | undefined;
  if (value.achievement !== undefined) {
    if (!isObject(value.achievement) || typeof value.achievement.mode !== "string") {
      errors.push(`${path}.achievement: expected a supported achievement object.`);
    } else if (value.achievement.mode === "exact") {
      unknownFields(value.achievement, new Set(["mode", "unlocked", "total"]), `${path}.achievement`, errors);
      const unlocked = finiteNumber(value.achievement.unlocked, `${path}.achievement.unlocked`, errors);
      const total = finiteNumber(value.achievement.total, `${path}.achievement.total`, errors, 1);
      if (unlocked !== undefined && total !== undefined && unlocked > total) errors.push(`${path}.achievement.unlocked: cannot exceed total.`);
      if (unlocked !== undefined && total !== undefined && unlocked <= total) achievement = { mode: "exact", unlocked, total };
    } else if (value.achievement.mode === "percentage") {
      unknownFields(value.achievement, new Set(["mode", "percent"]), `${path}.achievement`, errors);
      const percent = finiteNumber(value.achievement.percent, `${path}.achievement.percent`, errors);
      if (percent !== undefined && percent > 100) errors.push(`${path}.achievement.percent: cannot exceed 100.`);
      if (percent !== undefined && percent <= 100) achievement = { mode: "percentage", percent };
    } else if (value.achievement.mode === "none") {
      unknownFields(value.achievement, new Set(["mode"]), `${path}.achievement`, errors);
      achievement = { mode: "none" };
    } else {
      errors.push(`${path}.achievement.mode: expected exact, percentage, or none.`);
    }
  }

  let paidAmount: GameExperienceAiGame["paidAmount"];
  if (value.paidAmount !== undefined) {
    if (!isObject(value.paidAmount)) {
      errors.push(`${path}.paidAmount: expected { amount, currency }.`);
    } else {
      unknownFields(value.paidAmount, new Set(["amount", "currency"]), `${path}.paidAmount`, errors);
      const amount = finiteNumber(value.paidAmount.amount, `${path}.paidAmount.amount`, errors, Number.EPSILON);
      const currency = optionalText(value.paidAmount.currency, `${path}.paidAmount.currency`, errors)?.toUpperCase();
      if (currency && !/^[A-Z]{3}$/.test(currency)) errors.push(`${path}.paidAmount.currency: expected a three-letter currency code such as CNY, AUD, or USD.`);
      if (amount !== undefined && currency && /^[A-Z]{3}$/.test(currency)) paidAmount = { amount, currency };
    }
  }

  const tags = value.tags === undefined ? undefined : Array.isArray(value.tags)
    ? value.tags.map((entry, itemIndex) => localized(entry, `${path}.tags[${itemIndex}]`, errors, notes) ?? {}).filter((entry) => entry.zh || entry.en)
    : (errors.push(`${path}.tags: expected an array of { zh, en } objects.`), undefined);
  const aiWarnings = value.warnings === undefined ? undefined : Array.isArray(value.warnings)
    ? value.warnings.map((entry, itemIndex) => optionalText(entry, `${path}.warnings[${itemIndex}]`, errors)).filter((entry): entry is string => Boolean(entry))
    : (errors.push(`${path}.warnings: expected a text array.`), undefined);

  return title ? {
    title,
    titleZh: contentText(value.titleZh, `${path}.titleZh`, errors, notes),
    titleEn: contentText(value.titleEn, `${path}.titleEn`, errors, notes),
    releaseYear: finiteNumber(value.releaseYear, `${path}.releaseYear`, errors, 1950),
    platformIds,
    playtimeHours: finiteNumber(value.playtimeHours, `${path}.playtimeHours`, errors),
    playtimeLabel: localized(value.playtimeLabel, `${path}.playtimeLabel`, errors, notes),
    achievement,
    paidAmount,
    completionStatus: localized(value.completionStatus, `${path}.completionStatus`, errors, notes),
    tags,
    shortSummary: localized(value.shortSummary, `${path}.shortSummary`, errors, notes),
    whyPlayed: localized(value.whyPlayed, `${path}.whyPlayed`, errors, notes),
    strengths: localized(value.strengths, `${path}.strengths`, errors, notes),
    weaknesses: localized(value.weaknesses, `${path}.weaknesses`, errors, notes),
    contribution: localized(value.contribution, `${path}.contribution`, errors, notes),
    detail: localized(value.detail, `${path}.detail`, errors, notes),
    warnings: [...(aiWarnings ?? []), ...notes],
  } : null;
}

function normalizeIdentity(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

function identityKeys(record: GameExperienceRecord) {
  return [record.identity.canonicalTitle, record.identity.titleZh, record.identity.titleEn, record.identity.originalTitle]
    .filter((value): value is string => Boolean(value?.trim()))
    .map(normalizeIdentity);
}

function mergeText(oldValue: string, newValue?: string) {
  const oldText = oldValue.trim();
  const newText = newValue?.trim() ?? "";
  if (!newText) return oldValue;
  if (!oldText) return newText;
  const oldNormalized = oldText.replace(/\s+/g, " ").toLocaleLowerCase();
  const newNormalized = newText.replace(/\s+/g, " ").toLocaleLowerCase();
  if (oldNormalized.includes(newNormalized)) return oldValue;
  if (newNormalized.includes(oldNormalized)) return newText;
  return `${oldText}\n\n${newText}`;
}

function setChanged(changes: string[], label: string, before: unknown, after: unknown) {
  if (JSON.stringify(before) !== JSON.stringify(after)) changes.push(label);
}

function buildResult(input: GameExperienceAiGame, existing: GameExperienceRecord | undefined, order: number) {
  const result = existing ? structuredClone(existing) : createBlankGameRecord();
  if (!existing) result.publication.libraryOrder = order;
  const changes: string[] = [];

  const nextCanonical = existing?.identity.canonicalTitle || input.title;
  const nextTitleZh = existing?.identity.titleZh || input.titleZh || (/\p{Script=Han}/u.test(input.title) ? input.title : undefined);
  const nextTitleEn = existing?.identity.titleEn || input.titleEn || input.title;
  setChanged(changes, "canonicalTitle", result.identity.canonicalTitle, nextCanonical);
  setChanged(changes, "titleZh", result.identity.titleZh, nextTitleZh);
  setChanged(changes, "titleEn", result.identity.titleEn, nextTitleEn);
  result.identity = {
    ...result.identity,
    canonicalTitle: nextCanonical,
    titleZh: nextTitleZh,
    titleEn: nextTitleEn,
    ...(input.releaseYear !== undefined ? { releaseYear: input.releaseYear } : {}),
    ...(input.platformIds !== undefined ? { platformIds: input.platformIds } : {}),
  };
  if (input.releaseYear !== undefined) setChanged(changes, "releaseYear", existing?.identity.releaseYear, input.releaseYear);
  if (input.platformIds !== undefined) setChanged(changes, "platformIds", existing?.identity.platformIds, input.platformIds);

  const nextStats = { ...result.stats };
  if (input.playtimeHours !== undefined) { setChanged(changes, "playtimeHours", nextStats.playtimeHours, input.playtimeHours); nextStats.playtimeHours = input.playtimeHours; }
  if (input.playtimeLabel?.zh !== undefined) { setChanged(changes, "playtimeLabel.zh", nextStats.playtimeLabelZh, input.playtimeLabel.zh); nextStats.playtimeLabelZh = input.playtimeLabel.zh; }
  if (input.playtimeLabel?.en !== undefined) { setChanged(changes, "playtimeLabel.en", nextStats.playtimeLabelEn, input.playtimeLabel.en); nextStats.playtimeLabelEn = input.playtimeLabel.en; }
  if (input.completionStatus?.zh !== undefined) { setChanged(changes, "completionStatus.zh", nextStats.completionStatusZh, input.completionStatus.zh); nextStats.completionStatusZh = input.completionStatus.zh; }
  if (input.completionStatus?.en !== undefined) { setChanged(changes, "completionStatus.en", nextStats.completionStatusEn, input.completionStatus.en); nextStats.completionStatusEn = input.completionStatus.en; }
  if (input.paidAmount !== undefined) { setChanged(changes, "paidAmount", nextStats.paidAmount, input.paidAmount); nextStats.paidAmount = input.paidAmount; }
  if (input.achievement) {
    const achievement = input.achievement;
    setChanged(changes, "achievement", {
      mode: nextStats.achievementMode,
      unlocked: nextStats.achievementUnlocked,
      total: nextStats.achievementTotal,
      percent: nextStats.achievementPercent,
    }, achievement);
    nextStats.achievementMode = achievement.mode;
    nextStats.achievementUnlocked = achievement.mode === "exact" ? achievement.unlocked : undefined;
    nextStats.achievementTotal = achievement.mode === "exact" ? achievement.total : undefined;
    nextStats.achievementPercent = achievement.mode === "percentage" ? achievement.percent : undefined;
  }
  result.stats = nextStats;

  const mergeLocalized = (
    label: string,
    incoming: LocalizedInput | undefined,
    get: (locale: "zh" | "en") => string,
    set: (locale: "zh" | "en", value: string) => void,
  ) => {
    for (const locale of ["zh", "en"] as const) {
      const value = incoming?.[locale];
      if (!value) continue;
      const merged = mergeText(get(locale), value);
      setChanged(changes, `${label}.${locale}`, get(locale), merged);
      set(locale, merged);
    }
  };
  mergeLocalized("shortSummary", input.shortSummary, (locale) => locale === "zh" ? result.presentation.shortSummaryZh ?? "" : result.presentation.shortSummaryEn ?? "", (locale, value) => { if (locale === "zh") result.presentation.shortSummaryZh = value; else result.presentation.shortSummaryEn = value; });
  mergeLocalized("whyPlayed", input.whyPlayed, (locale) => result.reflection[locale === "zh" ? "whyPlayedZh" : "whyPlayedEn"], (locale, value) => { result.reflection[locale === "zh" ? "whyPlayedZh" : "whyPlayedEn"] = value; });
  mergeLocalized("strengths", input.strengths, (locale) => result.reflection[locale === "zh" ? "strengthsZh" : "strengthsEn"], (locale, value) => { result.reflection[locale === "zh" ? "strengthsZh" : "strengthsEn"] = value; });
  mergeLocalized("weaknesses", input.weaknesses, (locale) => result.reflection[locale === "zh" ? "weaknessesZh" : "weaknessesEn"], (locale, value) => { result.reflection[locale === "zh" ? "weaknessesZh" : "weaknessesEn"] = value; });
  mergeLocalized("contribution", input.contribution, (locale) => result.reflection[locale === "zh" ? "contributionZh" : "contributionEn"], (locale, value) => { result.reflection[locale === "zh" ? "contributionZh" : "contributionEn"] = value; });
  mergeLocalized("detail", input.detail, (locale) => result.detail[locale], (locale, value) => { result.detail[locale] = value; });

  if (input.tags?.length) {
    const existingKeys = new Set(result.presentation.tags.map((tag) => `${tag.zh.toLocaleLowerCase()}|${tag.en.toLocaleLowerCase()}`));
    const additions = input.tags.filter((tag) => !existingKeys.has(`${(tag.zh ?? "").toLocaleLowerCase()}|${(tag.en ?? "").toLocaleLowerCase()}`));
    if (additions.length) {
      result.presentation.tags = [...result.presentation.tags, ...additions.map((tag) => ({ id: `${result.id}-tag-${crypto.randomUUID()}`, zh: tag.zh ?? "", en: tag.en ?? "" }))];
      changes.push("tags");
    }
  }
  result.updatedAt = new Date().toISOString();
  return { result, changes };
}

export function parseGameExperienceAiDocument(value: unknown): GameExperienceAiDocument {
  const errors: string[] = [];
  if (!isObject(value)) throw new Error("AI import must be a JSON object.");
  unknownFields(value, rootFields, "root", errors);
  if (value.version !== 1) errors.push("version: expected 1.");
  if (!Array.isArray(value.games) || value.games.length === 0) errors.push("games: expected at least one game.");
  const games = Array.isArray(value.games) ? value.games.map((game, index) => parseGame(game, index, errors)).filter((game): game is GameExperienceAiGame => Boolean(game)) : [];
  const seen = new Set<string>();
  games.forEach((game, index) => {
    const key = normalizeIdentity(game.title);
    if (seen.has(key)) errors.push(`games[${index}].title: duplicate game in the same import.`);
    seen.add(key);
  });
  if (errors.length) throw new Error(errors.join("\n"));
  return { version: 1, games };
}

export function previewGameExperienceAiImport(value: unknown, records: GameExperienceRecord[]): GameExperienceAiPreview[] {
  const document = parseGameExperienceAiDocument(value);
  const byIdentity = new Map<string, GameExperienceRecord>();
  records.forEach((record) => identityKeys(record).forEach((key) => byIdentity.set(key, record)));
  return document.games.map((input, index) => {
    const existing = [input.title, input.titleZh, input.titleEn]
      .filter((title): title is string => Boolean(title))
      .map((title) => byIdentity.get(normalizeIdentity(title)))
      .find((record): record is GameExperienceRecord => Boolean(record));
    const { result, changes } = buildResult(input, existing, records.length + index);
    const textMerges = existing ? [
      ["shortSummary.zh", existing.presentation.shortSummaryZh ?? "", input.shortSummary?.zh ?? "", result.presentation.shortSummaryZh ?? ""],
      ["shortSummary.en", existing.presentation.shortSummaryEn ?? "", input.shortSummary?.en ?? "", result.presentation.shortSummaryEn ?? ""],
      ["whyPlayed.zh", existing.reflection.whyPlayedZh, input.whyPlayed?.zh ?? "", result.reflection.whyPlayedZh],
      ["whyPlayed.en", existing.reflection.whyPlayedEn, input.whyPlayed?.en ?? "", result.reflection.whyPlayedEn],
      ["strengths.zh", existing.reflection.strengthsZh, input.strengths?.zh ?? "", result.reflection.strengthsZh],
      ["strengths.en", existing.reflection.strengthsEn, input.strengths?.en ?? "", result.reflection.strengthsEn],
      ["weaknesses.zh", existing.reflection.weaknessesZh, input.weaknesses?.zh ?? "", result.reflection.weaknessesZh],
      ["weaknesses.en", existing.reflection.weaknessesEn, input.weaknesses?.en ?? "", result.reflection.weaknessesEn],
      ["contribution.zh", existing.reflection.contributionZh, input.contribution?.zh ?? "", result.reflection.contributionZh],
      ["contribution.en", existing.reflection.contributionEn, input.contribution?.en ?? "", result.reflection.contributionEn],
      ["detail.zh", existing.detail.zh, input.detail?.zh ?? "", result.detail.zh],
      ["detail.en", existing.detail.en, input.detail?.en ?? "", result.detail.en],
    ].filter((entry) => Boolean(entry[2])).map(([field, oldValue, newValue, mergedValue]) => ({ field, oldValue, newValue, mergedValue })) : [];
    return {
      key: `${normalizeIdentity(input.title)}-${index}`,
      classification: existing ? "UPDATE" : "NEW",
      title: gameTitle(result, "zh"),
      existingRecordId: existing?.id,
      changedFields: changes,
      warnings: input.warnings ?? [],
      textMerges,
      result,
    };
  });
}

export function applyGameExperienceAiPreviews(records: GameExperienceRecord[], previews: GameExperienceAiPreview[], selectedKeys: Set<string>) {
  const next = structuredClone(records);
  for (const preview of previews) {
    if (!selectedKeys.has(preview.key)) continue;
    if (preview.existingRecordId) {
      const index = next.findIndex((record) => record.id === preview.existingRecordId);
      if (index < 0) throw new Error(`${preview.title}: existing record is no longer available.`);
      next[index] = structuredClone(preview.result);
    } else {
      next.push(structuredClone(preview.result));
    }
  }
  return next;
}

export function gameExperienceAiPrompt(notes: string, records: GameExperienceRecord[]) {
  const identities = records.map((record) => ({
    canonicalTitle: record.identity.canonicalTitle,
    titleZh: record.identity.titleZh ?? "",
    titleEn: record.identity.titleEn,
  }));
  return [
    "Convert the user's Game Experience notes into JSON only. Do not use Markdown.",
    "Return exactly: {\"version\":1,\"games\":[...]}.",
    "Each game requires title. Optional fields are titleZh, titleEn, releaseYear, platformIds, playtimeHours, playtimeLabel:{zh,en}, achievement, paidAmount:{amount,currency}, completionStatus:{zh,en}, tags:[{zh,en}], shortSummary:{zh,en}, whyPlayed:{zh,en}, strengths:{zh,en}, weaknesses:{zh,en}, contribution:{zh,en}, detail:{zh,en}, warnings:[string].",
    "Achievement is optional. If explicitly stated, use {mode:\"exact\",unlocked,total}, {mode:\"percentage\",percent}, or {mode:\"none\"}. Otherwise omit it.",
    "paidAmount is optional and may appear only when payment/spending and currency are explicitly stated. Use a three-letter currency code.",
    "Never infer playtime, achievements, spend, platform, completion, dates, rating, or tags.",
    "For every field: (1) if the notes state a specific number or fact, use it exactly; (2) if only a range or approximate scale is stated, write that range as a normal descriptive phrase (e.g. playtimeLabel.zh: \"150+ 小时\" or \"长期游玩\"); (3) if nothing reliable is stated, omit the field entirely - do not fill it with a placeholder or partial guess.",
    "The verification/uncertainty process itself - transcription artifacts, unclear numbers, anything you are unsure how to interpret - belongs ONLY in the warnings array, stated as a note to the human reviewer. It must never appear inside title, titleZh, titleEn, playtimeLabel, completionStatus, shortSummary, whyPlayed, strengths, weaknesses, contribution, or detail. Every one of those fields must read as finished, submittable copy the user could copy into a resume without editing.",
    "Concretely forbidden inside any field other than warnings, in any language: 待确认, 需核实, 需确认, 语音转写为, 可能是, 猜测为, 未确认, 内部备注, 推理过程, 数据异常, \"TBD\", \"to be confirmed\", \"unclear\", \"transcribed as\", \"unconfirmed\". If you catch yourself about to write one of these into a content field, delete that field's value and move the concern to warnings instead.",
    "Example - notes say the user played Stardew Valley for what a voice transcript rendered as \"283年9小时\": correct output is playtimeLabel.zh:\"283.9h\" if you can confidently resolve the number, OR omit playtimeHours/playtimeLabel entirely and instead write shortSummary.zh:\"长期游玩，对经营循环和长期成长系统较熟悉\" if you cannot. Do NOT output playtimeLabel.zh:\"语音转写为'283年9小时'，具体小时数需确认\" - that sentence describes your own uncertainty and must never be a field value.",
    "Never return coverAssetId, coverPublicPath, any asset field, a path, Blob, Base64, or IndexedDB data.",
    "Keep the user's first-person design-observation perspective. Do not turn the notes into a generic review and do not invent conclusions.",
    "For Chinese copy, keep whyPlayed.zh to one concise contextual statement of about 30-60 Chinese characters.",
    "Compress strengths.zh and weaknesses.zh into only the 1-2 strongest observations each. Target about 50-80 Chinese characters, avoid long explanation, and move supporting reasoning into detail.zh.",
    "Keep contribution.zh as the main design conclusion at about 80-140 Chinese characters. Move supporting explanation and extended evidence into detail.zh, which has no strict length limit.",
    "Do not repeat the same explanation across strengths, weaknesses, contribution, and detail. Preserve the user's actual opinion; never invent conclusions or destructively truncate source meaning.",
    `Existing game identities (for title matching only): ${JSON.stringify(identities)}`,
    "USER NOTES:",
    notes,
  ].join("\n");
}
