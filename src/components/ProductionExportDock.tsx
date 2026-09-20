import { useEffect, useRef, useState } from "react";
import { Download, Edit3, Eye, EyeOff, FileText, FolderKanban, X } from "lucide-react";
import { Link } from "react-router-dom";
import { exportProductionBundle, reportLauncherExportFailure } from "../lib/productionBundleExport";
import { useLocale } from "../locales/LocaleContext";
import { setOwnerMode, useOwnerMode } from "../hooks/useOwnerMode";
import { setEditingMode, useEditingMode } from "../hooks/useEditingMode";

type ExportState = "idle" | "exporting" | "done" | "error";

// The one owner-only, always-reachable entry point into editing mode --
// visible whenever owner permission is true, regardless of editingMode
// itself (that's the whole point: this is how editingMode ever turns on).
// Deliberately tiny/unobtrusive so a default local open of the site still
// reads as the plain public portfolio. Everything else in this file (the
// full dock below, and every other editor-chrome consumer of
// useEditingMode()) stays hidden until this is clicked.
function EditModeTrigger() {
  const editingMode = useEditingMode();
  return (
    <button
      type="button"
      data-edit-mode-trigger
      onClick={() => setEditingMode(!editingMode)}
      aria-pressed={editingMode}
      title={editingMode ? "Exit editing mode" : "Enter editing mode"}
      className="fixed right-3 top-3 z-[90] grid h-8 w-8 place-items-center rounded-full border border-softWhite/20 bg-deepIndigo/70 text-softWhite/60 opacity-60 shadow-archive transition hover:opacity-100 hover:border-acidGreen hover:text-acidGreen print:hidden"
    >
      {editingMode ? <X className="h-3.5 w-3.5" aria-hidden="true" /> : <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />}
    </button>
  );
}

// Reads/writes the exact same dilida-portfolio:owner-mode:v1 key every
// useOwnerMode() call already uses (via setOwnerMode()'s shared
// storage+event path) -- not a second owner-state store. Only rendered
// once editingMode is on (see ProductionExportDock below) -- it is editor
// chrome, not a permission control, so it must never float on the canvas
// on its own.
function OwnerVisitorToggle() {
  const isOwnerMode = useOwnerMode();
  return (
    <button
      type="button"
      onClick={() => setOwnerMode(!isOwnerMode)}
      aria-pressed={isOwnerMode}
      className="dock-glass-button"
    >
      {isOwnerMode ? <Eye className="h-3.5 w-3.5" aria-hidden="true" /> : <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />}
      {isOwnerMode ? "OWNER · PREVIEW AS VISITOR" : "VISITOR PREVIEW · BACK TO OWNER"}
    </button>
  );
}

function PublishExportButton() {
  const [state, setState] = useState<ExportState>("idle");
  const [message, setMessage] = useState("");

  const runExport = async () => {
    setState("exporting");
    setMessage("Reading local drafts and referenced images...");
    try {
      const result = await exportProductionBundle();
      setState("done");
      setMessage(
        result.missingReferences.length
          ? `Exported with ${result.missingReferences.length} missing image reference(s). Review before import.`
          : `Exported ${result.draftCount} draft(s) and ${result.imageCount} image(s).`,
      );
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Export failed.");
    }
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        className="dock-glass-button"
        onClick={() => void runExport()}
        disabled={state === "exporting"}
      >
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
        {state === "exporting" ? "EXPORTING..." : "EXPORT FOR PUBLISH"}
      </button>
      {message ? (
        <p
          className={`max-w-sm rounded-lg border bg-deepIndigo/96 px-3 py-2 text-xs leading-5 shadow-archive ${
            state === "error" ? "border-peach/45 text-peach" : "border-softWhite/12 text-softWhite/64"
          }`}
          aria-live="polite"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}

// PORTFOLIO COLLECTION opens the collection editor (/:locale/export,
// PortfolioPdfBuilderPage) so the owner picks which projects/UI Works/games
// go in and in what order before anything is captured — it no longer
// triggers the Playwright collection pipeline directly. The editor's own
// "Generate Collection PDF" action (next to its legacy "Export PDF" print
// button) is what actually calls runPortfolioCollectionExport() now, with
// an explicit PortfolioCollectionSelection built from the editor's existing
// Outline/Projects/UI/Games panel state. See portfolioCollectionExport.ts.
function CollectionExportButton() {
  const { locale, pathFor } = useLocale();
  return (
    <Link
      to={pathFor("/export")}
      className="dock-glass-button"
    >
      <FileText className="h-3.5 w-3.5" aria-hidden="true" />
      {locale === "zh" ? "作品集合集导出" : "PORTFOLIO COLLECTION"}
    </Link>
  );
}

// The project archive/management page (WorkPage.tsx) is no longer reachable
// from any public nav (Homepage 2.0 / project-chrome rework retired the old
// Work/Play header links) -- this is now its only entry point, at the same
// owner-tool dock level as the export buttons below, gated identically
// (import.meta.env.DEV via the dock's own early return) so it is completely
// absent from the DOM in a production build, not merely hidden.
function ProjectArchiveButton() {
  const { locale, pathFor } = useLocale();
  return (
    <Link
      to={pathFor("/work")}
      className="dock-glass-button"
    >
      <FolderKanban className="h-3.5 w-3.5" aria-hidden="true" />
      {locale === "zh" ? "项目中台" : "PROJECT CONTROL CENTER"}
    </Link>
  );
}

export function ProductionExportDock() {
  const launcherExportStarted = useRef(false);

  useEffect(() => {
    if (!import.meta.env.DEV || launcherExportStarted.current) return;
    const params = new URLSearchParams(window.location.search);
    const requestToken = params.get("portfolioLauncherExport") ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(requestToken)) return;
    launcherExportStarted.current = true;

    const removeRequestFromUrl = () => {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.delete("portfolioLauncherExport");
      window.history.replaceState(window.history.state, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
    };

    void (async () => {
      try {
        const request = await fetch(
          `/__portfolio-content/publishing-export/request?token=${encodeURIComponent(requestToken)}`,
          { cache: "no-store" },
        );
        const state = await request.json().catch(() => null) as { state?: string; error?: string } | null;
        if (!request.ok) throw new Error(state?.error || "The launcher publishing request is unavailable.");
        if (state?.state === "pending") {
          await exportProductionBundle({ launcherRequestToken: requestToken });
        }
      } catch (error) {
        await reportLauncherExportFailure(requestToken, error);
      } finally {
        removeRequestFromUrl();
      }
    })();
  }, []);

  const isOwner = useOwnerMode();
  const editingMode = useEditingMode();

  if (!import.meta.env.DEV) return null;

  return (
    <>
      {/* isOwner (permission), not editingMode -- this is the trigger that
          turns editingMode on/off, so it can never be gated by the thing
          it controls. */}
      {isOwner ? <EditModeTrigger /> : null}
      {editingMode ? (
        <div data-production-export-dock className="fixed bottom-4 left-4 z-[75] flex max-w-[calc(100vw-2rem)] flex-col items-start gap-2 print:hidden">
          <OwnerVisitorToggle />
          <ProjectArchiveButton />
          <CollectionExportButton />
          <PublishExportButton />
        </div>
      ) : null}
    </>
  );
}
