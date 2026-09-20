import { useSyncExternalStore } from "react";

// Homepage 3.0, Haoqi-track Phase 3: the DOM->WebGL bridge's own shared
// registry. HomeProjectCard (HomeProjectFlow.tsx) registers its DOM
// measurement target (the `.home-project-card__surface` element -- the
// same box Phase 1.2's 8px inset already made equal to the visible image
// edges) plus the currently-resolved cover URL and natural aspect ratio;
// HomeProjectCanvas reads this same Map every frame to place/scale its
// planes and load/swap textures. A plain external mutable store (like
// this project's existing homeSlotsStore.ts / dirtyIntentStore.ts
// pattern), not React state, because membership changes rarely but reads
// happen every animation frame -- routing that through React state would
// re-render the whole tree 60 times a second for no reason.
//
// DOM stays layout authority: this registry only ever *reads* an element
// the DOM grid already positioned; it never writes back into layout.
export type ProjectCoverEntry = {
  element: HTMLElement;
  coverUrl: string;
  ratio: number;
};

const entries = new Map<string, ProjectCoverEntry>();
const membershipListeners = new Set<() => void>();
const readyState = new Map<string, boolean>();
const readyListeners = new Set<(id: string) => void>();

function notifyMembershipChanged() {
  membershipListeners.forEach((listener) => listener());
}

export function registerProjectCover(id: string, entry: ProjectCoverEntry): void {
  const isNew = !entries.has(id);
  entries.set(id, entry);
  if (isNew) notifyMembershipChanged();
}

export function unregisterProjectCover(id: string): void {
  if (!entries.has(id)) return;
  entries.delete(id);
  readyState.delete(id);
  notifyMembershipChanged();
}

export function getRegisteredProjectCovers(): ReadonlyMap<string, ProjectCoverEntry> {
  return entries;
}

export function subscribeProjectCoverMembership(listener: () => void): () => void {
  membershipListeners.add(listener);
  return () => membershipListeners.delete(listener);
}

// Flipped exactly once per project, by HomeProjectCanvas, the first
// frame that project's texture has loaded AND its plane has been
// positioned at least once -- see HomeProjectCanvas.tsx's own comment
// for the full DOM-visible -> texture-loaded -> rect-verified -> DOM-
// hidden sequence this drives. Never set for a project whose texture
// failed to load or while WebGL itself is unsupported, so the DOM cover
// is the fallback by construction, not a special-cased branch.
export function setProjectCoverReady(id: string, ready: boolean): void {
  if (readyState.get(id) === ready) return;
  readyState.set(id, ready);
  readyListeners.forEach((listener) => listener(id));
}

export function isProjectCoverReady(id: string): boolean {
  return readyState.get(id) ?? false;
}

export function useProjectCoverReady(id: string): boolean {
  return useSyncExternalStore(
    (callback) => {
      const listener = (changedId: string) => {
        if (changedId === id) callback();
      };
      readyListeners.add(listener);
      return () => readyListeners.delete(listener);
    },
    () => isProjectCoverReady(id),
  );
}
