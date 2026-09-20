// Double Image (image-row) is a strict, Figma-defined 2-slot layout only
// (node DOUBLE_IMAGE in docs/design/figma-template-map.json). There is no
// auto single/triple fallback and no chunking of larger legacy sets --
// see ImageRowTemplate.tsx for how a non-2-count instance is handled
// (marked legacy/incompatible in the editor, hidden on the live site).

export const DOUBLE_IMAGE_ROW_FRAME_WIDTH = 1180;
export const DOUBLE_IMAGE_ROW_FRAME_HEIGHT = 386;

export interface ImageRowSlotGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const DOUBLE_IMAGE_ROW_SLOTS: ImageRowSlotGeometry[] = [
  { x: 0, y: 31, width: 575, height: 323 },
  { x: 605, y: 31, width: 575, height: 323 },
];

export function toFramePercent(value: number, frameSize: number): string {
  return `${(value / frameSize) * 100}%`;
}
