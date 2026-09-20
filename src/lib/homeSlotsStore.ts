// Shared factory behind homeProjectSlots.ts and homeExplorationSlots.ts --
// both are now legacy/inert (Homepage 3.0 Modular Interaction Redesign
// Phase B.1: the live Homepage renders the canonical catalog directly, no
// PROJECT/EXPLORE slot system), kept only for old-data continuity (see
// each file's own comment). Originally two independent 6-slot reference
// lists (Figma: same 3x2 card grid, switched by the hero tabs), each only
// ever storing a project id, never a copy of that project's title/image/
// summary. This module holds the one real implementation so the two stay
// identical (fixed count, normalization, empty/public rules) without
// hand-duplicating it.

import { useEffect, useState } from "react";

export type HomeSlotConfig = {
  ref: string | null;
};

export const HOME_SLOT_COUNT = 6;

export function emptyHomeSlots(): HomeSlotConfig[] {
  return Array.from({ length: HOME_SLOT_COUNT }, () => ({ ref: null }));
}

export function normalizeHomeSlots(value: unknown): HomeSlotConfig[] {
  const slots = emptyHomeSlots();
  if (!Array.isArray(value)) return slots;
  for (let index = 0; index < HOME_SLOT_COUNT; index += 1) {
    const entry = value[index];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const ref = (entry as Record<string, unknown>).ref;
    slots[index] = { ref: typeof ref === "string" && ref.trim() ? ref.trim() : null };
  }
  return slots;
}

export function createHomeSlotsStore(storageKey: string, getPublished: () => unknown) {
  const changeEvent = `${storageKey}-changed`;

  function load(): HomeSlotConfig[] {
    const published = normalizeHomeSlots(getPublished());
    if (typeof window === "undefined" || !import.meta.env.DEV) {
      return published;
    }
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (!stored) return published;
      return normalizeHomeSlots(JSON.parse(stored) as unknown);
    } catch {
      return published;
    }
  }

  function save(slots: HomeSlotConfig[]): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(slots));
    } catch {
      // best-effort, same as every other draft save path in this app
    }
    // Same-tab reactivity (the native "storage" event never fires in the
    // tab that made the write) -- mirrors useProjectCatalog/dirtyIntentStore's
    // own CHANGED_EVENT pattern, so any mounted consumer (Homepage's own
    // slot grid, /work's Project Control Center reading "homepage
    // placement") updates immediately without a reload, whichever one made
    // the write.
    window.dispatchEvent(new CustomEvent(changeEvent));
  }

  // Live-reactive read, for chrome that isn't Homepage's own slot grid but
  // still needs to reflect the current binding (e.g. /work showing which
  // slot, if any, a project currently occupies) -- and reactive Homepage
  // itself now uses this too, so a bind made from /work (or another tab)
  // updates Homepage without a reload either.
  function useSlots(): HomeSlotConfig[] {
    const [slots, setSlots] = useState(() => load());
    useEffect(() => {
      const refresh = () => setSlots(load());
      const handleStorage = (event: StorageEvent) => {
        if (!event.key || event.key === storageKey) refresh();
      };
      refresh();
      window.addEventListener(changeEvent, refresh);
      window.addEventListener("storage", handleStorage);
      return () => {
        window.removeEventListener(changeEvent, refresh);
        window.removeEventListener("storage", handleStorage);
      };
    }, []);
    return slots;
  }

  return { load, save, useSlots };
}
