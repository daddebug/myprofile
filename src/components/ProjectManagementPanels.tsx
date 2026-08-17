import { useState, type ChangeEvent, type ReactNode } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, FilePlus2, Save, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createDynamicProject, getProjectPublicMetaStoreSnapshot, restoreProjectPublicMetaStore, setProjectPublicMetaOverride, type ProjectCatalogItem, type ProjectVisibility, type ResolvedProjectMetadata } from "../lib/projectMetadata";
import { markProjectDirty } from "../lib/publishIntent";
import { ProjectCoverEditor } from "./ProjectCoverEditor";
import { useLocale } from "../locales/LocaleContext";

type WizardStatus = "draft" | "public" | "coming-soon";
type MetadataDraft = {
  id: string; slug: string; titleZh: string; titleEn: string; summaryZh: string; summaryEn: string;
  year: string; categoryZh: string; categoryEn: string; tagsZh: string; tagsEn: string; role: string; collaborators: string; tools: string;
  status: WizardStatus; visibility: ProjectVisibility; featured: boolean; archiveOrder: number;
};

const emptyMetadata = (archiveOrder: number): MetadataDraft => ({ id: "", slug: "", titleZh: "", titleEn: "", summaryZh: "", summaryEn: "", year: new Date().getFullYear().toString(), categoryZh: "", categoryEn: "", tagsZh: "", tagsEn: "", role: "", collaborators: "", tools: "", status: "draft", visibility: "hidden", featured: false, archiveOrder });

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
  }));
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const save = () => {
    const validation = validateMetadata(metadata, catalog, project.id);
    if (validation) { setError(validation); return; }
    if (metadata.slug !== project.slug && !window.confirm(`Change project slug from "${project.slug}" to "${metadata.slug}"? Existing links may need updating.`)) return;
    setProjectPublicMetaOverride(project.id, {
      slug: metadata.slug,
      route: `/work/${metadata.slug}`,
      titleZh: metadata.titleZh.trim(),
      titleEn: metadata.titleEn.trim(),
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

function MetadataStep({ value, onChange, coverUrl, onCover, idReadOnly = false, showFileInput = true }: { value: MetadataDraft; onChange: (value: MetadataDraft) => void; coverUrl: string; onCover: (file: File | null) => void; idReadOnly?: boolean; showFileInput?: boolean }) {
  const field = (key: keyof MetadataDraft, next: string | number | boolean) => onChange({ ...value, [key]: next });
  return <div className="mt-6 grid gap-4 md:grid-cols-2">
    <label><span className="editor-label">Stable project ID</span><input className="editor-input disabled:cursor-not-allowed disabled:opacity-55" value={value.id} readOnly={idReadOnly} onChange={(event) => field("id", event.target.value)} />{idReadOnly ? <small className="mt-1 block text-xs text-softWhite/38">Permanent identity. It is read-only after creation.</small> : null}</label>
    <label><span className="editor-label">Slug</span><input className="editor-input" value={value.slug} onChange={(event) => field("slug", event.target.value)} />{idReadOnly ? <small className="mt-1 flex items-center gap-1 text-xs text-[#d8bb72]"><AlertTriangle className="h-3.5 w-3.5" />Changing the slug changes the public route and requires confirmation.</small> : null}</label>
    <Input label="Chinese title" value={value.titleZh} onChange={(next) => field("titleZh", next)} /><Input label="English title" value={value.titleEn} onChange={(next) => field("titleEn", next)} />
    <Input label="Chinese short description" value={value.summaryZh} onChange={(next) => field("summaryZh", next)} multiline /><Input label="English short description" value={value.summaryEn} onChange={(next) => field("summaryEn", next)} multiline />
    <Input label="Year / duration" value={value.year} onChange={(next) => field("year", next)} hint="Examples: 2026.07 or 2026.07.03–07.05" /><Input label="Role" value={value.role} onChange={(next) => field("role", next)} />
    <Input label="Chinese category" value={value.categoryZh} onChange={(next) => field("categoryZh", next)} hint="Main classification shown prominently, e.g. Game Jam" /><Input label="English category" value={value.categoryEn} onChange={(next) => field("categoryEn", next)} hint="Main classification shown prominently" />
    <Input label="Chinese tags (comma separated)" value={value.tagsZh} onChange={(next) => field("tagsZh", next)} hint="Smaller supporting labels" /><Input label="English tags (comma separated)" value={value.tagsEn} onChange={(next) => field("tagsEn", next)} hint="Smaller supporting labels" />
    <Input label="Collaborators (comma separated)" value={value.collaborators} onChange={(next) => field("collaborators", next)} /><Input label="Tools (comma separated)" value={value.tools} onChange={(next) => field("tools", next)} />
    <label><span className="editor-label">Publication status</span><select className="editor-input" value={value.status} onChange={(event) => field("status", event.target.value)}><option value="draft">Draft</option><option value="public">Public</option><option value="coming-soon">Coming Soon</option></select><small className="mt-1 block text-xs text-softWhite/38">Draft / Public / Coming Soon describes editorial readiness.</small></label>
    <label><span className="editor-label">Visibility</span><select className="editor-input" value={value.visibility} onChange={(event) => field("visibility", event.target.value)}><option value="public">Visible in public listings</option><option value="hidden">Hidden from public listings</option></select></label>
    <Input label="Archive position" value={String(value.archiveOrder)} onChange={(next) => field("archiveOrder", Number(next) || 0)} />
    <div className="grid content-start gap-3 rounded-[10px] border border-softWhite/10 p-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value.featured} onChange={(event) => field("featured", event.target.checked)} />Featured on homepage</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value.status === "coming-soon"} onChange={(event) => field("status", event.target.checked ? "coming-soon" : "draft")} />Coming soon</label></div>
    {showFileInput ? <label className="rounded-[10px] border border-softWhite/10 p-3"><span className="editor-label">Optional cover</span>{coverUrl ? <img src={coverUrl} alt="Cover preview" className="mb-3 aspect-video w-full rounded-[8px] object-cover" /> : null}<input type="file" accept="image/png,image/jpeg,image/webp,image/avif" onChange={(event: ChangeEvent<HTMLInputElement>) => onCover(event.target.files?.[0] ?? null)} /></label> : null}
  </div>;
}

export function ManagementOverlay({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) { return <div className="fixed inset-0 z-[100] overflow-y-auto bg-[#08081e]/88 p-4 backdrop-blur-sm" role="dialog" aria-modal="true"><div className="mx-auto my-8 max-w-6xl rounded-[18px] border border-electricBlue/30 bg-[#11113a] p-5 shadow-archive md:p-7"><div className="flex items-center justify-between"><h2 className="font-display text-3xl font-semibold">{title}</h2><button type="button" className="editor-icon" onClick={onClose}><X className="h-5 w-5" /></button></div>{children}</div></div>; }
function Input({ label, value, onChange, multiline = false, hint }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean; hint?: string }) { const Field = multiline ? "textarea" : "input"; return <label><span className="editor-label">{label}</span><Field className="editor-input" value={value} onChange={(event) => onChange(event.target.value)} />{hint ? <small className="mt-1 block text-xs text-softWhite/38">{hint}</small> : null}</label>; }
function Fact({ label, value }: { label: string; value: string }) { return <div className="grid gap-1 sm:grid-cols-[180px_1fr]"><span className="font-mono text-[10px] uppercase text-softWhite/36">{label}</span><span>{value}</span></div>; }
function splitList(value: string) { return value.split(",").map((item) => item.trim()).filter(Boolean); }
