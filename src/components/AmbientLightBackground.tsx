import { useLocation } from "react-router-dom";
import "../ambient-light-background.css";

const PUBLIC_ROUTE_PATTERN = /^\/(?:zh|en)(?:\/|$)/;
const PRIVATE_ROUTE_PATTERN = /^\/(?:zh|en)\/(?:export|private)(?:\/|$)/;
// Homepage 2.0 (the bare "/:locale" index route) is fully light-themed --
// this dark fixed overlay is the old-theme ambient decoration, still
// correct for the remaining dark public routes (WorkPage, GameArchivePage)
// but not for home, whose own background (styles.css) is now #F7F6ED.
const HOME_ROUTE_PATTERN = /^\/(?:zh|en)\/?$/;
// Project detail pages (/:locale/work/:slug) are Portfolio 2.0's
// DynamicProjectPage, also fully light-themed (#F7F6ED) -- Shell itself is
// bg-transparent, so without this exclusion this dark overlay was the only
// thing painting a background during the route's Suspense/lazy-load
// window, producing a dark flash before the page's own content mounted.
// /work itself (bare, no slug) and /play keep the dark ambient decoration.
const PROJECT_DETAIL_ROUTE_PATTERN = /^\/(?:zh|en)\/work\/[^/]+\/?$/;

export function AmbientLightBackground() {
  const location = useLocation();
  const isPublicRoute = PUBLIC_ROUTE_PATTERN.test(location.pathname)
    && !PRIVATE_ROUTE_PATTERN.test(location.pathname)
    && !HOME_ROUTE_PATTERN.test(location.pathname)
    && !PROJECT_DETAIL_ROUTE_PATTERN.test(location.pathname);

  if (!isPublicRoute) return null;

  return (
    <div
      className="ambient-light-background"
      data-ambient-light-background
      data-exact-export="hide"
      aria-hidden="true"
    >
      <div className="ambient-light ambient-light--green" />
      <div className="ambient-light ambient-light--blue" />
      <div className="ambient-light ambient-light--secondary" />
    </div>
  );
}
