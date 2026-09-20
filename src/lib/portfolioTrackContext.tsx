import { createContext, useContext, useState, type ReactNode } from "react";
import type { PortfolioTrack } from "./projectMetadata";

const PortfolioTrackContext = createContext<{
  activeTrack: PortfolioTrack;
  setActiveTrack: (track: PortfolioTrack) => void;
} | null>(null);

// Mounted once above the route tree in App.tsx (outside the <Routes> subtree
// that remounts on every pathname change) so Home <-> Work keeps the same
// active track for the session. Deliberately volatile: no localStorage, no
// URL/query param — a refresh resetting to the default track is accepted.
export function PortfolioTrackProvider({ children }: { children: ReactNode }) {
  const [activeTrack, setActiveTrack] = useState<PortfolioTrack>("ux-ui");
  return <PortfolioTrackContext.Provider value={{ activeTrack, setActiveTrack }}>{children}</PortfolioTrackContext.Provider>;
}

export function usePortfolioTrack() {
  const context = useContext(PortfolioTrackContext);
  if (!context) throw new Error("usePortfolioTrack must be used within PortfolioTrackProvider");
  return context;
}
