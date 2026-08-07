import { useCallback, useLayoutEffect, useState } from "react";
import { FileDown } from "lucide-react";
import { useOwnerMode } from "../hooks/useOwnerMode";

const PRINT_QUERY_KEY = "printProject";

function readPrintMode() {
  if (typeof window === "undefined") return false;
  return new URL(window.location.href).searchParams.get(PRINT_QUERY_KEY) === "1";
}

function updatePrintQuery(enabled: boolean) {
  const url = new URL(window.location.href);
  if (enabled) url.searchParams.set(PRINT_QUERY_KEY, "1");
  else url.searchParams.delete(PRINT_QUERY_KEY);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

async function waitForProjectAssets() {
  await document.fonts?.ready;

  const images = Array.from(
    document.querySelectorAll<HTMLImageElement>("[data-project-route-shell] img"),
  );
  const ready = Promise.all(images.map(async (image) => {
    if (!image.complete) {
      await new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      });
    }
    await image.decode?.().catch(() => undefined);
  }));

  await Promise.race([
    ready,
    new Promise<void>((resolve) => window.setTimeout(resolve, 10_000)),
  ]);
}

export function ProjectPrintAction({ onBeforePrint }: { onBeforePrint?: () => void }) {
  const isOwnerMode = useOwnerMode();
  const [isPrintMode, setIsPrintMode] = useState(readPrintMode);
  const [isPreparing, setIsPreparing] = useState(false);

  const leavePrintMode = useCallback(() => {
    setIsPrintMode(false);
    setIsPreparing(false);
    updatePrintQuery(false);
  }, []);

  useLayoutEffect(() => {
    if (isPrintMode) document.documentElement.dataset.projectPrint = "true";
    else delete document.documentElement.dataset.projectPrint;
    return () => { delete document.documentElement.dataset.projectPrint; };
  }, [isPrintMode]);

  if (!isOwnerMode || !import.meta.env.DEV) return null;

  const printProject = async () => {
    if (isPreparing) return;
    setIsPreparing(true);
    onBeforePrint?.();
    updatePrintQuery(true);
    setIsPrintMode(true);

    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    await waitForProjectAssets();

    window.addEventListener("afterprint", leavePrintMode, { once: true });
    window.print();
  };

  return (
    <button
      type="button"
      className="inline-flex items-center gap-2 rounded-full border border-electricBlue/55 bg-deepIndigo/92 px-4 py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-acidGreen shadow-archive backdrop-blur transition hover:border-acidGreen/70 hover:bg-archiveBlue/92 disabled:cursor-wait disabled:opacity-60"
      onClick={() => void printProject()}
      disabled={isPreparing}
      data-project-print-control
    >
      <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
      {isPreparing ? "PREPARING PRINT..." : "EXPORT PROJECT PDF"}
    </button>
  );
}
