import { useEffect, useMemo, useState } from "react";
import { Library, RefreshCw, Save, Sparkles } from "lucide-react";
import {
  generateSvgIcon,
  listGeneratedIcons,
  saveGeneratedIcon,
  type GeneratedIconLibraryEntry,
  type GeneratedSvgIcon,
} from "../../lib/generatedSvgIcons";

export type ModuleIconReference = {
  id: string;
  name: string;
  title: string;
  svgPath: string;
};

export function GeneratedSvgIconEditor({
  language,
  title,
  description,
  projectId,
  moduleId,
  currentIcon,
  onInsert,
}: {
  language: "zh" | "en";
  title: string;
  description: string;
  projectId: string;
  moduleId: string;
  currentIcon?: ModuleIconReference;
  onInsert: (icon: ModuleIconReference) => void;
}) {
  const [keywords, setKeywords] = useState("");
  const [variant, setVariant] = useState(0);
  const [generated, setGenerated] = useState<GeneratedSvgIcon | null>(null);
  const [saved, setSaved] = useState<GeneratedIconLibraryEntry | null>(null);
  const [library, setLibrary] = useState<GeneratedIconLibraryEntry[]>([]);
  const [selectedId, setSelectedId] = useState(currentIcon?.id ?? "");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const prompt = useMemo(() => [title, description, keywords].filter(Boolean).join("\n"), [title, description, keywords]);

  useEffect(() => {
    let active = true;
    listGeneratedIcons()
      .then(({ icons }) => { if (active) setLibrary(icons); })
      .catch(() => { /* The editor remains usable before the first save. */ });
    return () => { active = false; };
  }, []);

  const generate = (nextVariant = variant) => {
    setError("");
    setStatus("");
    setSaved(null);
    setGenerated(generateSvgIcon({ title, moduleDescription: description, keywords }, nextVariant));
  };

  const save = async () => {
    if (!generated) return;
    setError("");
    setStatus(language === "zh" ? "正在保存…" : "Saving…");
    try {
      const result = await saveGeneratedIcon({ icon: generated, projectId, moduleId, prompt });
      setSaved(result.icon);
      setLibrary((items) => [...items, result.icon]);
      setSelectedId(result.icon.id);
      setStatus(language === "zh" ? "已保存到本地图标库" : "Saved to local icon library");
    } catch (reason) {
      setStatus("");
      setError(reason instanceof Error ? reason.message : "Unable to save icon.");
    }
  };

  const insert = (entry: GeneratedIconLibraryEntry) => {
    onInsert({ id: entry.id, name: entry.name, title: entry.title, svgPath: entry.svgPath });
    setStatus(language === "zh" ? "已插入当前模块" : "Inserted into current module");
  };

  const selected = library.find((item) => item.id === selectedId);

  return (
    <div className="mt-3 border-t border-softWhite/10 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-softWhite/58">SVG Icon</p>
        {currentIcon ? <span className="text-xs text-acidGreen/72">{currentIcon.name}</span> : null}
      </div>
      <input
        className="mt-2 w-full border-b border-softWhite/14 bg-transparent py-2 text-xs text-softWhite outline-none placeholder:text-softWhite/28 focus:border-acidGreen"
        value={keywords}
        onChange={(event) => setKeywords(event.target.value)}
        placeholder={language === "zh" ? "关键词，例如：公会、协作、割裂" : "Keywords, e.g. guild, collaboration, gap"}
      />
      <div className="mt-3 grid gap-3 sm:grid-cols-[7rem_minmax(0,1fr)]">
        <div className="grid aspect-square place-items-center bg-softWhite/[0.04] text-softWhite">
          {generated ? (
            <div className="h-16 w-16" aria-label={generated.title} dangerouslySetInnerHTML={{ __html: generated.svg }} />
          ) : currentIcon ? (
            <img className="h-16 w-16 object-contain" src={currentIcon.svgPath} alt="" />
          ) : (
            <Sparkles className="h-7 w-7 text-softWhite/28" aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0">
          {generated ? (
            <>
              <p className="text-sm font-semibold text-softWhite">{generated.brief.iconName}</p>
              <p className="mt-1 text-xs leading-5 text-softWhite/50">{generated.brief.composition}</p>
            </>
          ) : (
            <p className="text-xs leading-5 text-softWhite/42">
              {language === "zh" ? "使用当前标题、说明和关键词生成透明背景的 64×64 线性图标。" : "Generate a transparent 64 × 64 line icon from this title, description, and keywords."}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="editor-action" onClick={() => generate()}>
              <Sparkles className="h-3.5 w-3.5" />{language === "zh" ? "生成 SVG 图标" : "Generate SVG Icon"}
            </button>
            <button type="button" className="editor-action" disabled={!generated} onClick={() => { const next = variant + 1; setVariant(next); generate(next); }}>
              <RefreshCw className="h-3.5 w-3.5" />{language === "zh" ? "重新生成" : "Regenerate"}
            </button>
            <button type="button" className="editor-action" disabled={!generated || Boolean(saved)} onClick={() => void save()}>
              <Save className="h-3.5 w-3.5" />{language === "zh" ? "保存到图标库" : "Save to Library"}
            </button>
            <button type="button" className="editor-action" disabled={!saved} onClick={() => saved && insert(saved)}>
              {language === "zh" ? "插入当前模块" : "Insert into Current Module"}
            </button>
          </div>
        </div>
      </div>
      {library.length ? (
        <div className="mt-3 flex items-center gap-2">
          <Library className="h-3.5 w-3.5 shrink-0 text-softWhite/38" />
          <select className="editor-input min-w-0 flex-1" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
            <option value="">{language === "zh" ? "从本地图标库选择" : "Choose from local library"}</option>
            {library.map((icon) => <option value={icon.id} key={icon.id}>{icon.title} · {icon.name}</option>)}
          </select>
          <button type="button" className="editor-action shrink-0" disabled={!selected} onClick={() => selected && insert(selected)}>
            {language === "zh" ? "插入" : "Insert"}
          </button>
        </div>
      ) : null}
      {status ? <p className="mt-2 text-xs text-acidGreen/72">{status}</p> : null}
      {error ? <p className="mt-2 text-xs text-peach">{error}</p> : null}
    </div>
  );
}
