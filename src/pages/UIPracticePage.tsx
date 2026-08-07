import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { AlertCircle, Check, Edit3, GripVertical, Plus, Save, Trash2 } from "lucide-react";
import { PageTransition } from "../components/PageTransition";
import { ProjectHeroTitleSummary } from "../components/ProjectHeroTitleSummary";
import { projectHeroTextWidth } from "../lib/caseStudyLayout";
import metadata from "../data/uiPracticeMetadata.json";
import {
  abortDynamicProjectImageStage,
  commitDynamicProjectImage,
  decodeDynamicProjectImage,
  getDynamicProjectImageMapping,
  stageDynamicProjectImage,
  unbindDynamicProjectImages,
} from "../lib/portfolioContentClient";
import { stemOf, UI_PRACTICE_DIMENSIONS } from "../lib/uiPracticeDimensions";

type UIPracticeMetadata = {
  id?: string;
  order?: number;
  title?: string;
  description?: string;
};

type UIPracticeItem = {
  id: string;
  filename: string;
  src: string;
  title: string;
  description: string;
  order?: number;
  width?: number;
  height?: number;
  image?: {
    imageId: string;
    publicPath: string;
  };
  imageDisplayMode?: "cover" | "natural";
  imageWidthMode?: "card" | "wide" | "full";
  startNewRow?: boolean;
};

type SaveState = "idle" | "saving" | "saved" | "error";
type PracticeMode = "normal" | "edit" | "sort";
type UIPracticeCollection = {
  version: 1;
  items: Array<{
    id: string;
    filename: string;
    title: string;
    description: string;
    order: number;
    image?: {
      imageId: string;
      publicPath: string;
    };
    imageDisplayMode?: "cover" | "natural";
    imageWidthMode?: "card" | "wide" | "full";
    startNewRow?: boolean;
  }>;
};

const canEdit = import.meta.env.DEV;
const UI_PRACTICE_PROJECT_ID = "ui-personal-practice";
const UI_PRACTICE_GALLERY_INSTANCE_ID = "ui-practice-gallery";
const UI_PRACTICE_GALLERY_REGION_ID = "ui-practice:gallery";
const persistedMetadata = metadata as unknown;
// Points at the optimized WebP display assets (src/assets/ui-practice-optimized/),
// not the raw originals in src/assets/ui-practice/ — those stay in the repo
// untouched but are no longer imported, so they aren't part of the production build.
const imageModules = import.meta.glob("../assets/ui-practice-optimized/*.{png,jpg,jpeg,webp,avif}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

function filenameFromPath(path: string) {
  return path.split("/").pop() ?? path;
}

function readableName(filename: string) {
  return filename.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
}

function stableItemId(filename: string) {
  let hash = 2166136261;
  for (const character of filename) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return `ui-practice-${(hash >>> 0).toString(36)}`;
}

function isPersistedCollection(value: unknown): value is UIPracticeCollection {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as { version?: unknown; items?: unknown };
  return candidate.version === 1 && Array.isArray(candidate.items);
}

function buildInitialItems(): UIPracticeItem[] {
  // Matched by filename stem (no extension) so metadata entries like
  // "Y3K尝试1.png" still resolve to the optimized "Y3K尝试1.webp" asset.
  const modulesByStem = new Map(
    Object.entries(imageModules).map(([path, src]) => [stemOf(filenameFromPath(path)), src]),
  );

  if (isPersistedCollection(persistedMetadata)) {
    return persistedMetadata.items
      .reduce<UIPracticeItem[]>((items, savedItem, index) => {
        const persisted = savedItem as UIPracticeCollection["items"][number];
        const stem = stemOf(persisted.filename);
        const src = persisted.image?.publicPath ?? modulesByStem.get(stem);
        if (!src) return items;
        const dimensions = UI_PRACTICE_DIMENSIONS[stem];
        items.push({
          id: persisted.id,
          filename: persisted.filename,
          src,
          title: persisted.title,
          description: persisted.description,
          order: Number.isFinite(persisted.order) ? persisted.order : index + 1,
          width: dimensions?.width,
          height: dimensions?.height,
          ...(persisted.image ? { image: persisted.image } : {}),
          ...(persisted.imageDisplayMode ? { imageDisplayMode: persisted.imageDisplayMode } : {}),
          ...(persisted.imageWidthMode ? { imageWidthMode: persisted.imageWidthMode } : {}),
          ...(persisted.startNewRow === true ? { startNewRow: true } : {}),
        });
        return items;
      }, [])
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  const metadataByFilename = persistedMetadata as Record<string, UIPracticeMetadata>;
  const items = Object.entries(imageModules).map(([path, src]) => {
    const filename = filenameFromPath(path);
    const stem = stemOf(filename);
    const itemMetadata = metadataByFilename[filename] ?? {};
    const dimensions = UI_PRACTICE_DIMENSIONS[stem];

    return {
      id: itemMetadata.id ?? stableItemId(filename),
      filename,
      src,
      title: itemMetadata.title ?? "",
      description: itemMetadata.description ?? "",
      order: itemMetadata.order,
      width: dimensions?.width,
      height: dimensions?.height,
    };
  });

  const ordered = items
    .filter((item) => Number.isFinite(item.order))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.filename.localeCompare(b.filename));
  const discovered = items
    .filter((item) => !Number.isFinite(item.order))
    .sort((a, b) => a.filename.localeCompare(b.filename));

  return [...ordered, ...discovered];
}

function createCollection(
  items: UIPracticeItem[],
  { trimText }: { trimText: boolean },
): UIPracticeCollection {
  return {
    version: 1,
    items: items.map((item, index) => ({
      id: item.id,
      filename: item.filename,
      order: index + 1,
      title: trimText ? item.title.trim() : item.title,
      description: trimText ? item.description.trim() : item.description,
      ...(item.image ? { image: item.image } : {}),
      ...(item.imageDisplayMode ? { imageDisplayMode: item.imageDisplayMode } : {}),
      ...(item.imageWidthMode ? { imageWidthMode: item.imageWidthMode } : {}),
      ...(item.startNewRow === true ? { startNewRow: true } : {}),
    })),
  };
}

function createDiskGalleryItems(items: UIPracticeItem[]) {
  return items.flatMap((item) => item.image ? [{
    id: item.id,
    image: item.image,
    imageDisplayMode: item.imageDisplayMode ?? "cover",
    alt: { zh: item.title, en: "" },
    caption: { zh: item.description, en: "" },
    ...(item.imageWidthMode ? { imageWidthMode: item.imageWidthMode } : {}),
    ...(item.startNewRow === true ? { startNewRow: true } : {}),
  }] : []);
}

async function writeCollection(collection: UIPracticeCollection) {
  const response = await fetch("/__ui-practice-metadata", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ collection }),
  });
  if (!response.ok) {
    const result = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(result?.error ?? "Unable to write metadata.");
  }
}

export function UIPracticePage() {
  const [items, setItems] = useState<UIPracticeItem[]>(() => buildInitialItems());
  const [mode, setMode] = useState<PracticeMode>("normal");
  const [sortItems, setSortItems] = useState<UIPracticeItem[]>([]);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState("");
  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "saved" | "error">("idle");
  const [uploadError, setUploadError] = useState("");
  const addImageInputRef = useRef<HTMLInputElement>(null);
  const hasImages = items.length > 0;
  const isEditing = mode === "edit";
  const isSorting = mode === "sort";
  const imageCountLabel = useMemo(() => `${items.length} visual ${items.length === 1 ? "piece" : "pieces"}`, [items.length]);

  const updateItem = (itemId: string, updates: Partial<Pick<UIPracticeItem, "title" | "description">>) => {
    setItems((currentItems) =>
      currentItems.map((item) => (item.id === itemId ? { ...item, ...updates } : item)),
    );
  };

  const moveSortItem = (targetItemId: string) => {
    if (!draggedItemId || draggedItemId === targetItemId) return;

    setSortItems((currentItems) => {
      const fromIndex = currentItems.findIndex((item) => item.id === draggedItemId);
      const toIndex = currentItems.findIndex((item) => item.id === targetItemId);

      if (fromIndex === -1 || toIndex === -1) return currentItems;

      const nextItems = [...currentItems];
      const [movedItem] = nextItems.splice(fromIndex, 1);
      nextItems.splice(toIndex, 0, movedItem);

      return nextItems;
    });
  };

  const enterEditMode = () => {
    setSaveState("idle");
    setSaveError("");
    setMode("edit");
  };

  const enterSortMode = () => {
    setSaveState("idle");
    setSaveError("");
    setSortItems(items);
    setPendingDeleteIds([]);
    setConfirmDeleteId(null);
    setMode("sort");
  };

  const cancelSortMode = () => {
    setDraggedItemId(null);
    setSortItems([]);
    setPendingDeleteIds([]);
    setConfirmDeleteId(null);
    setSaveState("idle");
    setSaveError("");
    setMode("normal");
  };

  const markForDeletion = (itemId: string) => {
    setPendingDeleteIds((currentIds) =>
      currentIds.includes(itemId) ? currentIds : [...currentIds, itemId],
    );
    setSortItems((currentItems) => currentItems.filter((item) => item.id !== itemId));
    setConfirmDeleteId(null);

    if (draggedItemId === itemId) {
      setDraggedItemId(null);
    }
  };

  const addImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !canEdit) return;

    const itemId = `ui-practice-item-${crypto.randomUUID()}`;
    let staged: Awaited<ReturnType<typeof stageDynamicProjectImage>> | null = null;
    let committedImageId: string | null = null;
    let previousDiskInstance: Record<string, unknown> | null = null;
    let uploadStage: "staging" | "decoding" | "committing" = "staging";
    const fileDescription = `${file.name}（${file.type.replace("image/", "").toUpperCase()}, ${(file.size / 1024).toFixed(0)}KB）`;
    try {
      setUploadState("uploading");
      setUploadError("");
      const mappingBefore = await getDynamicProjectImageMapping(UI_PRACTICE_PROJECT_ID);
      previousDiskInstance = mappingBefore.instances[UI_PRACTICE_GALLERY_INSTANCE_ID] ?? null;
      staged = await stageDynamicProjectImage(
        UI_PRACTICE_PROJECT_ID,
        UI_PRACTICE_GALLERY_INSTANCE_ID,
        itemId,
        file,
      );
      uploadStage = "decoding";
      await decodeDynamicProjectImage(staged.publicUrl);
      uploadStage = "committing";

      const extension = staged.format === "jpeg" ? "jpeg" : staged.format;
      const newItem: UIPracticeItem = {
        id: itemId,
        filename: `${staged.imageId}.${extension}`,
        src: staged.publicUrl,
        title: "",
        description: "",
        order: items.length + 1,
        width: staged.width,
        height: staged.height,
        image: { imageId: staged.imageId, publicPath: staged.publicUrl },
        imageDisplayMode: "cover",
      };
      const nextItems = [...items, newItem];
      const instance = {
        instanceId: UI_PRACTICE_GALLERY_INSTANCE_ID,
        templateId: "image-row",
        regionId: UI_PRACTICE_GALLERY_REGION_ID,
        anchorId: "__end__",
        content: { heading: { zh: "", en: "" }, items: createDiskGalleryItems(nextItems) },
        order: 0,
      };
      const committed = await commitDynamicProjectImage({
        projectId: UI_PRACTICE_PROJECT_ID,
        commitToken: staged.commitToken,
        itemId,
        instance,
      });
      committedImageId = committed.image.imageId;
      staged = null;

      await writeCollection(createCollection(nextItems, { trimText: false }));
      setItems(nextItems);
      setSortItems((current) => [...current, newItem]);
      setUploadState("saved");
      window.setTimeout(() => setUploadState("idle"), 2200);
    } catch (error) {
      if (staged) {
        await abortDynamicProjectImageStage(UI_PRACTICE_PROJECT_ID, staged.commitToken).catch(() => undefined);
      }
      if (committedImageId) {
        await unbindDynamicProjectImages({
          projectId: UI_PRACTICE_PROJECT_ID,
          instanceId: UI_PRACTICE_GALLERY_INSTANCE_ID,
          imageIds: [committedImageId],
          instance: previousDiskInstance,
        }).catch(() => undefined);
      }
      setUploadState("error");
      const detail = error instanceof Error ? error.message : String(error);
      const dimensions = staged ? `${staged.width}×${staged.height}` : "未读取到尺寸";
      const stageLabel = { staging: "上传阶段", decoding: "浏览器重新解码阶段", committing: "写入项目目录阶段" }[uploadStage];
      setUploadError(`${fileDescription}（${dimensions}）在${stageLabel}失败：${detail}${staged ? "；已暂存的文件已回滚，原有图片未被修改。" : "；原有图片未被修改。"}`);
    }
  };

  const saveMetadata = async (exitAfterSave = false) => {
    if (!canEdit) return;

    setSaveState("saving");
    setSaveError("");

    try {
      const nextCollection = createCollection(items, { trimText: true });
      await writeCollection(nextCollection);

      setItems((currentItems) =>
        currentItems.map((item, index) => ({
          ...item,
          title: item.title.trim(),
          description: item.description.trim(),
          order: index + 1,
        })),
      );
      setSaveState("saved");

      if (exitAfterSave) {
        setMode("normal");
      }

      window.setTimeout(() => setSaveState("idle"), 2200);
    } catch (error) {
      setSaveState("error");
      setSaveError(error instanceof Error ? error.message : "Unable to write metadata.");
    }
  };

  const saveSortOrder = async () => {
    if (!canEdit) return;

    setSaveState("saving");
    setSaveError("");

    try {
      const nextItems = sortItems.map((item, index) => ({ ...item, order: index + 1 }));
      const nextCollection = createCollection(nextItems, { trimText: false });
      await writeCollection(nextCollection);

      setItems(nextItems);
      setSortItems([]);
      setPendingDeleteIds([]);
      setConfirmDeleteId(null);
      setDraggedItemId(null);
      setMode("normal");
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 2200);
    } catch (error) {
      setSaveState("error");
      setSaveError(error instanceof Error ? error.message : "Unable to write metadata.");
    }
  };

  return (
    <PageTransition>
      <main className="min-h-screen bg-deepIndigo text-softWhite">
        <section className="relative overflow-hidden border-b border-softWhite/10 bg-deepIndigo py-16 md:py-24">
          <div className="absolute inset-0 bg-grain bg-[length:18px_18px] opacity-20" />
          <div className="site-container relative">
            <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="font-mono text-xs font-bold uppercase tracking-[0.24em] text-acidGreen/88">
                  visual archive / {imageCountLabel}
                </p>
                <ProjectHeroTitleSummary>
                  <h1 className={`mt-4 font-display text-[clamp(3rem,8vw,7.5rem)] leading-none text-softWhite ${projectHeroTextWidth.title}`}>
                    UI Personal Practice
                  </h1>
                  <p className={`mt-6 text-base leading-8 text-softWhite/66 md:text-lg ${projectHeroTextWidth.summary}`}>
                    Interface studies, game UI explorations, and small visual systems collected as a running practice shelf.
                  </p>
                </ProjectHeroTitleSummary>
              </div>

              {canEdit ? (
                <div className="flex flex-wrap items-center gap-3">
                  {isEditing ? (
                    <>
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-full border border-acidGreen/55 bg-acidGreen px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.16em] text-deepIndigo transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
                        onClick={() => saveMetadata(false)}
                        disabled={saveState === "saving"}
                      >
                        <Save className="h-4 w-4" aria-hidden="true" />
                        Save
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-full border border-softWhite/16 bg-archiveBlue/48 px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.16em] text-softWhite/78 transition hover:border-acidGreen/50 hover:text-acidGreen disabled:cursor-wait disabled:opacity-60"
                        onClick={() => saveMetadata(true)}
                        disabled={saveState === "saving"}
                      >
                        <Check className="h-4 w-4" aria-hidden="true" />
                        Done
                      </button>
                    </>
                  ) : isSorting ? (
                    <>
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-full border border-softWhite/16 bg-archiveBlue/48 px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.16em] text-softWhite/78 transition hover:border-acidGreen/50 hover:text-acidGreen disabled:cursor-wait disabled:opacity-60"
                        onClick={cancelSortMode}
                        disabled={saveState === "saving"}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-full border border-acidGreen/55 bg-acidGreen px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.16em] text-deepIndigo transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
                        onClick={saveSortOrder}
                        disabled={saveState === "saving"}
                      >
                        <Save className="h-4 w-4" aria-hidden="true" />
                        Save
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-full border border-softWhite/16 bg-archiveBlue/42 px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.16em] text-softWhite/76 transition hover:border-acidGreen/50 hover:text-acidGreen"
                        onClick={enterEditMode}
                      >
                        <Edit3 className="h-4 w-4" aria-hidden="true" />
                        Edit
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-full border border-softWhite/16 bg-archiveBlue/42 px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.16em] text-softWhite/76 transition hover:border-acidGreen/50 hover:text-acidGreen"
                        onClick={enterSortMode}
                      >
                        <GripVertical className="h-4 w-4" aria-hidden="true" />
                        Sort
                      </button>
                    </>
                  )}

                  <SaveMessage saveState={saveState} saveError={saveError} />
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className="bg-deepIndigo py-14 md:py-20">
          <div className="site-container">
            {hasImages ? (
              isSorting ? (
                <div>
                  <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-softWhite/12 bg-archiveBlue/18 p-4">
                    <p className="font-mono text-xs font-bold uppercase tracking-[0.22em] text-acidGreen/88">
                      Sorting {sortItems.length} works
                      {pendingDeleteIds.length > 0 ? (
                        <span className="text-softWhite/42"> / {pendingDeleteIds.length} to remove</span>
                      ) : null}
                    </p>
                    <div className="flex items-center gap-3">
                      <input
                        ref={addImageInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="sr-only"
                        onChange={addImage}
                      />
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-full border border-acidGreen/55 bg-acidGreen px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.16em] text-deepIndigo transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
                        onClick={() => addImageInputRef.current?.click()}
                        disabled={saveState === "saving" || uploadState === "uploading"}
                      >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        {uploadState === "uploading" ? "正在保存" : "添加图片"}
                      </button>
                      <button
                        type="button"
                        className="rounded-full border border-softWhite/16 bg-deepIndigo/35 px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.16em] text-softWhite/72 transition hover:border-acidGreen/50 hover:text-acidGreen disabled:cursor-wait disabled:opacity-60"
                        onClick={cancelSortMode}
                        disabled={saveState === "saving"}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="rounded-full border border-acidGreen/55 bg-acidGreen px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.16em] text-deepIndigo transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
                        onClick={saveSortOrder}
                        disabled={saveState === "saving"}
                      >
                        Save
                      </button>
                    </div>
                  </div>

                  {uploadState === "saved" ? (
                    <p className="mb-4 font-mono text-xs font-bold text-acidGreen">已保存到本地项目目录</p>
                  ) : uploadState === "error" ? (
                    <p className="mb-4 font-mono text-xs font-bold text-peach">{uploadError}</p>
                  ) : null}

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6">
                    {sortItems.map((item, index) => (
                      <article
                        key={item.id}
                        draggable
                        className={`group relative cursor-grab rounded-[10px] border bg-archiveBlue/20 p-2 transition active:cursor-grabbing ${
                          draggedItemId === item.id
                            ? "border-acidGreen/70 opacity-70"
                            : "border-softWhite/12 hover:border-acidGreen/45"
                        }`}
                        onDragStart={(event) => {
                          setDraggedItemId(item.id);
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", item.id);
                        }}
                        onDragOver={(event) => {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                          moveSortItem(item.id);
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          moveSortItem(item.id);
                        }}
                        onDragEnd={() => setDraggedItemId(null)}
                      >
                        <button
                          type="button"
                          className="absolute right-2 top-2 z-20 grid h-7 w-7 place-items-center rounded-full border border-softWhite/14 bg-deepIndigo/80 text-softWhite/46 transition hover:border-peach/60 hover:text-peach"
                          aria-label={`Remove ${item.title || readableName(item.filename)}`}
                          onPointerDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                          }}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setConfirmDeleteId(item.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>

                        {confirmDeleteId === item.id ? (
                          <div
                            className="absolute inset-x-2 top-10 z-30 rounded-[8px] border border-softWhite/14 bg-deepIndigo/95 p-3 shadow-archive"
                            onPointerDown={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                            }}
                            onClick={(event) => event.stopPropagation()}
                          >
                            <p className="text-xs leading-5 text-softWhite/78">Remove this image from UI Personal Practice?</p>
                            <div className="mt-3 flex items-center justify-end gap-2">
                              <button
                                type="button"
                                className="rounded-full border border-softWhite/14 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-softWhite/62 transition hover:border-acidGreen/50 hover:text-acidGreen"
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  setConfirmDeleteId(null);
                                }}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                className="rounded-full border border-peach/50 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-peach transition hover:bg-peach hover:text-deepIndigo"
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  markForDeletion(item.id);
                                }}
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ) : null}

                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-bold text-acidGreen">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <GripVertical className="h-4 w-4 text-softWhite/34 transition group-hover:text-acidGreen/80" aria-hidden="true" />
                        </div>
                        <div className="grid aspect-[4/3] place-items-center overflow-hidden rounded-[7px] border border-softWhite/10 bg-deepIndigo/50">
                          <img
                            src={item.src}
                            alt={item.title || readableName(item.filename)}
                            className="h-full w-full object-contain"
                            loading="lazy"
                            decoding="async"
                          />
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="grid gap-20 md:gap-28">
                {items.map((item) => (
                  <article
                    key={item.id}
                    className={`group relative ${isEditing ? "rounded-[10px] border border-softWhite/12 bg-archiveBlue/18 p-3 md:p-4" : ""}`}
                  >
                    <img
                      src={item.src}
                      alt={item.title || readableName(item.filename)}
                      className="mx-auto block h-auto rounded-[8px] border border-softWhite/10 object-contain"
                      style={{ maxWidth: "min(100%, 980px)" }}
                      width={item.width}
                      height={item.height}
                      loading="lazy"
                      decoding="async"
                    />

                    {isEditing ? (
                      <div className="mt-4 grid gap-3 rounded-[8px] border border-softWhite/10 bg-deepIndigo/50 p-4">
                        <label className="grid gap-2">
                          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-softWhite/44">
                            Optional title
                          </span>
                          <input
                            value={item.title}
                            onChange={(event) => updateItem(item.id, { title: event.target.value })}
                            className="rounded-[8px] border border-softWhite/12 bg-archiveBlue/35 px-3 py-2 text-sm text-softWhite outline-none transition placeholder:text-softWhite/28 focus:border-acidGreen/60"
                            placeholder="Leave empty to show image only"
                          />
                        </label>
                        <label className="grid gap-2">
                          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-softWhite/44">
                            Optional description
                          </span>
                          <textarea
                            value={item.description}
                            onChange={(event) => updateItem(item.id, { description: event.target.value })}
                            className="min-h-24 resize-y rounded-[8px] border border-softWhite/12 bg-archiveBlue/35 px-3 py-2 text-sm leading-6 text-softWhite outline-none transition placeholder:text-softWhite/28 focus:border-acidGreen/60"
                            placeholder="Add a short note, or leave empty"
                          />
                        </label>
                      </div>
                    ) : item.title || item.description ? (
                      <div className="mx-auto mt-5 max-w-3xl text-center">
                        {item.title ? <h2 className="font-display text-2xl leading-tight text-softWhite md:text-3xl">{item.title}</h2> : null}
                        {item.description ? <p className="mt-3 text-sm leading-7 text-softWhite/62 md:text-base">{item.description}</p> : null}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
              )
            ) : (
              <div className="mx-auto max-w-2xl rounded-[10px] border border-softWhite/12 bg-archiveBlue/24 p-8 text-center">
                <p className="font-display text-3xl text-softWhite">No UI practice images yet.</p>
                <p className="mt-3 text-sm leading-6 text-softWhite/60">
                  Drop PNG, JPG, JPEG, WebP, or AVIF files into src/assets/ui-practice and they will appear here automatically.
                </p>
              </div>
            )}
          </div>
        </section>

      </main>
    </PageTransition>
  );
}

function SaveMessage({ saveState, saveError }: { saveState: SaveState; saveError: string }) {
  if (saveState === "idle") return null;

  if (saveState === "error") {
    return (
      <span className="inline-flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-peach">
        <AlertCircle className="h-4 w-4" aria-hidden="true" />
        {saveError || "Save failed"}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-softWhite/58">
      {saveState === "saving" ? "Saving..." : "Saved to source"}
    </span>
  );
}
