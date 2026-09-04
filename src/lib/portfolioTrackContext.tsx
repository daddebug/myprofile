import { createContext, useContext, useState, type ReactNode } from "react";
import { PORTFOLIO_TRACK_OPTIONS, type PortfolioTrack } from "./projectMetadata";

// "all" is presentation-only public navigation state -- it is never a real
// PortfolioTrack, never saved into project metadata, and never an editor
// option. It only ever exists here, in the shared active-tab state.
export type ActivePortfolioTrack = "all" | PortfolioTrack;

// Home has no ALL tab of its own (Work/Archive is where "everything,
// including unclassified" lives) -- when the shared state is "all" (e.g.
// arriving from Work's own default), Home resolves it to the first real
// Track for display/filtering only. This never writes back to the shared
// context, so Work's own ALL tab and filtering are unaffected.
export function resolveHomeTrack(activeTrack: ActivePortfolioTrack): PortfolioTrack {
  return activeTrack === "all" ? PORTFOLIO_TRACK_OPTIONS[0] : activeTrack;
}

const PortfolioTrackContext = createContext<{
  activeTrack: ActivePortfolioTrack;
  setActiveTrack: (track: ActivePortfolioTrack) => void;
} | null>(null);

// Mounted once above the route tree in App.tsx (outside the <Routes> subtree
// that remounts on every pathname change) so Home <-> Work keeps the same
// active track for the session. Deliberately volatile: no localStorage, no
// URL/query param -- a refresh resetting to the default "all" is accepted.
export function PortfolioTrackProvider({ children }: { children: ReactNode }) {
  const [activeTrack, setActiveTrack] = useState<ActivePortfolioTrack>("all");
  return <PortfolioTrackContext.Provider value={{ activeTrack, setActiveTrack }}>{children}</PortfolioTrackContext.Provider>;
}

export function usePortfolioTrack() {
  const context = useContext(PortfolioTrackContext);
  if (!context) throw new Error("usePortfolioTrack must be used within PortfolioTrackProvider");
  return context;
}
