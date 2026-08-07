import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Edit3, X } from "lucide-react";
import { isCollectionExportCapture } from "../lib/collectionExportStaging";

export type CaseStudySaveStatus = "ready" | "saving" | "saved" | "error";

type CaseStudyEditorContextValue = {
  isEditing: boolean;
  setIsEditing: (value: boolean) => void;
  toggleEditing: () => void;
};

const CaseStudyEditorContext = createContext<CaseStudyEditorContextValue | null>(null);

export function CaseStudyEditorProvider({ children }: { children: ReactNode }) {
  const [isEditing, setIsEditing] = useState(false);
  const canEdit = import.meta.env.DEV;

  const value = {
    isEditing: canEdit && isEditing,
    setIsEditing: (next: boolean) => {
      if (canEdit) setIsEditing(next);
    },
    toggleEditing: () => {
      if (canEdit) setIsEditing((current) => !current);
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
  isEditing,
  onToggle,
  actions,
  children,
}: {
  isEditing: boolean;
  onToggle: () => void;
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
  }, [isEditing, actions, children]);

  // Also hidden during a collection export capture — this dock (EDIT
  // CONTENT, EDIT PROJECT INFO, EXPORT EXACT WEB PDF) is owner-only chrome
  // that must never appear in the captured screenshot the Portfolio
  // Collection PDF embeds; the DOM-trim step upstream only drops nodes
  // outside [data-project-route-shell], and this dock is rendered inside it.
  if (!import.meta.env.DEV || isCollectionExportCapture()) return null;

  return (
    <div
      ref={dockRef}
      className="fixed right-3 top-[calc(var(--site-header-height)+13px)] z-[80] flex max-w-[calc(100vw-1.5rem)] flex-col items-end gap-2 md:right-6"
    >
      <div className="flex max-w-full flex-wrap justify-end gap-2">
        <button
          type="button"
          className={`inline-flex items-center gap-2 rounded-full border px-4 py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.12em] shadow-archive backdrop-blur transition ${
            isEditing
              ? "border-acidGreen/70 bg-acidGreen text-deepIndigo"
              : "border-electricBlue/55 bg-deepIndigo/92 text-acidGreen hover:border-acidGreen/70 hover:bg-archiveBlue/92"
          }`}
          onClick={onToggle}
        >
          {isEditing ? <X className="h-3.5 w-3.5" aria-hidden="true" /> : <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />}
          {isEditing ? "DONE EDITING" : "EDIT CONTENT"}
        </button>
        {actions}
      </div>
      {isEditing ? children : null}
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
