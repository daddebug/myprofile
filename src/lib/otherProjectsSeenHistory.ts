// A lightweight, browser-local "have I already been recommended this
// project via Other Projects" history -- not authored content, not a draft,
// purely a per-visitor viewing preference, so plain localStorage (no
// publish/import path, no owner/DEV gate) is the right home for it, same
// tier as other pure-UI local state elsewhere in this app. Locale-
// independent: a project's identity (its id) doesn't change with viewing
// locale, so one shared history covers both.
const STORAGE_KEY = "dilida-portfolio:other-projects-seen:v1";

export function loadSeenOtherProjectIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((value): value is string => typeof value === "string"));
  } catch {
    return new Set();
  }
}

export function saveSeenOtherProjectIds(ids: ReadonlySet<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // best-effort, same as every other local-preference save path in this app
  }
}
