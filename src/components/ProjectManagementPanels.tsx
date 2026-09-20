import { useState, type ChangeEvent, type ReactNode } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, FilePlus2, Save, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createDynamicProject, getProjectPublicMetaStoreSnapshot, restoreProjectPublicMetaStore, setProjectPublicMetaOverride, COVER_SHORT_DESCRIPTION_MAX, coverShortDescriptionOverLimit, DEFAULT_PROJECT_THEME_COLOR, PROJECT_THEME_COLOR_PRESETS, type PortfolioTrack, type ProjectCatalogItem, type ProjectVisibility, type ResolvedProjectMetadata } from "../lib/projectMetadata";
import { markProjectDirty } from "../lib/publishIntent";
import { ProjectCoverEditor } from "./ProjectCoverEditor";
import { useLocale } from "../locales/LocaleContext";

type WizardStatus = "draft" | "public" | "coming-soon";
type MetadataDraft = {
  id: string; slug: string; titleZh: string; titleEn: string;
  // Hero's independent two-line title (EDIT PROJECT INFO only -- the New
  // Project wizard still collects a single titleZh/titleEn above; these
  // stay empty until the owner opens EDIT PROJECT INFO and splits it).
  titleLine1Zh: string; titleLine1En: string; titleLine2Zh: string; titleLine2En: string;
  summaryZh: string; summaryEn: string;
  year: string; categoryZh: string; categoryEn: string; tagsZh: string; tagsEn: string; role: string; collaborators: string; tools: string;
  status: WizardStatus; visibility: ProjectVisibility; featured: boolean; archiveOrder: number; portfolioTrack: PortfolioTrack | null; projectThemeColor: string;
};

const emptyMetadata = (archiveOrder: number): MetadataDraft => ({ id: "", slug: "", titleZh: "", titleEn: "", titleLine1Zh: "", titleLine1En: "", titleLine2Zh: "", titleLine2En: "", summaryZh: "", summaryEn: "", year: new Date().getFullYear().toString(), categoryZh: "", categoryEn: "", tagsZh: "", tagsEn: "", role: "", collaborators: "", tools: "", status: "draft", visibility: "hidden", featured: false, archiveOrder, portfolioTrack: null, projectThemeColor: DEFAULT_PROJECT_THEME_COLOR });

function validateDuration(value: string) {
  return /^\d{4}(?:[./-]\d{1,2}(?:[./-]\d{1,2})?)?(?:\s*(?:[-–—]|to)\s*(?:(?:\d{4}(?:[./-]\d{1,2}(?:[./-]\d{1,2})?)?)|(?:\d{1,2}(?:[./-]\d{1,2})?)|进行中|至今|present|ongoing))?$/i.test(value.trim());
}

function validateMetadata(metadata: MetadataDraft, catalog: ResolvedProjectMetadata[], currentId?: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(metadata.id)) return "Project ID must use lowercase kebab-case.";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(metadata.slug)) return "Slug must use lowercase kebab-case.";
  if (catalog.some((project) => project.id === metadata.id && project.id !== currentId)) return "This project ID already exists.";
  if (catalog.some((project) => project.slug === metadata.slug && project.id !== currentId)) return "This slug already exists.";
  if (!metadata.titleZh.trim() || !metadata.summaryZh.trim()) return "Chinese title and description are required.";
  if (!currentId && !metadata.categoryZh.trim()) return "Chinese category is required.";
  if (!validateDuration(metadata.year)) return "Use a year/date format such as 2026, 2026.07, or 2026.07.03–07.05.";
  // Cover's shortDescription is a concise subtitle, not body copy -- blocks
  // save instead of silently truncating what the owner already wrote (see
  // COVER_SHORT_DESCRIPTION_MAX's own comment in projectMetadata.ts).
  if (coverShortDescriptionOverLimit("zh", metadata.summaryZh)) return `Chinese short description exceeds ${COVER_SHORT_DESCRIPTION_MAX.zh} characters.`;
  if (coverShortDescriptionOverLimit("en", metadata.summaryEn)) return `English short description exceeds ${COVER_SHORT_DESCRIPTION_MAX.en} characters.`;
  return "";
}

function generatedProjectId(title: string) {
  const normalized = title
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  let hash = 2166136261;
  for (const character of title.trim()) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  const suffix = (hash >>> 0).toString(36);
  return normalized
    ? `${normalized.slice(0, 42).replace(/-+$/g, "")}-${suffix}`
    : title.trim()
      ? `project-${suffix}`
      : "";
}

function generatedSlug(id: string) {
  return id
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function NewProjectWizard({ catalog, onClose }: { catalog: ResolvedProjectMetadata[]; onClose: () => void }) {
  const { locale, pathFor } = useLocale();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [metadata, setMetadata] = useState(() => emptyMetadata(catalog.length + 1));
  const [idManuallyEdited, setIdManuallyEdited] = useState(false);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const updateCreateField = (key: keyof MetadataDraft, next: string | number | boolean) => {
    if (key === "id") setIdManuallyEdited(true);
    if (key === "slug") setSlugManuallyEdited(true);
    setMetadata((current) => {
      const updated = { ...current, [key]: next };
      if (key === "titleZh" && typeof next === "string") {
        const nextId = idManuallyEdited ? current.id : generatedProjectId(next);
        if (!idManuallyEdited) updated.id = nextId;
        if (!slugManuallyEdited) updated.slug = generatedSlug(nextId);
      } else if (key === "id" && typeof next === "string" && !slugManuallyEdited) {
        updated.slug = generatedSlug(next);
      }
      return updated;
    });
  };

  const next = () => {
    const validation = validateMetadata(metadata, catalog); if (validation) { setError(validation); return; }
    setError(""); setStep(2);
  };
  const back = () => { setError(""); setStep(1); };

  const create = async () => {
    const validation = validateMetadata(metadata, catalog); if (validation) { setError(validation); return; }
    const metadataSnapshot = getProjectPublicMetaStoreSnapshot();
    setCreating(true); setError("");
    try {
      const status = metadata.status;
      const record: ProjectCatalogItem = {
        id: metadata.id, slug: metadata.slug, route: `/work/${metadata.slug}`,
        titleZh: metadata.titleZh.trim(), titleEn: metadata.titleEn.trim(), summaryZh: metadata.summaryZh.trim(), summaryEn: metadata.summaryEn.trim(),
        tagsZh: splitList(metadata.tagsZh), tagsEn: splitList(metadata.tagsEn), categoryZh: metadata.categoryZh.trim(), categoryEn: metadata.categoryEn.trim(), duration: metadata.year,
        archiveOrder: metadata.archiveOrder, featured: metadata.featured, group: "work",
        visibility: metadata.visibility,
        publicationState: status === "coming-soon" ? "coming-soon" : status === "draft" ? "draft" : "published",
        coverImage: "", comingSoon: status === "coming-soon", isDynamic: true,
        year: metadata.year, role: metadata.role.trim(), collaborators: splitList(metadata.collaborators), tools: splitList(metadata.tools),
      };
      createDynamicProject(record);
      onClose();
      navigate(pathFor(`/work/${metadata.slug}`));
    } catch (reason) {
      restoreProjectPublicMetaStore(metadataSnapshot);
      setError(reason instanceof Error ? reason.message : "Unable to create the project.");
    } finally { setCreating(false); }
  };

  return <ManagementOverlay title={locale === "zh" ? "新增项目" : "New project"} onClose={onClose}>
    <div className="flex gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-softWhite/36">{[1, 2].map((number) => <span key={number} className={number === step ? "text-acidGreen" : ""}>0{number}</span>)}</div>
    {step === 1 ? <CreateMetadataStep value={metadata} onFieldChange={updateCreateField} /> : null}
    {step === 2 ? <div className="mt-6 grid gap-3 rounded-[12px] border border-softWhite/10 bg-archiveBlue/14 p-5 text-sm">
      <Fact label="Route" value={`/${locale}/work/${metadata.slug}`} />
      <Fact label="Project ID" value={metadata.id} />
      <Fact label="Featured" value={metadata.featured ? "Yes" : "No"} />
      <p className="mt-2 text-xs leading-5 text-softWhite/44">{locale === "zh" ? "创建后页面为空白。进入编辑模式后，使用“+ 添加模板”从当前 9 个模板自行搭建内容。" : "The project starts blank. In edit mode, use \"+ Add template\" to build its content from the current 9 templates."}</p>
    </div> : null}
    {error ? <p className="mt-4 text-sm text-peach" role="alert">{error}</p> : null}
    <div className="mt-7 flex justify-between"><button type="button" className="editor-action" onClick={step === 1 ? onClose : back}>{step === 1 ? <X className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />}{step === 1 ? "Cancel" : "Back"}</button>{step < 2 ? <button type="button" className="editor-action border-acidGreen text-acidGreen" onClick={next}>Next<ArrowRight className="h-4 w-4" /></button> : <button type="button" className="editor-action border-acidGreen bg-acidGreen text-deepIndigo" onClick={create} disabled={creating}><FilePlus2 className="h-4 w-4" />{creating ? "Creating..." : "Create project"}</button>}</div>
  </ManagementOverlay>;
}

export function ProjectInfoEditor({ project, catalog, onClose, onSaved }: { project: ResolvedProjectMetadata; catalog: ResolvedProjectMetadata[]; onClose: () => void; onSaved?: (slug: string) => void }) {
  const { locale } = useLocale();
  const [metadata, setMetadata] = useState<MetadataDraft>(() => ({
    id: project.id,
    slug: project.slug,
    titleZh: project.titleZh,
    titleEn: project.titleEn,
    // Compat: an explicit line field wins; otherwise the whole existing
    // title (per locale, no cross-language borrowing here) becomes line 1
    // and line 2 starts empty, ready for the owner to split manually. `||`,
    // not `??` -- DynamicProjectCodePanel's AI-apply path writes an
    // explicit "" (not undefined) to signal "no line split, use the whole
    // title" (see projectMetadata.ts's resolveTitleLines for the matching
    // fix); `??` would show this editor's own Line 1 field as blank
    // instead of the real title, and saving from there would then persist
    // that blank as the new whole title, permanently erasing it.
    titleLine1Zh: project.titleLine1Zh || project.titleZh,
    titleLine1En: project.titleLine1En || project.titleEn,
    titleLine2Zh: project.titleLine2Zh ?? "",
    titleLine2En: project.titleLine2En ?? "",
    summaryZh: project.summaryZh,
    summaryEn: project.summaryEn,
    year: project.duration || project.year || "",
    categoryZh: project.categoryZh,
    categoryEn: project.categoryEn,
    tagsZh: project.tagsZh.join(", "),
    tagsEn: project.tagsEn.join(", "),
    role: project.role ?? "",
    collaborators: (project.collaborators ?? []).join(", "),
    tools: (project.tools ?? []).join(", "),
    status: project.publicationState === "published" ? "public" : project.publicationState,
    visibility: project.visibility,
    featured: project.featured,
    archiveOrder: project.archiveOrder,
    portfolioTrack: project.portfolioTrack ?? null,
    projectThemeColor: project.projectThemeColor,
  }));
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const save = () => {
    // titleZh/titleEn (the whole title used everywhere else on the site --
    // archive cards, breadcrumbs, <title> tags) is derived from the two
    // line fields, not edited directly here; MetadataStep no longer shows
    // a plain title input for this editor. Validated as this derived
    // value so the existing "Chinese title required" rule still applies.
    const titleZh = [metadata.titleLine1Zh, metadata.titleLine2Zh].map((line) => line.trim()).filter(Boolean).join(" ");
    const titleEn = [metadata.titleLine1En, metadata.titleLine2En].map((line) => line.trim()).filter(Boolean).join(" ");
    const validation = validateMetadata({ ...metadata, titleZh, titleEn }, catalog, project.id);
    if (validation) { setError(validation); return; }
    if (metadata.slug !== project.slug && !window.confirm(`Change project slug from "${project.slug}" to "${metadata.slug}"? Existing links may need updating.`)) return;
    setProjectPublicMetaOverride(project.id, {
      slug: metadata.slug,
      route: `/work/${metadata.slug}`,
      titleZh,
      titleEn,
      titleLine1Zh: metadata.titleLine1Zh.trim(),
      titleLine1En: metadata.titleLine1En.trim(),
      titleLine2Zh: metadata.titleLine2Zh.trim(),
      titleLine2En: metadata.titleLine2En.trim(),
      summaryZh: metadata.summaryZh.trim(),
      summaryEn: metadata.summaryEn.trim(),
      duration: metadata.year.trim(),
      year: metadata.year.trim(),
      categoryZh: metadata.categoryZh.trim(),
      categoryEn: metadata.categoryEn.trim(),
      tagsZh: splitList(metadata.tagsZh),
      tagsEn: splitList(metadata.tagsEn),
      role: metadata.role.trim(),
      collaborators: splitList(metadata.collaborators),
      tools: splitList(metadata.tools),
      archiveOrder: metadata.archiveOrder,
      featured: metadata.featured,
      visibility: metadata.visibility,
      publicationState: metadata.status === "public" ? "published" : metadata.status,
      portfolioTrack: metadata.portfolioTrack,
      projectThemeColor: metadata.projectThemeColor,
    });
    markProjectDirty(project.id);
    setError("");
    setSaved(true);
    onSaved?.(metadata.slug);
  };
  return <ManagementOverlay title="EDIT PROJECT INFO" onClose={onClose}>
    <p className="mt-3 max-w-3xl text-sm leading-6 text-softWhite/58">{locale === "zh" ? "编辑项目在首页、项目列表和详情页共用的基础资料。保存会更新当前项目，不会创建副本。" : "Edit the shared project information used by the homepage, archive, and detail page. Saving updates this project; it does not create a duplicate."}</p>
    <MetadataStep value={metadata} onChange={(value) => { setMetadata(value); setSaved(false); }} idReadOnly coverUrl="" onCover={() => undefined} showFileInput={false} />
    <div className="mt-6 rounded-[12px] border border-softWhite/10 bg-archiveBlue/14 p-4"><ProjectCoverEditor projectId={project.id} locale={locale} fallbackImage={project.coverImage} variant="compact" /></div>
    {error ? <p className="mt-4 text-sm text-peach" role="alert">{error}</p> : null}
    {saved ? <p className="mt-4 text-sm text-acidGreen" role="status">Project information saved.</p> : null}
    <div className="mt-7 flex flex-wrap justify-between gap-3"><button type="button" className="editor-action" onClick={onClose}><ArrowLeft className="h-4 w-4" />BACK / CANCEL</button><button type="button" className="editor-action border-acidGreen bg-acidGreen text-deepIndigo" onClick={save}><Save className="h-4 w-4" />SAVE PROJECT INFO</button></div>
  </ManagementOverlay>;
}

function CreateMetadataStep({
  value,
  onFieldChange,
}: {
  value: MetadataDraft;
  onFieldChange: (
    key: keyof MetadataDraft,
    value: string | number | boolean,
  ) => void;
}) {
  return (
    <div className="mt-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Input
          label="Chinese title"
          value={value.titleZh}
          onChange={(next) => onFieldChange("titleZh", next)}
        />
        <Input
          label="Year / duration"
          value={value.year}
          onChange={(next) => onFieldChange("year", next)}
          hint="Examples: 2026.07 or 2026.07.03–07.05"
        />
        <Input
          label="Chinese short description"
          value={value.summaryZh}
          onChange={(next) => onFieldChange("summaryZh", next)}
          multiline
          maxLength={COVER_SHORT_DESCRIPTION_MAX.zh}
        />
        <Input
          label="Chinese category"
          value={value.categoryZh}
          onChange={(next) => onFieldChange("categoryZh", next)}
        />
      </div>

      <details className="mt-6 border-t border-softWhite/10 pt-4">
        <summary className="cursor-pointer text-sm font-semibold text-softWhite/72">
          更多设置
        </summary>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Input
            label="Stable project ID"
            value={value.id}
            onChange={(next) => onFieldChange("id", next)}
          />
          <Input
            label="Slug"
            value={value.slug}
            onChange={(next) => onFieldChange("slug", next)}
          />
          <Input
            label="Role"
            value={value.role}
            onChange={(next) => onFieldChange("role", next)}
          />
          <Input
            label="Chinese tags (comma separated)"
            value={value.tagsZh}
            onChange={(next) => onFieldChange("tagsZh", next)}
          />
          <Input
            label="Collaborators (comma separated)"
            value={value.collaborators}
            onChange={(next) => onFieldChange("collaborators", next)}
          />
          <Input
            label="Tools (comma separated)"
            value={value.tools}
            onChange={(next) => onFieldChange("tools", next)}
          />
          <label>
            <span className="editor-label">Publication status</span>
            <select
              className="editor-input"
              value={value.status}
              onChange={(event) =>
                onFieldChange("status", event.target.value)
              }
            >
              <option value="draft">Draft</option>
              <option value="public">Public</option>
              <option value="coming-soon">Coming Soon</option>
            </select>
          </label>
          <label>
            <span className="editor-label">Visibility</span>
            <select
              className="editor-input"
              value={value.visibility}
              onChange={(event) =>
                onFieldChange("visibility", event.target.value)
              }
            >
              <option value="hidden">Hidden from public listings</option>
              <option value="public">Visible in public listings</option>
            </select>
          </label>
          <Input
            label="Archive position"
            value={String(value.archiveOrder)}
            onChange={(next) =>
              onFieldChange("archiveOrder", Number(next) || 0)
            }
          />
          <div className="grid content-start gap-3 rounded-[10px] border border-softWhite/10 p-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={value.featured}
                onChange={(event) =>
                  onFieldChange("featured", event.target.checked)
                }
              />
              Featured on homepage
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={value.status === "coming-soon"}
                onChange={(event) =>
                  onFieldChange(
                    "status",
                    event.target.checked ? "coming-soon" : "draft",
                  )
                }
              />
              Coming soon
            </label>
          </div>
        </div>
      </details>
    </div>
  );
}

// One base accent per project; Hero and Footer both derive from it live via
// the same color-mix formulas project-web-sections.css uses on the real
// page, so this preview is never just a guess at what the page will look
// like. Presets are a fixed click-to-apply list; Custom reuses the native
// browser color picker on purpose -- no bespoke color-wheel UI. Exported --
// Theme Color now lives only in ProjectQuickSettings.tsx, not this file's
// own MetadataStep, but the field UI itself is shared rather than
// duplicated.
export function ThemeColorField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const heroPreview = `color-mix(in srgb, ${value} 60%, #F7F6ED 40%)`;
  const footerPreview = `color-mix(in srgb, ${value} 78%, #F7F6ED 22%)`;
  return (
    <label className="md:col-span-2">
      <span className="editor-label">THEME COLOR / 主题色</span>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {PROJECT_THEME_COLOR_PRESETS.map((preset) => (
          <button
            key={preset.hex}
            type="button"
            onClick={() => onChange(preset.hex)}
            title={`${preset.labelEn} / ${preset.labelZh} · ${preset.hex}`}
            aria-pressed={value.toLowerCase() === preset.hex.toLowerCase()}
            className={`h-8 w-8 rounded-full border-2 transition ${value.toLowerCase() === preset.hex.toLowerCase() ? "border-acidGreen" : "border-softWhite/20 hover:border-softWhite/50"}`}
            style={{ background: preset.hex }}
          />
        ))}
        <span aria-hidden="true" className="mx-1 h-6 w-px bg-softWhite/15" />
        <label className="relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-2 border-dashed border-softWhite/30 hover:border-softWhite/60" title="Custom color">
          <input
            type="color"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
          <span className="pointer-events-none text-xs text-softWhite/56">+</span>
        </label>
        <span className="font-mono text-xs uppercase text-softWhite/56">{value}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 overflow-hidden rounded-[8px] border border-softWhite/10">
        <div className="flex h-14 items-end p-2" style={{ background: `linear-gradient(180deg, ${heroPreview} 0%, #F7F6ED 86%)` }}>
          <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-[#495d47]">Hero</span>
        </div>
        <div className="flex h-14 items-end p-2" style={{ background: footerPreview }}>
          <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-[#2F3B2F]">Footer</span>
        </div>
      </div>
      <small className="mt-1 block text-xs text-softWhite/38">Custom colors are always blended lighter for Hero/Footer -- a dark pick never renders as a deep or black surface.</small>
    </label>
  );
}

// Project Info is metadata-only now: title, description, year, category,
// plus the owner's permanent identity (Project ID) and, tucked in Advanced,
// the two low-frequency fields (Slug, Visibility) that are still edited
// here but don't belong in the everyday-editing main form. Everything else
// that used to live in this form (Role, Portfolio Track, Theme Color, Tags,
// Tools, Collaborators, Publication Status, Archive Position, Featured on
// Homepage) has a different, more specific home now: Track/Status/
// Theme Color/Tags moved to ProjectQuickSettings.tsx's live-write popover;
// Archive Position/Featured already had their real, canonical editor in
// WorkPage.tsx's own archive order editor all along (Project Info was
// always a duplicate for those two); Role/Tools/Collaborators have no
// editor at all right now, reserved for a future Project Overview /
// narrative-presentation surface, per explicit instruction not to build
// one this round. No field was removed from the data schema -- only from
// this form's rendered inputs; every value still round-trips through
// save() below untouched.
function MetadataStep({ value, onChange, coverUrl, onCover, idReadOnly = false, showFileInput = true }: { value: MetadataDraft; onChange: (value: MetadataDraft) => void; coverUrl: string; onCover: (file: File | null) => void; idReadOnly?: boolean; showFileInput?: boolean }) {
  const field = (key: keyof MetadataDraft, next: string | number | boolean) => onChange({ ...value, [key]: next });
  return <div className="mt-6 grid gap-4 md:grid-cols-2">
    <label className="md:col-span-2"><span className="editor-label">Stable project ID</span><input className="editor-input disabled:cursor-not-allowed disabled:opacity-55" value={value.id} readOnly={idReadOnly} onChange={(event) => field("id", event.target.value)} />{idReadOnly ? <small className="mt-1 block text-xs text-softWhite/38">Permanent identity. It is read-only after creation.</small> : null}</label>
    <Input label="Chinese title — Line 1" value={value.titleLine1Zh} onChange={(next) => field("titleLine1Zh", next)} /><Input label="English title — Line 1" value={value.titleLine1En} onChange={(next) => field("titleLine1En", next)} />
    <Input label="Chinese title — Line 2" value={value.titleLine2Zh} onChange={(next) => field("titleLine2Zh", next)} hint="Optional — leave empty for a single-line title" /><Input label="English title — Line 2" value={value.titleLine2En} onChange={(next) => field("titleLine2En", next)} hint="Optional — leave empty for a single-line title" />
    <Input label="Chinese short description" value={value.summaryZh} onChange={(next) => field("summaryZh", next)} multiline maxLength={COVER_SHORT_DESCRIPTION_MAX.zh} /><Input label="English short description" value={value.summaryEn} onChange={(next) => field("summaryEn", next)} multiline maxLength={COVER_SHORT_DESCRIPTION_MAX.en} />
    <Input label="Year / duration" value={value.year} onChange={(next) => field("year", next)} hint="Examples: 2026.07 or 2026.07.03–07.05" />
    <Input label="Chinese category" value={value.categoryZh} onChange={(next) => field("categoryZh", next)} hint="Main classification shown prominently, e.g. Game Jam" /><Input label="English category" value={value.categoryEn} onChange={(next) => field("categoryEn", next)} hint="Main classification shown prominently" />
    {showFileInput ? <label className="rounded-[10px] border border-softWhite/10 p-3 md:col-span-2"><span className="editor-label">Optional cover</span>{coverUrl ? <img src={coverUrl} alt="Cover preview" className="mb-3 aspect-video w-full rounded-[8px] object-cover" /> : null}<input type="file" accept="image/png,image/jpeg,image/webp,image/avif" onChange={(event: ChangeEvent<HTMLInputElement>) => onCover(event.target.files?.[0] ?? null)} /></label> : null}
    <details className="md:col-span-2 mt-2 border-t border-softWhite/10 pt-4">
      <summary className="cursor-pointer text-sm font-semibold text-softWhite/72">Advanced</summary>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label><span className="editor-label">Slug</span><input className="editor-input" value={value.slug} onChange={(event) => field("slug", event.target.value)} />{idReadOnly ? <small className="mt-1 flex items-center gap-1 text-xs text-[#d8bb72]"><AlertTriangle className="h-3.5 w-3.5" />Changing the slug changes the public route and requires confirmation.</small> : null}</label>
        <label><span className="editor-label">Visibility</span><select className="editor-input" value={value.visibility} onChange={(event) => field("visibility", event.target.value)}><option value="public">Visible in public listings</option><option value="hidden">Hidden from public listings</option></select></label>
      </div>
    </details>
  </div>;
}

export function ManagementOverlay({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) { return <div className="fixed inset-0 z-[100] overflow-y-auto bg-[#08081e]/88 p-4 backdrop-blur-sm" role="dialog" aria-modal="true"><div className="mx-auto my-8 max-w-6xl rounded-[18px] border border-electricBlue/30 bg-[#11113a] p-5 shadow-archive md:p-7"><div className="flex items-center justify-between"><h2 className="font-display text-3xl font-semibold">{title}</h2><button type="button" className="editor-icon" onClick={onClose}><X className="h-5 w-5" /></button></div>{children}</div></div>; }
function Input({ label, value, onChange, multiline = false, hint, maxLength }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean; hint?: string; maxLength?: number }) {
  const Field = multiline ? "textarea" : "input";
  const count = value.trim().length;
  const overLimit = maxLength !== undefined && count > maxLength;
  return <label>
    <span className="editor-label flex items-center justify-between gap-2">
      <span>{label}</span>
      {maxLength !== undefined ? <span className={overLimit ? "font-mono text-[11px] font-normal normal-case text-peach" : "font-mono text-[11px] font-normal normal-case text-softWhite/38"}>{count} / {maxLength}</span> : null}
    </span>
    <Field className="editor-input" value={value} onChange={(event) => onChange(event.target.value)} />
    {hint ? <small className="mt-1 block text-xs text-softWhite/38">{hint}</small> : null}
  </label>;
}
function Fact({ label, value }: { label: string; value: string }) { return <div className="grid gap-1 sm:grid-cols-[180px_1fr]"><span className="font-mono text-[10px] uppercase text-softWhite/36">{label}</span><span>{value}</span></div>; }
function splitList(value: string) { return value.split(",").map((item) => item.trim()).filter(Boolean); }
