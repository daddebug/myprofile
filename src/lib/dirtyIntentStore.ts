// The Edit Baseline / Dirty Intent Store (Publishing Architecture V2). The
// single place a baseContentHash is ever produced: captured once, the FIRST
// time an entity becomes dirty (a draft save, a Game Experience visibility
// change, a delete request), and reused unconditionally after that -- never
// re-read from currently-published state at export time. This is what makes
// Window-1 conflict detection in buildPublishPlan.mjs meaningful: comparing
// against a baseline taken *now*, at export time, would trivially never
// detect a conflict that happened between the user's first edit and their
// eventual export.
//
// Replaces the standalone `dilida-portfolio:pending-deletions:v1` sketched
// in an earlier draft of this design -- deletion is just one of three intent
// kinds this one store tracks, not a second parallel mechanism.
//
// FOUNDATION ONLY at this stage: this module is not yet wired into any real
// mutation call site (CaseStudyEditor draft saves, Game Experience
// visibility controls, project deletion). That wiring is deliberately
// deferred to the Game Experience UNPUBLISH integration and two-phase
// deletion steps later in the V2 cutover plan, so it can be done together
// with the UI flows it depends on, verified in a real browser, rather than
// half-wired into some save paths and not others.
import { useEffect, useState } from "react";
import { hashContent } from "./contentHash";

const STORAGE_KEY = "dilida-portfolio:dirty-intents:v1";
const CHANGE_EVENT = "dilida-portfolio:dirty-intents-changed";

export type DirtyIntentKind = "UPSERT" | "UNPUBLISH" | "DELETE";
export type DirtyIntentEntityType = "project" | "gameExperienceRecord" | "uiPractice";

export type DirtyIntentEntry = {
  entityId: string;
  entityType: DirtyIntentEntityType;
  kind: DirtyIntentKind;
  baseContentHash: string;
  capturedAt: string;
};

type Store = Record<string, DirtyIntentEntry>;

function isDirtyIntentKind(value: unknown): value is DirtyIntentKind {
  return value === "UPSERT" || value === "UNPUBLISH" || value === "DELETE";
}

function isDirtyIntentEntityType(value: unknown): value is DirtyIntentEntityType {
  return value === "project" || value === "gameExperienceRecord" || value === "uiPractice";
}

function isValidEntry(entityId: string, value: unknown): value is DirtyIntentEntry {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DirtyIntentEntry>;
  return (
    candidate.entityId === entityId
    && isDirtyIntentEntityType(candidate.entityType)
    && isDirtyIntentKind(candidate.kind)
    && typeof candidate.baseContentHash === "string" && candidate.baseContentHash.length > 0
    && typeof candidate.capturedAt === "string" && candidate.capturedAt.length > 0
  );
}

function readStore(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const result: Store = {};
    for (const [entityId, entry] of Object.entries(parsed as Record<string, unknown>)) {
      if (isValidEntry(entityId, entry)) result[entityId] = entry;
    }
    return result;
  } catch {
    return {};
  }
}

function writeStore(store: Store): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export function getDirtyIntent(entityId: string): DirtyIntentEntry | undefined {
  return readStore()[entityId];
}

export function listDirtyIntents(entityType?: DirtyIntentEntityType): DirtyIntentEntry[] {
  const entries = Object.values(readStore());
  return entityType ? entries.filter((entry) => entry.entityType === entityType) : entries;
}

// Captures this entity's baseline the FIRST time it becomes dirty, and
// records its current intent kind. If an entry already exists for this
// entityId, its baseContentHash is reused UNCONDITIONALLY -- only `kind` may
// change (e.g. a project the user was editing (UPSERT) is then deleted
// (DELETE): the baseline stays anchored to whatever production looked like
// before the user's first edit, not to the moment of the later delete
// request). currentPublishedEntity is only ever read to compute a NEW
// baseline; an existing entry's baseline is never recomputed from it.
export function captureDirtyIntent(
  entityId: string,
  entityType: DirtyIntentEntityType,
  kind: DirtyIntentKind,
  currentPublishedEntity: unknown,
): DirtyIntentEntry {
  const store = readStore();
  const existing = store[entityId];
  const entry: DirtyIntentEntry = existing
    ? { ...existing, kind }
    : { entityId, entityType, kind, baseContentHash: hashContent(currentPublishedEntity), capturedAt: new Date().toISOString() };
  store[entityId] = entry;
  writeStore(store);
  return entry;
}

// Clears one entity's dirty intent. Call this ONLY on publish-success
// acknowledgement (the intent's publish completed) or an explicit user
// discard/revert -- never as a side effect of exporting, closing a tab, or
// any other implicit event. A Window-1 CONFLICT on this entity must leave
// its entry open, not clear it (see the Deletion Transaction Model / Conflict
// Model): the user's local edit/delete request is still pending, not
// resolved, until a publish actually succeeds for it.
export function clearDirtyIntent(entityId: string): void {
  const store = readStore();
  if (!(entityId in store)) return;
  delete store[entityId];
  writeStore(store);
}

// Live-reactive read, mirroring templateLayoutDefaults.ts's
// useTemplateHorizontalInset pattern -- for future UI that needs to reflect
// the current dirty-intent set (e.g. an "N unpublished changes" indicator).
export function useDirtyIntents(entityType?: DirtyIntentEntityType): DirtyIntentEntry[] {
  const [value, setValue] = useState(() => listDirtyIntents(entityType));

  useEffect(() => {
    setValue(listDirtyIntents(entityType));
    const onChange = () => setValue(listDirtyIntents(entityType));
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [entityType]);

  return value;
}
