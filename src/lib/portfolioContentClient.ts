import { PROJECT_COVER_CHANGED_EVENT } from "./projectCoverDb";

const persistenceTestEndpoint = "/__portfolio-content/persistence-test/image";
const projectCoverStageEndpoint = "/__portfolio-content/project-covers/stage";
const projectCoverCommitEndpoint = "/__portfolio-content/project-covers/commit";
const projectCoverResolveEndpoint = "/__portfolio-content/project-covers/resolve";
const projectBodyStageEndpoint = "/__portfolio-content/project-body/stage";
const projectBodyCommitEndpoint = "/__portfolio-content/project-body/commit";
const projectBodyDocumentEndpoint = "/__portfolio-content/project-body/document";
const projectImageStageEndpoint = "/__portfolio-content/project-images/stage";
const projectImageCommitEndpoint = "/__portfolio-content/project-images/commit";
const projectImageMappingEndpoint = "/__portfolio-content/project-images/mapping";
const projectImageUnbindEndpoint = "/__portfolio-content/project-images/unbind";
const projectImageAbortEndpoint = "/__portfolio-content/project-images/abort";
const dynamicProjectRecoveryEndpoint = "/__portfolio-content/dynamic-projects/recovery";
const playableGameStageEndpoint = "/__portfolio-content/playable-games/stage";
const playableGameCommitEndpoint = "/__portfolio-content/playable-games/commit";
const playableGameListEndpoint = "/__portfolio-content/playable-games/list";
const playableGameBindEndpoint = "/__portfolio-content/playable-games/bind";
const playableGameFolderStartEndpoint = "/__portfolio-content/playable-games/folder/start";
const playableGameFolderFileEndpoint = "/__portfolio-content/playable-games/folder/file";
const playableGameFolderFinishEndpoint = "/__portfolio-content/playable-games/folder/finish";
const playableGameAbortEndpoint = "/__portfolio-content/playable-games/abort";
const playableGameCoverStageEndpoint = "/__portfolio-content/playable-games/cover/stage";
const playableGameCoverCommitEndpoint = "/__portfolio-content/playable-games/cover/commit";
const supportedMimeTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
// Real-world JPEG uploads (observed from WeChat's local file cache on
// Windows) can report one of these alternate/absent MIME strings even
// though the file itself is a normal JPEG — file.type reflects what the OS
// told the browser, not the file's real signature. Blocking the request
// here on that alone would reject a valid image before the server ever
// gets a chance to check its actual bytes, so anything in this broader set
// is allowed through to the server's byte-signature check instead of being
// rejected client-side. This does not weaken validation: the server still
// requires a real PNG/JPEG/WebP signature regardless of what MIME (if any)
// was declared.
const looselyAcceptableImageMimeTypes = new Set(["image/jpeg", "image/jpg", "image/pjpeg", "image/png", "image/webp", "", "application/octet-stream"]);

export type PersistenceTestImageResult = {
  sourceRelativePath: string;
  publicRelativePath: string;
  publicUrl: string;
  sizeBytes: number;
  sha256: string;
  format: "png" | "jpeg" | "webp";
};

export type ProjectCoverDiskRecord = {
  publicRelativePath: string;
  publicUrl: string;
  sourceRelativePath: string;
  sha256: string;
  format: "png" | "jpeg" | "webp";
  size: number;
  updatedAt: string;
};

export type StagedProjectCover = PersistenceTestImageResult & {
  commitToken: string;
};

export type ProjectBodyDiskAsset = {
  assetId: string;
  sourceRelativePath: string;
  publicRelativePath: string;
  publicUrl: string;
  sha256: string;
  format: "png" | "jpeg" | "webp";
  size: number;
  width: number;
  height: number;
  updatedAt: string;
};

export type StagedProjectBodyAsset = PersistenceTestImageResult & {
  commitToken: string;
  assetId: string;
  width: number;
  height: number;
};

export type ProjectBodyDiskDocument<TDocument = Record<string, unknown>> = {
  version: 1;
  projectId: string;
  updatedAt: string;
  document: TDocument;
  assets: Record<string, ProjectBodyDiskAsset>;
};

export type DynamicProjectImageRecord = {
  imageId: string;
  projectId: string;
  instanceId: string;
  templateId: "image-row" | "direction-compare";
  itemId: string;
  originalFileName: string;
  sourcePath: string;
  publicPath: string;
  publicUrl: string;
  sha256: string;
  format: "png" | "jpeg" | "webp";
  size: number;
  width: number;
  height: number;
  createdAt: string;
};

export type DynamicProjectImageInstance = {
  instanceId: string;
  templateId: "image-row" | "direction-compare";
  regionId: string;
  anchorId: string;
  content: Record<string, unknown>;
  layoutSettings?: Record<string, unknown>;
  order: number;
  updatedAt: string;
};

export type DynamicProjectImageMapping = {
  version: 1;
  projectId: string;
  updatedAt: string;
  images: Record<string, DynamicProjectImageRecord>;
  instances: Record<string, DynamicProjectImageInstance>;
};

export type StagedDynamicProjectImage = PersistenceTestImageResult & {
  commitToken: string;
  projectId: string;
  instanceId: string;
  itemId: string;
  imageId: string;
  width: number;
  height: number;
};

function getSafeExtension(file: File) {
  const match = file.name.match(/\.(png|jpe?g|webp)$/i);
  if (!match) {
    throw new Error("Choose a PNG, JPEG, or WebP image.");
  }
  return `.${match[1].toLowerCase()}`;
}

export async function persistTestImage(
  file: File,
): Promise<PersistenceTestImageResult> {
  if (!supportedMimeTypes.has(file.type)) {
    throw new Error("Choose a PNG, JPEG, or WebP image.");
  }

  const response = await fetch(persistenceTestEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": file.type,
      "X-Portfolio-File-Extension": getSafeExtension(file),
    },
    body: file,
    credentials: "same-origin",
  });

  const payload = (await response.json()) as
    | PersistenceTestImageResult
    | { error?: string };
  if (!response.ok) {
    throw new Error(
      "error" in payload && payload.error
        ? payload.error
        : "Unable to persist the test image.",
    );
  }

  return payload as PersistenceTestImageResult;
}

async function readResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T | { error?: string };
  if (!response.ok) {
    throw new Error(
      "error" in (payload as { error?: string }) &&
        (payload as { error?: string }).error
        ? (payload as { error: string }).error
        : "The local project directory could not be updated.",
    );
  }
  return payload as T;
}

export async function stageProjectCover(file: File): Promise<StagedProjectCover> {
  if (!supportedMimeTypes.has(file.type)) {
    throw new Error("Choose a PNG, JPEG, or WebP image.");
  }

  const response = await fetch(projectCoverStageEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": file.type,
      "X-Portfolio-File-Extension": getSafeExtension(file),
    },
    body: file,
    credentials: "same-origin",
  });
  return readResponse<StagedProjectCover>(response);
}

export async function decodeProjectCover(publicUrl: string) {
  const image = new Image();
  image.src = publicUrl;
  await image.decode();
  if (!image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
    throw new Error("The saved cover could not be decoded by the browser.");
  }
}

export async function commitProjectCover(
  projectId: string,
  commitToken: string,
): Promise<ProjectCoverDiskRecord> {
  const response = await fetch(projectCoverCommitEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, commitToken }),
    credentials: "same-origin",
  });
  const payload = await readResponse<{
    projectId: string;
    record: ProjectCoverDiskRecord;
  }>(response);
  window.dispatchEvent(
    new CustomEvent(PROJECT_COVER_CHANGED_EVENT, { detail: { projectId } }),
  );
  return payload.record;
}

export async function getDiskProjectCover(projectId: string) {
  const response = await fetch(
    `${projectCoverResolveEndpoint}?projectId=${encodeURIComponent(projectId)}`,
    { credentials: "same-origin", cache: "no-store" },
  );
  const payload = await readResponse<{
    projectId: string;
    record: ProjectCoverDiskRecord | null;
  }>(response);
  return payload.record;
}

export async function stageProjectBodyAsset(projectId: string, assetId: string, file: File) {
  if (!supportedMimeTypes.has(file.type)) throw new Error("Choose a PNG, JPEG, or WebP image.");
  const response = await fetch(projectBodyStageEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": file.type,
      "X-Portfolio-File-Extension": getSafeExtension(file),
      "X-Portfolio-Project-Id": projectId,
      "X-Portfolio-Asset-Id": assetId,
    },
    body: file,
    credentials: "same-origin",
  });
  return readResponse<StagedProjectBodyAsset>(response);
}

export async function decodeProjectBodyAsset(publicUrl: string) {
  const image = new Image();
  image.src = publicUrl;
  await image.decode();
  if (!image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
    throw new Error("The saved project image could not be decoded by the browser.");
  }
}

export async function commitProjectBodyAssets<TDocument>(
  projectId: string,
  document: TDocument,
  assets: Array<{ assetId: string; commitToken: string }>,
) {
  const response = await fetch(projectBodyCommitEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, document, assets }),
    credentials: "same-origin",
  });
  return readResponse<ProjectBodyDiskDocument<TDocument>>(response);
}

export async function saveProjectBodyDocument<TDocument>(projectId: string, document: TDocument) {
  const response = await fetch(projectBodyDocumentEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, document }),
    credentials: "same-origin",
  });
  return readResponse<ProjectBodyDiskDocument<TDocument>>(response);
}

export async function getDiskProjectBodyDocument<TDocument>(projectId: string) {
  const response = await fetch(`${projectBodyDocumentEndpoint}?projectId=${encodeURIComponent(projectId)}`, {
    credentials: "same-origin",
    cache: "no-store",
  });
  const payload = await readResponse<{ projectId: string; record: ProjectBodyDiskDocument<TDocument> | null }>(response);
  return payload.record;
}

export async function stageDynamicProjectImage(
  projectId: string,
  instanceId: string,
  itemId: string,
  file: File,
) {
  if (!looselyAcceptableImageMimeTypes.has(file.type)) throw new Error("Choose a PNG, JPEG, or WebP image.");
  const response = await fetch(projectImageStageEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": file.type,
      "X-Portfolio-File-Extension": getSafeExtension(file),
      "X-Portfolio-Project-Id": projectId,
      "X-Portfolio-Instance-Id": instanceId,
      "X-Portfolio-Item-Id": itemId,
      "X-Portfolio-Original-File-Name": encodeURIComponent(file.name),
    },
    body: file,
    credentials: "same-origin",
  });
  return readResponse<StagedDynamicProjectImage>(response);
}

export async function decodeDynamicProjectImage(publicUrl: string) {
  const image = new Image();
  image.src = publicUrl;
  await image.decode();
  if (!image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
    throw new Error("The saved project image could not be decoded by the browser.");
  }
}

export async function commitDynamicProjectImage(payload: {
  projectId: string;
  commitToken: string;
  itemId: string;
  instance: Record<string, unknown>;
}) {
  const response = await fetch(projectImageCommitEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "same-origin",
  });
  return readResponse<{
    projectId: string;
    image: DynamicProjectImageRecord;
    mapping: DynamicProjectImageMapping;
  }>(response);
}

export async function abortDynamicProjectImageStage(projectId: string, commitToken: string) {
  const response = await fetch(projectImageAbortEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, commitToken }),
    credentials: "same-origin",
  });
  return readResponse<{ projectId: string; aborted: true }>(response);
}

export async function getDynamicProjectImageMapping(projectId: string) {
  const response = await fetch(`${projectImageMappingEndpoint}?projectId=${encodeURIComponent(projectId)}`, {
    credentials: "same-origin",
    cache: "no-store",
  });
  const payload = await readResponse<{ projectId: string; mapping: DynamicProjectImageMapping }>(response);
  return payload.mapping;
}

export async function unbindDynamicProjectImages(payload: {
  projectId: string;
  instanceId: string;
  imageIds: string[];
  instance: Record<string, unknown> | null;
}) {
  const response = await fetch(projectImageUnbindEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "same-origin",
  });
  const result = await readResponse<{ projectId: string; mapping: DynamicProjectImageMapping }>(response);
  return result.mapping;
}

export async function backupDynamicProjectCode(payload: {
  projectId: string;
  createdAt: string;
  metadata: Record<string, unknown>;
  draft: Record<string, unknown>;
}) {
  const response = await fetch(dynamicProjectRecoveryEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "same-origin",
  });
  return readResponse<{
    projectId: string;
    relativePath: string;
    sizeBytes: number;
  }>(response);
}

export type PlayableGameReference = {
  gameId: string;
  entryPublicPath: string;
  originalFileName: string;
  displayName: string;
  fileCount: number;
  totalBytes: number;
  createdAt: string;
};

export type PlayableGameCoverReference = {
  coverId: string;
  publicUrl: string;
  format: "png" | "jpeg" | "webp";
  size: number;
};

export async function stagePlayableGameCover(projectId: string, file: File) {
  if (!supportedMimeTypes.has(file.type)) throw new Error("Choose a PNG, JPEG, or WebP image.");
  const response = await fetch(playableGameCoverStageEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": file.type,
      "X-Portfolio-File-Extension": getSafeExtension(file),
      "X-Portfolio-Project-Id": projectId,
    },
    body: file,
    credentials: "same-origin",
  });
  return readResponse<PersistenceTestImageResult & { commitToken: string }>(response);
}

export async function commitPlayableGameCover(projectId: string, commitToken: string) {
  const response = await fetch(playableGameCoverCommitEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, commitToken }),
    credentials: "same-origin",
  });
  const payload = await readResponse<{ projectId: string; cover: PlayableGameCoverReference }>(response);
  return payload.cover;
}

export async function stagePlayableGame(projectId: string, file: File) {
  if (!file.name.toLowerCase().endsWith(".zip")) throw new Error("Choose a ZIP game build.");
  const response = await fetch(playableGameStageEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/zip", "X-Portfolio-Project-Id": projectId, "X-Portfolio-File-Name": file.name },
    body: file,
    credentials: "same-origin",
  });
  return readResponse<PlayableGameReference & { commitToken: string }>(response);
}

export type PlayableGameImportStage = "reading" | "checking" | "copying" | "verifying" | "saving";

export async function abortPlayableGameImport(projectId: string, token: string) {
  if (!token) return;
  await fetch(playableGameAbortEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, token }),
    credentials: "same-origin",
  }).then((response) => readResponse<{ aborted: boolean }>(response));
}

export async function stagePlayableGameFolder(
  projectId: string,
  selectedFiles: File[],
  onStage?: (stage: PlayableGameImportStage) => void,
) {
  if (!selectedFiles.length) throw new Error("Choose a WebGL game folder.");
  onStage?.("reading");
  const files = selectedFiles.map((file) => ({
    file,
    relativePath: file.webkitRelativePath || file.name,
    size: file.size,
  }));
  const folderName = files[0].relativePath.split(/[\\/]/)[0] || "web-game-folder";
  onStage?.("checking");
  const startResponse = await fetch(playableGameFolderStartEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId,
      originalFileName: folderName,
      files: files.map(({ relativePath, size }) => ({ relativePath, size })),
    }),
    credentials: "same-origin",
  });
  const started = await readResponse<{ uploadToken: string; fileCount: number }>(startResponse);
  try {
    onStage?.("copying");
    for (let index = 0; index < files.length; index += 1) {
      const response = await fetch(playableGameFolderFileEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Portfolio-Upload-Token": started.uploadToken,
          "X-Portfolio-File-Index": String(index),
        },
        body: files[index].file,
        credentials: "same-origin",
      });
      await readResponse<{ received: number }>(response);
    }
    const finishResponse = await fetch(playableGameFolderFinishEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, uploadToken: started.uploadToken }),
      credentials: "same-origin",
    });
    return await readResponse<PlayableGameReference & { commitToken: string }>(finishResponse);
  } catch (error) {
    await abortPlayableGameImport(projectId, started.uploadToken).catch(() => undefined);
    throw error;
  }
}

export async function verifyPlayableGameEntry(entryPublicPath: string) {
  if (!entryPublicPath.startsWith("/portfolio-assets/playable-games/")) throw new Error("The staged game entry path is invalid.");
  const response = await fetch(entryPublicPath, { cache: "no-store", credentials: "same-origin" });
  if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) throw new Error("The staged game entry could not be loaded.");
}

export async function commitPlayableGame(projectId: string, commitToken: string) {
  const response = await fetch(playableGameCommitEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, commitToken }),
    credentials: "same-origin",
  });
  const payload = await readResponse<{ projectId: string; game: PlayableGameReference }>(response);
  return payload.game;
}

export async function listPlayableGames(projectId: string) {
  const response = await fetch(`${playableGameListEndpoint}?projectId=${encodeURIComponent(projectId)}`, {
    cache: "no-store",
    credentials: "same-origin",
  });
  const payload = await readResponse<{ projectId: string; games: PlayableGameReference[] }>(response);
  return payload.games;
}

export async function bindPlayableGame(projectId: string, gameId: string) {
  const response = await fetch(playableGameBindEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, gameId }),
    credentials: "same-origin",
  });
  const payload = await readResponse<{ projectId: string; game: PlayableGameReference }>(response);
  return payload.game;
}
