import { useEffect } from "react";

// Ambient page-background signal for chrome that floats OUTSIDE the page's
// own DOM subtree -- ProductionExportDock is rendered as Shell's sibling
// (see layouts/Shell.tsx), not a descendant of any one page, so a CSS
// selector scoped to the page's own root class can never reach it. Written
// to <html> (the nearest common ancestor of every page and the dock) as
// data-surface="light" | "dark" so plain CSS attribute selectors can react
// to it -- see ProductionExportDock's own .dock-glass-button rules in
// styles.css -- without any prop-drilling or React context. Restored to
// whatever value (if any) was set before this page mounted, so navigating
// away never leaves a stale surface behind for whichever page opens next.
export function useSurfaceSignal(surface: "light" | "dark") {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute("data-surface");
    root.setAttribute("data-surface", surface);
    return () => {
      if (previous === null) root.removeAttribute("data-surface");
      else root.setAttribute("data-surface", previous);
    };
  }, [surface]);
}
