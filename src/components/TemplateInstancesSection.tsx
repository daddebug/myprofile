import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  AlignLeft,
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  Braces,
  Check,
  Copy,
  Figma,
  GitBranch,
  Gamepad2,
  Image as ImageIcon,
  LayoutTemplate,
  ListOrdered,
  PieChart,
  Pencil,
  Plus,
  Settings,
  StickyNote,
  Table2,
  Trash2,
  Undo2,
  Workflow,
  X,
} from "lucide-react";
import {
  TemplatePreviewFrame,
  TemplateRenderBoundary,
} from "./template-tools/TemplatePreviewFrame";
import {
  getRegisteredTemplates,
  type RegisteredTemplate,
  type TemplateContentValue,
  type TemplateFieldDefinition,
} from "../lib/templateLibrary";
import {
  anchorForInsertPosition,
  applyRegionOrder,
  buildFlowUnits,
  createInstanceId,
  deriveFromUnits,
  type TemplateInstance,
  type TemplateInstanceLayoutSettings,
} from "../lib/projectTemplateInstances";
import { useTemplateHorizontalInset } from "../lib/templateLayoutDefaults";
import { isCollectionExportCapture } from "../lib/collectionExportStaging";
import { recordTemplateFit } from "../lib/collectionMediaDiagnostics";
import { optimizeUploadedImage } from "../lib/imageOptimization";
import {
  figmaPrototypeUrlErrorMessage,
  normalizeFigmaPrototypeUrl,
} from "../lib/figmaEmbed";
import {
  abortDynamicProjectImageStage,
  abortPlayableGameImport,
  bindPlayableGame,
  commitPlayableGame,
  commitPlayableGameCover,
  commitDynamicProjectImage,
  decodeDynamicProjectImage,
  decodeProjectCover,
  listPlayableGames,
  stagePlayableGame,
  stagePlayableGameFolder,
  stagePlayableGameCover,
  stageDynamicProjectImage,
  unbindDynamicProjectImages,
  type PlayableGameImportStage,
  verifyPlayableGameEntry,
} from "../lib/portfolioContentClient";
import {
  CircleSummaryContentEditor,
  DecisionTableContentEditor,
  PhaseMilestonesContentEditor,
  sampleContentFor,
  XMindContentEditor,
} from "../pages/OwnerTemplateBuilderPage";

const TEMPLATE_PICKER_ICONS: Record<string, typeof LayoutTemplate> = {
  "project-header": LayoutTemplate,
  "statement-longform": AlignLeft,
  "xmind-breakdown": GitBranch,
  "supporting-note": StickyNote,
  "phase-milestones": ListOrdered,
  "circle-summary": PieChart,
  "decision-table": Table2,
  "image-row": ImageIcon,
  "figma-prototype": Figma,
  "process-flow": Workflow,
  "playable-game": Gamepad2,
  "direction-compare": ArrowLeftRight,
};

const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/avif", "image/gif"];
const VIRTUAL_IMAGE_ROW_ITEM_ID = "__image-row-virtual-first__";

const UI_16IENXJ_SECTION_TARGETS: Record<string, string> = {
  "01": "business-decision",
  "02": "technical-direction",
  "03": "my-entry-point",
  "05": "function-hierarchy-optimisation",
  "06": "production-guidelines",
  "07": "iteration-result",
};

function projectInstanceDomId(projectId: string, instance: TemplateInstance) {
  if (projectId !== "ui-16ienxj") return undefined;
  if (instance.templateId === "process-flow") return "system-scope";
  if (instance.templateId !== "statement-longform") return undefined;
  const sectionNumber = instance.content.sectionNumber;
  if (!sectionNumber || typeof sectionNumber !== "object" || Array.isArray(sectionNumber)) return undefined;
  const localized = sectionNumber as { zh?: unknown; en?: unknown };
  const value = typeof localized.zh === "string" && localized.zh.trim()
    ? localized.zh.trim()
    : typeof localized.en === "string"
      ? localized.en.trim()
      : "";
  return UI_16IENXJ_SECTION_TARGETS[value];
}

function localizedTemplateInstanceLabel(
  instance: TemplateInstance,
  registeredTemplates: RegisteredTemplate[],
  language: "zh" | "en",
  index: number,
) {
  for (const field of ["leftTitle", "heading", "sectionTitle", "title"] as const) {
    const value = instance.content[field];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const localized = value as { zh?: unknown; en?: unknown };
      const preferred = localized[language];
      const fallback = localized.zh;
      if (typeof preferred === "string" && preferred.trim()) return preferred.trim();
      if (typeof fallback === "string" && fallback.trim()) return fallback.trim();
    }
  }
  const registered = registeredTemplates.find((template) => template.meta.id === instance.templateId);
  const name = registered
    ? language === "zh" ? registered.meta.nameZh : registered.meta.nameEn
    : instance.templateId;
  return `${name} ${index + 1}`;
}

export type ProjectImageRecord = {
  id: string;
  blob: Blob;
  fileName: string;
  mimeType: string;
  size: number;
  updatedAt: string;
};

export type ProjectImageDb = {
  getDraftImage: (id: string) => Promise<ProjectImageRecord | undefined>;
  putDraftImage: (record: ProjectImageRecord) => Promise<void>;
  deleteDraftImage: (id: string) => Promise<void>;
};

// Templates whose entire schema is flat bilingual text fields
// (project-header, statement-longform, supporting-note) never needed a
// bespoke editor — a label+textarea loop is already complete for that shape.
function GenericTextFieldsEditor({
  schema,
  content,
  language,
  onChange,
}: {
  schema: TemplateFieldDefinition[];
  content: Record<string, TemplateContentValue>;
  language: "zh" | "en";
  onChange: (content: Record<string, TemplateContentValue>) => void;
}) {
  const textFields = schema.filter((field) => field.type === "text" || field.type === "richtext");
  return (
    <div className="mt-5 grid gap-4">
      {textFields.map((field) => {
        const value = (content[field.id] as { zh: string; en: string } | undefined) ?? { zh: "", en: "" };
        return (
          <label key={field.id} className="block">
            <span className="mb-1.5 block text-xs font-semibold text-softWhite/46">
              {language === "zh" ? field.labelZh : field.labelEn}
            </span>
            <textarea
              className="min-h-20 w-full resize-y border border-softWhite/14 bg-deepIndigo/28 px-3 py-2 text-sm leading-6 text-softWhite outline-none focus:border-acidGreen"
              value={value[language]}
              onChange={(event) => onChange({ ...content, [field.id]: { ...value, [language]: event.target.value } })}
            />
          </label>
        );
      })}
    </div>
  );
}

type ProjectProcessFlowItem = {
  id: string;
  number: { zh: string; en: string };
  title: { zh: string; en: string };
  description: { zh: string; en: string };
};

function ProcessFlowContentEditor({
  content,
  language,
  onChange,
}: {
  content: Record<string, TemplateContentValue>;
  language: "zh" | "en";
  onChange: (content: Record<string, TemplateContentValue>) => void;
}) {
  const heading = (content.heading as { zh: string; en: string } | undefined) ?? {
    zh: "",
    en: "",
  };
  const items = Array.isArray(content.items)
    ? (content.items as ProjectProcessFlowItem[]).slice(0, 6)
    : [];

  const updateItem = (
    index: number,
    field: "number" | "title" | "description",
    value: string,
  ) => {
    const next = items.map((item, itemIndex) =>
      itemIndex === index
        ? {
            ...item,
            [field]: {
              ...(item[field] ?? { zh: "", en: "" }),
              [language]: value,
            },
          }
        : item,
    );
    onChange({ ...content, items: next });
  };

  return (
    <section className="mt-5">
      <label className="block max-w-xl">
        <span className="mb-1.5 block text-xs font-semibold text-softWhite/46">
          {language === "zh" ? "模板主标题（可选）" : "Heading (optional)"}
        </span>
        <input
          className="w-full border-b border-softWhite/18 bg-transparent py-2 text-sm text-softWhite outline-none focus:border-acidGreen"
          value={heading[language]}
          onChange={(event) =>
            onChange({
              ...content,
              heading: { ...heading, [language]: event.target.value },
            })
          }
        />
      </label>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {items.map((item, index) => (
          <div
            key={item.id}
            className="grid gap-3 rounded-[8px] border border-softWhite/12 bg-deepIndigo/24 p-4"
          >
            <strong className="font-mono text-xs text-acidGreen">
              {String(index + 1).padStart(2, "0")}
            </strong>
            <label>
              <span className="mb-1.5 block text-xs font-semibold text-softWhite/46">
                {language === "zh" ? "编号" : "Number"}
              </span>
              <input
                className="w-full border-b border-softWhite/18 bg-transparent py-2 text-sm text-softWhite outline-none focus:border-acidGreen"
                value={item.number?.[language] ?? ""}
                onChange={(event) => updateItem(index, "number", event.target.value)}
              />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-semibold text-softWhite/46">
                {language === "zh" ? "标题" : "Title"}
              </span>
              <input
                className="w-full border-b border-softWhite/18 bg-transparent py-2 text-sm text-softWhite outline-none focus:border-acidGreen"
                value={item.title?.[language] ?? ""}
                onChange={(event) => updateItem(index, "title", event.target.value)}
              />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-semibold text-softWhite/46">
                {language === "zh" ? "简短描述（可选）" : "Short description (optional)"}
              </span>
              <textarea
                className="min-h-20 w-full resize-y border border-softWhite/14 bg-deepIndigo/28 px-3 py-2 text-sm leading-6 text-softWhite outline-none focus:border-acidGreen"
                value={item.description?.[language] ?? ""}
                onChange={(event) =>
                  updateItem(index, "description", event.target.value)
                }
              />
            </label>
          </div>
        ))}
      </div>
    </section>
  );
}

type ProjectImageRowItem = {
  id: string;
  image?: { localImageId?: string; imageId?: string; publicPath?: string };
  imageDisplayMode?: "cover" | "natural";
  imageWidthMode?: "card" | "wide" | "full";
  hoverPreviewMode?: "none" | "floating";
  startNewRow?: boolean;
  alt: { zh: string; en: string };
  caption: { zh: string; en: string };
  placeholder?: { zh: string; en: string };
  suggestedAspectRatio?: string;
  suggestedImageCount?: number;
};

function ProjectImageRowContentEditor({
  content,
  language,
  onChange,
  db,
}: {
  content: Record<string, TemplateContentValue>;
  language: "zh" | "en";
  onChange: (content: Record<string, TemplateContentValue>) => void;
  db: ProjectImageDb;
}) {
  const heading = (content.heading as { zh: string; en: string } | undefined) ?? { zh: "", en: "" };
  const items = Array.isArray(content.items) ? (content.items as ProjectImageRowItem[]) : [];
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [activeUploadId, setActiveUploadId] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];
    Promise.all(
      items.map(async (item) => {
        const id = item.image?.localImageId;
        if (!id) return null;
        const record = await db.getDraftImage(id).catch(() => undefined);
        if (!record) return null;
        const url = URL.createObjectURL(record.blob);
        urls.push(url);
        return [item.id, url] as const;
      }),
    ).then((entries) => {
      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const entry of entries) if (entry) next[entry[0]] = entry[1];
      setThumbnails(next);
    });
    return () => {
      cancelled = true;
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [items.map((item) => item.image?.localImageId).join("|")]);

  const updateItems = (next: ProjectImageRowItem[]) => onChange({ ...content, items: next });
  const updateItem = (id: string, updates: Partial<ProjectImageRowItem>) =>
    updateItems(items.map((item) => (item.id === id ? { ...item, ...updates } : item)));
  const moveItem = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= items.length) return;
    const next = [...items];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    updateItems(next);
  };
  const addItem = () => {
    if (items.length >= 12) return;
    updateItems([...items, { id: createInstanceId("image-row-item"), alt: { zh: "", en: "" }, caption: { zh: "", en: "" }, hoverPreviewMode: "none" }]);
  };
  const removeItem = async (item: ProjectImageRowItem) => {
    updateItems(items.filter((current) => current.id !== item.id));
  };
  const chooseImage = (itemId: string) => {
    setUploadError("");
    setActiveUploadId(itemId);
    fileInputRef.current?.click();
  };
  const uploadImage = async (event: ChangeEvent<HTMLInputElement>) => {
    // Image Row uploads are canonical only in the inline editor, where the
    // project ID and instance/item IDs are available for the disk transaction.
    if (event.currentTarget.dataset.legacyImageRowEditor !== "enabled") {
      event.target.value = "";
      setUploadError(language === "zh"
        ? "请在模板原位编辑中上传图片，以保存到本地项目目录。"
        : "Upload from the inline template editor so the image is saved to the local project directory.");
      return;
    }
    const file = event.target.files?.[0];
    const itemId = activeUploadId;
    event.target.value = "";
    if (!file || !itemId) return;
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setUploadError(language === "zh" ? "请选择 PNG、JPEG、WebP、AVIF 或 GIF 图片。" : "Choose a PNG, JPEG, WebP, AVIF, or GIF image.");
      return;
    }
    const item = items.find((current) => current.id === itemId);
    const previousId = item?.image?.localImageId;
    try {
      const optimized = await optimizeUploadedImage(file);
      const imageId = createInstanceId("image");
      await db.putDraftImage({ id: imageId, blob: optimized, fileName: file.name, mimeType: optimized.type || file.type, size: optimized.size, updatedAt: new Date().toISOString() });
      updateItem(itemId, {
        image: { localImageId: imageId },
        imageDisplayMode: item?.imageDisplayMode ?? "cover",
      });
      if (previousId) await db.deleteDraftImage(previousId).catch(() => undefined);
    } catch {
      setUploadError(language === "zh" ? "图片保存失败，原有图片未被修改。" : "The image could not be saved. Your existing image was not changed.");
    }
  };

  return (
    <section className="mt-5">
      <input ref={fileInputRef} type="file" accept={ACCEPTED_IMAGE_TYPES.join(",")} className="hidden" onChange={(event) => void uploadImage(event)} />
      <label className="block max-w-xl">
        <span className="mb-1.5 block text-xs font-semibold text-softWhite/46">{language === "zh" ? "顶部标题" : "Heading"}</span>
        <input className="w-full border-b border-softWhite/18 bg-transparent py-2 text-sm text-softWhite outline-none focus:border-acidGreen" value={heading[language]} onChange={(event) => onChange({ ...content, heading: { ...heading, [language]: event.target.value } })} />
      </label>
      <div className="mt-5 grid gap-5">
        {items.map((item, index) => (
          <div key={item.id} className="grid gap-3 border-b border-softWhite/10 pb-5 md:grid-cols-[10rem_minmax(0,1fr)]">
            <div>
              {!item.image?.localImageId && (item.placeholder?.[language] || item.suggestedAspectRatio) ? (
                <div className="mb-2 text-xs leading-5 text-softWhite/54">
                  {item.placeholder?.[language] ? <p>{language === "zh" ? `待补：${item.placeholder[language]}` : `To add: ${item.placeholder[language]}`}</p> : null}
                  {item.suggestedAspectRatio ? <p className="text-acidGreen/72">{language === "zh" ? `建议比例：${item.suggestedAspectRatio}` : `Suggested ratio: ${item.suggestedAspectRatio}`}</p> : null}
                </div>
              ) : null}
              <div className="flex h-24 w-full items-center justify-center overflow-hidden rounded-[10px] bg-deepIndigo/48 text-xs text-softWhite/38">
                {thumbnails[item.id] ? <img src={thumbnails[item.id]} alt="" className="h-full w-full object-contain" /> : <span>{language === "zh" ? "尚未上传" : "No image yet"}</span>}
              </div>
              <button type="button" className="editor-action mt-2 w-full justify-center" onClick={() => chooseImage(item.id)}>
                {item.image?.localImageId ? (language === "zh" ? "替换图片" : "Replace image") : (language === "zh" ? "上传图片" : "Add image")}
              </button>
            </div>
            <div className="grid gap-3">
              {item.image?.localImageId ? (
                <fieldset>
                  <legend className="mb-1.5 text-xs font-semibold text-softWhite/46">
                    {language === "zh" ? "图片显示" : "Image display"}
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={`editor-action ${(item.imageDisplayMode ?? "cover") === "cover" ? "border-acidGreen text-acidGreen" : ""}`}
                      onClick={() => updateItem(item.id, { imageDisplayMode: "cover" })}
                    >
                      {language === "zh" ? "裁切填满" : "Crop to fill"}
                    </button>
                    <button
                      type="button"
                      className={`editor-action ${item.imageDisplayMode === "natural" ? "border-acidGreen text-acidGreen" : ""}`}
                      onClick={() => updateItem(item.id, { imageDisplayMode: "natural" })}
                    >
                      {language === "zh" ? "完整显示" : "Show full image"}
                    </button>
                  </div>
                </fieldset>
              ) : null}
              <label>
                <span className="mb-1.5 block text-xs font-semibold text-softWhite/46">{language === "zh" ? "图片说明" : "Caption"}</span>
                <input className="w-full border-b border-softWhite/18 bg-transparent py-2 text-sm text-softWhite outline-none focus:border-acidGreen" value={item.caption[language]} onChange={(event) => updateItem(item.id, { caption: { ...item.caption, [language]: event.target.value } })} />
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="editor-action" disabled={index === 0} onClick={() => moveItem(index, -1)}>{language === "zh" ? "上移" : "Move up"}</button>
                <button type="button" className="editor-action" disabled={index === items.length - 1} onClick={() => moveItem(index, 1)}>{language === "zh" ? "下移" : "Move down"}</button>
                <button type="button" className="editor-action text-peach" onClick={() => void removeItem(item)}>{language === "zh" ? "删除" : "Delete"}</button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {uploadError ? <p className="mt-3 text-sm text-peach">{uploadError}</p> : null}
      <button type="button" className="editor-action mt-4" disabled={items.length >= 12} onClick={addItem}>{language === "zh" ? "添加图片" : "Add image"}</button>
    </section>
  );
}

function ProjectFigmaPrototypeContentEditor({
  content,
  language,
  onChange,
  db,
}: {
  content: Record<string, TemplateContentValue>;
  language: "zh" | "en";
  onChange: (content: Record<string, TemplateContentValue>) => void;
  db: ProjectImageDb;
}) {
  const caption = (content.caption as { zh: string; en: string } | undefined) ?? { zh: "", en: "" };
  const figmaUrl = typeof content.figmaUrl === "string" ? content.figmaUrl : "";
  const fallbackImage = content.fallbackImage as { localImageId?: string } | undefined;
  const [urlDraft, setUrlDraft] = useState(figmaUrl);
  const [urlError, setUrlError] = useState("");
  const [thumbnail, setThumbnail] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let url = "";
    const id = fallbackImage?.localImageId;
    if (!id) { setThumbnail(""); return undefined; }
    db.getDraftImage(id).then((record) => {
      if (cancelled || !record) return;
      url = URL.createObjectURL(record.blob);
      setThumbnail(url);
    }).catch(() => undefined);
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [fallbackImage?.localImageId]);

  const applyUrl = () => {
    const trimmed = urlDraft.trim();
    if (!trimmed) { setUrlError(""); onChange({ ...content, figmaUrl: "" }); return; }
    const result = normalizeFigmaPrototypeUrl(trimmed);
    if (!result.ok) { setUrlError(figmaPrototypeUrlErrorMessage(result.error)); return; }
    setUrlError("");
    onChange({ ...content, figmaUrl: trimmed });
  };

  const uploadFallback = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setUrlError(language === "zh" ? "请选择 PNG、JPEG、WebP、AVIF 或 GIF 图片。" : "Choose a PNG, JPEG, WebP, AVIF, or GIF image.");
      return;
    }
    const previousId = fallbackImage?.localImageId;
    const optimized = await optimizeUploadedImage(file);
    const imageId = createInstanceId("image");
    await db.putDraftImage({ id: imageId, blob: optimized, fileName: file.name, mimeType: optimized.type || file.type, size: optimized.size, updatedAt: new Date().toISOString() });
    onChange({ ...content, fallbackImage: { localImageId: imageId } });
    if (previousId) await db.deleteDraftImage(previousId).catch(() => undefined);
  };

  return (
    <section className="mt-5">
      <label className="block max-w-xl">
        <span className="mb-1.5 block text-xs font-semibold text-softWhite/46">{language === "zh" ? "Figma 链接" : "Figma URL"}</span>
        <input
          className="w-full border-b border-softWhite/18 bg-transparent py-2 text-sm text-softWhite outline-none focus:border-acidGreen"
          placeholder="https://www.figma.com/proto/..."
          value={urlDraft}
          onChange={(event) => setUrlDraft(event.target.value)}
          onBlur={applyUrl}
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); applyUrl(); } }}
        />
      </label>
      {urlError ? <p className="mt-2 text-sm text-peach">{urlError}</p> : null}
      <div className="mt-5 max-w-xl">
        <span className="mb-1.5 block text-xs font-semibold text-softWhite/46">{language === "zh" ? "备用图片" : "Fallback image"}</span>
        <div className="flex h-24 w-full items-center justify-center overflow-hidden rounded-[10px] bg-deepIndigo/48 text-xs text-softWhite/38">
          {thumbnail ? <img src={thumbnail} alt="" className="h-full w-full object-contain" /> : <span>{language === "zh" ? "尚未上传" : "No image yet"}</span>}
        </div>
        <input ref={fileInputRef} type="file" accept={ACCEPTED_IMAGE_TYPES.join(",")} className="hidden" onChange={(event) => void uploadFallback(event)} />
        <button type="button" className="editor-action mt-2" onClick={() => fileInputRef.current?.click()}>
          {fallbackImage?.localImageId ? (language === "zh" ? "替换图片" : "Replace image") : (language === "zh" ? "上传图片" : "Add image")}
        </button>
      </div>
      <label className="mt-5 block max-w-xl">
        <span className="mb-1.5 block text-xs font-semibold text-softWhite/46">{language === "zh" ? "说明文字" : "Caption"}</span>
        <input className="w-full border-b border-softWhite/18 bg-transparent py-2 text-sm text-softWhite outline-none focus:border-acidGreen" value={caption[language]} onChange={(event) => onChange({ ...content, caption: { ...caption, [language]: event.target.value } })} />
      </label>
    </section>
  );
}

function InstanceEditor({
  templateId,
  schema,
  content,
  language,
  onChange,
  db,
  jumpTargets,
}: {
  templateId: string;
  schema: TemplateFieldDefinition[];
  content: Record<string, TemplateContentValue>;
  language: "zh" | "en";
  onChange: (content: Record<string, TemplateContentValue>) => void;
  db: ProjectImageDb;
  jumpTargets: Array<{ instanceId: string; label: string }>;
}) {
  if (templateId === "xmind-breakdown") return <XMindContentEditor mode="double" content={content} language={language} onChange={onChange} />;
  if (templateId === "phase-milestones") return <PhaseMilestonesContentEditor emphasisMode="custom" content={content} language={language} onChange={onChange} jumpTargets={jumpTargets} />;
  if (templateId === "circle-summary") return <CircleSummaryContentEditor content={content} language={language} onChange={onChange} />;
  if (templateId === "decision-table") return <DecisionTableContentEditor content={content} language={language} onChange={onChange} />;
  if (templateId === "image-row") return <ProjectImageRowContentEditor content={content} language={language} onChange={onChange} db={db} />;
  if (templateId === "figma-prototype") return <ProjectFigmaPrototypeContentEditor content={content} language={language} onChange={onChange} db={db} />;
  if (templateId === "process-flow") return <ProcessFlowContentEditor content={content} language={language} onChange={onChange} />;
  return <GenericTextFieldsEditor schema={schema} content={content} language={language} onChange={onChange} />;
}

function ResolvedInstancePreview({
  instance,
  instanceOrder,
  projectId,
  locale,
  db,
  inlineEditing,
  onContentChange,
  onDiskImagesChanged,
}: {
  instance: TemplateInstance;
  instanceOrder: number;
  projectId: string;
  locale: "zh" | "en";
  db: ProjectImageDb;
  inlineEditing: boolean;
  onContentChange: (content: Record<string, TemplateContentValue>) => void;
  onDiskImagesChanged?: () => void;
}) {
  const registered = useMemo(() => getRegisteredTemplates().find((t) => t.meta.id === instance.templateId), [instance.templateId]);
  const [resolvedContent, setResolvedContent] = useState<Record<string, TemplateContentValue>>(instance.content);
  const templateDefaultInset = useTemplateHorizontalInset(instance.templateId);
  const horizontalInset = instance.layoutSettings?.horizontalInset ?? templateDefaultInset;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [activeUploadId, setActiveUploadId] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [uploadStatus, setUploadStatus] = useState("");
  const gameInputRef = useRef<HTMLInputElement | null>(null);
  const gameFolderInputRef = useRef<HTMLInputElement | null>(null);
  const gameCoverInputRef = useRef<HTMLInputElement | null>(null);
  const [gameUploadBusy, setGameUploadBusy] = useState(false);
  const [gameUploadStage, setGameUploadStage] = useState<PlayableGameImportStage | "">("");
  const [availableGames, setAvailableGames] = useState<Awaited<ReturnType<typeof listPlayableGames>>>([]);

  useEffect(() => {
    if (!inlineEditing || instance.templateId !== "playable-game") return;
    let cancelled = false;
    void listPlayableGames(projectId).then((games) => {
      if (!cancelled) setAvailableGames(games);
    }).catch(() => {
      if (!cancelled) setAvailableGames([]);
    });
    return () => { cancelled = true; };
  }, [inlineEditing, instance.templateId, projectId]);

  const finishGameImport = async (staged: Awaited<ReturnType<typeof stagePlayableGame>>) => {
    try {
      setGameUploadStage("verifying");
      await verifyPlayableGameEntry(staged.entryPublicPath);
      setGameUploadStage("saving");
      const game = await commitPlayableGame(projectId, staged.commitToken);
      setAvailableGames((current) => [...current.filter((item) => item.gameId !== game.gameId), game]);
      onContentChange({ ...instance.content, game });
    } catch (error) {
      await abortPlayableGameImport(projectId, staged.commitToken).catch(() => undefined);
      throw error;
    }
  };

  const playableGameErrorMessage = (error: unknown) => {
    const detail = error instanceof Error ? error.message : "Game build could not be saved.";
    if (/\b(?:EPERM|EACCES|EBUSY)\b/i.test(detail)) {
      return locale === "zh"
        ? `Windows 暂时占用了游戏文件，系统已经自动重试，但仍未能完成。技术详情：${detail}`
        : `Windows temporarily locked the game files. Automatic retries and the safe-copy fallback could not finish. Details: ${detail}`;
    }
    return detail;
  };

  const uploadGameBuild = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploadError(""); setGameUploadBusy(true); setGameUploadStage("reading");
    try {
      setGameUploadStage("checking");
      const staged = await stagePlayableGame(projectId, file);
      await finishGameImport(staged);
    } catch (error) {
      setUploadError(playableGameErrorMessage(error));
    } finally { setGameUploadBusy(false); setGameUploadStage(""); }
  };

  const uploadGameFolder = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    setUploadError(""); setGameUploadBusy(true); setGameUploadStage("reading");
    try {
      const staged = await stagePlayableGameFolder(projectId, files, setGameUploadStage);
      await finishGameImport(staged);
    } catch (error) {
      setUploadError(playableGameErrorMessage(error));
    } finally { setGameUploadBusy(false); setGameUploadStage(""); }
  };

  const uploadGameCover = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploadError(""); setGameUploadBusy(true);
    try {
      const staged = await stagePlayableGameCover(projectId, file);
      await decodeProjectCover(staged.publicUrl);
      const cover = await commitPlayableGameCover(projectId, staged.commitToken);
      onContentChange({ ...instance.content, cover });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Game cover could not be saved.");
    } finally { setGameUploadBusy(false); }
  };

  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];
    async function resolve() {
      if (instance.templateId === "image-row" && Array.isArray(instance.content.items)) {
        const items = instance.content.items as ProjectImageRowItem[];
        const resolvedItems = await Promise.all(items.map(async (item) => {
          if (item.image?.publicPath) return item;
          const id = item.image?.localImageId;
          if (!id) return item;
          const record = await db.getDraftImage(id).catch(() => undefined);
          if (!record) return item;
          const url = URL.createObjectURL(record.blob);
          urls.push(url);
          return { ...item, image: { ...item.image, publicPath: url } };
        }));
        if (!cancelled) setResolvedContent({ ...instance.content, items: resolvedItems });
        return;
      }
      if (instance.templateId === "figma-prototype") {
        const fallback = instance.content.fallbackImage as { localImageId?: string } | undefined;
        const id = fallback?.localImageId;
        if (id) {
          const record = await db.getDraftImage(id).catch(() => undefined);
          if (record && !cancelled) {
            const url = URL.createObjectURL(record.blob);
            urls.push(url);
            setResolvedContent({ ...instance.content, fallbackImage: { ...fallback, publicPath: url } });
            return;
          }
        }
      }
      if (!cancelled) setResolvedContent(instance.content);
    }
    void resolve();
    return () => {
      cancelled = true;
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [instance.content, instance.templateId]);

  const updateLocalizedText = (field: string, value: string) => {
    const current = instance.content[field];
    const localized = current && typeof current === "object" && !Array.isArray(current)
      ? current as { zh?: string; en?: string }
      : {};
    onContentChange({ ...instance.content, [field]: { zh: localized.zh ?? "", en: localized.en ?? "", [locale]: value } });
  };

  const updateImageRowItem = (itemId: string, updates: Record<string, unknown>) => {
    const items = Array.isArray(instance.content.items) ? instance.content.items : [];
    onContentChange({
      ...instance.content,
      items: items.map((value) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return value;
        const item = value as Record<string, unknown>;
        return item.id === itemId ? { ...item, ...updates } : item;
      }),
    });
  };

  const chooseImage = (itemId: string) => {
    setUploadError("");
    setUploadStatus("");
    setActiveUploadId(itemId);
    fileInputRef.current?.click();
  };

  const uploadImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const itemId = activeUploadId;
    event.target.value = "";
    if (!file || !itemId) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setUploadError(locale === "zh" ? "请选择 PNG、JPEG 或 WebP 图片。" : "Choose a PNG, JPEG, or WebP image.");
      return;
    }
    let stagedImage: Awaited<ReturnType<typeof stageDynamicProjectImage>> | null = null;
    // Tracks which step is in flight so a failure can name the real stage
    // instead of a blanket "Invalid image" — the file's own format/size are
    // already known before any network call, so they're always available.
    let uploadStage: "staging" | "decoding" | "committing" = "staging";
    const fileDescription = `${file.name}（${file.type.replace("image/", "").toUpperCase()}, ${(file.size / 1024).toFixed(0)}KB）`;
    try {
      setUploadStatus(locale === "zh" ? "正在写入本地项目目录" : "Saving to the local project directory");
      const persistedItemId = itemId === VIRTUAL_IMAGE_ROW_ITEM_ID ? createInstanceId("image-row-item") : itemId;
      const staged = await stageDynamicProjectImage(projectId, instance.instanceId, persistedItemId, file);
      stagedImage = staged;
      uploadStage = "decoding";
      await decodeDynamicProjectImage(staged.publicUrl);
      uploadStage = "committing";
      let nextContent: Record<string, TemplateContentValue>;
      if (instance.templateId === "direction-compare") {
        if (persistedItemId !== "leftImage" && persistedItemId !== "rightImage") {
          throw new Error(`Invalid Direction Compare image slot: ${persistedItemId}`);
        }
        const currentImage = instance.content[persistedItemId];
        const hoverPreviewMode = currentImage && typeof currentImage === "object" && !Array.isArray(currentImage)
          && (currentImage as Record<string, unknown>).hoverPreviewMode === "floating"
          ? "floating"
          : "none";
        nextContent = {
          ...instance.content,
          [persistedItemId]: { imageId: staged.imageId, publicPath: staged.publicUrl, hoverPreviewMode },
        };
      } else {
        const items = Array.isArray(instance.content.items) ? instance.content.items : [];
        let nextItems: unknown[];
        if (itemId === VIRTUAL_IMAGE_ROW_ITEM_ID) {
          nextItems = [
            ...items,
            {
              id: persistedItemId,
              image: { imageId: staged.imageId, publicPath: staged.publicUrl },
              imageDisplayMode: "cover",
              hoverPreviewMode: "none",
              alt: { zh: "", en: "" },
              caption: { zh: "", en: "" },
            },
          ];
        } else {
          const currentItem = items.find((value) => value && typeof value === "object" && !Array.isArray(value) && (value as Record<string, unknown>).id === itemId) as Record<string, unknown> | undefined;
          nextItems = items.map((value) => {
            if (!value || typeof value !== "object" || Array.isArray(value)) return value;
            const item = value as Record<string, unknown>;
            return item.id === itemId
              ? {
                  ...item,
                  image: { imageId: staged.imageId, publicPath: staged.publicUrl },
                  imageDisplayMode: currentItem?.imageDisplayMode === "natural" ? "natural" : "cover",
                }
              : item;
          });
        }
        nextContent = { ...instance.content, items: nextItems };
      }
      const committed = await commitDynamicProjectImage({
        projectId,
        commitToken: staged.commitToken,
        itemId: persistedItemId,
        instance: { ...instance, content: nextContent, order: instanceOrder },
      });
      onContentChange(committed.mapping.instances[instance.instanceId]?.content ?? nextContent);
      onDiskImagesChanged?.();
      stagedImage = null;
      setUploadStatus(locale === "zh" ? "已保存到本地项目目录" : "Saved to the local project directory");
    } catch (error) {
      if (stagedImage) await abortDynamicProjectImageStage(projectId, stagedImage.commitToken).catch(() => undefined);
      setUploadStatus("");
      const detail = error instanceof Error ? error.message : String(error);
      const dimensions = stagedImage ? `${stagedImage.width}×${stagedImage.height}` : (locale === "zh" ? "未读取到尺寸" : "dimensions not read");
      const stageLabel = locale === "zh"
        ? { staging: "上传阶段", decoding: "浏览器重新解码阶段", committing: "写入项目目录阶段" }[uploadStage]
        : { staging: "the upload stage", decoding: "the browser re-decode stage", committing: "the project-directory write stage" }[uploadStage];
      setUploadError(locale === "zh"
        ? `${fileDescription}（${dimensions}）在${stageLabel}失败：${detail}${stagedImage ? "；已暂存的文件已回滚，原有图片未被修改。" : "；原有图片未被修改。"}`
        : `${fileDescription} (${dimensions}) failed at ${stageLabel}: ${detail}${stagedImage ? "; the staged file was rolled back and your existing image was not changed." : "; your existing image was not changed."}`);
    }
  };

  const removeDirectionCompareImage = async (side: "left" | "right") => {
    const field = side === "left" ? "leftImage" : "rightImage";
    const image = instance.content[field];
    const imageId = image && typeof image === "object" && !Array.isArray(image)
      ? (image as Record<string, unknown>).imageId
      : undefined;
    const nextContent = { ...instance.content, [field]: null };
    try {
      if (typeof imageId === "string") {
        await unbindDynamicProjectImages({
          projectId,
          instanceId: instance.instanceId,
          imageIds: [imageId],
          instance: { ...instance, content: nextContent, order: instanceOrder },
        });
        onDiskImagesChanged?.();
      }
      onContentChange(nextContent);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "The image reference could not be removed.");
    }
  };

  const updateDirectionCompareImageSetting = (side: "left" | "right", updates: { hoverPreviewMode: "none" | "floating" }) => {
    const field = side === "left" ? "leftImage" : "rightImage";
    const image = instance.content[field];
    if (!image || typeof image !== "object" || Array.isArray(image)) return;
    onContentChange({ ...instance.content, [field]: { ...image, ...updates } });
  };

  const removeImageRowItem = async (itemId: string) => {
    const items = Array.isArray(instance.content.items) ? instance.content.items : [];
    const itemIndex = items.findIndex((value) => value && typeof value === "object" && !Array.isArray(value) && (value as Record<string, unknown>).id === itemId);
    if (itemIndex < 0) return;
    const removedItem = items[itemIndex] as Record<string, unknown>;
    const nextItems = items.filter((_, index) => index !== itemIndex);
    if ((removedItem.startNewRow === true || removedItem.imageWidthMode === "full") && itemIndex < nextItems.length) {
      const nextItem = nextItems[itemIndex];
      if (nextItem && typeof nextItem === "object" && !Array.isArray(nextItem)) {
        nextItems[itemIndex] = { ...(nextItem as Record<string, unknown>), startNewRow: true };
      }
    }
    const nextContent = {
      ...instance.content,
      items: nextItems,
    };
    const image = removedItem.image && typeof removedItem.image === "object" && !Array.isArray(removedItem.image)
      ? removedItem.image as Record<string, unknown>
      : null;
    try {
      if (typeof image?.imageId === "string") {
        await unbindDynamicProjectImages({
          projectId,
          instanceId: instance.instanceId,
          imageIds: [image.imageId],
          instance: { ...instance, content: nextContent, order: instanceOrder },
        });
        onDiskImagesChanged?.();
      }
      onContentChange(nextContent);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "The image reference could not be removed.");
    }
  };

  // "Delete image" only clears the item's own image reference (safely
  // unbinding the real file first) and keeps the item itself, so it falls
  // back to its upload placeholder — distinct from removeImageRowItem above,
  // which deletes the whole item/card.
  const removeImageRowItemImage = async (itemId: string) => {
    const items = Array.isArray(instance.content.items) ? instance.content.items : [];
    const itemIndex = items.findIndex((value) => value && typeof value === "object" && !Array.isArray(value) && (value as Record<string, unknown>).id === itemId);
    if (itemIndex < 0) return;
    const targetItem = items[itemIndex] as Record<string, unknown>;
    const image = targetItem.image && typeof targetItem.image === "object" && !Array.isArray(targetItem.image)
      ? targetItem.image as Record<string, unknown>
      : null;
    const nextItems = items.map((value, index) => {
      if (index !== itemIndex || !value || typeof value !== "object" || Array.isArray(value)) return value;
      const { image: _removedImage, ...rest } = value as Record<string, unknown>;
      return rest;
    });
    const nextContent = {
      ...instance.content,
      items: nextItems,
    };
    try {
      if (typeof image?.imageId === "string") {
        await unbindDynamicProjectImages({
          projectId,
          instanceId: instance.instanceId,
          imageIds: [image.imageId],
          instance: { ...instance, content: nextContent, order: instanceOrder },
        });
        onDiskImagesChanged?.();
      }
      onContentChange(nextContent);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "The image reference could not be removed.");
    }
  };

  const createEmptyImageRowItem = (startNewRow = false) => ({
    id: createInstanceId("image-row-item"),
    alt: { zh: "", en: "" },
    caption: { zh: "", en: "" },
    hoverPreviewMode: "none",
    ...(startNewRow ? { startNewRow: true } : {}),
  });

  const addImageRowItemAfter = (itemId: string) => {
    const items = Array.isArray(instance.content.items) ? instance.content.items : [];
    if (items.length >= 12) return;
    const itemIndex = items.findIndex((value) => value && typeof value === "object" && !Array.isArray(value) && (value as Record<string, unknown>).id === itemId);
    if (itemIndex < 0) return;
    onContentChange({
      ...instance.content,
      items: [
        ...items.slice(0, itemIndex + 1),
        createEmptyImageRowItem(),
        ...items.slice(itemIndex + 1),
      ],
    });
  };

  const addImageRowNewRow = () => {
    const items = Array.isArray(instance.content.items) ? instance.content.items : [];
    if (items.length === 0 || items.length >= 12) return;
    onContentChange({ ...instance.content, items: [...items, createEmptyImageRowItem(true)] });
  };

  if (!registered) return null;
  const { Component, meta } = registered;
  const name = locale === "zh" ? meta.nameZh : meta.nameEn;
  const supportsInlineEditing = instance.templateId === "statement-longform" || instance.templateId === "image-row" || instance.templateId === "playable-game" || instance.templateId === "direction-compare" || instance.templateId === "figma-prototype";
  const inlineEditor = inlineEditing && supportsInlineEditing ? {
    onLocalizedTextChange: updateLocalizedText,
    ...(instance.templateId === "image-row" ? {
      imageRow: {
        onUploadFirstImage: () => chooseImage(VIRTUAL_IMAGE_ROW_ITEM_ID),
        onAddItemAfter: addImageRowItemAfter,
        onAddNewRow: addImageRowNewRow,
        onReplaceImage: chooseImage,
        onRemoveImage: removeImageRowItemImage,
        onRemoveItem: removeImageRowItem,
        onCancelPlaceholder: removeImageRowItem,
        onItemChange: updateImageRowItem,
        error: uploadError,
      },
    } : {}),
    ...(instance.templateId === "playable-game" ? {
      playableGame: {
        onChooseFolder: () => gameFolderInputRef.current?.click(),
        onChooseZip: () => gameInputRef.current?.click(),
        onChooseCover: () => gameCoverInputRef.current?.click(),
        onUseSavedBuild: async (gameId: string) => {
          setUploadError(""); setGameUploadBusy(true);
          try {
            const game = await bindPlayableGame(projectId, gameId);
            onContentChange({ ...instance.content, game });
          } catch (error) {
            setUploadError(error instanceof Error ? error.message : "The saved game could not be bound.");
          } finally {
            setGameUploadBusy(false);
          }
        },
        availableGames,
        onContentChange: (updates: Record<string, unknown>) => onContentChange({ ...instance.content, ...updates }),
        busy: gameUploadBusy,
        stage: gameUploadStage,
        error: uploadError,
      },
    } : {}),
    ...(instance.templateId === "direction-compare" ? {
      directionCompare: {
        onUploadImage: (side: "left" | "right") => chooseImage(side === "left" ? "leftImage" : "rightImage"),
        onRemoveImage: removeDirectionCompareImage,
        onImageSettingChange: updateDirectionCompareImageSetting,
        onDirectionChange: (direction: "left-to-right" | "right-to-left" | "none") => onContentChange({ ...instance.content, direction }),
        status: uploadStatus,
        error: uploadError,
      },
    } : {}),
  } : undefined;

  return (
    <>
      <input ref={fileInputRef} type="file" accept={ACCEPTED_IMAGE_TYPES.join(",")} className="hidden" onChange={(event) => void uploadImage(event)} />
      <input ref={(node) => { gameFolderInputRef.current = node; node?.setAttribute("webkitdirectory", ""); }} type="file" className="hidden" multiple onChange={(event) => void uploadGameFolder(event)} />
      <input ref={gameInputRef} type="file" accept="application/zip,.zip" className="hidden" onChange={(event) => void uploadGameBuild(event)} />
      <input ref={gameCoverInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => void uploadGameCover(event)} />
      <TemplatePreviewFrame>
        <TemplateRenderBoundary name={name} resetKey={`${instance.instanceId}-${locale}`}>
          <Component content={resolvedContent} locale={locale} horizontalInset={horizontalInset} inlineEditor={inlineEditor} />
        </TemplateRenderBoundary>
      </TemplatePreviewFrame>
      {inlineEditing && instance.templateId === "image-row" && uploadStatus ? (
        <p className="mt-2 text-xs font-semibold text-acidGreen">{uploadStatus}</p>
      ) : null}
    </>
  );
}

function TemplatePickerModal({
  templates,
  language,
  onSelect,
  onClose,
}: {
  templates: RegisteredTemplate[];
  language: "zh" | "en";
  onSelect: (templateId: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-deepIndigo/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-[14px] border border-electricBlue/35 bg-[#12143f] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-display text-lg font-semibold text-softWhite">
            {language === "zh" ? "添加模板" : "Add template"}
          </h2>
          <button
            type="button"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-archiveBlue/40 text-softWhite/70 transition hover:text-softWhite"
            aria-label={language === "zh" ? "关闭" : "Close"}
            onClick={onClose}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {templates.map((template) => {
            const Icon = TEMPLATE_PICKER_ICONS[template.meta.id] ?? LayoutTemplate;
            return (
              <button
                key={template.meta.id}
                type="button"
                className="flex items-center gap-3 rounded-[10px] border border-softWhite/12 bg-archiveBlue/12 p-4 text-left transition hover:border-acidGreen/60 hover:bg-acidGreen/[0.08]"
                onClick={() => onSelect(template.meta.id)}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-acidGreen/15 text-acidGreen">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-sm font-semibold text-softWhite">{template.meta.nameZh}</span>
                  <span className="block text-xs text-softWhite/50">{template.meta.nameEn}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function InsertTemplateStrip({ active, onOpen, language }: { active: boolean; onOpen: () => void; language: "zh" | "en" }) {
  return (
    <div className="group/insert relative my-3 flex items-center justify-center">
      <span className={`h-px flex-1 bg-softWhite/10 transition group-hover/insert:bg-acidGreen/45 ${active ? "bg-acidGreen/45" : ""}`} aria-hidden="true" />
      <button
        type="button"
        className={`mx-3 inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition hover:border-acidGreen hover:bg-acidGreen hover:px-4 hover:py-2 hover:text-deepIndigo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acidGreen ${active ? "border-acidGreen bg-acidGreen text-deepIndigo" : "border-acidGreen/40 bg-deepIndigo text-acidGreen/80"}`}
        onClick={onOpen}
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        {language === "zh" ? "添加模板" : "Add template"}
      </button>
      <span className={`h-px flex-1 bg-softWhite/10 transition group-hover/insert:bg-acidGreen/45 ${active ? "bg-acidGreen/45" : ""}`} aria-hidden="true" />
    </div>
  );
}

function cloneJsonContent(
  content: Record<string, TemplateContentValue>,
): Record<string, TemplateContentValue> {
  return JSON.parse(JSON.stringify(content)) as Record<string, TemplateContentValue>;
}

function instanceJson(instance: TemplateInstance) {
  return {
    instanceId: instance.instanceId,
    templateId: instance.templateId,
    regionId: instance.regionId,
    anchorId: instance.anchorId,
    content: instance.content,
    layoutSettings: instance.layoutSettings ?? null,
  };
}

export type TemplateSchemaValidationIssue = {
  path: string;
  problem: string;
  expected: string;
  actual: string;
};

export function validateContentAgainstSchemaIssues(
  content: Record<string, TemplateContentValue>,
  schema: TemplateFieldDefinition[],
): TemplateSchemaValidationIssue[] {
  const issues: TemplateSchemaValidationIssue[] = [];
  for (const field of schema) {
    const value = content[field.id];
    const isArrayField = field.type === "list" || field.type === "images" || field.type === "table";

    if (isArrayField && value !== undefined && !Array.isArray(value)) {
      issues.push({ path: field.id, problem: "must be an array", expected: "array", actual: value === null ? "null" : typeof value });
      continue;
    }

    if (field.required && (value === undefined || value === null || value === "")) {
      issues.push({ path: field.id, problem: "is required", expected: field.type, actual: value === undefined ? "missing" : String(value) });
      continue;
    }

    if (Array.isArray(value)) {
      if (typeof field.min === "number" && value.length < field.min) {
        issues.push({ path: field.id, problem: `requires at least ${field.min} item(s)`, expected: `${field.min}-${field.max ?? "unbounded"} items`, actual: `${value.length} items` });
      }
      if (typeof field.max === "number" && value.length > field.max) {
        issues.push({ path: field.id, problem: `allows at most ${field.max} item(s)`, expected: `${field.min ?? 0}-${field.max} items`, actual: `${value.length} items` });
      }
    }
  }

  return issues;
}

export function validateContentAgainstSchema(
  content: Record<string, TemplateContentValue>,
  schema: TemplateFieldDefinition[],
): string | null {
  const issue = validateContentAgainstSchemaIssues(content, schema)[0];
  return issue ? `${issue.path} ${issue.problem}.` : null;
}

export function validateImageRowOptions(
  content: Record<string, TemplateContentValue>,
): string | null {
  for (const key of ["className", "style", "css", "grid", "gridColumn", "grid-column"]) {
    if (content[key] !== undefined) return `${key} is not supported by Image Row.`;
  }
  const columns = content.columns;
  if (columns !== undefined && columns !== 1 && columns !== 2 && columns !== 3 && columns !== 4) {
    return "columns must be 1, 2, 3, or 4.";
  }
  const rowAlignment = content.rowAlignment;
  if (rowAlignment !== undefined && rowAlignment !== "start" && rowAlignment !== "center") {
    return "rowAlignment must be start or center.";
  }
  if (!Array.isArray(content.items)) return null;

  for (const [index, value] of content.items.entries()) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const item = value as Record<string, unknown>;
    for (const key of ["width", "imageWidth", "maxWidth", "className", "style", "css", "grid", "gridColumn", "grid-column", "gridArea", "grid-area", "span", "columnSpan", "columns", "rowIndex", "columnIndex", "position"]) {
      if (item[key] !== undefined) return `items[${index}].${key} is not supported by Image Row.`;
    }
    if (item.startNewRow !== undefined && typeof item.startNewRow !== "boolean") {
      return `items[${index}].startNewRow must be boolean.`;
    }
    const mode = item.imageDisplayMode;
    if (mode !== undefined && mode !== "cover" && mode !== "natural") {
      return `items[${index}].imageDisplayMode must be cover or natural.`;
    }
    const widthMode = item.imageWidthMode;
    if (widthMode !== undefined && widthMode !== "card" && widthMode !== "wide" && widthMode !== "full") {
      return `items[${index}].imageWidthMode must be card, wide, or full.`;
    }
    const hoverPreviewMode = item.hoverPreviewMode;
    if (hoverPreviewMode !== undefined && hoverPreviewMode !== "none" && hoverPreviewMode !== "floating") {
      return `items[${index}].hoverPreviewMode must be none or floating.`;
    }
    const cropRatio = item.imageCropRatio;
    if (cropRatio !== undefined && cropRatio !== "16:9" && cropRatio !== "1:1") {
      return `items[${index}].imageCropRatio must be 16:9 or 1:1.`;
    }
  }

  return null;
}

function CodeFillModal({
  instance,
  template,
  language,
  onApply,
  onClose,
}: {
  instance: TemplateInstance;
  template: RegisteredTemplate;
  language: "zh" | "en";
  onApply: (content: Record<string, TemplateContentValue>) => void;
  onClose: () => void;
}) {
  const [jsonText, setJsonText] = useState(() => JSON.stringify(instanceJson(instance), null, 2));
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [undoContent, setUndoContent] = useState<Record<string, TemplateContentValue> | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const templateName = language === "zh" ? template.meta.nameZh : template.meta.nameEn;
  const aiRequest = [
    `Template ID: ${instance.templateId}`,
    "",
    "Template data structure:",
    JSON.stringify(template.meta.schema, null, 2),
    "",
    "Current instance JSON:",
    JSON.stringify(instanceJson(instance), null, 2),
    "",
    "Instructions:",
    "- Modify content only.",
    "- Do not modify instanceId.",
    "- Do not modify templateId.",
    "- Do not modify regionId.",
    "- Do not modify anchorId.",
    "- Do not modify layoutSettings.",
    "- Preserve the zh / en bilingual structure.",
    "- Return the complete JSON object.",
    "- Do not use a Markdown code block.",
  ].join("\n");

  const copyAiRequest = async () => {
    try {
      await navigator.clipboard.writeText(aiRequest);
      setStatus(language === "zh" ? "AI 请求已复制" : "AI request copied");
      setError("");
    } catch {
      setError(language === "zh" ? "复制失败，请检查浏览器剪贴板权限。" : "Copy failed. Check clipboard permission.");
    }
  };

  const applyJson = () => {
    setError("");
    setStatus("");

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (parseError) {
      setError(
        language === "zh"
          ? `JSON 无法解析：${parseError instanceof Error ? parseError.message : "未知错误"}`
          : `Invalid JSON: ${parseError instanceof Error ? parseError.message : "Unknown error"}`,
      );
      return;
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      setError(language === "zh" ? "粘贴内容必须是完整的 JSON 对象。" : "The pasted value must be a complete JSON object.");
      return;
    }

    const candidate = parsed as Record<string, unknown>;
    const immutableChecks: Array<[string, unknown, unknown]> = [
      ["instanceId", candidate.instanceId, instance.instanceId],
      ["templateId", candidate.templateId, instance.templateId],
      ["regionId", candidate.regionId, instance.regionId],
      ["anchorId", candidate.anchorId, instance.anchorId],
    ];
    const changedIdentity = immutableChecks.find(([, pasted, current]) => pasted !== current);
    if (changedIdentity) {
      setError(
        language === "zh"
          ? `${changedIdentity[0]} 与当前实例不一致，未应用任何内容。`
          : `${changedIdentity[0]} does not match the current instance. Nothing was applied.`,
      );
      return;
    }

    if (
      JSON.stringify(candidate.layoutSettings ?? null)
      !== JSON.stringify(instance.layoutSettings ?? null)
    ) {
      setError(language === "zh" ? "layoutSettings 已被修改，未应用任何内容。" : "layoutSettings was changed. Nothing was applied.");
      return;
    }

    if (!candidate.content || typeof candidate.content !== "object" || Array.isArray(candidate.content)) {
      setError(language === "zh" ? "content 必须是一个 JSON 对象。" : "content must be a JSON object.");
      return;
    }

    const nextContent = candidate.content as Record<string, TemplateContentValue>;
    const schemaError = validateContentAgainstSchema(nextContent, template.meta.schema);
    if (schemaError) {
      setError(language === "zh" ? `内容不符合模板结构：${schemaError}` : `Content does not match the template schema: ${schemaError}`);
      return;
    }
    if (instance.templateId === "image-row") {
      const imageRowOptionsError = validateImageRowOptions(nextContent);
      if (imageRowOptionsError) {
        setError(language === "zh" ? `Image Row 设置无效：${imageRowOptionsError}` : `Invalid Image Row settings: ${imageRowOptionsError}`);
        return;
      }
    }

    setUndoContent(cloneJsonContent(instance.content));
    onApply(cloneJsonContent(nextContent));
    setJsonText(JSON.stringify({ ...instanceJson(instance), content: nextContent }, null, 2));
    setStatus(language === "zh" ? "内容已应用到当前实例" : "Content applied to this instance");
  };

  const undo = () => {
    if (!undoContent) return;
    onApply(cloneJsonContent(undoContent));
    setJsonText(JSON.stringify({ ...instanceJson(instance), content: undoContent }, null, 2));
    setUndoContent(null);
    setError("");
    setStatus(language === "zh" ? "本次代码填充已撤销" : "Code fill was undone");
  };

  return createPortal(
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-deepIndigo/86 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-[14px] border border-electricBlue/28 bg-[#12143f] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.48)] md:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`code-fill-title-${instance.instanceId}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={`code-fill-title-${instance.instanceId}`} className="font-display text-lg font-semibold text-softWhite">
              {language === "zh" ? "代码填充" : "Code fill"} · {templateName}
            </h2>
            <p className="mt-1 font-mono text-xs text-softWhite/44">{instance.instanceId}</p>
          </div>
          <button
            type="button"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-archiveBlue/40 text-softWhite/70 transition hover:text-softWhite"
            aria-label={language === "zh" ? "关闭" : "Close"}
            onClick={onClose}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <textarea
          className="mt-5 h-[55vh] min-h-72 resize-none border border-softWhite/12 bg-deepIndigo/42 p-4 font-mono text-xs leading-5 text-softWhite/82 outline-none focus:border-acidGreen"
          value={jsonText}
          spellCheck={false}
          aria-label={language === "zh" ? "当前实例 JSON" : "Current instance JSON"}
          onChange={(event) => {
            setJsonText(event.target.value);
            setError("");
            setStatus("");
          }}
        />

        {error ? <p className="mt-3 text-sm text-peach">{error}</p> : null}
        {status ? <p className="mt-3 text-sm text-acidGreen/82">{status}</p> : null}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <button type="button" className="editor-action inline-flex items-center gap-2" onClick={() => void copyAiRequest()}>
            <Copy className="h-4 w-4" aria-hidden="true" />
            {language === "zh" ? "复制 AI 请求" : "Copy AI request"}
          </button>
          <div className="flex flex-wrap items-center gap-2">
            {undoContent ? (
              <button type="button" className="editor-action inline-flex items-center gap-2" onClick={undo}>
                <Undo2 className="h-4 w-4" aria-hidden="true" />
                {language === "zh" ? "撤销本次代码填充" : "Undo code fill"}
              </button>
            ) : null}
            <button type="button" className="editor-action" onClick={onClose}>
              {language === "zh" ? "取消" : "Cancel"}
            </button>
            <button
              type="button"
              className="inline-flex min-h-9 items-center justify-center bg-acidGreen px-4 text-sm font-semibold text-deepIndigo transition hover:bg-[#8cff75]"
              onClick={applyJson}
            >
              {language === "zh" ? "应用内容" : "Apply content"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function InstanceBlock({
  instance,
  instanceOrder,
  projectId,
  registeredTemplates,
  language,
  db,
  isEditing,
  ownerEditing,
  canMoveUp,
  canMoveDown,
  followsTemplate,
  onMoveUp,
  onMoveDown,
  onRemove,
  onStartEditing,
  onDoneEditing,
  onContentChange,
  onLayoutSettingsChange,
  onDiskImagesChanged,
  domId,
  jumpTargets,
}: {
  instance: TemplateInstance;
  instanceOrder: number;
  projectId: string;
  registeredTemplates: RegisteredTemplate[];
  language: "zh" | "en";
  db: ProjectImageDb;
  isEditing: boolean;
  ownerEditing: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  followsTemplate: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onStartEditing: () => void;
  onDoneEditing: () => void;
  onContentChange: (content: Record<string, TemplateContentValue>) => void;
  onLayoutSettingsChange: (layoutSettings: TemplateInstanceLayoutSettings) => void;
  onDiskImagesChanged?: () => void;
  domId?: string;
  jumpTargets: Array<{ instanceId: string; label: string }>;
}) {
  const registered = registeredTemplates.find((t) => t.meta.id === instance.templateId);
  const name = registered ? (language === "zh" ? registered.meta.nameZh : registered.meta.nameEn) : instance.templateId;
  const templateDefaultInset = useTemplateHorizontalInset(instance.templateId);
  const hasInsetOverride = instance.layoutSettings?.horizontalInset !== undefined;
  const effectiveInset = instance.layoutSettings?.horizontalInset ?? templateDefaultInset;
  const [codeFillOpen, setCodeFillOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const supportsInlineEditing = instance.templateId === "statement-longform" || instance.templateId === "image-row" || instance.templateId === "playable-game" || instance.templateId === "direction-compare";
  const imageRowItemCount = instance.templateId === "image-row" && Array.isArray(instance.content.items)
    ? instance.content.items.length
    : 0;
  const imageRowEditingGridCount = Math.max(1, imageRowItemCount);
  const storedImageRowColumns = instance.content.columns;
  const effectiveImageRowColumns = storedImageRowColumns === 1 || storedImageRowColumns === 2 || storedImageRowColumns === 3 || storedImageRowColumns === 4
    ? storedImageRowColumns
    : Math.min(4, Math.max(1, imageRowEditingGridCount));
  const effectiveImageRowAlignment = instance.content.rowAlignment === "center" ? "center" : "start";

  // In collection-export mode only: a small, explicit allowlist of known
  // horizontal-scroll viewport selectors (templates that rely on the live
  // site's horizontal-scroll affordance at narrow widths — fine for a
  // visitor, but a one-shot PDF capture can't scroll, so content past the
  // visible edge would otherwise be clipped). Deliberately NOT a generic
  // "scan every descendant of every instance" scanner — that shrank
  // unrelated templates whenever any nested element merely reported
  // overflow, which is exactly what this was asked not to do. Templates
  // with their own more specific needs (e.g. phase-milestones, which must
  // also keep its heading at normal size and re-center its track) own a
  // dedicated fix inside their own component instead of relying on this.
  // Add a selector here only for a template whose live layout is "one
  // fixed-min-width viewport, otherwise scrollable" like process-flow's.
  const HORIZONTAL_FIT_VIEWPORT_SELECTORS = [".process-flow-viewport"];
  const fitRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isCollectionExportCapture()) return;
    const node = fitRef.current;
    if (!node) return;
    for (const selector of HORIZONTAL_FIT_VIEWPORT_SELECTORS) {
      const viewport = node.querySelector<HTMLElement>(selector);
      if (!viewport) continue;
      viewport.style.zoom = "1";
      const availableWidth = viewport.clientWidth;
      const naturalWidth = viewport.scrollWidth;
      const fitScale = availableWidth > 0 && naturalWidth > availableWidth
        ? Math.min(1, availableWidth / naturalWidth)
        : 1;
      // Scale the viewport itself, not the whole instance — its sibling
      // heading/copy (if any, outside this selector) stays at normal size.
      if (fitScale < 1) viewport.style.zoom = String(fitScale);
      // Verifying success must use getBoundingClientRect, not
      // clientWidth/scrollWidth: this Chromium build does not recompute
      // those integer DOM properties after a zoom change, even though the
      // real rendered pixels (and the real capture) are correctly scaled —
      // confirmed empirically by comparing both. Checks whether the
      // viewport's own direct children now fit inside its edge, both
      // measured post-zoom.
      const viewportRect = viewport.getBoundingClientRect();
      let overflowAfterFit = 0;
      for (const child of Array.from(viewport.children)) {
        const childRect = child.getBoundingClientRect();
        overflowAfterFit = Math.max(overflowAfterFit, Math.round(childRect.right - viewportRect.right));
      }
      recordTemplateFit({
        templateInstanceId: instance.instanceId,
        templateId: instance.templateId,
        naturalWidth,
        availableWidth: Math.round(availableWidth),
        fitScale,
        overflowAfterFit: Math.max(0, overflowAfterFit),
      });
    }
  }, [instance.instanceId, instance.templateId, instance.content]);

  return (
    <div
      ref={fitRef}
      id={instance.instanceId}
      data-template-instance-id={instance.instanceId}
      data-template-instance-template-id={instance.templateId}
      className={`relative min-w-0 ${isEditing ? "outline outline-1 outline-offset-[-1px] outline-acidGreen/55" : ""}`}
      style={{
        // Collection export renders one project as a standalone printed
        // page, not a scrolling webpage — the normal, generous scroll-
        // reading rhythm (3rem/2.67rem) reads as too sparse and too long
        // there. Fixed to one flat 24px rule between every top-level
        // template instance in capture mode (no separate "adjacent same
        // template" tier — that nicety is a live-site-only distinction),
        // gated by isCollectionExportCapture(); the live site's own
        // vertical rhythm is untouched.
        marginTop: isCollectionExportCapture()
          ? "24px"
          : followsTemplate
            ? "var(--template-library-adjacent-instance-gap)"
            : "var(--template-library-instance-gap)",
      }}
    >
      {domId && domId !== instance.instanceId ? <span id={domId} className="absolute left-0 top-0" aria-hidden="true" /> : null}
      {ownerEditing && !isEditing ? (
        <button type="button" className="editor-action absolute -top-10 right-2 z-[70] inline-flex min-h-8 items-center gap-1.5 bg-deepIndigo/88 shadow-sm backdrop-blur" onClick={onStartEditing}>
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          {language === "zh" ? "编辑" : "Edit"}
        </button>
      ) : null}
      {isEditing ? (
        <div className="absolute -top-10 right-2 z-[70] flex max-w-[calc(100%_-_1rem)] flex-wrap items-center justify-between gap-2 rounded-[6px] border border-electricBlue/25 bg-deepIndigo/90 px-2 py-1.5 shadow-[0_8px_24px_rgba(3,5,26,0.28)] backdrop-blur-md">
          <p className="font-mono text-xs uppercase tracking-[0.1em] text-softWhite/56">{name}</p>
          <div className="flex items-center gap-2">
            <button type="button" className="editor-action inline-flex min-h-8 items-center gap-1.5" onClick={onDoneEditing}>
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              {language === "zh" ? "完成" : "Done"}
            </button>
            {registered ? (
              <button
                type="button"
                className="editor-action inline-flex min-h-8 items-center gap-1.5"
                onClick={() => setCodeFillOpen(true)}
              >
                <Braces className="h-4 w-4" aria-hidden="true" />
                {language === "zh" ? "代码填充" : "Code fill"}
              </button>
            ) : null}
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-archiveBlue/38 text-softWhite/62 transition hover:text-softWhite"
              aria-label={language === "zh" ? "模板设置" : "Template settings"}
              onClick={() => setSettingsOpen((open) => !open)}
            >
              <Settings className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-archiveBlue/38 text-softWhite/62 transition hover:text-softWhite disabled:cursor-not-allowed disabled:opacity-25"
              aria-label={language === "zh" ? "上移" : "Move up"}
              disabled={!canMoveUp}
              onClick={onMoveUp}
            >
              <ArrowUp className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-archiveBlue/38 text-softWhite/62 transition hover:text-softWhite disabled:cursor-not-allowed disabled:opacity-25"
              aria-label={language === "zh" ? "下移" : "Move down"}
              disabled={!canMoveDown}
              onClick={onMoveDown}
            >
              <ArrowDown className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-peach/10 text-peach/72 transition hover:bg-peach/18 hover:text-peach"
              aria-label={language === "zh" ? "删除" : "Delete"}
              onClick={onRemove}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}
      {isEditing && settingsOpen ? (
        <div className="absolute right-2 top-0 z-[69] flex max-w-[calc(100%_-_1rem)] flex-wrap items-center gap-3 rounded-[6px] border border-softWhite/12 bg-deepIndigo/94 px-3 py-2 shadow-[0_12px_30px_rgba(3,5,26,0.34)] backdrop-blur-md">
          <span className="text-xs font-semibold text-softWhite/64">
            {language === "zh" ? "左右缩进" : "Horizontal inset"}
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={400}
            step={8}
            value={effectiveInset}
            onChange={(event) => {
              const next = Number(event.target.value);
              onLayoutSettingsChange({ horizontalInset: Number.isFinite(next) ? Math.max(0, Math.round(next)) : 0 });
            }}
            className="w-20 border-b border-softWhite/18 bg-transparent py-1 text-center text-sm text-softWhite outline-none focus:border-acidGreen"
          />
          <span className="text-xs text-softWhite/40">px</span>
          {hasInsetOverride ? (
            <button
              type="button"
              className="editor-action"
              onClick={() => onLayoutSettingsChange({ horizontalInset: undefined })}
            >
              {language === "zh" ? "恢复模板默认值" : "Restore template default"}
            </button>
          ) : (
            <span className="text-xs text-softWhite/40">
              {language === "zh" ? `跟随模板默认值（${templateDefaultInset}px）` : `Following template default (${templateDefaultInset}px)`}
            </span>
          )}
          {instance.templateId === "image-row" ? (
            <>
              <span className="h-5 w-px bg-softWhite/12" aria-hidden="true" />
              <span className="text-xs font-semibold text-softWhite/64">{language === "zh" ? "每行图片" : "Images per row"}</span>
              <div className="flex gap-1">
                {[1, 2, 3, 4].map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`editor-action min-w-8 justify-center ${effectiveImageRowColumns === value ? "border-acidGreen text-acidGreen" : ""}`}
                    onClick={() => onContentChange({ ...instance.content, columns: value })}
                  >
                    {value}
                  </button>
                ))}
              </div>
              <span className="text-xs font-semibold text-softWhite/64">{language === "zh" ? "最后一行" : "Last row"}</span>
              <div className="flex gap-1">
                <button type="button" className={`editor-action ${effectiveImageRowAlignment === "start" ? "border-acidGreen text-acidGreen" : ""}`} onClick={() => onContentChange({ ...instance.content, rowAlignment: "start" })}>
                  {language === "zh" ? "左对齐" : "Left"}
                </button>
                <button type="button" className={`editor-action ${effectiveImageRowAlignment === "center" ? "border-acidGreen text-acidGreen" : ""}`} onClick={() => onContentChange({ ...instance.content, rowAlignment: "center" })}>
                  {language === "zh" ? "居中" : "Center"}
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
      <ResolvedInstancePreview instance={instance} instanceOrder={instanceOrder} projectId={projectId} locale={language} db={db} inlineEditing={isEditing} onContentChange={onContentChange} onDiskImagesChanged={onDiskImagesChanged} />
      {isEditing && registered && !supportsInlineEditing ? (
        <InstanceEditor
          templateId={instance.templateId}
          schema={registered.meta.schema}
          content={instance.content}
          language={language}
          onChange={onContentChange}
          db={db}
          jumpTargets={jumpTargets}
        />
      ) : null}
      {isEditing && registered && codeFillOpen ? (
        <CodeFillModal
          instance={instance}
          template={registered}
          language={language}
          onApply={onContentChange}
          onClose={() => setCodeFillOpen(false)}
        />
      ) : null}
    </div>
  );
}

export type LegacyFlowItem = {
  id: string;
  node: ReactNode;
};

// Renders one "region" of a project page — an existing legacy content list
// (one intervention section, one chapter, etc.) interleaved with that
// region's template instances, with a single unified "+ Add template"
// insertion point before every item, between any two items, and after the
// last one. Legacy items are rendered exactly as the caller built them
// (their own move/remove controls are untouched) and are never reordered
// by this component — only template instances move, via anchors relative
// to the surrounding legacy block ids, so their position survives reloads
// even if legacy content is edited later.
export function TemplateFlowRegion({
  regionId,
  projectId,
  legacyItems,
  instances,
  onInstancesChange,
  isEditing,
  language,
  db,
  pickerExcludedTemplateIds = [],
  onDiskImagesChanged,
}: {
  regionId: string;
  projectId: string;
  legacyItems: LegacyFlowItem[];
  instances: TemplateInstance[];
  onInstancesChange: (next: TemplateInstance[]) => void;
  isEditing: boolean;
  language: "zh" | "en";
  db: ProjectImageDb;
  pickerExcludedTemplateIds?: string[];
  onDiskImagesChanged?: () => void;
}) {
  const registeredTemplates = useMemo(() => getRegisteredTemplates(), []);
  const [pickerAtIndex, setPickerAtIndex] = useState<number | null>(null);
  const [editingInstanceId, setEditingInstanceId] = useState<string | null>(null);

  useEffect(() => {
    if (!isEditing) setEditingInstanceId(null);
  }, [isEditing]);

  useEffect(() => {
    if (editingInstanceId && !instances.some((instance) => instance.instanceId === editingInstanceId)) {
      setEditingInstanceId(null);
    }
  }, [editingInstanceId, instances]);

  const legacyIds = legacyItems.map((item) => item.id);
  const units = buildFlowUnits(legacyIds, regionId, instances);
  const instanceById = new Map(
    instances.filter((instance) => instance.regionId === regionId).map((instance) => [instance.instanceId, instance] as const),
  );
  const legacyNodeById = new Map(legacyItems.map((item) => [item.id, item.node] as const));

  const insertInstance = (index: number, templateId: string) => {
    const registered = registeredTemplates.find((t) => t.meta.id === templateId);
    if (!registered) return;
    let instanceId = createInstanceId(templateId);
    while (templateId === "direction-compare" && instances.some((instance) => instance.instanceId === instanceId)) {
      instanceId = createInstanceId(templateId);
    }
    const newInstance: TemplateInstance = {
      instanceId,
      templateId,
      regionId,
      anchorId: anchorForInsertPosition(units, index),
      content: sampleContentFor(registered.meta.schema, templateId),
    };
    const newUnits = [...units.slice(0, index), { kind: "instance" as const, instanceId: newInstance.instanceId }, ...units.slice(index)];
    const { anchors, order } = deriveFromUnits(newUnits);
    onInstancesChange(applyRegionOrder([...instances, newInstance], regionId, anchors, order));
    setPickerAtIndex(null);
  };

  const findUnitIndex = (instanceId: string) => units.findIndex((unit) => unit.kind === "instance" && unit.instanceId === instanceId);

  const moveInstance = (instanceId: string, direction: -1 | 1) => {
    const current = findUnitIndex(instanceId);
    const target = current + direction;
    if (current === -1 || target < 0 || target >= units.length) return;
    const newUnits = [...units];
    [newUnits[current], newUnits[target]] = [newUnits[target], newUnits[current]];
    const { anchors, order } = deriveFromUnits(newUnits);
    onInstancesChange(applyRegionOrder(instances, regionId, anchors, order));
  };

  const removeInstance = async (instanceId: string) => {
    if (!window.confirm(language === "zh" ? "删除这个模板实例？" : "Delete this template instance?")) return;
    const matches = instances.filter((candidate) => candidate.instanceId === instanceId);
    if (matches.some((candidate) => candidate.templateId === "direction-compare") && matches.length !== 1) {
      window.alert(language === "zh"
        ? `无法安全删除：实例 ID ${instanceId} 匹配到 ${matches.length} 条记录。请先修复重复实例 ID。`
        : `Cannot delete safely: instance ID ${instanceId} matched ${matches.length} records. Repair duplicate instance IDs first.`);
      return;
    }
    const [instance] = matches;
    if (instance?.templateId === "image-row" || instance?.templateId === "direction-compare") {
      const imageValues = instance.templateId === "image-row" && Array.isArray(instance.content.items)
        ? instance.content.items.flatMap((value) => {
            if (!value || typeof value !== "object" || Array.isArray(value)) return [];
            return [(value as Record<string, unknown>).image];
          })
        : [instance.content.leftImage, instance.content.rightImage];
      const imageIds = imageValues.flatMap((image) => {
        if (!image || typeof image !== "object" || Array.isArray(image)) return [];
        const imageId = (image as Record<string, unknown>).imageId;
        return typeof imageId === "string" ? [imageId] : [];
      });
      if (imageIds.length) {
        try {
          await unbindDynamicProjectImages({ projectId, instanceId, imageIds, instance: null });
          onDiskImagesChanged?.();
        } catch (error) {
          window.alert(error instanceof Error ? error.message : "The saved image references could not be removed.");
          return;
        }
      }
    }
    onInstancesChange(instances.filter((instance) => instance.instanceId !== instanceId));
  };

  const canMove = (instanceId: string, direction: -1 | 1) => {
    const current = findUnitIndex(instanceId);
    const target = current + direction;
    return current !== -1 && target >= 0 && target < units.length;
  };

  const updateInstanceContent = (instanceId: string, content: Record<string, TemplateContentValue>) => {
    onInstancesChange(instances.map((instance) => (instance.instanceId === instanceId ? { ...instance, content } : instance)));
  };

  // A horizontalInset of undefined means "no override" — remove the whole
  // layoutSettings object rather than storing an explicit undefined, so an
  // instance that has never been customized keeps following this
  // template's saved default indefinitely (see templateLayoutDefaults.ts).
  const updateInstanceLayoutSettings = (instanceId: string, layoutSettings: TemplateInstanceLayoutSettings) => {
    onInstancesChange(instances.map((instance) => {
      if (instance.instanceId !== instanceId) return instance;
      if (layoutSettings.horizontalInset === undefined) {
        const { layoutSettings: _dropped, ...rest } = instance;
        return rest;
      }
      return { ...instance, layoutSettings: { ...instance.layoutSettings, ...layoutSettings } };
    }));
  };

  const renderStrip = (index: number) =>
    isEditing ? (
      <InsertTemplateStrip active={pickerAtIndex === index} onOpen={() => setPickerAtIndex(index)} language={language} />
    ) : null;

  return (
    <>
      {units.map((unit, index) => (
        <Fragment key={unit.kind === "legacy" ? `legacy-${unit.id}` : unit.instanceId}>
          {renderStrip(index)}
          {unit.kind === "legacy" ? (
            legacyNodeById.get(unit.id) ?? null
          ) : (
            <InstanceBlock
              instance={instanceById.get(unit.instanceId)!}
              instanceOrder={instances.findIndex((candidate) => candidate.instanceId === unit.instanceId)}
              projectId={projectId}
              registeredTemplates={registeredTemplates}
              language={language}
              db={db}
              isEditing={isEditing && editingInstanceId === unit.instanceId}
              ownerEditing={isEditing}
              canMoveUp={canMove(unit.instanceId, -1)}
              canMoveDown={canMove(unit.instanceId, 1)}
              followsTemplate={index > 0 && units[index - 1]?.kind === "instance"}
              onMoveUp={() => moveInstance(unit.instanceId, -1)}
              onMoveDown={() => moveInstance(unit.instanceId, 1)}
              onRemove={() => void removeInstance(unit.instanceId)}
              onStartEditing={() => setEditingInstanceId(unit.instanceId)}
              onDoneEditing={() => setEditingInstanceId(null)}
              onContentChange={(content) => updateInstanceContent(unit.instanceId, content)}
              onLayoutSettingsChange={(layoutSettings) => updateInstanceLayoutSettings(unit.instanceId, layoutSettings)}
              onDiskImagesChanged={onDiskImagesChanged}
              domId={projectInstanceDomId(projectId, instanceById.get(unit.instanceId)!)}
              jumpTargets={instances
                .filter((candidate) => candidate.instanceId !== unit.instanceId)
                .map((candidate, candidateIndex) => ({
                  instanceId: candidate.instanceId,
                  label: localizedTemplateInstanceLabel(candidate, registeredTemplates, language, candidateIndex),
                }))}
            />
          )}
        </Fragment>
      ))}
      {renderStrip(units.length)}
      {pickerAtIndex !== null ? (
        <TemplatePickerModal
          templates={registeredTemplates.filter(
            (template) =>
              !pickerExcludedTemplateIds.includes(template.meta.id),
          )}
          language={language}
          onSelect={(templateId) => insertInstance(pickerAtIndex, templateId)}
          onClose={() => setPickerAtIndex(null)}
        />
      ) : null}
    </>
  );
}
