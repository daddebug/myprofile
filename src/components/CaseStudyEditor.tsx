import { createContext, useContext, useState, type ReactNode } from "react";
import { Edit3, X } from "lucide-react";

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
  children,
}: {
  isEditing: boolean;
  onToggle: () => void;
  children?: ReactNode;
}) {
  if (!import.meta.env.DEV) return null;

  return (
    <div className="fixed right-3 top-[82px] z-[80] flex max-w-[calc(100vw-1.5rem)] flex-col items-end gap-2 md:right-6 md:top-[84px]">
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
