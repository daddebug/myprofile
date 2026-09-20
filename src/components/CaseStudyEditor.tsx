import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { isCollectionExportCapture } from "../lib/collectionExportStaging";
import { useEditingMode } from "../hooks/useEditingMode";

export type CaseStudySaveStatus = "ready" | "saving" | "saved" | "error";

type CaseStudyEditorContextValue = {
  isEditing: boolean;
  setIsEditing: (value: boolean) => void;
  toggleEditing: () => void;
};

const CaseStudyEditorContext = createContext<CaseStudyEditorContextValue | null>(null);

export function CaseStudyEditorProvider({ children }: { children: ReactNode }) {
  // Content editing is automatic now -- no second "EDIT CONTENT" activation
  // click. isEditing tracks editingMode directly; `suppressed` exists only
  // for the one remaining caller that needs to hide inline editor chrome
  // for a moment without touching global editingMode: the live Exact Web
  // PDF capture (ProjectExactWebExportAction's onBeforeExport/onAfterExport
  // via setIsEditing(false)/(true) below) mutates the real page's own DOM
  // before screenshotting it, then restores editing once the export
  // settles. Nothing else should call setIsEditing/toggleEditing anymore.
  const [suppressed, setSuppressed] = useState(false);
  // Content-editing capability is gated on the same shared owner-permission
  // + editingMode pair every other editor surface uses (ProductionExportDock,
  // HomePage's InlineTemplateField/slot pickers) -- not on
  // import.meta.env.DEV alone, so it stays unavailable until the global
  // Edit trigger is on, even in a DEV build.
  const canEdit = useEditingMode();

  const value = {
    isEditing: canEdit && !suppressed,
    setIsEditing: (next: boolean) => {
      if (canEdit) setSuppressed(!next);
    },
    toggleEditing: () => {
      if (canEdit) setSuppressed((current) => !current);
    },
  };

  return <CaseStudyEditorContext.Provider value={value}>{children}</CaseStudyEditorContext.Provider>;
}

export function useCaseStudyEditor() {
  const value = useContext(CaseStudyEditorContext);
  if (!value) throw new Error("useCaseStudyEditor must be used inside CaseStudyEditorProvider.");
  return value;
}

export function CaseStudyEditorDock({
  actions,
  children,
}: {
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const dockRef = useRef<HTMLDivElement | null>(null);

  // Publishes this dock's real, live bottom edge as a CSS variable so any other
  // fixed/sticky editor toolbar on the page (e.g. ProjectDocumentPage's
  // Cancel/Save bar) can stack directly underneath it instead of guessing a
  // fixed pixel offset. Re-measures whenever the dock's own size changes (extra
  // action buttons, wrapped rows on narrow widths, status text appearing) so it
  // stays correct at any viewport width, zoom level, or content length.
  useLayoutEffect(() => {
    const node = dockRef.current;
    if (!node || typeof ResizeObserver === "undefined") return undefined;
    const publish = () => {
      document.documentElement.style.setProperty("--owner-dock-bottom", `${Math.ceil(node.getBoundingClientRect().bottom)}px`);
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(node);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--owner-dock-bottom");
    };
  }, [actions, children]);

  // Gated on editingMode itself, not just import.meta.env.DEV -- this whole
  // dock (EDIT PROJECT INFO, Quick Settings, EXPORT EXACT WEB PDF) is editor
  // chrome, so it must disappear the moment editingMode is off, the same as
  // ProductionExportDock's own contents. No separate "EDIT CONTENT"
  // activation anymore -- content editing is automatic whenever editingMode
  // is on (see CaseStudyEditorProvider), so this dock no longer needs an
  // isEditing-driven toggle button; it renders whenever it's visible at
  // all. Also hidden during a collection export capture, since this
  // owner-only chrome must never appear in the captured screenshot the
  // Portfolio Collection PDF embeds (the DOM-trim step upstream only drops
  // nodes outside [data-project-route-shell], and this dock renders inside
  // it). The literal `!import.meta.env.DEV` check stays first (same as
  // every other editor-chrome gate in this codebase) so the whole component
  // body is dead-code-eliminated from the production bundle, not just made
  // to return null at runtime -- useEditingMode() alone can't be statically
  // folded away since its result depends on a runtime hook chain.
  const editingModeActive = useEditingMode();
  if (!import.meta.env.DEV || !editingModeActive || isCollectionExportCapture()) return null;

  return (
    <div
      ref={dockRef}
      data-owner-editor-dock
      className="fixed right-3 top-[calc(var(--site-header-height)+13px)] z-[80] flex max-w-[calc(100vw-1.5rem)] flex-col items-end gap-2 md:right-6"
    >
      <div className="flex max-w-full flex-wrap justify-end gap-2">
        {actions}
      </div>
      {children}
    </div>
  );
}

export function CaseStudyEditorActions({
  saveStatus,
  children,
}: {
  saveStatus: CaseStudySaveStatus;
  children?: ReactNode;
}) {
  const status = saveStatus === "saving" ? "SAVING..." : saveStatus === "error" ? "SAVE ERROR" : "SAVED LOCALLY";

  return (
    <div className="flex max-w-full flex-wrap items-center justify-end gap-2 rounded-[12px] border border-electricBlue/35 bg-deepIndigo/95 px-3 py-2 shadow-archive backdrop-blur">
      <span className={`font-mono text-[10px] font-bold uppercase tracking-[0.1em] ${saveStatus === "error" ? "text-peach" : "text-softWhite/48"}`}>
        {status}
      </span>
      {children}
    </div>
  );
}
