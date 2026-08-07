import { getPublishedProjectDocuments } from "./publishedPortfolio";

export const PROJECT_DOCUMENTS_STORAGE_KEY = "dilida-portfolio:project-documents:v1";
export const PROJECT_DOCUMENTS_CHANGED_EVENT = "dilida-portfolio:project-documents-changed";

export type ProjectTemplateId = "visual-showcase" | "project-story" | "design-case-study" | (string & {});
export type ProjectBlockType = "text" | "media" | "structured" | "diagram" | (string & {});
export type ProjectBlockVariant = "quiet" | "standard" | "emphasis" | "editorial" | "technical";

export type LocalizedText = {
  zh: string;
  en: string;
  useZhAsEnglishFallback?: boolean;
};

export type ProjectMediaItem = {
  id: string;
  assetId?: string;
  publicPath?: string;
  alt: LocalizedText;
  caption: LocalizedText;
  cropMode: "contain" | "cover";
  focalPosition: string;
  aspectRatio: "16:9" | "4:3" | "1:1" | "9:16" | "auto";
};

export type ProjectDiagramNode = {
  id: string;
  parentId?: string;
  title: LocalizedText;
  description: LocalizedText;
  nodeType: "root" | "branch" | "step" | "note";
  emphasis: boolean;
  order: number;
};

export type ProjectFigmaPrototype = {
  sourceUrl: string;
  embedUrl: string;
  posterAssetId?: string;
  posterPublicPath?: string;
  aspectRatio?: "16:9" | "4:3" | "1:1" | "9:16" | "auto";
  interactionHint?: LocalizedText;
};

// A single column in a `comparison-table` block — e.g. one side of a
// before/after or left/right comparison. Distinct from `media` items:
// every column keeps its own title AND description AND (optionally) its
// own image, rendered as three separate visible fields, never merged into
// one caption string.
export type ProjectComparisonColumn = {
  id: string;
  title: LocalizedText;
  description: LocalizedText;
  media?: ProjectMediaItem;
};

// A real multi-column table — used for decision matrices, criteria /
// idea-filter matrices, and any other "N columns × M rows" source content.
// Every cell is independently bilingual.
export type ProjectMatrixRow = { id: string; cells: LocalizedText[] };

// A chronological timeline item — distinct from `ProjectDiagramNode` (which
// models a process/flow step, not a dated event).
export type ProjectTimelineItem = {
  id: string;
  date: LocalizedText;
  label: LocalizedText;
  description: LocalizedText;
  emphasis: boolean;
  order: number;
};

// An image with two INDEPENDENT visible text fields (a short title and a
// separate description) — distinct from `ProjectMediaItem.caption`, which is
// a single field. Used wherever the source has a bold per-image subtitle AND
// a separate description paragraph, so neither has to be merged into one
// caption string.
export type ProjectAnnotatedImageItem = {
  id: string;
  title: LocalizedText;
  description: LocalizedText;
  media?: ProjectMediaItem;
};

// One labeled list within a `boundary-list` block (e.g. "Keep" / "Change",
// but the label itself is editable, not fixed).
export type ProjectBoundaryList = {
  id: string;
  label: LocalizedText;
  items: LocalizedText[];
};

export type ProjectCardSubItem = { id: string; title: LocalizedText; description: LocalizedText };
// A repeating group of cards, each with its own optional sub-items — e.g.
// one card per competitor, each listing its own observation branches.
export type ProjectGroupedCard = {
  id: string;
  title: LocalizedText;
  meta: LocalizedText;
  subItems: ProjectCardSubItem[];
};

// One labeled slot in an `image-slot-grid` block — a fixed-purpose image
// placeholder with its own label, independent of any other content.
export type ProjectImageSlotItem = { id: string; label: LocalizedText; media?: ProjectMediaItem };

// One node in a `thinking-map` block — a labelled step/point in a reasoning
// or system map, distinct from `ProjectDiagramNode` (a process/flow step)
// and from `ProjectTimelineItem` (a dated event).
export type ProjectThinkingMapNode = {
  id: string;
  label: LocalizedText;
  body: LocalizedText;
  emphasis: boolean;
  order: number;
};

export type ProjectTab = { id: string; label: LocalizedText; body: LocalizedText };

export type ProjectBlockContent = {
  eyebrow?: LocalizedText;
  title?: LocalizedText;
  body?: LocalizedText;
  secondaryBody?: LocalizedText;
  quoteAttribution?: LocalizedText;
  // `date` is optional and only meaningful for timeline/milestone layouts; every
  // other structured layout (cards, metrics, comparisons, etc.) simply leaves it unset.
  items?: Array<{ id: string; title: LocalizedText; description: LocalizedText; value?: string; date?: LocalizedText }>;
  media?: ProjectMediaItem[];
  nodes?: ProjectDiagramNode[];
  footnote?: LocalizedText;
  figmaPrototype?: ProjectFigmaPrototype;
  comparisonColumns?: ProjectComparisonColumn[];
  matrixColumns?: LocalizedText[];
  matrixRows?: ProjectMatrixRow[];
  timelineItems?: ProjectTimelineItem[];
  annotatedImages?: ProjectAnnotatedImageItem[];
  boundaryLists?: ProjectBoundaryList[];
  groupedCards?: ProjectGroupedCard[];
  imageSlotItems?: ProjectImageSlotItem[];
  thinkingMapNodes?: ProjectThinkingMapNode[];
  tabs?: ProjectTab[];
};

export type ProjectDocumentBlock = {
  id: string;
  type: ProjectBlockType;
  layout: string;
  variant: ProjectBlockVariant;
  // Defaults to "visible" when absent, for compatibility with documents
  // saved before this field existed. Hidden blocks are excluded from the
  // public renderer but remain fully editable (dimmed) in owner mode —
  // this is how migrated content that was hidden in a legacy bespoke page
  // stays hidden after migration, instead of becoming visible for the
  // first time as a side effect of being migrated.
  visibility?: "visible" | "hidden";
  content: ProjectBlockContent;
  settings: Record<string, string | number | boolean>;
};

export type ProjectDocumentSection = {
  id: string;
  type: "chapter" | "interlude" | "conclusion" | "unplaced";
  title: LocalizedText;
  visibility: "visible" | "hidden";
  blocks: ProjectDocumentBlock[];
};

export type ProjectDocument = {
  schemaVersion: 1;
  projectId: string;
  templateId: ProjectTemplateId;
  templateVersionUsed: number;
  localeStrategy: "independent";
  // Defaults to "complete" when absent, for compatibility with documents
  // saved before this field existed (hand-authored via the template
  // picker, where the owner writes both languages as they go). A migrated
  // document must set this explicitly based on what English content the
  // source project actually had.
  translationStatus?: "complete" | "partial" | "unavailable";
  sections: ProjectDocumentSection[];
  updatedAt: string;
};

export type ProjectDocumentStore = {
  version: 1;
  documents: Record<string, ProjectDocument>;
};

export function createStableId(prefix: string) {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

export function localized(zh = "", en = ""): LocalizedText {
  return { zh, en };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readLocalStore(): ProjectDocumentStore {
  if (typeof window === "undefined" || !import.meta.env.DEV) return { version: 1, documents: {} };
  try {
    const value = JSON.parse(window.localStorage.getItem(PROJECT_DOCUMENTS_STORAGE_KEY) ?? "null") as unknown;
    if (!isRecord(value) || value.version !== 1 || !isRecord(value.documents)) return { version: 1, documents: {} };
    const documents = Object.fromEntries(
      Object.entries(value.documents).flatMap(([projectId, document]) => {
        const parsed = validateProjectDocument(document);
        return parsed && parsed.projectId === projectId ? [[projectId, parsed]] : [];
      }),
    );
    return { version: 1, documents };
  } catch {
    return { version: 1, documents: {} };
  }
}

export function validateProjectDocument(value: unknown): ProjectDocument | null {
  if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.projectId !== "string" || !value.projectId) return null;
  if (typeof value.templateId !== "string" || typeof value.templateVersionUsed !== "number" || !Array.isArray(value.sections)) return null;
  const seenSectionIds = new Set<string>();
  const seenBlockIds = new Set<string>();
  for (const section of value.sections) {
    if (!isRecord(section) || typeof section.id !== "string" || seenSectionIds.has(section.id) || !Array.isArray(section.blocks)) return null;
    seenSectionIds.add(section.id);
    for (const block of section.blocks) {
      if (!isRecord(block) || typeof block.id !== "string" || seenBlockIds.has(block.id) || typeof block.type !== "string" || typeof block.layout !== "string") return null;
      seenBlockIds.add(block.id);
    }
  }
  return structuredClone(value) as ProjectDocument;
}

export function readProjectDocuments(): Record<string, ProjectDocument> {
  const published = getPublishedProjectDocuments();
  if (!import.meta.env.DEV) return published;
  return { ...published, ...readLocalStore().documents };
}

export function getProjectDocument(projectId: string) {
  return readProjectDocuments()[projectId];
}

export function saveProjectDocument(document: ProjectDocument) {
  if (typeof window === "undefined" || !import.meta.env.DEV) return;
  const validated = validateProjectDocument(document);
  if (!validated) throw new Error("The project document is invalid and was not saved.");
  const store = readLocalStore();
  const next: ProjectDocumentStore = {
    version: 1,
    documents: { ...store.documents, [validated.projectId]: { ...validated, updatedAt: new Date().toISOString() } },
  };
  window.localStorage.setItem(PROJECT_DOCUMENTS_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(PROJECT_DOCUMENTS_CHANGED_EVENT, { detail: { projectId: validated.projectId } }));
}

export function restoreProjectDocumentStore(store: ProjectDocumentStore) {
  if (typeof window === "undefined" || !import.meta.env.DEV) return;
  window.localStorage.setItem(PROJECT_DOCUMENTS_STORAGE_KEY, JSON.stringify(store));
  window.dispatchEvent(new CustomEvent(PROJECT_DOCUMENTS_CHANGED_EVENT));
}

export function deleteProjectDocument(projectId: string) {
  if (typeof window === "undefined" || !import.meta.env.DEV) return;
  const store = readLocalStore();
  if (!(projectId in store.documents)) return;
  const { [projectId]: _removed, ...documents } = store.documents;
  window.localStorage.setItem(PROJECT_DOCUMENTS_STORAGE_KEY, JSON.stringify({ version: 1, documents }));
  window.dispatchEvent(new CustomEvent(PROJECT_DOCUMENTS_CHANGED_EVENT, { detail: { projectId } }));
}

export function getLocalProjectDocumentStoreSnapshot(): ProjectDocumentStore {
  return structuredClone(readLocalStore());
}

export function getProjectDocumentsExportStore(): ProjectDocumentStore {
  return { version: 1, documents: readProjectDocuments() };
}
