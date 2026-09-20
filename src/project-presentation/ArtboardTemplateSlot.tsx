import type { CSSProperties, ReactNode } from "react";

// Placement is a presentation-layer concern, not a template-content
// concern -- see PSD_TEMPLATE_WORKFLOW.md and this task's boundary against
// pushing artboardIndex/x/y/frameId into TemplateProps. This is the one
// place that translates a PSD (x, y, width, height) into where a child
// actually renders inside a ProjectArtboard.
//
// Artboard invariant:
//   1. An ArtboardTemplateSlot's own (x, y, width, height) is the ONLY
//      thing that controls a template's outer placement inside an
//      Artboard.
//   2. A template renderer placed inside an Artboard must not contribute
//      extra outer margin/padding that changes that placement -- any
//      margin/padding it normally carries for normal-flow section rhythm
//      (spacing between stacked templates on a legacy page) must be
//      zeroed for the Artboard case via an Artboard-scoped CSS override
//      (see project-artboard.css), never by adjusting the slot's own
//      PSD-sourced coordinate to compensate for it. Mapping geometry must
//      equal PSD geometry, not "PSD geometry minus a renderer's legacy
//      padding" -- the latter silently drifts every time that renderer's
//      CSS changes.
//   3. Spacing that is genuinely part of the design INSIDE a template
//      (e.g. phase-milestones' own number-to-title-to-description rhythm)
//      is unaffected by this rule and stays exactly as PSD-synced.
export function ArtboardTemplateSlot({
  x,
  y,
  width,
  height,
  children,
}: {
  x: number;
  y: number;
  width?: number;
  height?: number;
  children: ReactNode;
}) {
  const style: CSSProperties = {
    position: "absolute",
    left: x,
    top: y,
    width,
    height,
  };
  return <div style={style}>{children}</div>;
}
