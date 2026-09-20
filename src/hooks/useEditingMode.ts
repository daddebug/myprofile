import { useEffect, useState } from "react";
import { useOwnerMode } from "./useOwnerMode";

// Separate from owner PERMISSION (useOwnerMode): owner permission decides
// whether a draft/private project can be reached at all; editingMode
// decides whether editor CHROME (ProductionExportDock's full contents,
// InlineTemplateField, homepage slot pickers, CaseStudyEditorDock/EDIT
// CONTENT, etc.) is actually rendered. Defaults to false even when owner
// permission is true, so a fresh local open of the site looks exactly like
// the public portfolio until the one small Edit trigger is clicked.
export const EDITING_MODE_STORAGE_KEY = "dilida-portfolio:editing-mode:v1";
export const EDITING_MODE_CHANGED_EVENT = "dilida-portfolio:editing-mode-changed";

function readStoredEditingMode(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(EDITING_MODE_STORAGE_KEY) === "1";
}

// The one place editingMode is changed after mount (the small Edit /
// Exit Edit trigger). No-ops outside DEV -- editingMode can never be
// switched on in a production build regardless of what calls this.
export function setEditingMode(value: boolean): void {
  if (typeof window === "undefined" || !import.meta.env.DEV) return;
  if (value) {
    window.localStorage.setItem(EDITING_MODE_STORAGE_KEY, "1");
  } else {
    window.localStorage.removeItem(EDITING_MODE_STORAGE_KEY);
  }
  window.dispatchEvent(new CustomEvent(EDITING_MODE_CHANGED_EVENT, { detail: { value } }));
}

// Returns isOwner && editingMode as one value -- editor UI should never be
// visible without owner permission regardless of a stale "editingMode: on"
// flag (e.g. left on from a previous session, then Visitor Preview is
// switched on instead of owner permission actually changing). Call sites
// that also independently gate project-click permission still do so via
// useOwnerMode() directly and separately, per this round's split -- this
// hook only ever answers "should editor chrome render right now."
export function useEditingMode(): boolean {
  const isOwner = useOwnerMode();
  const [editingMode, setLocalEditingMode] = useState(() => import.meta.env.DEV && readStoredEditingMode());

  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    const handleChange = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail?.value === "boolean") {
        setLocalEditingMode(event.detail.value);
      }
    };
    window.addEventListener(EDITING_MODE_CHANGED_EVENT, handleChange);
    return () => window.removeEventListener(EDITING_MODE_CHANGED_EVENT, handleChange);
  }, []);

  return isOwner && editingMode;
}
