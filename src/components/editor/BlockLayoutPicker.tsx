import type { BlockLayoutDefinition, BlockLayoutShape } from "../../lib/projectTemplates";

const BOX = "rounded-[2px] bg-current";

function ShapeIcon({ shape }: { shape: BlockLayoutShape }) {
  switch (shape) {
    case "text-block":
      return (
        <div className="grid w-full gap-1">
          <div className={`${BOX} h-1.5 w-2/3 opacity-80`} />
          <div className={`${BOX} h-1 w-full opacity-40`} />
          <div className={`${BOX} h-1 w-5/6 opacity-40`} />
        </div>
      );
    case "quote":
      return (
        <div className="grid w-full place-items-center py-1.5">
          <div className={`${BOX} h-1.5 w-3/4 opacity-70`} />
        </div>
      );
    case "two-col":
      return (
        <div className="grid w-full grid-cols-2 gap-1">
          <div className={`${BOX} h-6 opacity-70`} />
          <div className={`${BOX} h-6 opacity-40`} />
        </div>
      );
    case "three-col":
      return (
        <div className="grid w-full grid-cols-3 gap-1">
          <div className={`${BOX} h-6 opacity-70`} />
          <div className={`${BOX} h-6 opacity-55`} />
          <div className={`${BOX} h-6 opacity-40`} />
        </div>
      );
    case "single":
      return <div className={`${BOX} h-6 w-full opacity-70`} />;
    case "grid":
      return (
        <div className="grid w-full grid-cols-3 gap-1">
          {[70, 55, 40, 40, 55, 70].map((opacity, index) => (
            <div key={index} className={BOX} style={{ height: "0.75rem", opacity: opacity / 100 }} />
          ))}
        </div>
      );
    case "flow-h":
      return (
        <div className="flex w-full items-center gap-1">
          <div className={`${BOX} h-4 w-4 shrink-0 opacity-70`} />
          <div className="h-px flex-1 bg-current opacity-30" />
          <div className={`${BOX} h-4 w-4 shrink-0 opacity-55`} />
          <div className="h-px flex-1 bg-current opacity-30" />
          <div className={`${BOX} h-4 w-4 shrink-0 opacity-40`} />
        </div>
      );
    case "flow-v":
      return (
        <div className="grid w-full justify-items-start gap-1">
          <div className={`${BOX} h-2 w-2/3 opacity-70`} />
          <div className={`${BOX} ml-3 h-2 w-1/2 opacity-55`} />
          <div className={`${BOX} ml-6 h-2 w-1/3 opacity-40`} />
        </div>
      );
    case "embed":
      return (
        <div className="grid h-6 w-full place-items-center rounded-[2px] border border-dashed border-current opacity-60">
          <span className="text-[8px]">▷</span>
        </div>
      );
    case "divider":
      return (
        <div className="flex w-full items-center py-2.5">
          <div className="h-px w-full bg-current opacity-50" />
        </div>
      );
    case "comparison-columns":
      return (
        <div className="grid w-full grid-cols-2 gap-1">
          <div className="grid gap-1">
            <div className={`${BOX} h-3 w-full opacity-70`} />
            <div className={`${BOX} h-1 w-4/5 opacity-45`} />
            <div className={`${BOX} h-1 w-3/5 opacity-45`} />
          </div>
          <div className="grid gap-1">
            <div className={`${BOX} h-3 w-full opacity-55`} />
            <div className={`${BOX} h-1 w-4/5 opacity-35`} />
            <div className={`${BOX} h-1 w-3/5 opacity-35`} />
          </div>
        </div>
      );
    case "matrix-table":
      return (
        <div className="grid w-full grid-cols-3 gap-px overflow-hidden rounded-[2px] bg-current opacity-70">
          {Array.from({ length: 9 }).map((_, index) => (
            <div key={index} className="h-1.5 bg-[#151542]" style={{ opacity: index < 3 ? 1 : 0.6 }} />
          ))}
        </div>
      );
    case "timeline-dates":
      return (
        <div className="flex w-full items-center gap-1">
          {[0, 1, 2].map((index) => (
            <div key={index} className="flex flex-1 flex-col items-center gap-1">
              <div className={`${BOX} h-1.5 w-1.5 rounded-full opacity-75`} />
              <div className={`${BOX} h-1 w-full opacity-40`} />
            </div>
          ))}
        </div>
      );
    case "annotated-image":
      return (
        <div className="grid w-full grid-cols-2 gap-1">
          {[0, 1].map((index) => (
            <div key={index} className="grid gap-1">
              <div className={`${BOX} h-4 w-full opacity-60`} />
              <div className={`${BOX} h-1 w-4/5 opacity-75`} />
              <div className={`${BOX} h-1 w-3/5 opacity-35`} />
            </div>
          ))}
        </div>
      );
    case "boundary-list":
      return (
        <div className="grid w-full grid-cols-2 gap-1.5">
          <div className="grid gap-1">
            <div className={`${BOX} h-1.5 w-2/3 opacity-80`} />
            <div className={`${BOX} h-1 w-full opacity-40`} />
            <div className={`${BOX} h-1 w-full opacity-40`} />
          </div>
          <div className="grid gap-1">
            <div className={`${BOX} h-1.5 w-2/3 opacity-55`} />
            <div className={`${BOX} h-1 w-full opacity-30`} />
            <div className={`${BOX} h-1 w-full opacity-30`} />
          </div>
        </div>
      );
    case "grouped-cards":
      return (
        <div className="grid w-full grid-cols-2 gap-1">
          {[70, 55].map((opacity, index) => (
            <div key={index} className="grid gap-0.5 rounded-[2px] border border-current p-1" style={{ opacity: opacity / 100 }}>
              <div className={`${BOX} h-1 w-3/4`} />
              <div className={`${BOX} h-0.5 w-full opacity-60`} />
              <div className={`${BOX} h-0.5 w-full opacity-60`} />
            </div>
          ))}
        </div>
      );
    case "image-slot-grid":
      return (
        <div className="grid w-full grid-cols-3 gap-1">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <div key={index} className="rounded-[1px] border border-dashed border-current opacity-55" style={{ height: "0.65rem" }} />
          ))}
        </div>
      );
    case "thinking-map":
      return (
        <div className="grid w-full justify-items-center gap-1">
          <div className={`${BOX} h-1.5 w-1.5 rounded-full opacity-80`} />
          <div className="flex gap-2">
            <div className={`${BOX} h-1.5 w-1.5 rounded-full opacity-55`} />
            <div className={`${BOX} h-1.5 w-1.5 rounded-full opacity-55`} />
          </div>
        </div>
      );
    case "tabbed-content":
      return (
        <div className="grid w-full gap-1">
          <div className="flex gap-1">
            <div className={`${BOX} h-1.5 w-5 opacity-80`} />
            <div className={`${BOX} h-1.5 w-5 opacity-35`} />
            <div className={`${BOX} h-1.5 w-5 opacity-35`} />
          </div>
          <div className={`${BOX} h-4 w-full opacity-45`} />
        </div>
      );
    default:
      return null;
  }
}

/**
 * Visual, structural-preview layout picker. Replaces a raw <select> of
 * layout ids with a grid of small shape diagrams + labels, so choosing a
 * template doesn't require reading an unfamiliar id.
 */
export function BlockLayoutPicker({
  layouts,
  value,
  onChange,
  locale,
}: {
  layouts: BlockLayoutDefinition[];
  value: string;
  onChange: (id: string) => void;
  locale: "zh" | "en";
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
      {layouts.map((layout) => (
        <button
          key={layout.id}
          type="button"
          onClick={() => onChange(layout.id)}
          aria-pressed={value === layout.id}
          className={`flex flex-col items-center gap-2 rounded-[8px] border p-2.5 text-center transition ${
            value === layout.id
              ? "border-acidGreen bg-acidGreen/10 text-acidGreen"
              : "border-softWhite/12 text-softWhite/56 hover:border-softWhite/30 hover:text-softWhite/80"
          }`}
        >
          <ShapeIcon shape={layout.shape} />
          <span className="text-[10px] font-semibold leading-tight">{locale === "zh" ? layout.labelZh : layout.labelEn}</span>
        </button>
      ))}
    </div>
  );
}
