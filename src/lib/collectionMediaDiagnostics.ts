// Structural media-collapse diagnostics for the collection export
// (collectionExport=1 mode only). Components that collapse a genuinely
// empty media slot (DraftImage in ThreeDCharacterUiDraftPage, RowImage in
// ImageRowTemplate) record it here instead of relying on a post-hoc DOM
// scan — once a slot is fully removed from the tree (not just emptied), a
// DOM scan after the fact can no longer see it existed at all. Recording
// happens inline during render; each recorder is keyed by a stable id so a
// React StrictMode double-render (or an unrelated re-render) overwrites the
// same entry instead of double-counting.
//
// Never touches localStorage/IndexedDB — this is an in-memory, per-page-
// load counter read once by the server-side capture via page.evaluate().

type MediaDiagnosticsStore = {
  emptySlotsFound: Set<string>;
  emptySlotsCollapsed: Set<string>;
  modulesOmitted: Set<string>;
  textOnlyCards: Set<string>;
};

function store(): MediaDiagnosticsStore | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { __collectionMediaDiagnostics?: MediaDiagnosticsStore };
  if (!w.__collectionMediaDiagnostics) {
    w.__collectionMediaDiagnostics = {
      emptySlotsFound: new Set(),
      emptySlotsCollapsed: new Set(),
      modulesOmitted: new Set(),
      textOnlyCards: new Set(),
    };
  }
  return w.__collectionMediaDiagnostics;
}

export function recordEmptySlotFound(id: string) {
  store()?.emptySlotsFound.add(id);
}

export function recordEmptySlotCollapsed(id: string) {
  store()?.emptySlotsCollapsed.add(id);
}

export function recordModuleOmitted(id: string) {
  store()?.modulesOmitted.add(id);
}

export function recordTextOnlyCard(id: string) {
  store()?.textOnlyCards.add(id);
}

// Per-top-level-template-instance overflow-fit diagnostics (collectionExport=1
// mode only) — recorded by TemplateInstancesSection's per-instance wrapper
// whenever it measures and (if needed) scales an overflowing template. Keyed
// by templateInstanceId (a Map, not a Set) so a re-measure overwrites the
// same entry instead of accumulating duplicates across re-renders.
export type TemplateFitDiagnostic = {
  templateInstanceId: string;
  templateId: string;
  naturalWidth: number;
  availableWidth: number;
  fitScale: number;
  overflowAfterFit: number;
};

function fitStore(): Map<string, TemplateFitDiagnostic> | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { __collectionTemplateFitDiagnostics?: Map<string, TemplateFitDiagnostic> };
  if (!w.__collectionTemplateFitDiagnostics) w.__collectionTemplateFitDiagnostics = new Map();
  return w.__collectionTemplateFitDiagnostics;
}

export function recordTemplateFit(diagnostic: TemplateFitDiagnostic) {
  fitStore()?.set(diagnostic.templateInstanceId, diagnostic);
}
