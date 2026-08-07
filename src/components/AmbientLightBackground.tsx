import { useLocation } from "react-router-dom";
import "../ambient-light-background.css";

const PUBLIC_ROUTE_PATTERN = /^\/(?:zh|en)(?:\/|$)/;
const PRIVATE_ROUTE_PATTERN = /^\/(?:zh|en)\/(?:export|private)(?:\/|$)/;

export function AmbientLightBackground() {
  const location = useLocation();
  const isPublicRoute = PUBLIC_ROUTE_PATTERN.test(location.pathname)
    && !PRIVATE_ROUTE_PATTERN.test(location.pathname);

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
