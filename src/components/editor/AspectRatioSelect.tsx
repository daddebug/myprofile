// Single shared aspect-ratio control, used everywhere an image or embed
// needs a display ratio (project-body media, Figma prototype poster, etc.)
// instead of each editor re-declaring its own copy of the same 5 options.
export const ASPECT_RATIO_OPTIONS = ["16:9", "4:3", "1:1", "9:16", "auto"] as const;
export type AspectRatioValue = (typeof ASPECT_RATIO_OPTIONS)[number];

export function AspectRatioSelect({
  label = "Aspect ratio",
  value,
  onChange,
}: {
  label?: string;
  value: AspectRatioValue;
  onChange: (value: AspectRatioValue) => void;
}) {
  return (
    <label>
      <span className="editor-label">{label}</span>
      <select className="editor-select" value={value} onChange={(event) => onChange(event.target.value as AspectRatioValue)}>
        {ASPECT_RATIO_OPTIONS.map((ratio) => <option key={ratio}>{ratio}</option>)}
      </select>
    </label>
  );
}

export function aspectRatioToClassName(value: string | undefined) {
  if (value === "4:3") return "aspect-[4/3]";
  if (value === "1:1") return "aspect-square";
  if (value === "9:16") return "aspect-[9/16]";
  if (value === "auto") return "min-h-48";
  return "aspect-video";
}
