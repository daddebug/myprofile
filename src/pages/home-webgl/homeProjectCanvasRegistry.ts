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
  // Section B (Homepage 3.0): the hover-reveal texture. Empty string means
  // "no hover texture for this project" -- HomeProjectCanvas then leaves
  // uHoverMix at 0 permanently, so a project with neither real nor
  // placeholder hover art degrades to "no hover effect", never a crash or
  // a blank/black swap.
  hoverUrl: string;
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

export function isFirstProjectCoverReady(): boolean {
  const firstId = entries.keys().next().value;
  return firstId !== undefined && isProjectCoverReady(firstId);
}

export function subscribeFirstProjectCoverReady(listener: () => void): () => void {
  const notify = () => listener();
  membershipListeners.add(notify);
  readyListeners.add(notify);
  return () => {
    membershipListeners.delete(notify);
    readyListeners.delete(notify);
  };
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


// Section B (Homepage 3.0): hover intent, set by HomeProjectCard's own
// onMouseEnter/onMouseLeave (mouse only -- React's mouseenter/mouseleave
// never fire persistently for touch, so this never gets stuck "on" on a
// touch device). A plain external store, same reasoning as the rest of
// this file: membership/hover changes are rare compared to the 60fps read
// HomeProjectCanvas does of it, so it must not be React state.
const hoveredIds = new Set<string>();
const hoverListeners = new Set<() => void>();

export function setProjectHovered(id: string, hovered: boolean): void {
  const wasHovered = hoveredIds.has(id);
  if (wasHovered === hovered) return;
  if (hovered) hoveredIds.add(id);
  else hoveredIds.delete(id);
  hoverListeners.forEach((listener) => listener());
}

export function isProjectHovered(id: string): boolean {
  return hoveredIds.has(id);
}

export function subscribeProjectHover(listener: () => void): () => void {
  hoverListeners.add(listener);
  return () => hoverListeners.delete(listener);
}
