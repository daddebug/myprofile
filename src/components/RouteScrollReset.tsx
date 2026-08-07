import { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";

function scrollToHash(hash: string) {
  const rawTarget = hash.slice(1);
  if (!rawTarget) return false;

  let targetId = rawTarget;
  try {
    targetId = decodeURIComponent(rawTarget);
  } catch {
    // Keep the raw fragment when it is not valid URI-encoded text.
  }

  const target = document.getElementById(targetId) ?? document.getElementsByName(targetId)[0];
  if (!target) return false;

  target.scrollIntoView({ behavior: "auto", block: "start" });
  return true;
}

export function RouteScrollReset() {
  const location = useLocation();

  useLayoutEffect(() => {
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";

    return () => {
      window.history.scrollRestoration = previousRestoration;
    };
  }, []);

  useLayoutEffect(() => {
    let frame = 0;
    let remainingHashFrames = 120;

    const resetWindowScroll = () => {
      if (location.hash) {
        if (!scrollToHash(location.hash) && remainingHashFrames > 0) {
          remainingHashFrames -= 1;
          frame = window.requestAnimationFrame(resetWindowScroll);
        }
        return;
      }

      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    };

    resetWindowScroll();
    window.addEventListener("pageshow", resetWindowScroll);

    return () => {
      window.removeEventListener("pageshow", resetWindowScroll);
      window.cancelAnimationFrame(frame);
    };
  }, [location.hash, location.key, location.pathname, location.search]);

  return null;
}
