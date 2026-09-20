import { useEffect, useState } from "react";

export const OWNER_MODE_STORAGE_KEY = "dilida-portfolio:owner-mode:v1";

// Dispatched whenever setOwnerMode() changes the stored value, so every
// mounted useOwnerMode() instance across the app (Home, WorkPage,
// GameArchivePage, project pages, the dock's own toggle) updates together --
// a plain localStorage write alone doesn't re-render already-mounted
// sibling components. Mirrors the existing PROJECT_PUBLIC_META_CHANGED_EVENT
// pattern (projectMetadata.ts) rather than inventing a new cross-component
// notification mechanism.
export const OWNER_MODE_CHANGED_EVENT = "dilida-portfolio:owner-mode-changed";

function readOwnerParameter() {
  if (typeof window === "undefined") return null;
  return new URL(window.location.href).searchParams.get("owner");
}

// null = the user has never explicitly chosen a mode in this browser --
// distinct from "0", which is an explicit, remembered choice of Visitor
// Preview and must not be silently overridden back to the DEV default.
function readStoredOwnerMode(): boolean | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(OWNER_MODE_STORAGE_KEY);
  if (stored === "1") return true;
  if (stored === "0") return false;
  return null;
}

function readInitialOwnerMode(): boolean {
  // import.meta.env.DEV is the one hard outer gate -- production can never
  // become Owner regardless of what a browser's localStorage happens to
  // hold (e.g. from an earlier local session), and regardless of any
  // query-param override below.
  if (typeof window === "undefined" || !import.meta.env.DEV) return false;
  const parameter = readOwnerParameter();
  if (parameter === "1") return true;
  if (parameter === "0") return false;
  const stored = readStoredOwnerMode();
  if (stored !== null) return stored;
  // DEV default: Owner. Opening the local site should already let you edit
  // and reach every bound project without a query param or manual toggle --
  // only an explicit Visitor Preview choice (the dock toggle, or ?owner=0)
  // ever turns this off, and that choice is then remembered.
  return true;
}

// The one place that changes owner mode after mount (the dock's Owner /
// Visitor Preview toggle) -- writes the same storage key every
// useOwnerMode() instance already reads, then notifies them all via the
// shared event above. No second owner-state store.
export function setOwnerMode(value: boolean): void {
  if (typeof window === "undefined" || !import.meta.env.DEV) return;
  window.localStorage.setItem(OWNER_MODE_STORAGE_KEY, value ? "1" : "0");
  window.dispatchEvent(new CustomEvent(OWNER_MODE_CHANGED_EVENT, { detail: { value } }));
}

export function useOwnerMode() {
  const [isOwnerMode, setIsOwnerMode] = useState(readInitialOwnerMode);

  useEffect(() => {
    const parameter = readOwnerParameter();
    if (!import.meta.env.DEV) {
      if (parameter === "1" || parameter === "0") {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete("owner");
        window.history.replaceState(window.history.state, "", `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
      }
      return;
    }

    // ?owner=1/0 stays a debug override that also updates (and persists
    // through) the same shared storage/event path as the dock toggle --
    // not a second mechanism.
    if (parameter === "1") {
      setOwnerMode(true);
    } else if (parameter === "0") {
      setOwnerMode(false);
    }

    if (parameter === "1" || parameter === "0") {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete("owner");
      window.history.replaceState(window.history.state, "", `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
    }
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    const handleChange = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail?.value === "boolean") {
        setIsOwnerMode(event.detail.value);
      }
    };
    window.addEventListener(OWNER_MODE_CHANGED_EVENT, handleChange);
    return () => window.removeEventListener(OWNER_MODE_CHANGED_EVENT, handleChange);
  }, []);

  return isOwnerMode;
}
