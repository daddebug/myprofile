// Persistent, per-template default horizontal inset (px) for the Template
// Library's width control. One shared localStorage key holds every
// template's default — not a separate key per template — so a value set
// in the Builder survives a full page reload / browser restart / rebuild,
// and every new instance of that template (in any project) picks it up
// automatically. Project-level instances can still override this value for
// themselves; that override lives on the instance's own layoutSettings
// (see projectTemplateInstances.ts), never here.
import { useEffect, useState } from "react";

const STORAGE_KEY = "dilida-portfolio:template-layout-defaults:v1";
const CHANGE_EVENT = "dilida-portfolio:template-layout-defaults-changed";

// Initial, code-level fallback used only until a template's default has
// ever been saved. Once saved, the persisted value always wins — reopening
// the Builder never silently reverts to these.
const INITIAL_HORIZONTAL_INSETS: Record<string, number> = {
  "project-header": 120,
  "statement-longform": 80,
  "xmind-breakdown": 180,
  "supporting-note": 100,
  "phase-milestones": 40,
  "circle-summary": 40,
  "decision-table": 160,
  "image-row": 40,
  "figma-prototype": 180,
  "process-flow": 80,
};

type StoredDefaults = Record<string, { horizontalInset: number }>;

function readStore(): StoredDefaults {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const result: StoredDefaults = {};
    for (const [templateId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (
        value
        && typeof value === "object"
        && typeof (value as { horizontalInset?: unknown }).horizontalInset === "number"
        && Number.isFinite((value as { horizontalInset: number }).horizontalInset)
      ) {
        result[templateId] = { horizontalInset: (value as { horizontalInset: number }).horizontalInset };
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function getTemplateHorizontalInset(templateId: string): number {
  const stored = readStore()[templateId];
  if (stored) return stored.horizontalInset;
  return INITIAL_HORIZONTAL_INSETS[templateId] ?? 0;
}

export function setTemplateHorizontalInset(templateId: string, horizontalInset: number): void {
  const store = readStore();
  store[templateId] = { horizontalInset: Math.max(0, Math.round(horizontalInset)) };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { templateId } }));
}

// Live-reactive read: stays in sync if the Builder saves a new default for
// this template while this component is already mounted (Gallery, an open
// project page, etc.) — without requiring a manual reload.
export function useTemplateHorizontalInset(templateId: string): number {
  const [value, setValue] = useState(() => getTemplateHorizontalInset(templateId));

  useEffect(() => {
    setValue(getTemplateHorizontalInset(templateId));
    const onChange = () => setValue(getTemplateHorizontalInset(templateId));
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [templateId]);

  return value;
}
