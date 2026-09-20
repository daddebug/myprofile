import { useEffect, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import {
  getPortfolioTrackLabel,
  PORTFOLIO_TRACK_OPTIONS,
  setProjectPublicMetaOverride,
  type PortfolioTrack,
  type ProjectPublicationState,
  type ResolvedProjectMetadata,
} from "../lib/projectMetadata";
import { markProjectDirty } from "../lib/publishIntent";
import { ThemeColorField } from "./ProjectManagementPanels";

// Instant-write, not draft-then-save: every control here calls
// setProjectPublicMetaOverride directly on interaction, the same store
// EDIT PROJECT INFO writes to. The `project` prop is already reactive --
// ProjectPage.tsx's useProjectCatalog refreshes on the same
// PROJECT_PUBLIC_META_CHANGED_EVENT this dispatches -- so Track,
// Publication Status, and Theme Color all reflect on the real page (Hero
// and Footer included) without this popover ever needing to close. Tags
// are the one exception: free text needs local draft state so a keystroke
// mid-edit doesn't fight the reactive re-render, committed on blur.
export function ProjectQuickSettings({
  project,
  onOpenProjectInfo,
}: {
  project: ResolvedProjectMetadata;
  onOpenProjectInfo: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [tagsZhDraft, setTagsZhDraft] = useState(project.tagsZh.join(", "));
  const [tagsEnDraft, setTagsEnDraft] = useState(project.tagsEn.join(", "));

  useEffect(() => {
    setTagsZhDraft(project.tagsZh.join(", "));
    setTagsEnDraft(project.tagsEn.join(", "));
  }, [project.tagsZh, project.tagsEn]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open]);

  function patch(next: Parameters<typeof setProjectPublicMetaOverride>[1]) {
    setProjectPublicMetaOverride(project.id, next);
    markProjectDirty(project.id);
  }

  function commitTags() {
    patch({
      tagsZh: tagsZhDraft.split(",").map((item) => item.trim()).filter(Boolean),
      tagsEn: tagsEnDraft.split(",").map((item) => item.trim()).filter(Boolean),
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        className="editor-action bg-deepIndigo/92 text-acidGreen"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
        QUICK SETTINGS
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-[85] mt-2 w-[300px] max-w-[calc(100vw-2rem)] rounded-[12px] border border-electricBlue/30 bg-[#11113a] p-4 shadow-archive backdrop-blur">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-softWhite/56">Quick Settings</span>
            <button type="button" className="editor-icon" onClick={() => setOpen(false)} aria-label="Close">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="mt-3 grid gap-3">
            <label>
              <span className="editor-label">PROJECT / EXPLORE TRACK</span>
              <select
                className="editor-input"
                value={project.portfolioTrack ?? ""}
                onChange={(event) => patch({ portfolioTrack: (event.target.value || null) as PortfolioTrack | null })}
              >
                <option value="">{getPortfolioTrackLabel(null)}</option>
                {PORTFOLIO_TRACK_OPTIONS.map((track) => (
                  <option key={track} value={track}>{getPortfolioTrackLabel(track)}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="editor-label">Publication status</span>
              <select
                className="editor-input"
                value={project.publicationState}
                onChange={(event) => patch({ publicationState: event.target.value as ProjectPublicationState })}
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="coming-soon">Coming Soon</option>
              </select>
            </label>
            <ThemeColorField value={project.projectThemeColor} onChange={(next) => patch({ projectThemeColor: next })} />
            <div className="grid gap-2">
              <span className="editor-label">Tags</span>
              <input
                className="editor-input"
                value={tagsZhDraft}
                placeholder="Chinese tags, comma separated"
                onChange={(event) => setTagsZhDraft(event.target.value)}
                onBlur={commitTags}
              />
              <input
                className="editor-input"
                value={tagsEnDraft}
                placeholder="English tags, comma separated"
                onChange={(event) => setTagsEnDraft(event.target.value)}
                onBlur={commitTags}
              />
            </div>
            <button
              type="button"
              className="editor-action justify-center"
              onClick={() => {
                setOpen(false);
                onOpenProjectInfo();
              }}
            >
              PROJECT INFO
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
