import { useEffect, useRef, useState } from "react";
import { Download, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import { exportProductionBundle, reportLauncherExportFailure } from "../lib/productionBundleExport";
import { useLocale } from "../locales/LocaleContext";

type ExportState = "idle" | "exporting" | "done" | "error";

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
        className="inline-flex items-center gap-2 rounded-full border border-electricBlue/45 bg-deepIndigo/94 px-4 py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-acidGreen shadow-archive transition hover:border-acidGreen disabled:cursor-wait disabled:opacity-60"
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
      className="inline-flex items-center gap-2 rounded-full border border-acidGreen/45 bg-deepIndigo/94 px-4 py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-acidGreen shadow-archive transition hover:bg-acidGreen hover:text-deepIndigo"
    >
      <FileText className="h-3.5 w-3.5" aria-hidden="true" />
      {locale === "zh" ? "作品集合集导出" : "PORTFOLIO COLLECTION"}
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

  if (!import.meta.env.DEV) return null;

  return (
    <div data-production-export-dock className="fixed bottom-4 left-4 z-[75] flex max-w-[calc(100vw-2rem)] flex-col items-start gap-2 print:hidden">
      <CollectionExportButton />
      <PublishExportButton />
    </div>
  );
}
