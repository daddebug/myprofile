// Session-scoped "has the opening aperture already played" flag -- a
// first Homepage entry this browser session gets the full reveal; a
// return visit (e.g. back from a project) does not replay it, matching
// PageTransition's own short per-route fade instead. Deliberately
// sessionStorage, not localStorage: a fresh tab/window should see the
// opening again, a same-session route change should not.
const INTRO_SESSION_KEY = "dilida-portfolio:intro-played:v1";

export function hasIntroPlayedThisSession(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.sessionStorage.getItem(INTRO_SESSION_KEY) === "1";
  } catch {
    // Storage unavailable (private mode, disabled) -- treat as already
    // played so the page never gets stuck replaying the aperture.
    return true;
  }
}

export function markIntroPlayed(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(INTRO_SESSION_KEY, "1");
  } catch {
    // Ignore -- worst case the aperture replays on the next entry.
  }
}

