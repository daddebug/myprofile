// Canonical, pure-function translation backfill helper (Translation
// Persistence fix). Applied wherever browser-authored local content
// (drafts, Game Experience records, project catalog overrides) is loaded
// or exported, so an `en` value already written to publishedPortfolio.json
// is never silently lost just because the browser's own local copy still
// has it empty.
//
// The ONLY rule: for any `{zh, en}` pair -- either a nested `{ zh, en }`
// object (e.g. a Game Experience tag, or `detail`), or sibling `fooZh`/
// `fooEn` fields on the same parent object (e.g. `titleZh`/`titleEn`,
// `reflection.strengthsZh`/`reflection.strengthsEn`) -- found at matching
// positions in `local` and `published`, local's `en` is adopted from
// published's `en` IFF:
//   local's own zh === published's own zh   (Chinese identity unchanged)
//   AND local's en is empty
//   AND published's en is non-empty
// A non-empty local `en` is always preserved untouched, never overwritten.
// A changed zh means the Chinese source was edited since translation and
// must NOT inherit stale English -- an empty `en` in that case is a valid
// "needs translation" signal, not a bug to paper over.
//
// Structural matching is positional (array index / object key), not a
// content-based search -- correct and sufficient for hydrating the SAME
// entity's local draft against its own currently-published counterpart,
// which is the only case this is used for. Never touches ids, asset
// references, ordering, numbers, booleans, publish state, or zh values
// themselves -- only ever writes into an already-empty en field.

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isEmptyText(value: unknown): boolean {
  return typeof value !== "string" || value.trim() === "";
}

function isZhEnPair(value: unknown): value is { zh: string; en: string } {
  return isRecord(value) && typeof value.zh === "string" && typeof value.en === "string";
}

function hydrateValue(local: unknown, published: unknown): unknown {
  if (published === null || published === undefined) return local;

  if (Array.isArray(local)) {
    if (!Array.isArray(published)) return local;
    return local.map((item, index) => hydrateValue(item, published[index]));
  }

  if (isZhEnPair(local)) {
    if (isZhEnPair(published) && local.zh === published.zh && isEmptyText(local.en) && !isEmptyText(published.en)) {
      return { ...local, en: published.en };
    }
    return local;
  }

  if (isRecord(local)) {
    if (!isRecord(published)) return local;
    const result: Record<string, unknown> = { ...local };

    for (const key of Object.keys(local)) {
      if (!key.endsWith("Zh")) continue;
      const enKey = `${key.slice(0, -2)}En`;
      if (!(enKey in local)) continue;
      const localZh = local[key];
      const localEn = local[enKey];
      const publishedZh = published[key];
      const publishedEn = published[enKey];
      if (
        typeof localZh === "string"
        && typeof publishedZh === "string"
        && localZh === publishedZh
        && isEmptyText(localEn)
        && !isEmptyText(publishedEn)
      ) {
        result[enKey] = publishedEn;
      }
    }

    for (const key of Object.keys(local)) {
      const value = local[key];
      if (Array.isArray(value) || isRecord(value)) {
        result[key] = hydrateValue(value, published[key]);
      }
    }

    return result;
  }

  return local;
}

// Public, typed entry point. `published` may be null/undefined (e.g. a
// brand-new project with nothing published yet) -- a no-op in that case.
export function hydrateTranslations<T>(local: T, published: T | null | undefined): T {
  return hydrateValue(local, published) as T;
}
