// Single shared bilingual (zh/en) text input used by every block editor
// (text, media captions/alt, structured items, diagram nodes, Figma prototype, etc.)
// so every visible copy field gets the exact same editing UI.
export function BilingualInput({
  label,
  zh,
  en,
  onChange,
  multiline = false,
  large = false,
}: {
  label: string;
  zh: string;
  en: string;
  onChange: (locale: "zh" | "en", value: string) => void;
  multiline?: boolean;
  large?: boolean;
}) {
  const Field = multiline ? "textarea" : "input";
  return (
    <div className="grid gap-2 md:grid-cols-2">
      <label>
        <span className="editor-label">{label} · 中文</span>
        <Field className={`editor-input ${large ? "font-display text-2xl" : ""}`} value={zh} onChange={(event) => onChange("zh", event.target.value)} />
      </label>
      <label>
        <span className="editor-label">{label} · English</span>
        <Field className={`editor-input ${large ? "font-display text-2xl" : ""}`} value={en} onChange={(event) => onChange("en", event.target.value)} />
      </label>
    </div>
  );
}
