import type { ReactNode } from "react";

// Stacks ProjectArtboards with zero margin/gap -- boards butt seamlessly
// against each other, matching the PSD's own document where one Frame
// ends exactly where the next begins.
export function ArtboardStack({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", flexDirection: "column", margin: 0, gap: 0 }}>{children}</div>;
}
