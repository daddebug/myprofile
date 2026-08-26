export type CircleSummaryEditorItem = {
  id: string;
  text: { zh: string; en: string };
};

// Extracted so the fix for the "editing one item changes all of them" bug is
// independently testable without mounting the editor component — see
// scripts/circleSummaryUpdateRegressionTest.mjs. Pure: returns a new array,
// only the item at `index` is a new object, every other item keeps its
// original object reference (so the preview never sees a shared/mutated
// reference for items that weren't edited).
export function replaceCircleSummaryItemAt(
  items: CircleSummaryEditorItem[],
  index: number,
  updates: Partial<CircleSummaryEditorItem>,
): CircleSummaryEditorItem[] {
  return items.map((item, itemIndex) =>
    itemIndex === index ? { ...item, ...updates } : item,
  );
}
