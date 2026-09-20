import {
  TemplatePreviewFrame,
  TemplateRenderBoundary,
} from "../components/template-tools/TemplatePreviewFrame";
import { getRegisteredTemplates, type TemplateContentValue } from "../lib/templateLibrary";
import type { TemplateInstance } from "../lib/projectTemplateInstances";

// Renders one template instance inside an Artboard, read-only -- reuses
// the same error-boundary/frame pieces TemplateInstancesSection's
// InstanceBlock uses, but deliberately does NOT go through InstanceBlock
// itself: no marginTop, no grid gap, no owner edit-button chrome, none of
// TemplateFlowRegion's normal-flow instance management. Placement is the
// caller's job via ArtboardTemplateSlot.
//
// Known gap: no inlineEditor wiring yet, so this instance is not owner-
// editable while it lives inside an Artboard slot -- see
// PROJECT_STATUS.md / the task report for why this was deliberately not
// built out in this pass (reusing the existing inline editor safely would
// need InstanceBlock's own editing state, which is currently private to
// TemplateInstancesSection.tsx).
export function ArtboardInstanceRenderer({
  instance,
  locale,
  horizontalInset,
}: {
  instance: TemplateInstance;
  locale: "zh" | "en";
  horizontalInset: number;
}) {
  const registered = getRegisteredTemplates().find((entry) => entry.meta.id === instance.templateId);
  if (!registered) return null;
  const Component = registered.Component;
  return (
    <TemplatePreviewFrame>
      <TemplateRenderBoundary name={registered.meta.nameEn} resetKey={`${instance.instanceId}-${locale}`}>
        <Component
          content={instance.content as Record<string, TemplateContentValue>}
          locale={locale}
          horizontalInset={horizontalInset}
        />
      </TemplateRenderBoundary>
    </TemplatePreviewFrame>
  );
}
