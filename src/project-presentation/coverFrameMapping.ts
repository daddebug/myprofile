// Presentation-layer instance assignment for the web-native Cover. Geometry
// lives in ProjectCoverSection's normal document-flow grid, not in this helper.

// Presentation-layer "instance -> frame" assignment. FRAME_01_COVER claims
// the first phase-milestones instance; every other instance remains in the
// normal fallback flow at its original relative position.
export function splitCoverFrameInstances<T extends { templateId: string }>(
  instances: T[],
): { coverPhaseInstance: T | null; remainingInstances: T[]; originalIndex: number } {
  const index = instances.findIndex((instance) => instance.templateId === "phase-milestones");
  if (index === -1) return { coverPhaseInstance: null, remainingInstances: instances, originalIndex: -1 };
  const coverPhaseInstance = instances[index];
  const remainingInstances = [...instances.slice(0, index), ...instances.slice(index + 1)];
  return { coverPhaseInstance, remainingInstances, originalIndex: index };
}

export function mergeCoverFrameInstance<T>(
  coverPhaseInstance: T | null,
  originalIndex: number,
  nextRemaining: T[],
): T[] {
  if (!coverPhaseInstance) return nextRemaining;
  const insertAt = Math.max(0, Math.min(originalIndex, nextRemaining.length));
  return [...nextRemaining.slice(0, insertAt), coverPhaseInstance, ...nextRemaining.slice(insertAt)];
}
