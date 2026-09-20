import type { ReactNode } from "react";
import "./project-web-sections.css";
import "./portfolio2-layout.css";

// Normal document-flow presentation surface for web-native project sections.
// Bounded visual modules can continue to opt into ProjectArtboard separately.
export function ProjectWebSections({ children }: { children: ReactNode }) {
  return <div className="project-web-sections">{children}</div>;
}
