// Bridges the gap between the owner's real browser (where a dynamic
// project's actual content lives — localStorage for its draft/catalog
// entry, IndexedDB for any not-yet-disk-committed images) and the
// collection export pipeline's server-side headless Chromium, which has its
// own separate browser profile and can see none of that.
//
// Producer side (runs in the owner's real browser, called from
// portfolioCollectionExport.ts before capture starts): reads whatever a
// dynamic project needs from localStorage/IndexedDB and stages it to a
// temporary job directory on disk via the collection plugin's endpoints.
// Never writes anything back into localStorage/IndexedDB — this is a
// one-directional export, not a sync.
//
// Consumer side (runs in ANY page that loads with ?collectionJob=<id>,
// including the Playwright-driven capture): fetches that job's staged data
// once and caches it in memory (never in localStorage/IndexedDB either), so
// projectMetadata.ts, DynamicProjectPage.tsx, and ProjectDocumentPage.tsx
// (via ProjectPage.tsx) can prefer it over the browser's own (empty, in
// Playwright) storage.

import { mergeTemplateInstances, type TemplateInstance } from "./projectTemplateInstances";
import { getProjectBodyAsset } from "./projectBodyAssetDb";
import { getLocalProjectDocumentStoreSnapshot, type ProjectDocument } from "./projectDocuments";
import { getPublishedProjectDraft } from "./publishedPortfolio";
import { backfillMatchingTemplateImagePublicPaths } from "./templateImageReferences";

const createJobEndpoint = "/__local-export/collection/create-job";
const jobProjectEndpoint = (jobId: string, projectId: string) =>
  `/__local-export/collection/job/${encodeURIComponent(jobId)}/project/${encodeURIComponent(projectId)}`;

export type StagedPublicMetaEntry = Record<string, unknown> & { isDynamic?: boolean; slug?: string; route?: string; titleZh?: string; summaryZh?: string };
export type StagedDynamicDraft = { version: 1; templateInstances: TemplateInstance[]; updatedAt: string };
export type StagedImage = { imageId: string; dataUrl: string };

export type StagedProjectPayload = {
  projectId: string;
  publicMetaEntry: StagedPublicMetaEntry | null;
  dynamicDraft: StagedDynamicDraft | null;
  document: ProjectDocument | null;
  images: StagedImage[];
};

export type CreateJobResult = { jobId: string; projects: string[] };

// --- Producer: read from this browser's own storage, never write to it ---

function publicMetaStorageKey() {
  return "dilida-portfolio:project-public-meta:v1";
}

function dynamicDraftStorageKey(projectId: string) {
  return `dilida-portfolio:dynamic-project:${projectId}:draft:v1`;
}

function readLocalPublicMetaEntry(projectId: string): StagedPublicMetaEntry | null {
  try {
    const raw = window.localStorage.getItem(publicMetaStorageKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const projectsValue = (parsed as Record<string, unknown>).projects;
    if (!projectsValue || typeof projectsValue !== "object" || Array.isArray(projectsValue)) return null;
    const entry = (projectsValue as Record<string, unknown>)[projectId];
    return entry && typeof entry === "object" && !Array.isArray(entry) ? (entry as StagedPublicMetaEntry) : null;
  } catch {
    return null;
  }
}

function readLocalDynamicDraft(projectId: string): StagedDynamicDraft | null {
  try {
    const raw = window.localStorage.getItem(dynamicDraftStorageKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || (parsed as Record<string, unknown>).version !== 1) return null;
    const instances = (parsed as Record<string, unknown>).templateInstances;
    const published = getPublishedProjectDraft(projectId);
    const publishedInstances = published && typeof published === "object" && !Array.isArray(published)
      ? mergeTemplateInstances((published as Record<string, unknown>).templateInstances)
      : [];
    const normalizedInstances = backfillMatchingTemplateImagePublicPaths(
      Array.isArray(instances) ? (instances as TemplateInstance[]) : [],
      publishedInstances,
    );
    return {
      version: 1,
      templateInstances: normalizedInstances,
      updatedAt: typeof (parsed as Record<string, unknown>).updatedAt === "string" ? (parsed as Record<string, unknown>).updatedAt as string : new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

// The newer content system: a project's real body can live here instead of
// (or alongside a stale) TemplateInstance draft — see projectDocuments.ts.
// getLocalProjectDocumentStoreSnapshot() already handles the DEV/window
// gating that readLocalDynamicDraft above does by hand, so this just picks
// the one project id out of that snapshot.
function readLocalProjectDocument(projectId: string): ProjectDocument | null {
  try {
    return getLocalProjectDocumentStoreSnapshot().documents[projectId] ?? null;
  } catch {
    return null;
  }
}

function isUsablePublicPath(value: unknown): value is string {
  return typeof value === "string" && (value.startsWith("/") || value.startsWith("http://") || value.startsWith("https://"));
}

// Both imageId (direction-compare's own field) and localImageId
// (image-row's and figma-prototype's field for a not-yet-disk-committed
// draft image — confirmed via TemplateInstancesSection.tsx's own image
// resolution effect, which looks up item.image?.localImageId /
// fallbackImage?.localImageId specifically for those two templates) key
// into the same projectBodyAssetDb store by the same id shape. Staging
// must recognize both: only checking imageId here was silently skipping
// every not-yet-committed image-row/figma-prototype image, which is why
// they disappeared from the capture instead of being staged.
function assetReferenceId(record: Record<string, unknown>): string | null {
  if (typeof record.imageId === "string" && record.imageId) return record.imageId;
  if (typeof record.localImageId === "string" && record.localImageId) return record.localImageId;
  return null;
}

// Walks a template instance's arbitrary content tree looking for any
// {imageId | localImageId, publicPath?} shape — the pattern every image
// reference in this draft format uses (image-row items, figma-prototype's
// fallbackImage, direction-compare's leftImage/rightImage, and anything
// added later that follows the same convention) — rather than hardcoding
// per-template-id field paths.
function collectImageRefs(value: unknown, found: Map<string, { publicPath?: string }>) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectImageRefs(item, found));
    return;
  }
  const record = value as Record<string, unknown>;
  const assetId = assetReferenceId(record);
  if (assetId) {
    found.set(assetId, { publicPath: isUsablePublicPath(record.publicPath) ? record.publicPath : undefined });
  }
  for (const key of Object.keys(record)) collectImageRefs(record[key], found);
}

function rewriteImageRefs(value: unknown, urlByImageId: Map<string, string>): unknown {
  if (Array.isArray(value)) return value.map((item) => rewriteImageRefs(item, urlByImageId));
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const key of Object.keys(record)) next[key] = rewriteImageRefs(record[key], urlByImageId);
  const assetId = assetReferenceId(record);
  if (assetId && urlByImageId.has(assetId)) {
    next.publicPath = urlByImageId.get(assetId);
  }
  return next;
}

// ProjectDocument content uses a different image-reference shape than
// TemplateInstance drafts: `assetId`/`publicPath` (ProjectMediaItem) and,
// separately, `posterAssetId`/`posterPublicPath` (ProjectFigmaPrototype's
// poster frame) — see ProjectDocumentPage.tsx's own applyDiskAssetPath,
// which this mirrors. Both key into the same projectBodyAssetDb store as
// the TemplateInstance draft's imageId/localImageId.
const documentAssetFields = [
  { idField: "assetId", pathField: "publicPath" },
  { idField: "posterAssetId", pathField: "posterPublicPath" },
] as const;

function collectDocumentImageRefs(value: unknown, found: Map<string, { publicPath?: string }>) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectDocumentImageRefs(item, found));
    return;
  }
  const record = value as Record<string, unknown>;
  for (const { idField, pathField } of documentAssetFields) {
    const assetId = record[idField];
    if (typeof assetId === "string" && assetId) {
      found.set(assetId, { publicPath: isUsablePublicPath(record[pathField]) ? (record[pathField] as string) : undefined });
    }
  }
  for (const key of Object.keys(record)) collectDocumentImageRefs(record[key], found);
}

function rewriteDocumentImageRefs(value: unknown, urlByAssetId: Map<string, string>): unknown {
  if (Array.isArray(value)) return value.map((item) => rewriteDocumentImageRefs(item, urlByAssetId));
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const key of Object.keys(record)) next[key] = rewriteDocumentImageRefs(record[key], urlByAssetId);
  for (const { idField, pathField } of documentAssetFields) {
    const assetId = record[idField];
    if (typeof assetId === "string" && urlByAssetId.has(assetId)) next[pathField] = urlByAssetId.get(assetId);
  }
  return next;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)), { once: true });
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Unable to read a local project image.")), { once: true });
    reader.readAsDataURL(blob);
  });
}

// Builds the staging payload for one project if — and only if — it's a
// dynamic project whose real content can only be read from this browser
// (isDynamic and has a draft key or a ProjectDocument). Static/legacy/
// migrated projects return null: they render fine from disk/production data
// already, no staging needed, and the collection pipeline skips them for
// this project.
//
// A dynamic project's real body can be EITHER the older TemplateInstance
// draft (dynamicDraft) OR the newer ProjectDocument content system — never
// assume one implies the absence of the other; both are staged whenever
// present so captureProjectPage's validation (which only requires at least
// one of them for an isDynamic project) and the capture browser's render
// path both see whichever one the owner's browser actually has. The
// ProjectDocument read is gated on isDynamic specifically (unlike
// dynamicDraft, which is staged whenever it exists even if isDynamic wasn't
// set) — a static/migrated project's local ProjectDocument cache can be
// stale relative to what's already been committed to disk, and disk is
// always what both browsers already agree on for those.
export async function buildDynamicProjectStagingPayload(projectId: string, jobId: string): Promise<StagedProjectPayload | null> {
  const publicMetaEntry = readLocalPublicMetaEntry(projectId);
  const dynamicDraft = readLocalDynamicDraft(projectId);
  const projectDocument = publicMetaEntry?.isDynamic ? readLocalProjectDocument(projectId) : null;
  if (!publicMetaEntry?.isDynamic && !dynamicDraft) return null;

  const refs = new Map<string, { publicPath?: string }>();
  if (dynamicDraft) collectImageRefs(dynamicDraft.templateInstances, refs);
  if (projectDocument) collectDocumentImageRefs(projectDocument.sections, refs);

  const images: StagedImage[] = [];
  const urlByImageId = new Map<string, string>();
  for (const [imageId, ref] of refs) {
    if (ref.publicPath) continue; // already disk-committed, already reachable
    const record = await getProjectBodyAsset(imageId).catch(() => undefined);
    if (!record?.blob) continue; // genuinely missing — left unstaged, reported as a missing-image diagnostic
    const dataUrl = await blobToDataUrl(record.blob);
    images.push({ imageId, dataUrl });
    urlByImageId.set(imageId, `/__local-export/collection/job/${jobId}/assets/${imageId}`);
  }

  const rewrittenDraft = dynamicDraft && urlByImageId.size
    ? { ...dynamicDraft, templateInstances: rewriteImageRefs(dynamicDraft.templateInstances, urlByImageId) as TemplateInstance[] }
    : dynamicDraft;

  const rewrittenDocument = projectDocument && urlByImageId.size
    ? { ...projectDocument, sections: rewriteDocumentImageRefs(projectDocument.sections, urlByImageId) as ProjectDocument["sections"] }
    : projectDocument;

  return { projectId, publicMetaEntry, dynamicDraft: rewrittenDraft, document: rewrittenDocument, images };
}

export async function createCollectionJob(jobId: string, projects: StagedProjectPayload[]): Promise<CreateJobResult> {
  const response = await fetch(createJobEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId, projects }),
  });
  const payload = await response.json().catch(() => ({})) as CreateJobResult & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Unable to stage the collection export job.");
  return payload;
}

export async function deleteCollectionJob(jobId: string): Promise<void> {
  await fetch(`/__local-export/collection/job/${encodeURIComponent(jobId)}`, { method: "DELETE" }).catch(() => undefined);
}

export async function reportCollectionExportError(payload: Record<string, unknown>): Promise<void> {
  await fetch("/__local-export/collection/report-error", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => undefined);
}

// --- Consumer: in-memory only, read by any page loaded with ?collectionJob= ---

const stagedProjects = new Map<string, { metadata: StagedPublicMetaEntry | null; draft: StagedDynamicDraft | null; document: ProjectDocument | null }>();
let loadedJobId: string | null = null;
let loadPromise: Promise<void> | null = null;

export function getCollectionJobId(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("collectionJob");
}

export function isCollectionStagingMode(): boolean {
  return getCollectionJobId() !== null;
}

// True for every project page the collection export pipeline visits
// (?collectionExport=1), static or dynamic — unlike isCollectionStagingMode()
// above, which only covers the dynamic-draft-staging subset that also
// carries &collectionJob=. Used to hide owner-only editing chrome and
// archive navigation from the captured screenshot; never changes what a
// real visitor or the owner sees, and never touches public project content.
export function isCollectionExportCapture(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("collectionExport");
}

// Fetches this job's staged data for the CURRENT project only (the one
// route.tsx is about to render) — one small request instead of the whole
// job, since a job can cover many projects but a page only ever needs its
// own. Idempotent per (jobId, projectId): safe to call from multiple effects.
export async function ensureStagedProjectLoaded(projectId: string): Promise<void> {
  const jobId = getCollectionJobId();
  if (!jobId) return;
  if (loadedJobId !== jobId) {
    stagedProjects.clear();
    loadedJobId = jobId;
  }
  if (stagedProjects.has(projectId)) return;
  const key = `${jobId}:${projectId}`;
  if (!loadPromise || (loadPromise as unknown as { key?: string }).key !== key) {
    loadPromise = fetch(jobProjectEndpoint(jobId, projectId), { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { metadata?: StagedPublicMetaEntry | null; draft?: StagedDynamicDraft | null; document?: ProjectDocument | null } | null) => {
        stagedProjects.set(projectId, { metadata: payload?.metadata ?? null, draft: payload?.draft ?? null, document: payload?.document ?? null });
      })
      .catch(() => {
        stagedProjects.set(projectId, { metadata: null, draft: null, document: null });
      });
    (loadPromise as unknown as { key?: string }).key = key;
  }
  await loadPromise;
}

export function getStagedPublicMetaEntry(projectId: string): StagedPublicMetaEntry | null {
  return stagedProjects.get(projectId)?.metadata ?? null;
}

export function getStagedDynamicDraft(projectId: string): StagedDynamicDraft | null {
  return stagedProjects.get(projectId)?.draft ?? null;
}

export function getStagedProjectDocument(projectId: string): ProjectDocument | null {
  return stagedProjects.get(projectId)?.document ?? null;
}

export function hasStagedDataFor(projectId: string): boolean {
  return stagedProjects.has(projectId);
}

export function getAllStagedProjectIds(): string[] {
  return [...stagedProjects.keys()];
}
