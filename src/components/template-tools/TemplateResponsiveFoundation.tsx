import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import "../../template-library.css";

export const templateResponsiveFoundation = {
  breakpoints: {
    tablet: 768,
    desktop: 1200,
  },
  contentMaxWidth: "80rem",
} as const;

type TemplateStyle = CSSProperties & {
  [key: `--template-${string}`]: string | number | undefined;
};

// Owner-only "template boundary debug mode" (see TemplateDebugProvider).
// Read internally by TemplateSurface/TemplateContent so none of the 9
// template files need to know it exists — a provider higher up the tree
// (Builder preview, project edit-mode instance list) supplies a label (or
// null to mean "off"), and these two shared wrappers are the ONLY place the
// outline/label CSS is applied, since they are every template's real
// outermost box and inset-controlled content box respectively.
type TemplateDebugInfo = {
  label: string;
  showContentBoundary?: boolean;
  // Gallery-only: highlights this template's outer boundary (brighter/green)
  // to show which one the top control bar's inset field is currently
  // editing, distinct from the faint boundary every other template shows.
  emphasizeSurface?: boolean;
};

const TemplateDebugContext = createContext<TemplateDebugInfo | null>(null);

export function TemplateDebugProvider({
  info,
  children,
}: {
  info: TemplateDebugInfo | null;
  children: ReactNode;
}) {
  return (
    <TemplateDebugContext.Provider value={info}>
      {children}
    </TemplateDebugContext.Provider>
  );
}

export function TemplateSurface({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: TemplateStyle;
}) {
  const debugInfo = useContext(TemplateDebugContext);
  return (
    <section
      className={`template-library-surface ${debugInfo ? "template-library-surface--debug" : ""} ${debugInfo?.emphasizeSurface ? "template-library-surface--debug-selected" : ""} ${className}`.trim()}
      style={style}
    >
      {debugInfo ? (
        <span
          className={`template-library-debug-label ${debugInfo.emphasizeSurface ? "template-library-debug-label--selected" : ""}`.trim()}
          aria-hidden="true"
        >
          {debugInfo.label}
        </span>
      ) : null}
      {children}
    </section>
  );
}

export function TemplateContent({
  children,
  className = "",
  style,
  horizontalInset = 0,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  // Symmetric left/right inset (px). This is the ONLY thing that controls
  // this template's outer width/position — see the .template-library-content
  // rule in template-library.css for the actual calc()/clamp.
  horizontalInset?: number;
}) {
  const debugInfo = useContext(TemplateDebugContext);
  return (
    <div
      className={`template-library-content ${debugInfo?.showContentBoundary ? "template-library-content--debug" : ""} ${className}`.trim()}
      style={{
        ...style,
        "--template-horizontal-inset": `${Math.max(0, horizontalInset)}px`,
      } as TemplateStyle}
    >
      {children}
    </div>
  );
}
