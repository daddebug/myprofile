export type PortfolioExportMode = "live" | "pdf" | "offline";

export function getPortfolioExportMode(): PortfolioExportMode {
  if (typeof window === "undefined") return "live";
  const mode = new URLSearchParams(window.location.search).get("exportMode");
  return mode === "pdf" || mode === "offline" ? mode : "live";
}
