import type { PropsWithChildren } from "react";
import { ProductionExportDock } from "../components/ProductionExportDock";
import { CustomCursor } from "../components/CustomCursor";

// Homepage 2.0 / project-chrome rework: the old global site header (logo,
// name, Work/Play nav, language switcher, mobile menu) and the old global
// footer are both retired from every page's render tree, not just hidden --
// Home renders its own Figma-driven hero/footer, and project detail pages
// carry their own minimal Back + language overlay controls (see
// DynamicProjectPage.tsx) instead of relying on a shared header band.
export function Shell({ children }: PropsWithChildren) {
  return (
    <div className="ambient-public-shell relative z-[1] min-h-screen bg-transparent text-softWhite">
      {/* Temporarily disabled for lag diagnosis — do not delete. <CustomCursor /> */}
      {children}
      <ProductionExportDock />
    </div>
  );
}
