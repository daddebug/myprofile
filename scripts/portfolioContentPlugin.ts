import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  access,
  copyFile,
  cp,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { inflateRawSync, inflateSync } from "node:zlib";
import type { Plugin, ViteDevServer } from "vite";

const endpoint = "/__portfolio-content/persistence-test/image";
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
const playableGameCoverResolveEndpoint = "/__portfolio-content/playable-games/cover/resolve";
const allowedOrigin = "http://localhost:5173";
const allowedHost = "localhost:5173";
const maximumFileBytes = 8 * 1024 * 1024;
const maximumJsonBytes = 64 * 1024;
const maximumProjectDocumentJsonBytes = 4 * 1024 * 1024;
const stagedCoverLifetimeMs = 10 * 60 * 1000;
const maximumGameZipBytes = 200 * 1024 * 1024;
const maximumGameExpandedBytes = 500 * 1024 * 1024;
const maximumGameFiles = 5000;
const forbiddenGameExtensions = new Set([".exe", ".bat", ".cmd", ".ps1", ".msi", ".scr", ".com"]);

type ImageFormat = "png" | "jpeg" | "webp";

type ImageDefinition = {
  extensions: ReadonlySet<string>;
  mime: string;
  outputExtension: string;
};

type PersistedImagePair = {
  sourceRelativePath: string;
  publicRelativePath: string;
  publicUrl: string;
  sizeBytes: number;
  sha256: string;
  format: ImageFormat;
  sourceAbsolutePath: string;
  publicAbsolutePath: string;
};

type ProjectCoverRecord = {
  publicRelativePath: string;
  publicUrl: string;
  sourceRelativePath: string;
  sha256: string;
  format: ImageFormat;
  size: number;
  updatedAt: string;
};

type ProjectCoverDocument = {
  version: 1;
  updatedAt: string;
  covers: Record<string, ProjectCoverRecord>;
};

type StagedProjectCover = {
  createdAt: number;
  image: PersistedImagePair;
};

type ImageDimensions = { width: number; height: number };

type ProjectBodyAssetRecord = {
  assetId: string;
  sourceRelativePath: string;
  publicRelativePath: string;
  publicUrl: string;
  sha256: string;
  format: ImageFormat;
  size: number;
  width: number;
  height: number;
  updatedAt: string;
};

type ProjectBodyDiskDocument = {
  version: 1;
  projectId: string;
  updatedAt: string;
  document: Record<string, unknown>;
  assets: Record<string, ProjectBodyAssetRecord>;
};

type StagedProjectBodyAsset = {
  createdAt: number;
  projectId: string;
  assetId: string;
  image: PersistedImagePair;
  dimensions: ImageDimensions;
};

type DynamicProjectImageRecord = {
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
  format: ImageFormat;
  size: number;
  width: number;
  height: number;
  createdAt: string;
};

type DynamicProjectImageInstance = {
  instanceId: string;
  templateId: "image-row" | "direction-compare";
  regionId: string;
  anchorId: string;
  content: Record<string, unknown>;
  layoutSettings?: Record<string, unknown>;
  order: number;
  updatedAt: string;
};

type DynamicProjectImageDocument = {
  version: 1;
  projectId: string;
  updatedAt: string;
  images: Record<string, DynamicProjectImageRecord>;
  instances: Record<string, DynamicProjectImageInstance>;
};

type StagedDynamicProjectImage = {
  createdAt: number;
  projectId: string;
  instanceId: string;
  itemId: string;
  imageId: string;
  originalFileName: string;
  image: PersistedImagePair;
  dimensions: ImageDimensions;
};

type PlayableGameRecord = { gameId: string; entryPublicPath: string; sourceDirectory: string; publicDirectory: string; originalFileName: string; displayName?: string; createdAt: string; fileCount: number; totalBytes: number };
type StagedPlayableGame = { createdAt: number; projectId: string; record: PlayableGameRecord; sourceAbsolutePath: string; publicAbsolutePath: string };
type PlayableGameFolderManifestEntry = { relativePath: string; size: number };
type StagedPlayableGameFolder = {
  createdAt: number;
  projectId: string;
  originalFileName: string;
  temporaryRoot: string;
  uploadRoot: string;
  manifest: PlayableGameFolderManifestEntry[];
  uploadedIndexes: Set<number>;
};
type PlayableGameCoverRecord = { coverId: string; sourceRelativePath: string; publicRelativePath: string; publicUrl: string; sha256: string; format: ImageFormat; size: number; createdAt: string };
type StagedPlayableGameCover = { createdAt: number; projectId: string; image: PersistedImagePair };
type PlayableGameDocument = { version: 1; projectId: string; updatedAt: string; games: PlayableGameRecord[]; covers: PlayableGameCoverRecord[] };

const imageDefinitions: Record<ImageFormat, ImageDefinition> = {
  png: {
    extensions: new Set([".png"]),
    mime: "image/png",
    outputExtension: ".png",
  },
  jpeg: {
    extensions: new Set([".jpg", ".jpeg"]),
    mime: "image/jpeg",
    outputExtension: ".jpg",
  },
  webp: {
    extensions: new Set([".webp"]),
    mime: "image/webp",
    outputExtension: ".webp",
  },
};

class RequestError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

async function readBodyWithLimit(req: IncomingMessage, maximumBytes: number, label: string) {
  const header = req.headers["content-length"];
  const declared = Number(Array.isArray(header) ? header[0] : header ?? 0);
  if (declared > maximumBytes) throw new RequestError(`${label} exceeds the size limit.`, 413);
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maximumBytes) throw new RequestError(`${label} exceeds the size limit.`, 413);
    chunks.push(buffer);
  }
  if (!total) throw new RequestError(`${label} is empty.`, 400);
  return Buffer.concat(chunks, total);
}

function safeZipEntries(zip: Buffer) {
  let eocd = -1;
  for (let index = zip.length - 22; index >= Math.max(0, zip.length - 65557); index -= 1) {
    if (zip.readUInt32LE(index) === 0x06054b50) { eocd = index; break; }
  }
  if (eocd < 0) throw new RequestError("ZIP directory is missing or ZIP64 is not supported.", 400);
  const count = zip.readUInt16LE(eocd + 10);
  if (count < 1 || count > maximumGameFiles) throw new RequestError(`ZIP must contain 1 to ${maximumGameFiles} files.`, 400);
  let cursor = zip.readUInt32LE(eocd + 16);
  let expandedBytes = 0;
  const entries: Array<{ name: string; data: Buffer }> = [];
  for (let index = 0; index < count; index += 1) {
    if (zip.readUInt32LE(cursor) !== 0x02014b50) throw new RequestError("ZIP directory is invalid.", 400);
    const flags = zip.readUInt16LE(cursor + 8);
    const method = zip.readUInt16LE(cursor + 10);
    const compressedSize = zip.readUInt32LE(cursor + 20);
    const uncompressedSize = zip.readUInt32LE(cursor + 24);
    const nameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    const externalAttributes = zip.readUInt32LE(cursor + 38);
    const localOffset = zip.readUInt32LE(cursor + 42);
    const rawName = zip.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8").replace(/\\/g, "/");
    const isDirectory = rawName.endsWith("/");
    const name = normalizeGameRelativePath(isDirectory ? rawName.replace(/\/+$/, "") : rawName);
    cursor += 46 + nameLength + extraLength + commentLength;
    if ((flags & 1) !== 0) throw new RequestError("Encrypted ZIP entries are not supported.", 400);
    if (((externalAttributes >>> 16) & 0o170000) === 0o120000) throw new RequestError("ZIP symbolic links are not allowed.", 400);
    if (isDirectory) continue;
    if (forbiddenGameExtensions.has(path.extname(name).toLowerCase())) throw new RequestError(`Executable file is not allowed: ${name}`, 400);
    expandedBytes += uncompressedSize;
    if (expandedBytes > maximumGameExpandedBytes) throw new RequestError("Expanded game build exceeds the 500 MiB limit.", 413);
    if (zip.readUInt32LE(localOffset) !== 0x04034b50) throw new RequestError("ZIP local entry is invalid.", 400);
    const localNameLength = zip.readUInt16LE(localOffset + 26);
    const localExtraLength = zip.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = zip.subarray(dataStart, dataStart + compressedSize);
    const data = method === 0 ? Buffer.from(compressed) : method === 8 ? inflateRawSync(compressed, { maxOutputLength: maximumGameExpandedBytes }) : null;
    if (!data || data.length !== uncompressedSize) throw new RequestError(`Unsupported or invalid ZIP entry: ${name}`, 400);
    entries.push({ name, data });
  }
  return entries;
}

function normalizeGameRelativePath(value: string) {
  const normalized = value.replace(/\\/g, "/").replace(/^\.\//, "");
  const parts = normalized.split("/");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    /^[a-z]:/i.test(normalized) ||
    parts.some((part) => !part || part === "." || part === ".." || part.includes("\0"))
  ) {
    throw new RequestError("Game build contains an unsafe path.", 400);
  }
  if (forbiddenGameExtensions.has(path.posix.extname(normalized).toLowerCase())) {
    throw new RequestError(`Executable file is not allowed: ${normalized}`, 400);
  }
  return parts.join("/");
}

function findPlayableWebsiteRoot(relativePaths: string[]) {
  const indexPaths = relativePaths.filter((relativePath) => path.posix.basename(relativePath).toLowerCase() === "index.html");
  if (indexPaths.length > 1) {
    throw new RequestError("检测到多个网页入口，请选择只包含一个游戏构建的文件夹或 ZIP。", 400);
  }
  if (indexPaths.length === 0) {
    const unityProjectDirectories = new Set(["assets", "library", "packages", "projectsettings"]);
    const looksLikeUnityProject = relativePaths.some((relativePath) => relativePath.split("/").some((part) => unityProjectDirectories.has(part.toLowerCase())));
    throw new RequestError(
      looksLikeUnityProject
        ? "你选择的是 Unity 工程，不是导出的 WebGL 网页游戏。"
        : "没有找到网页游戏入口 index.html。请选择 Unity 导出的 WebGL 文件夹，而不是 Unity 工程文件夹。",
      400,
    );
  }
  const directory = path.posix.dirname(indexPaths[0]);
  return directory === "." ? "" : directory;
}

function selectPlayableWebsiteEntries(entries: Array<{ name: string; data: Buffer }>) {
  const websiteRoot = findPlayableWebsiteRoot(entries.map((entry) => entry.name));
  const prefix = websiteRoot ? `${websiteRoot}/` : "";
  const selected = entries
    .filter((entry) => !prefix || entry.name.startsWith(prefix))
    .map((entry) => ({ name: prefix ? entry.name.slice(prefix.length) : entry.name, data: entry.data }));
  const names = new Set<string>();
  for (const entry of selected) {
    entry.name = normalizeGameRelativePath(entry.name);
    if (names.has(entry.name.toLowerCase())) throw new RequestError(`Game build contains a duplicate path: ${entry.name}`, 400);
    names.add(entry.name.toLowerCase());
  }
  if (!names.has("index.html")) throw new RequestError("The detected game entry could not be normalized.", 400);
  return selected;
}

async function fileSha256(filePath: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

async function inventoryDirectory(root: string, ignoredRelativePaths = new Set<string>()) {
  const inventory = new Map<string, { size: number; sha256: string }>();
  const visit = async (directory: string) => {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = path.relative(root, absolutePath).split(path.sep).join("/");
      if (entry.isSymbolicLink()) throw new Error("Symbolic links are not allowed in playable game files.");
      if (entry.isDirectory()) await visit(absolutePath);
      else if (entry.isFile() && !ignoredRelativePaths.has(relativePath)) {
        const fileStat = await stat(absolutePath);
        inventory.set(relativePath, { size: fileStat.size, sha256: await fileSha256(absolutePath) });
      }
    }
  };
  await visit(root);
  return inventory;
}

function assertMatchingInventories(expected: Map<string, { size: number; sha256: string }>, actual: Map<string, { size: number; sha256: string }>, label: string) {
  if (expected.size !== actual.size) throw new Error(`${label} file count verification failed.`);
  for (const [relativePath, expectedFile] of expected) {
    const actualFile = actual.get(relativePath);
    if (!actualFile || actualFile.size !== expectedFile.size || actualFile.sha256 !== expectedFile.sha256) {
      throw new Error(`${label} verification failed: ${relativePath}`);
    }
  }
}

async function writePlayableWebsiteEntries(siteRoot: string, entries: Array<{ name: string; data: Buffer }>) {
  await mkdir(siteRoot, { recursive: true });
  for (const entry of entries) {
    const destination = path.resolve(siteRoot, entry.name);
    if (!destination.startsWith(`${siteRoot}${path.sep}`)) throw new RequestError("Game build path escaped the temporary directory.", 400);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, entry.data, { flag: "wx" });
  }
}

async function installStagedPlayableWebsite(
  projectRoot: string,
  projectId: string,
  originalFileName: string,
  siteRoot: string,
  originalArchivePath?: string,
) {
  const gameId = `game-${randomUUID()}`;
  const sourceRelative = path.posix.join("content/source-assets/playable-games", projectId, gameId);
  const publicRelative = path.posix.join("public/portfolio-assets/playable-games", projectId, gameId);
  const sourceFinal = path.resolve(projectRoot, sourceRelative);
  const publicFinal = path.resolve(projectRoot, publicRelative);
  assertInsideProject(projectRoot, sourceFinal); assertInsideProject(projectRoot, publicFinal);
  const stagedInventory = await inventoryDirectory(siteRoot);
  if (!stagedInventory.has("index.html")) throw new RequestError("The staged website root does not contain index.html.", 400);
  try {
    await mkdir(path.dirname(sourceFinal), { recursive: true }); await mkdir(path.dirname(publicFinal), { recursive: true });
    await cp(siteRoot, sourceFinal, { recursive: true, force: false, errorOnExist: true });
    await cp(siteRoot, publicFinal, { recursive: true, force: false, errorOnExist: true });
    if (originalArchivePath) await copyFile(originalArchivePath, path.join(sourceFinal, "original.zip"));
    const [sourceInventory, publicInventory] = await Promise.all([
      inventoryDirectory(sourceFinal, new Set(["original.zip"])),
      inventoryDirectory(publicFinal),
    ]);
    assertMatchingInventories(stagedInventory, sourceInventory, "Source game copy");
    assertMatchingInventories(stagedInventory, publicInventory, "Public game copy");
  } catch (error) {
    await rm(sourceFinal, { recursive: true, force: true }); await rm(publicFinal, { recursive: true, force: true });
    throw error;
  }
  const totalBytes = [...stagedInventory.values()].reduce((sum, entry) => sum + entry.size, 0);
  const record: PlayableGameRecord = { gameId, entryPublicPath: `/${path.posix.join("portfolio-assets/playable-games", projectId, gameId, "index.html")}`, sourceDirectory: sourceRelative, publicDirectory: publicRelative, originalFileName, createdAt: new Date().toISOString(), fileCount: stagedInventory.size, totalBytes };
  return { record, sourceAbsolutePath: sourceFinal, publicAbsolutePath: publicFinal };
}

async function stagePlayableGameBuild(projectRoot: string, projectId: string, originalFileName: string, zip: Buffer) {
  const temporaryRoot = path.resolve(projectRoot, "backups/tmp/playable-game-import", randomUUID());
  const siteRoot = path.join(temporaryRoot, "website");
  const originalArchivePath = path.join(temporaryRoot, "original.zip");
  assertInsideProject(projectRoot, temporaryRoot);
  try {
    const entries = selectPlayableWebsiteEntries(safeZipEntries(zip));
    await mkdir(temporaryRoot, { recursive: true });
    await writeFile(originalArchivePath, zip, { flag: "wx" });
    await writePlayableWebsiteEntries(siteRoot, entries);
    return await installStagedPlayableWebsite(projectRoot, projectId, originalFileName, siteRoot, originalArchivePath);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

function parsePlayableGameFolderManifest(payload: Record<string, unknown>) {
  const originalFileName = typeof payload.originalFileName === "string" ? payload.originalFileName.trim() : "";
  if (!originalFileName || originalFileName.length > 160 || /[\\/\0]/.test(originalFileName)) {
    throw new RequestError("A safe game folder name is required.", 400);
  }
  if (!Array.isArray(payload.files) || payload.files.length < 1 || payload.files.length > maximumGameFiles) {
    throw new RequestError(`Game folder must contain 1 to ${maximumGameFiles} files.`, 400);
  }
  let totalBytes = 0;
  const names = new Set<string>();
  const manifest = payload.files.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new RequestError("Game folder manifest is invalid.", 400);
    const record = value as Record<string, unknown>;
    const relativePath = normalizeGameRelativePath(typeof record.relativePath === "string" ? record.relativePath : "");
    const size = Number(record.size);
    if (!Number.isSafeInteger(size) || size < 0 || size > maximumGameExpandedBytes) throw new RequestError(`Invalid game file size: ${relativePath}`, 400);
    const comparisonName = relativePath.toLowerCase();
    if (names.has(comparisonName)) throw new RequestError(`Game folder contains a duplicate path: ${relativePath}`, 400);
    names.add(comparisonName);
    totalBytes += size;
    if (totalBytes > maximumGameExpandedBytes) throw new RequestError("Game folder exceeds the 500 MiB limit.", 413);
    return { relativePath, size };
  });
  findPlayableWebsiteRoot(manifest.map((entry) => entry.relativePath));
  return { originalFileName, manifest };
}

async function writeRequestFile(req: IncomingMessage, destination: string, expectedBytes: number) {
  const declared = Number(req.headers["content-length"] ?? -1);
  if (Number.isFinite(declared) && declared >= 0 && declared !== expectedBytes) throw new RequestError("Uploaded game file size does not match its manifest.", 400);
  await mkdir(path.dirname(destination), { recursive: true });
  const handle = await open(destination, "wx");
  let written = 0;
  try {
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      written += buffer.length;
      if (written > expectedBytes) throw new RequestError("Uploaded game file exceeds its declared size.", 400);
      let offset = 0;
      while (offset < buffer.length) {
        const result = await handle.write(buffer, offset, buffer.length - offset);
        offset += result.bytesWritten;
      }
    }
  } catch (error) {
    await handle.close();
    await rm(destination, { force: true });
    throw error;
  }
  await handle.close();
  if (written !== expectedBytes) {
    await rm(destination, { force: true });
    throw new RequestError("Uploaded game file is incomplete.", 400);
  }
}

async function materializePlayableGameFolder(upload: StagedPlayableGameFolder) {
  if (upload.uploadedIndexes.size !== upload.manifest.length) throw new RequestError("Some game folder files have not finished uploading.", 409);
  const websiteRoot = findPlayableWebsiteRoot(upload.manifest.map((entry) => entry.relativePath));
  const prefix = websiteRoot ? `${websiteRoot}/` : "";
  const siteRoot = path.join(upload.temporaryRoot, "website");
  await mkdir(siteRoot, { recursive: true });
  const selected = upload.manifest.filter((entry) => !prefix || entry.relativePath.startsWith(prefix));
  for (const entry of selected) {
    const normalizedPath = prefix ? entry.relativePath.slice(prefix.length) : entry.relativePath;
    const safeRelativePath = normalizeGameRelativePath(normalizedPath);
    const source = path.resolve(upload.uploadRoot, entry.relativePath);
    const destination = path.resolve(siteRoot, safeRelativePath);
    if (!source.startsWith(`${upload.uploadRoot}${path.sep}`) || !destination.startsWith(`${siteRoot}${path.sep}`)) {
      throw new RequestError("Game folder path escaped the temporary directory.", 400);
    }
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(source, destination);
  }
  return siteRoot;
}

async function cleanupStagedPlayableGame(staged: StagedPlayableGame) {
  await Promise.all([
    rm(staged.sourceAbsolutePath, { recursive: true, force: true }),
    rm(staged.publicAbsolutePath, { recursive: true, force: true }),
  ]);
}

async function readPlayableGameDocument(projectRoot: string, projectId: string): Promise<PlayableGameDocument> {
  const directory = path.resolve(projectRoot, "content/projects", projectId);
  const target = path.join(directory, "playable-games.json");
  assertInsideProject(projectRoot, target);
  try {
    const current = JSON.parse(await readFile(target, "utf8")) as { games?: PlayableGameRecord[] };
    if (!current || !Array.isArray(current.games)) throw new Error("Invalid playable-games.json.");
    return {
      version: 1,
      projectId,
      updatedAt: typeof (current as Record<string, unknown>).updatedAt === "string" ? String((current as Record<string, unknown>).updatedAt) : new Date(0).toISOString(),
      games: current.games,
      covers: Array.isArray((current as { covers?: PlayableGameCoverRecord[] }).covers) ? (current as { covers: PlayableGameCoverRecord[] }).covers : [],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return { version: 1, projectId, updatedAt: new Date(0).toISOString(), games: [], covers: [] };
  }
}

const windowsCommitRetryDelays = [100, 200, 400, 800, 1200, 1600] as const;

function isRetryableWindowsFileError(error: unknown) {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "EPERM" || code === "EACCES" || code === "EBUSY";
}

async function commitSmallFileWithRetry(source: string, target: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= windowsCommitRetryDelays.length; attempt += 1) {
    try {
      await rename(source, target);
      return;
    } catch (error) {
      lastError = error;
      if (!isRetryableWindowsFileError(error) || attempt === windowsCommitRetryDelays.length) break;
      await wait(windowsCommitRetryDelays[attempt]);
    }
  }
  if (!isRetryableWindowsFileError(lastError)) throw lastError;
  await copyFile(source, target);
  await rm(source, { force: true });
}

async function writePlayableGameDocument(projectRoot: string, document: PlayableGameDocument) {
  const directory = path.resolve(projectRoot, "content/projects", document.projectId);
  const target = path.join(directory, "playable-games.json");
  const backupDirectory = path.resolve(projectRoot, "backups/content-history/playable-games", document.projectId);
  assertInsideProject(projectRoot, target);
  assertInsideProject(projectRoot, backupDirectory);
  await Promise.all([mkdir(directory, { recursive: true }), mkdir(backupDirectory, { recursive: true })]);
  try {
    const current = await readFile(target);
    await writeFile(path.join(backupDirectory, `playable-games-${Date.now().toString(36)}-${randomUUID()}.json`), current, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const temporary = path.join(directory, `.playable-games-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, { flag: "wx" });
    JSON.parse(await readFile(temporary, "utf8"));
    await commitSmallFileWithRetry(temporary, target);
    return await readPlayableGameDocument(projectRoot, document.projectId);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function commitPlayableGameRecord(projectRoot: string, projectId: string, record: PlayableGameRecord) {
  const current = await readPlayableGameDocument(projectRoot, projectId);
  const installed = await writePlayableGameDocument(projectRoot, { ...current, updatedAt: new Date().toISOString(), games: [...current.games, record] });
  if (!installed.games.some((game) => game.gameId === record.gameId)) throw new Error("Committed game mapping could not be verified.");
  return record;
}

function toBrowserPlayableGame(game: PlayableGameRecord) {
  return {
    gameId: game.gameId,
    entryPublicPath: game.entryPublicPath,
    originalFileName: game.originalFileName,
    displayName: game.displayName?.trim() || game.originalFileName,
    fileCount: game.fileCount,
    totalBytes: game.totalBytes,
    createdAt: game.createdAt,
  };
}

async function verifyMappedPlayableGame(projectRoot: string, projectId: string, game: PlayableGameRecord) {
  const expectedPrefix = `/portfolio-assets/playable-games/${projectId}/${game.gameId}/`;
  if (!game.entryPublicPath.startsWith(expectedPrefix) || !game.entryPublicPath.toLowerCase().endsWith("/index.html")) {
    throw new RequestError("The saved game entry path is invalid.", 409);
  }
  const entryAbsolutePath = path.resolve(projectRoot, `public${game.entryPublicPath}`);
  assertInsideProject(projectRoot, entryAbsolutePath);
  await access(entryAbsolutePath);
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function assertInsideProject(projectRoot: string, candidate: string) {
  const relative = path.relative(projectRoot, candidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("The persistence-test path escaped the project root.");
  }
}

function parseContentLength(req: IncomingMessage) {
  const header = req.headers["content-length"];
  if (header === undefined) return null;
  const value = Array.isArray(header) ? header[0] : header;
  const length = Number(value);
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new RequestError("Invalid Content-Length.", 400);
  }
  if (length > maximumFileBytes) {
    throw new RequestError("Image exceeds the 8 MiB limit.", 413);
  }
  return length;
}

async function readBody(req: IncomingMessage) {
  const declaredLength = parseContentLength(req);
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maximumFileBytes) {
      throw new RequestError("Image exceeds the 8 MiB limit.", 413);
    }
    chunks.push(buffer);
  }

  if (declaredLength !== null && total !== declaredLength) {
    throw new RequestError("Request body size does not match Content-Length.", 400);
  }
  if (total === 0) {
    throw new RequestError("Image body is empty.", 400);
  }

  return Buffer.concat(chunks, total);
}

async function readJsonBody(req: IncomingMessage, maximumBytes = maximumJsonBytes) {
  const contentType = (req.headers["content-type"] ?? "")
    .toString()
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (contentType !== "application/json") {
    throw new RequestError("Content-Type must be application/json.", 415);
  }

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maximumBytes) {
      throw new RequestError("JSON request is too large.", 413);
    }
    chunks.push(buffer);
  }
  if (total === 0) {
    throw new RequestError("JSON request is empty.", 400);
  }

  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks, total).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Expected an object.");
    }
    return value as Record<string, unknown>;
  } catch {
    throw new RequestError("Invalid JSON request.", 400);
  }
}

function isPng(buffer: Buffer) {
  return (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  );
}

function validatePng(buffer: Buffer) {
  if (!isPng(buffer) || buffer.length < 45) {
    throw new RequestError("Invalid PNG signature or structure.", 415);
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let foundHeader = false;
  let foundEnd = false;
  const imageData: Buffer[] = [];

  while (offset + 12 <= buffer.length) {
    const chunkLength = buffer.readUInt32BE(offset);
    const chunkEnd = offset + 12 + chunkLength;
    if (chunkEnd > buffer.length) {
      throw new RequestError("PNG chunk extends beyond the file.", 415);
    }

    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    if (type === "IHDR") {
      if (foundHeader || chunkLength !== 13 || offset !== 8) {
        throw new RequestError("Invalid PNG header.", 415);
      }
      width = buffer.readUInt32BE(dataStart);
      height = buffer.readUInt32BE(dataStart + 4);
      foundHeader = true;
    } else if (type === "IDAT") {
      imageData.push(buffer.subarray(dataStart, dataStart + chunkLength));
    } else if (type === "IEND") {
      if (chunkLength !== 0) {
        throw new RequestError("Invalid PNG end chunk.", 415);
      }
      foundEnd = true;
      break;
    }
    offset = chunkEnd;
  }

  if (!foundHeader || !foundEnd || width <= 0 || height <= 0 || imageData.length === 0) {
    throw new RequestError("PNG is missing required image data.", 415);
  }

  try {
    if (inflateSync(Buffer.concat(imageData)).length === 0) {
      throw new Error("Empty PNG pixel stream.");
    }
  } catch {
    throw new RequestError("PNG pixel data cannot be decoded.", 415);
  }
}

// Some real-world JPEGs (observed from files saved out of WeChat's local
// cache on Windows) carry a handful of extra bytes before the real FF D8
// SOI marker instead of starting with it at offset 0 — the file is a
// genuine, undamaged JPEG, just not packaged strictly to spec. Scanning a
// small bounded window (not the whole file — that would risk treating
// arbitrary binary noise as a valid signature) finds the real SOI without
// weakening detection for anything else.
const JPEG_SOI_SEARCH_WINDOW = 32;

function findJpegSoiOffset(buffer: Buffer): number {
  const limit = Math.min(JPEG_SOI_SEARCH_WINDOW, buffer.length - 2);
  for (let offset = 0; offset <= limit; offset += 1) {
    if (buffer[offset] === 0xff && buffer[offset + 1] === 0xd8) return offset;
  }
  return -1;
}

function isJpeg(buffer: Buffer) {
  return (
    buffer.length >= 4 &&
    findJpegSoiOffset(buffer) >= 0 &&
    buffer[buffer.length - 2] === 0xff &&
    buffer[buffer.length - 1] === 0xd9
  );
}

function validateJpeg(buffer: Buffer) {
  const soi = findJpegSoiOffset(buffer);
  if (soi < 0 || buffer[buffer.length - 2] !== 0xff || buffer[buffer.length - 1] !== 0xd9) {
    throw new RequestError("Invalid JPEG signature.", 415);
  }

  const startOfFrameMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
    0xcf,
  ]);
  // Marker scanning starts right after the real SOI, wherever it was found
  // — any leading bytes before it are opaque to this scan either way, the
  // same as they always were for a spec-correct file starting at offset 0.
  let offset = soi + 2;
  let validDimensions = false;

  while (offset + 4 <= buffer.length) {
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    if (offset >= buffer.length) break;
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > buffer.length) break;
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) {
      throw new RequestError("Invalid JPEG segment.", 415);
    }
    if (startOfFrameMarkers.has(marker) && segmentLength >= 7) {
      const height = buffer.readUInt16BE(offset + 3);
      const width = buffer.readUInt16BE(offset + 5);
      validDimensions = width > 0 && height > 0;
    }
    offset += segmentLength;
  }

  if (!validDimensions) {
    throw new RequestError("JPEG dimensions could not be decoded.", 415);
  }
}

function isWebp(buffer: Buffer) {
  return (
    buffer.length >= 20 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  );
}

function validateWebp(buffer: Buffer) {
  if (!isWebp(buffer) || buffer.readUInt32LE(4) + 8 !== buffer.length) {
    throw new RequestError("Invalid WebP container.", 415);
  }

  const chunkType = buffer.toString("ascii", 12, 16);
  let width = 0;
  let height = 0;
  if (chunkType === "VP8X" && buffer.length >= 30) {
    width = 1 + buffer.readUIntLE(24, 3);
    height = 1 + buffer.readUIntLE(27, 3);
  } else if (chunkType === "VP8L" && buffer.length >= 25 && buffer[20] === 0x2f) {
    const bits = buffer.readUInt32LE(21);
    width = (bits & 0x3fff) + 1;
    height = ((bits >>> 14) & 0x3fff) + 1;
  } else if (
    chunkType === "VP8 " &&
    buffer.length >= 30 &&
    buffer[23] === 0x9d &&
    buffer[24] === 0x01 &&
    buffer[25] === 0x2a
  ) {
    width = buffer.readUInt16LE(26) & 0x3fff;
    height = buffer.readUInt16LE(28) & 0x3fff;
  }

  if (width <= 0 || height <= 0) {
    throw new RequestError("WebP dimensions could not be decoded.", 415);
  }
}

function detectAndValidateImage(buffer: Buffer): ImageFormat {
  if (isPng(buffer)) {
    validatePng(buffer);
    return "png";
  }
  if (isJpeg(buffer)) {
    validateJpeg(buffer);
    return "jpeg";
  }
  if (isWebp(buffer)) {
    validateWebp(buffer);
    return "webp";
  }
  throw new RequestError("Only PNG, JPEG, and WebP images are accepted.", 415);
}

function readImageDimensions(buffer: Buffer, format: ImageFormat): ImageDimensions {
  if (format === "png") {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (format === "webp") {
    const chunkType = buffer.toString("ascii", 12, 16);
    if (chunkType === "VP8X") {
      return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
    }
    if (chunkType === "VP8L") {
      const bits = buffer.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }

  const startOfFrameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  const soi = findJpegSoiOffset(buffer);
  let offset = soi >= 0 ? soi + 2 : 2;
  while (offset + 7 <= buffer.length) {
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const segmentLength = buffer.readUInt16BE(offset);
    if (startOfFrameMarkers.has(marker)) {
      return { height: buffer.readUInt16BE(offset + 3), width: buffer.readUInt16BE(offset + 5) };
    }
    offset += segmentLength;
  }
  throw new RequestError("Image dimensions could not be decoded.", 415);
}

function normalizeExtension(value: string | string[] | undefined) {
  const extension = Array.isArray(value) ? value[0] : value;
  if (
    !extension ||
    !/^\.(png|jpe?g|webp)$/i.test(extension) ||
    extension.includes("..") ||
    extension.includes("/") ||
    extension.includes("\\")
  ) {
    throw new RequestError("A safe PNG, JPEG, or WebP extension is required.", 400);
  }
  return extension.toLowerCase();
}

// Alternate MIME strings real browsers/OSes report for a JPEG file — none
// of these change what the file actually is, only how something upstream
// (Windows file association, an older browser) chose to label it.
const jpegMimeAliases = new Set(["image/jpeg", "image/jpg", "image/pjpeg"]);
// A blank or generic declaration isn't a lie about the format, it's an
// absence of one — the browser genuinely didn't know. Treated as "no
// opinion" rather than a mismatch, since the real signature (`format`,
// already verified by detectAndValidateImage before this runs) is what
// actually decided the format, not this header.
const unknownMimeTypes = new Set(["", "application/octet-stream"]);

function validateRequestMetadata(req: IncomingMessage, format: ImageFormat) {
  const contentType = (req.headers["content-type"] ?? "")
    .toString()
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  const extension = normalizeExtension(req.headers["x-portfolio-file-extension"]);
  const definition = imageDefinitions[format];
  const mimeIsAcceptable = contentType === definition.mime
    || unknownMimeTypes.has(contentType)
    || (format === "jpeg" && jpegMimeAliases.has(contentType));
  if (!mimeIsAcceptable || !definition.extensions.has(extension)) {
    throw new RequestError("MIME type, extension, and file signature do not match.", 415);
  }
}

function detectedSignatureLabel(buffer: Buffer): string {
  if (isPng(buffer)) return "PNG";
  if (isJpeg(buffer)) return "JPEG";
  if (isWebp(buffer)) return "WebP";
  return "无法识别（不是 PNG/JPEG/WebP 签名）";
}

// A format/MIME rejection here is the one failure mode a non-technical
// error message ("Invalid image" / "Unsupported image") is least helpful
// for — the owner has no way to tell whether the browser mislabeled a real
// file or the file itself is genuinely a different format. This restates
// the same failure with what was actually declared vs. actually detected,
// so it's diagnosable from the error text alone.
function detectImageOrThrowWithDiagnostics(req: IncomingMessage, buffer: Buffer): ImageFormat {
  try {
    const format = detectAndValidateImage(buffer);
    validateRequestMetadata(req, format);
    return format;
  } catch (error) {
    const declaredContentType = (req.headers["content-type"] ?? "").toString().split(";", 1)[0].trim() || "(未声明)";
    const rawExtension = req.headers["x-portfolio-file-extension"];
    const declaredExtension = (Array.isArray(rawExtension) ? rawExtension[0] : rawExtension) || "(未声明)";
    const detected = detectedSignatureLabel(buffer);
    const detail = error instanceof RequestError ? error.message : "无法校验图片格式。";
    throw new RequestError(
      `浏览器声明为 ${declaredContentType}，扩展名为 ${declaredExtension}，文件签名检测为 ${detected}。${detail}`,
      error instanceof RequestError ? error.statusCode : 415,
    );
  }
}

async function pathExists(candidate: string) {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function chooseUniqueFilename(
  sourceDirectory: string,
  publicDirectory: string,
  extension: string,
  prefix: string,
) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const filename = `${prefix}-${Date.now().toString(36)}-${randomUUID()}${extension}`;
    if (
      !(await pathExists(path.join(sourceDirectory, filename))) &&
      !(await pathExists(path.join(publicDirectory, filename)))
    ) {
      return filename;
    }
  }
  throw new Error("Unable to allocate a unique image filename.");
}

function sha256(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function persistImagePair(
  projectRoot: string,
  buffer: Buffer,
  format: ImageFormat,
  sourceRelativeDirectory: string,
  publicRelativeDirectory: string,
  filenamePrefix: string,
): Promise<PersistedImagePair> {
  const sourceDirectory = path.resolve(projectRoot, sourceRelativeDirectory);
  const publicDirectory = path.resolve(projectRoot, publicRelativeDirectory);
  assertInsideProject(projectRoot, sourceDirectory);
  assertInsideProject(projectRoot, publicDirectory);
  await Promise.all([
    mkdir(sourceDirectory, { recursive: true }),
    mkdir(publicDirectory, { recursive: true }),
  ]);

  const definition = imageDefinitions[format];
  const filename = await chooseUniqueFilename(
    sourceDirectory,
    publicDirectory,
    definition.outputExtension,
    filenamePrefix,
  );
  const operationId = randomUUID();
  const sourceTemporary = path.join(sourceDirectory, `.tmp-${operationId}`);
  const publicTemporary = path.join(publicDirectory, `.tmp-${operationId}`);
  const sourceFinal = path.join(sourceDirectory, filename);
  const publicFinal = path.join(publicDirectory, filename);
  const cleanupCandidates = [sourceTemporary, publicTemporary, sourceFinal, publicFinal];
  let completed = false;

  try {
    await writeFile(sourceTemporary, buffer, { flag: "wx" });
    await writeFile(publicTemporary, buffer, { flag: "wx" });

    const [sourceCheck, publicCheck] = await Promise.all([
      readFile(sourceTemporary),
      readFile(publicTemporary),
    ]);
    detectAndValidateImage(sourceCheck);
    detectAndValidateImage(publicCheck);
    const expectedHash = sha256(buffer);
    if (
      sourceCheck.length !== buffer.length ||
      publicCheck.length !== buffer.length ||
      sha256(sourceCheck) !== expectedHash ||
      sha256(publicCheck) !== expectedHash
    ) {
      throw new Error("Image verification failed before rename.");
    }

    await rename(sourceTemporary, sourceFinal);
    await rename(publicTemporary, publicFinal);

    const [sourceFinalCheck, publicFinalCheck] = await Promise.all([
      readFile(sourceFinal),
      readFile(publicFinal),
    ]);
    if (
      sourceFinalCheck.length !== buffer.length ||
      publicFinalCheck.length !== buffer.length ||
      sha256(sourceFinalCheck) !== expectedHash ||
      sha256(publicFinalCheck) !== expectedHash
    ) {
      throw new Error("Image verification failed after rename.");
    }

    completed = true;
    return {
      sourceRelativePath: path.posix.join(
        sourceRelativeDirectory,
        filename,
      ),
      publicRelativePath: path.posix.join(
        publicRelativeDirectory,
        filename,
      ),
      publicUrl: `/${path.posix.join(publicRelativeDirectory.replace(/^public\//, ""), filename)}`,
      sizeBytes: buffer.length,
      sha256: expectedHash,
      format,
      sourceAbsolutePath: sourceFinal,
      publicAbsolutePath: publicFinal,
    };
  } finally {
    if (!completed) {
      await Promise.all(cleanupCandidates.map((candidate) => rm(candidate, { force: true })));
    }
  }
}

async function persistDynamicProjectImagePair(
  projectRoot: string,
  buffer: Buffer,
  format: ImageFormat,
  projectId: string,
  imageId: string,
): Promise<PersistedImagePair> {
  const definition = imageDefinitions[format];
  const filename = `${imageId}${definition.outputExtension}`;
  const sourceRelativeDirectory = path.posix.join("content/source-assets/project-images", projectId);
  const publicRelativeDirectory = path.posix.join("public/portfolio-assets/project-images", projectId);
  const sourceDirectory = path.resolve(projectRoot, sourceRelativeDirectory);
  const publicDirectory = path.resolve(projectRoot, publicRelativeDirectory);
  const stagingDirectory = path.resolve(projectRoot, "backups/tmp/project-image-upload", randomUUID());
  const stagingPath = path.join(stagingDirectory, filename);
  const sourceFinal = path.join(sourceDirectory, filename);
  const publicFinal = path.join(publicDirectory, filename);
  const sourceTemporary = path.join(sourceDirectory, `.tmp-${randomUUID()}`);
  const publicTemporary = path.join(publicDirectory, `.tmp-${randomUUID()}`);
  const expectedHash = sha256(buffer);
  let completed = false;

  for (const candidate of [sourceDirectory, publicDirectory, stagingDirectory]) {
    assertInsideProject(projectRoot, candidate);
  }
  if (await pathExists(sourceFinal) || await pathExists(publicFinal)) {
    throw new Error("The generated image ID already exists.");
  }

  try {
    await mkdir(stagingDirectory, { recursive: true });
    await writeFile(stagingPath, buffer, { flag: "wx" });
    const staged = await readFile(stagingPath);
    if (detectAndValidateImage(staged) !== format || staged.length !== buffer.length || sha256(staged) !== expectedHash) {
      throw new Error("Image staging verification failed.");
    }

    await Promise.all([mkdir(sourceDirectory, { recursive: true }), mkdir(publicDirectory, { recursive: true })]);
    await Promise.all([
      copyFile(stagingPath, sourceTemporary),
      copyFile(stagingPath, publicTemporary),
    ]);
    const [sourceCheck, publicCheck] = await Promise.all([readFile(sourceTemporary), readFile(publicTemporary)]);
    if (
      sourceCheck.length !== buffer.length
      || publicCheck.length !== buffer.length
      || sha256(sourceCheck) !== expectedHash
      || sha256(publicCheck) !== expectedHash
      || detectAndValidateImage(sourceCheck) !== format
      || detectAndValidateImage(publicCheck) !== format
    ) {
      throw new Error("Image copy verification failed.");
    }
    await rename(sourceTemporary, sourceFinal);
    await rename(publicTemporary, publicFinal);
    const [installedSource, installedPublic] = await Promise.all([readFile(sourceFinal), readFile(publicFinal)]);
    if (
      installedSource.length !== buffer.length
      || installedPublic.length !== buffer.length
      || sha256(installedSource) !== expectedHash
      || sha256(installedPublic) !== expectedHash
    ) {
      throw new Error("Installed project image verification failed.");
    }

    completed = true;
    return {
      sourceRelativePath: path.posix.join(sourceRelativeDirectory, filename),
      publicRelativePath: path.posix.join(publicRelativeDirectory, filename),
      publicUrl: `/${path.posix.join(publicRelativeDirectory.replace(/^public\//, ""), filename)}`,
      sizeBytes: buffer.length,
      sha256: expectedHash,
      format,
      sourceAbsolutePath: sourceFinal,
      publicAbsolutePath: publicFinal,
    };
  } finally {
    await Promise.all([
      rm(stagingDirectory, { recursive: true, force: true }),
      rm(sourceTemporary, { force: true }),
      rm(publicTemporary, { force: true }),
      ...(completed ? [] : [rm(sourceFinal, { force: true }), rm(publicFinal, { force: true })]),
    ]);
  }
}

async function persistTestImage(projectRoot: string, buffer: Buffer, format: ImageFormat) {
  const image = await persistImagePair(
    projectRoot,
    buffer,
    format,
    "content/source-assets/persistence-test",
    "public/portfolio-assets/persistence-test",
    "persistence-test",
  );
  return toPublicImageResult(image);
}

function toPublicImageResult(image: PersistedImagePair) {
  return {
    sourceRelativePath: image.sourceRelativePath,
    publicRelativePath: image.publicRelativePath,
    publicUrl: image.publicUrl,
    sizeBytes: image.sizeBytes,
    sha256: image.sha256,
    format: image.format,
  };
}

function validateProjectId(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^[a-z0-9][a-z0-9._-]{0,127}$/i.test(value) ||
    value.includes("..") ||
    value.includes("/") ||
    value.includes("\\")
  ) {
    throw new RequestError("Invalid project ID.", 400);
  }
  return value;
}

function projectCoverDocumentPath(projectRoot: string) {
  const candidate = path.resolve(projectRoot, "content/projects/project-covers.json");
  assertInsideProject(projectRoot, candidate);
  return candidate;
}

function projectBodyDocumentPath(projectRoot: string, projectId: string) {
  const candidate = path.resolve(projectRoot, "content/projects", projectId, "project-document.json");
  assertInsideProject(projectRoot, candidate);
  return candidate;
}

function validateAssetId(value: unknown) {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9._-]{0,191}$/i.test(value) || value.includes("..")) {
    throw new RequestError("Invalid asset ID.", 400);
  }
  return value;
}

function validateProjectImageId(value: unknown, fieldName = "imageId") {
  if (
    typeof value !== "string"
    || !/^image-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  ) {
    throw new RequestError(`Invalid ${fieldName}: ${JSON.stringify(value)}. Expected image-<uuid>.`, 400);
  }
  return value;
}

function validateTemplateStructureId(value: unknown, fieldName: "instanceId" | "itemId" | "regionId") {
  if (
    typeof value !== "string"
    || value.length < 1
    || value.length > 256
    || !/^[a-z0-9][a-z0-9._:-]*$/i.test(value)
    || value.includes("..")
    || value.includes("/")
    || value.includes("\\")
  ) {
    throw new RequestError(
      `Invalid Image Row ${fieldName}: ${JSON.stringify(value)}. Expected a safe template structure ID using letters, numbers, dot, underscore, colon, or hyphen.`,
      400,
    );
  }
  return value;
}

function validateProjectDocumentPayload(value: unknown, projectId: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestError("Project document must be an object.", 400);
  }
  const document = value as Record<string, unknown>;
  if (document.schemaVersion !== 1 || document.projectId !== projectId || !Array.isArray(document.sections)) {
    throw new RequestError("Invalid project document payload.", 400);
  }
  return document;
}

function validateDynamicProjectRecoveryPayload(value: unknown, projectId: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestError("Dynamic project recovery data must be an object.", 400);
  }
  const record = value as Record<string, unknown>;
  if (
    record.projectId !== projectId
    || !record.draft
    || typeof record.draft !== "object"
    || Array.isArray(record.draft)
    || !Array.isArray((record.draft as Record<string, unknown>).templateInstances)
  ) {
    throw new RequestError("Invalid dynamic project recovery data.", 400);
  }
  return record;
}

async function writeDynamicProjectRecovery(
  projectRoot: string,
  projectId: string,
  payload: Record<string, unknown>,
) {
  const directory = path.resolve(
    projectRoot,
    "backups/recovery/project-code",
    projectId,
  );
  assertInsideProject(projectRoot, directory);
  await mkdir(directory, { recursive: true });
  const operationId = randomUUID();
  const filename = `${new Date().toISOString().replace(/[:.]/g, "-")}-${operationId}.json`;
  const finalPath = path.join(directory, filename);
  const temporaryPath = path.join(directory, `.recovery-${operationId}.tmp`);
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  try {
    await writeFile(temporaryPath, serialized, { encoding: "utf8", flag: "wx" });
    const verified = JSON.parse(await readFile(temporaryPath, "utf8")) as unknown;
    validateDynamicProjectRecoveryPayload(verified, projectId);
    await rename(temporaryPath, finalPath);
    const installed = JSON.parse(await readFile(finalPath, "utf8")) as unknown;
    validateDynamicProjectRecoveryPayload(installed, projectId);
    return {
      relativePath: path.posix.join(
        "backups/recovery/project-code",
        projectId,
        filename,
      ),
      sizeBytes: Buffer.byteLength(serialized, "utf8"),
    };
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

function parseProjectBodyDiskDocument(raw: string, projectId: string): ProjectBodyDiskDocument {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Project body document must be an object.");
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== 1 || candidate.projectId !== projectId || typeof candidate.updatedAt !== "string" || !candidate.assets || typeof candidate.assets !== "object" || Array.isArray(candidate.assets)) {
    throw new Error("Invalid version-1 project body document.");
  }
  validateProjectDocumentPayload(candidate.document, projectId);
  return value as ProjectBodyDiskDocument;
}

async function readProjectBodyDiskDocument(projectRoot: string, projectId: string) {
  const documentPath = projectBodyDocumentPath(projectRoot, projectId);
  try {
    return parseProjectBodyDiskDocument(await readFile(documentPath, "utf8"), projectId);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function writeProjectBodyDiskDocument(projectRoot: string, document: ProjectBodyDiskDocument) {
  const documentPath = projectBodyDocumentPath(projectRoot, document.projectId);
  const directory = path.dirname(documentPath);
  const backupDirectory = path.resolve(projectRoot, "backups/content-history/project-body", document.projectId);
  assertInsideProject(projectRoot, backupDirectory);
  await Promise.all([mkdir(directory, { recursive: true }), mkdir(backupDirectory, { recursive: true })]);

  let original: Buffer | null = null;
  try {
    original = await readFile(documentPath);
    await writeFile(path.join(backupDirectory, `project-document-${Date.now().toString(36)}-${randomUUID()}.json`), original, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const temporaryPath = path.join(directory, `.project-document-${randomUUID()}.tmp`);
  let installed = false;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    parseProjectBodyDiskDocument(await readFile(temporaryPath, "utf8"), document.projectId);
    await rename(temporaryPath, documentPath);
    installed = true;
    return parseProjectBodyDiskDocument(await readFile(documentPath, "utf8"), document.projectId);
  } catch (error) {
    if (installed) {
      if (original) {
        const restorePath = path.join(directory, `.project-document-restore-${randomUUID()}.tmp`);
        await writeFile(restorePath, original, { flag: "wx" });
        await rename(restorePath, documentPath);
      } else {
        await rm(documentPath, { force: true });
      }
    }
    throw error;
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

function dynamicProjectImageDocumentPath(projectRoot: string, projectId: string) {
  const candidate = path.resolve(projectRoot, "content/projects", projectId, "project-images.json");
  assertInsideProject(projectRoot, candidate);
  return candidate;
}

function emptyDynamicProjectImageDocument(projectId: string): DynamicProjectImageDocument {
  return {
    version: 1,
    projectId,
    updatedAt: new Date(0).toISOString(),
    images: {},
    instances: {},
  };
}

function parseDynamicProjectImageDocument(raw: string, projectId: string): DynamicProjectImageDocument {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Project image mapping must be an object.");
  }
  const candidate = value as Record<string, unknown>;
  if (
    candidate.version !== 1
    || candidate.projectId !== projectId
    || typeof candidate.updatedAt !== "string"
    || !candidate.images
    || typeof candidate.images !== "object"
    || Array.isArray(candidate.images)
    || !candidate.instances
    || typeof candidate.instances !== "object"
    || Array.isArray(candidate.instances)
  ) {
    throw new Error("Invalid version-1 project image mapping.");
  }
  return value as DynamicProjectImageDocument;
}

async function readDynamicProjectImageDocument(projectRoot: string, projectId: string) {
  const mappingPath = dynamicProjectImageDocumentPath(projectRoot, projectId);
  try {
    return parseDynamicProjectImageDocument(await readFile(mappingPath, "utf8"), projectId);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyDynamicProjectImageDocument(projectId);
    throw error;
  }
}

function validateDynamicImageInstance(
  value: unknown,
  projectId: string,
  requiredImage?: { imageId: string; itemId: string; publicUrl: string },
): Omit<DynamicProjectImageInstance, "updatedAt"> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestError("Dynamic image template instance snapshot is required.", 400);
  }
  const instance = value as Record<string, unknown>;
  const instanceId = validateTemplateStructureId(instance.instanceId, "instanceId");
  if (instance.templateId !== "image-row" && instance.templateId !== "direction-compare") {
    throw new RequestError("Only image-backed dynamic templates can bind project images.", 400);
  }
  const regionId = validateTemplateStructureId(instance.regionId, "regionId");
  const anchorId = typeof instance.anchorId === "string" && instance.anchorId.length <= 256 ? instance.anchorId : "";
  if (!anchorId || anchorId.includes("..") || /[\\]/.test(anchorId)) throw new RequestError("Invalid Image Row anchor ID.", 400);
  if (!instance.content || typeof instance.content !== "object" || Array.isArray(instance.content)) {
    throw new RequestError("Image Row content must be an object.", 400);
  }
  const content = structuredClone(instance.content as Record<string, unknown>);
  if (requiredImage) {
    if (instance.templateId === "image-row") {
      const items = Array.isArray(content.items) ? content.items : null;
      if (!items) throw new RequestError("Image Row items are required.", 400);
      const item = items.find((entry) => entry && typeof entry === "object" && !Array.isArray(entry) && (entry as Record<string, unknown>).id === requiredImage.itemId) as Record<string, unknown> | undefined;
      const image = item?.image && typeof item.image === "object" && !Array.isArray(item.image)
        ? item.image as Record<string, unknown>
        : null;
      if (!item || !image || image.imageId !== requiredImage.imageId || image.publicPath !== requiredImage.publicUrl) {
        throw new RequestError("The Image Row snapshot does not reference the staged image.", 409);
      }
    } else {
      if (requiredImage.itemId !== "leftImage" && requiredImage.itemId !== "rightImage") {
        throw new RequestError(`Invalid Direction Compare image slot: ${JSON.stringify(requiredImage.itemId)}.`, 400);
      }
      const image = content[requiredImage.itemId];
      if (!image || typeof image !== "object" || Array.isArray(image)
        || (image as Record<string, unknown>).imageId !== requiredImage.imageId
        || (image as Record<string, unknown>).publicPath !== requiredImage.publicUrl) {
        throw new RequestError("The Direction Compare snapshot does not reference the staged image.", 409);
      }
    }
  } else if (instance.templateId === "image-row" && !Array.isArray(content.items)) {
    throw new RequestError("Image Row items are required.", 400);
  }
  const order = typeof instance.order === "number" && Number.isInteger(instance.order) && instance.order >= 0
    ? instance.order
    : 0;
  const layoutSettings = instance.layoutSettings && typeof instance.layoutSettings === "object" && !Array.isArray(instance.layoutSettings)
    ? structuredClone(instance.layoutSettings as Record<string, unknown>)
    : undefined;
  return {
    instanceId,
    templateId: instance.templateId,
    regionId,
    anchorId,
    content,
    ...(layoutSettings ? { layoutSettings } : {}),
    order,
  };
}

async function writeDynamicProjectImageDocument(projectRoot: string, document: DynamicProjectImageDocument) {
  const mappingPath = dynamicProjectImageDocumentPath(projectRoot, document.projectId);
  const directory = path.dirname(mappingPath);
  const temporaryPath = path.join(directory, `.project-images-${randomUUID()}.tmp`);
  let original: Buffer | null = null;
  let installed = false;
  await mkdir(directory, { recursive: true });
  try {
    try {
      original = await readFile(mappingPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    parseDynamicProjectImageDocument(await readFile(temporaryPath, "utf8"), document.projectId);
    await rename(temporaryPath, mappingPath);
    installed = true;
    return parseDynamicProjectImageDocument(await readFile(mappingPath, "utf8"), document.projectId);
  } catch (error) {
    if (installed) {
      if (original) {
        const restorePath = path.join(directory, `.project-images-restore-${randomUUID()}.tmp`);
        await writeFile(restorePath, original, { flag: "wx" });
        await rename(restorePath, mappingPath);
      } else {
        await rm(mappingPath, { force: true });
      }
    }
    throw error;
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function createProjectImageRecoverySnapshot(
  projectRoot: string,
  projectId: string,
  before: DynamicProjectImageDocument,
  imageRecords: DynamicProjectImageRecord[],
) {
  const directory = path.resolve(
    projectRoot,
    "backups/recovery/project-images",
    projectId,
    `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}`,
  );
  assertInsideProject(projectRoot, directory);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "mapping-before.json"), `${JSON.stringify(before, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  for (const record of imageRecords) {
    const source = path.resolve(projectRoot, record.sourcePath);
    const publicImage = path.resolve(projectRoot, record.publicPath);
    assertInsideProject(projectRoot, source);
    assertInsideProject(projectRoot, publicImage);
    if (await pathExists(source)) await copyFile(source, path.join(directory, `source-${record.imageId}.${record.format === "jpeg" ? "jpg" : record.format}`));
    if (await pathExists(publicImage)) await copyFile(publicImage, path.join(directory, `public-${record.imageId}.${record.format === "jpeg" ? "jpg" : record.format}`));
  }
  return directory;
}

async function finishProjectImageRecoverySnapshot(directory: string, after: DynamicProjectImageDocument) {
  await writeFile(path.join(directory, "mapping-after.json"), `${JSON.stringify(after, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
}

function projectDocumentReferencesAsset(document: Record<string, unknown>, assetId: string) {
  const visit = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.some(visit);
    if (!value || typeof value !== "object") return false;
    const record = value as Record<string, unknown>;
    if (record.assetId === assetId || record.posterAssetId === assetId) return true;
    return Object.values(record).some(visit);
  };
  return visit(document.sections);
}

function parseProjectCoverDocument(raw: string): ProjectCoverDocument {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Project cover mapping must be an object.");
  }
  const candidate = value as Record<string, unknown>;
  if (
    candidate.version !== 1 ||
    typeof candidate.updatedAt !== "string" ||
    !candidate.covers ||
    typeof candidate.covers !== "object" ||
    Array.isArray(candidate.covers)
  ) {
    throw new Error("Invalid version-1 project cover mapping.");
  }
  return value as ProjectCoverDocument;
}

async function readProjectCoverDocument(projectRoot: string) {
  const mappingPath = projectCoverDocumentPath(projectRoot);
  try {
    return parseProjectCoverDocument(await readFile(mappingPath, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        version: 1,
        updatedAt: new Date(0).toISOString(),
        covers: {},
      } satisfies ProjectCoverDocument;
    }
    throw error;
  }
}

async function verifyStagedImage(projectRoot: string, staged: PersistedImagePair) {
  assertInsideProject(projectRoot, staged.sourceAbsolutePath);
  assertInsideProject(projectRoot, staged.publicAbsolutePath);
  const [source, publicImage] = await Promise.all([
    readFile(staged.sourceAbsolutePath),
    readFile(staged.publicAbsolutePath),
  ]);
  const sourceFormat = detectAndValidateImage(source);
  const publicFormat = detectAndValidateImage(publicImage);
  if (
    sourceFormat !== staged.format ||
    publicFormat !== staged.format ||
    source.length !== staged.sizeBytes ||
    publicImage.length !== staged.sizeBytes ||
    sha256(source) !== staged.sha256 ||
    sha256(publicImage) !== staged.sha256
  ) {
    throw new RequestError("Staged cover verification failed.", 409);
  }
}

async function writeProjectCoverDocument(
  projectRoot: string,
  document: ProjectCoverDocument,
) {
  const mappingPath = projectCoverDocumentPath(projectRoot);
  const mappingDirectory = path.dirname(mappingPath);
  const backupDirectory = path.resolve(
    projectRoot,
    "backups/content-history/project-covers",
  );
  assertInsideProject(projectRoot, backupDirectory);
  await Promise.all([
    mkdir(mappingDirectory, { recursive: true }),
    mkdir(backupDirectory, { recursive: true }),
  ]);

  let original: Buffer | null = null;
  try {
    original = await readFile(mappingPath);
    const backupPath = path.join(
      backupDirectory,
      `project-covers-${Date.now().toString(36)}-${randomUUID()}.json`,
    );
    await writeFile(backupPath, original, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const temporaryPath = path.join(
    mappingDirectory,
    `.project-covers-${randomUUID()}.tmp`,
  );
  const serialized = `${JSON.stringify(document, null, 2)}\n`;
  let installed = false;
  try {
    await writeFile(temporaryPath, serialized, { encoding: "utf8", flag: "wx" });
    const temporaryDocument = parseProjectCoverDocument(
      await readFile(temporaryPath, "utf8"),
    );
    if (temporaryDocument.updatedAt !== document.updatedAt) {
      throw new Error("Temporary project cover mapping verification failed.");
    }
    await rename(temporaryPath, mappingPath);
    installed = true;
    const installedDocument = parseProjectCoverDocument(
      await readFile(mappingPath, "utf8"),
    );
    if (installedDocument.updatedAt !== document.updatedAt) {
      throw new Error("Installed project cover mapping verification failed.");
    }
    return installedDocument;
  } catch (error) {
    if (installed) {
      if (original) {
        const restorePath = path.join(
          mappingDirectory,
          `.project-covers-restore-${randomUUID()}.tmp`,
        );
        await writeFile(restorePath, original, { flag: "wx" });
        await rename(restorePath, mappingPath);
      } else {
        await rm(mappingPath, { force: true });
      }
    }
    throw error;
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

function validateSameOriginRequest(req: IncomingMessage) {
  if (req.headers.origin !== allowedOrigin || req.headers.host !== allowedHost) {
    throw new RequestError("Only same-origin localhost:5173 requests are accepted.", 403);
  }
}

function validateLocalReadRequest(req: IncomingMessage) {
  if (
    req.headers.host !== allowedHost ||
    (req.headers.origin !== undefined && req.headers.origin !== allowedOrigin)
  ) {
    throw new RequestError("Only localhost:5173 requests are accepted.", 403);
  }
}

export function portfolioContentPlugin(): Plugin {
  return {
    name: "portfolio-content-persistence-test",
    apply: "serve",
    configureServer(server: ViteDevServer) {
      const projectRoot = path.resolve(server.config.root);
      const stagedProjectCovers = new Map<string, StagedProjectCover>();
      const stagedProjectBodyAssets = new Map<string, StagedProjectBodyAsset>();
      const stagedDynamicProjectImages = new Map<string, StagedDynamicProjectImage>();
      const stagedPlayableGames = new Map<string, StagedPlayableGame>();
      const stagedPlayableGameFolders = new Map<string, StagedPlayableGameFolder>();
      const stagedPlayableGameCovers = new Map<string, StagedPlayableGameCover>();

      const removeExpiredStages = async () => {
        const cutoff = Date.now() - stagedCoverLifetimeMs;
        for (const [token, staged] of stagedProjectCovers) {
          if (staged.createdAt < cutoff) stagedProjectCovers.delete(token);
        }
        for (const [token, staged] of stagedProjectBodyAssets) {
          if (staged.createdAt < cutoff) stagedProjectBodyAssets.delete(token);
        }
        for (const [token, staged] of stagedDynamicProjectImages) {
          if (staged.createdAt < cutoff) stagedDynamicProjectImages.delete(token);
        }
        for (const [token, staged] of stagedPlayableGames) {
          if (staged.createdAt < cutoff) {
            stagedPlayableGames.delete(token);
            await cleanupStagedPlayableGame(staged);
          }
        }
        for (const [token, staged] of stagedPlayableGameFolders) {
          if (staged.createdAt < cutoff) {
            stagedPlayableGameFolders.delete(token);
            await rm(staged.temporaryRoot, { recursive: true, force: true });
          }
        }
        for (const [token, staged] of stagedPlayableGameCovers) {
          if (staged.createdAt < cutoff) stagedPlayableGameCovers.delete(token);
        }
      };

      server.middlewares.use(playableGameCoverStageEndpoint, async (req, res) => {
        if (req.method !== "POST") { sendJson(res, 405, { error: "Method not allowed." }); return; }
        try {
          validateSameOriginRequest(req);
          const projectId = validateProjectId(req.headers["x-portfolio-project-id"]);
          const body = await readBody(req);
          const format = detectAndValidateImage(body);
          validateRequestMetadata(req, format);
          const image = await persistImagePair(
            projectRoot,
            body,
            format,
            path.posix.join("content/source-assets/playable-games", projectId, "covers"),
            path.posix.join("public/portfolio-assets/playable-games", projectId, "covers"),
            "playable-game-cover",
          );
          await removeExpiredStages();
          const commitToken = randomUUID();
          stagedPlayableGameCovers.set(commitToken, { createdAt: Date.now(), projectId, image });
          sendJson(res, 201, { commitToken, ...toPublicImageResult(image) });
        } catch (error) {
          sendJson(res, error instanceof RequestError ? error.statusCode : 500, { error: error instanceof Error ? error.message : "Unable to stage playable game cover." });
        }
      });

      server.middlewares.use(playableGameCoverCommitEndpoint, async (req, res) => {
        if (req.method !== "POST") { sendJson(res, 405, { error: "Method not allowed." }); return; }
        try {
          validateSameOriginRequest(req);
          const payload = await readJsonBody(req);
          const projectId = validateProjectId(payload.projectId);
          const commitToken = typeof payload.commitToken === "string" ? payload.commitToken : "";
          await removeExpiredStages();
          const staged = stagedPlayableGameCovers.get(commitToken);
          if (!staged || staged.projectId !== projectId) throw new RequestError("Commit token is invalid or expired.", 404);
          await verifyStagedImage(projectRoot, staged.image);
          const current = await readPlayableGameDocument(projectRoot, projectId);
          const record: PlayableGameCoverRecord = {
            coverId: `cover-${randomUUID()}`,
            sourceRelativePath: staged.image.sourceRelativePath,
            publicRelativePath: staged.image.publicRelativePath,
            publicUrl: staged.image.publicUrl,
            sha256: staged.image.sha256,
            format: staged.image.format,
            size: staged.image.sizeBytes,
            createdAt: new Date().toISOString(),
          };
          const installed = await writePlayableGameDocument(projectRoot, { ...current, updatedAt: new Date().toISOString(), covers: [...current.covers, record] });
          if (!installed.covers.some((cover) => cover.coverId === record.coverId && cover.sha256 === record.sha256)) throw new Error("Committed cover mapping could not be verified.");
          stagedPlayableGameCovers.delete(commitToken);
          sendJson(res, 200, { projectId, cover: { coverId: record.coverId, publicUrl: record.publicUrl, format: record.format, size: record.size } });
        } catch (error) {
          sendJson(res, error instanceof RequestError ? error.statusCode : 500, { error: error instanceof Error ? error.message : "Unable to commit playable game cover." });
        }
      });

      // Mirrors projectCoverResolveEndpoint above exactly: the currently
      // bound playable-game launch cover for this project (the last entry in
      // content/projects/<id>/playable-games.json#covers — "last wins" is
      // the same convention a single-current-cover project already uses),
      // re-fetched by productionBundleExport.ts to get real bytes into the
      // export bundle.
      server.middlewares.use(playableGameCoverResolveEndpoint, async (req, res) => {
        if (req.method !== "GET") {
          sendJson(res, 405, { error: "Method not allowed." });
          return;
        }
        try {
          validateLocalReadRequest(req);
          const requestUrl = new URL(req.url ?? "/", allowedOrigin);
          const projectId = validateProjectId(requestUrl.searchParams.get("projectId"));
          const document = await readPlayableGameDocument(projectRoot, projectId);
          const record = document.covers.at(-1) ?? null;
          sendJson(res, 200, {
            projectId,
            cover: record ? { coverId: record.coverId, publicUrl: record.publicUrl, format: record.format, size: record.size } : null,
          });
        } catch (error) {
          sendJson(res, error instanceof RequestError ? error.statusCode : 500, { error: error instanceof Error ? error.message : "Unable to read playable game cover." });
        }
      });

      server.middlewares.use(playableGameListEndpoint, async (req, res) => {
        if (req.method !== "GET") { sendJson(res, 405, { error: "Method not allowed." }); return; }
        try {
          validateLocalReadRequest(req);
          const requestUrl = new URL(req.url ?? "/", allowedOrigin);
          const projectId = validateProjectId(requestUrl.searchParams.get("projectId"));
          const document = await readPlayableGameDocument(projectRoot, projectId);
          sendJson(res, 200, {
            projectId,
            games: document.games.map(toBrowserPlayableGame),
          });
        } catch (error) {
          sendJson(res, error instanceof RequestError ? error.statusCode : 500, { error: error instanceof Error ? error.message : "Unable to list playable games." });
        }
      });

      server.middlewares.use(playableGameBindEndpoint, async (req, res) => {
        if (req.method !== "POST") { sendJson(res, 405, { error: "Method not allowed." }); return; }
        try {
          validateSameOriginRequest(req);
          const payload = await readJsonBody(req);
          const projectId = validateProjectId(payload.projectId);
          const gameId = validateAssetId(payload.gameId);
          const document = await readPlayableGameDocument(projectRoot, projectId);
          const game = document.games.find((candidate) => candidate.gameId === gameId);
          if (!game) throw new RequestError("The selected game does not exist in this project.", 404);
          await verifyMappedPlayableGame(projectRoot, projectId, game);
          sendJson(res, 200, { projectId, game: toBrowserPlayableGame(game) });
        } catch (error) {
          const statusCode = error instanceof RequestError ? error.statusCode : (error as NodeJS.ErrnoException).code === "ENOENT" ? 404 : 500;
          sendJson(res, statusCode, { error: error instanceof Error ? error.message : "Unable to bind playable game." });
        }
      });

      server.middlewares.use(playableGameFolderStartEndpoint, async (req, res) => {
        if (req.method !== "POST") { sendJson(res, 405, { error: "Method not allowed." }); return; }
        try {
          validateSameOriginRequest(req);
          const payload = await readJsonBody(req, maximumProjectDocumentJsonBytes);
          const projectId = validateProjectId(payload.projectId);
          const { originalFileName, manifest } = parsePlayableGameFolderManifest(payload);
          await removeExpiredStages();
          const uploadToken = randomUUID();
          const temporaryRoot = path.resolve(projectRoot, "backups/tmp/playable-game-import", `folder-${uploadToken}`);
          const uploadRoot = path.join(temporaryRoot, "uploaded");
          assertInsideProject(projectRoot, temporaryRoot);
          await mkdir(uploadRoot, { recursive: true });
          stagedPlayableGameFolders.set(uploadToken, {
            createdAt: Date.now(), projectId, originalFileName, temporaryRoot, uploadRoot, manifest, uploadedIndexes: new Set(),
          });
          sendJson(res, 201, { uploadToken, fileCount: manifest.length });
        } catch (error) {
          sendJson(res, error instanceof RequestError ? error.statusCode : 500, { error: error instanceof Error ? error.message : "Unable to start game folder upload." });
        }
      });

      server.middlewares.use(playableGameFolderFileEndpoint, async (req, res) => {
        if (req.method !== "POST") { sendJson(res, 405, { error: "Method not allowed." }); return; }
        try {
          validateSameOriginRequest(req);
          const tokenHeader = req.headers["x-portfolio-upload-token"];
          const indexHeader = req.headers["x-portfolio-file-index"];
          const uploadToken = Array.isArray(tokenHeader) ? tokenHeader[0] : tokenHeader;
          const fileIndex = Number(Array.isArray(indexHeader) ? indexHeader[0] : indexHeader);
          await removeExpiredStages();
          const upload = typeof uploadToken === "string" ? stagedPlayableGameFolders.get(uploadToken) : undefined;
          if (!upload) throw new RequestError("Folder upload token is invalid or expired.", 404);
          if (!Number.isSafeInteger(fileIndex) || fileIndex < 0 || fileIndex >= upload.manifest.length) throw new RequestError("Folder file index is invalid.", 400);
          if (upload.uploadedIndexes.has(fileIndex)) throw new RequestError("This game file was already uploaded.", 409);
          const entry = upload.manifest[fileIndex];
          const destination = path.resolve(upload.uploadRoot, entry.relativePath);
          if (!destination.startsWith(`${upload.uploadRoot}${path.sep}`)) throw new RequestError("Game folder path escaped the temporary directory.", 400);
          await writeRequestFile(req, destination, entry.size);
          upload.uploadedIndexes.add(fileIndex);
          sendJson(res, 200, { received: fileIndex });
        } catch (error) {
          sendJson(res, error instanceof RequestError ? error.statusCode : 500, { error: error instanceof Error ? error.message : "Unable to upload game folder file." });
        }
      });

      server.middlewares.use(playableGameFolderFinishEndpoint, async (req, res) => {
        if (req.method !== "POST") { sendJson(res, 405, { error: "Method not allowed." }); return; }
        let uploadToken = "";
        let upload: StagedPlayableGameFolder | undefined;
        let staged: Omit<StagedPlayableGame, "createdAt" | "projectId"> | undefined;
        let commitToken = "";
        try {
          validateSameOriginRequest(req);
          const payload = await readJsonBody(req);
          const projectId = validateProjectId(payload.projectId);
          uploadToken = typeof payload.uploadToken === "string" ? payload.uploadToken : "";
          await removeExpiredStages();
          upload = stagedPlayableGameFolders.get(uploadToken);
          if (!upload || upload.projectId !== projectId) throw new RequestError("Folder upload token is invalid or expired.", 404);
          const siteRoot = await materializePlayableGameFolder(upload);
          staged = await installStagedPlayableWebsite(projectRoot, projectId, upload.originalFileName, siteRoot);
          commitToken = randomUUID();
          stagedPlayableGames.set(commitToken, { createdAt: Date.now(), projectId, ...staged });
          stagedPlayableGameFolders.delete(uploadToken);
          await rm(upload.temporaryRoot, { recursive: true, force: true });
          sendJson(res, 201, { commitToken, ...toBrowserPlayableGame(staged.record) });
        } catch (error) {
          if (staged) {
            stagedPlayableGames.delete(commitToken);
            await cleanupStagedPlayableGame({ createdAt: Date.now(), projectId: upload?.projectId ?? "", ...staged });
          }
          if (upload) {
            stagedPlayableGameFolders.delete(uploadToken);
            await rm(upload.temporaryRoot, { recursive: true, force: true });
          }
          sendJson(res, error instanceof RequestError ? error.statusCode : 500, { error: error instanceof Error ? error.message : "Unable to finish game folder upload." });
        }
      });

      server.middlewares.use(playableGameAbortEndpoint, async (req, res) => {
        if (req.method !== "POST") { sendJson(res, 405, { error: "Method not allowed." }); return; }
        try {
          validateSameOriginRequest(req);
          const payload = await readJsonBody(req);
          const projectId = validateProjectId(payload.projectId);
          const token = typeof payload.token === "string" ? payload.token : "";
          const stagedGame = stagedPlayableGames.get(token);
          if (stagedGame?.projectId === projectId) {
            stagedPlayableGames.delete(token);
            await cleanupStagedPlayableGame(stagedGame);
          }
          const folderUpload = stagedPlayableGameFolders.get(token);
          if (folderUpload?.projectId === projectId) {
            stagedPlayableGameFolders.delete(token);
            await rm(folderUpload.temporaryRoot, { recursive: true, force: true });
          }
          sendJson(res, 200, { aborted: true });
        } catch (error) {
          sendJson(res, error instanceof RequestError ? error.statusCode : 500, { error: error instanceof Error ? error.message : "Unable to cancel playable game import." });
        }
      });

      server.middlewares.use(playableGameStageEndpoint, async (req, res) => {
        if (req.method !== "POST") { sendJson(res, 405, { error: "Method not allowed." }); return; }
        try {
          validateSameOriginRequest(req);
          const projectId = validateProjectId(req.headers["x-portfolio-project-id"]);
          const fileNameHeader = req.headers["x-portfolio-file-name"];
          const originalFileName = Array.isArray(fileNameHeader) ? fileNameHeader[0] : fileNameHeader;
          if (!originalFileName || !originalFileName.toLowerCase().endsWith(".zip") || /[\\/]/.test(originalFileName)) throw new RequestError("A safe ZIP file name is required.", 400);
          const zip = await readBodyWithLimit(req, maximumGameZipBytes, "Game ZIP");
          if (zip.readUInt32LE(0) !== 0x04034b50) throw new RequestError("Game build is not a ZIP file.", 400);
          const staged = await stagePlayableGameBuild(projectRoot, projectId, originalFileName, zip);
          await removeExpiredStages();
          const commitToken = randomUUID();
          stagedPlayableGames.set(commitToken, { createdAt: Date.now(), projectId, ...staged });
          sendJson(res, 201, { commitToken, ...toBrowserPlayableGame(staged.record) });
        } catch (error) {
          sendJson(res, error instanceof RequestError ? error.statusCode : 500, { error: error instanceof Error ? error.message : "Unable to stage playable game." });
        }
      });

      server.middlewares.use(playableGameCommitEndpoint, async (req, res) => {
        if (req.method !== "POST") { sendJson(res, 405, { error: "Method not allowed." }); return; }
        let commitToken = "";
        let staged: StagedPlayableGame | undefined;
        try {
          validateSameOriginRequest(req);
          const payload = await readJsonBody(req);
          const projectId = validateProjectId(payload.projectId);
          commitToken = typeof payload.commitToken === "string" ? payload.commitToken : "";
          await removeExpiredStages();
          staged = stagedPlayableGames.get(commitToken);
          if (!staged || staged.projectId !== projectId) throw new RequestError("Commit token is invalid or expired.", 404);
          await access(staged.sourceAbsolutePath); await access(staged.publicAbsolutePath);
          const game = await commitPlayableGameRecord(projectRoot, projectId, staged.record);
          stagedPlayableGames.delete(commitToken);
          sendJson(res, 200, { projectId, game: toBrowserPlayableGame(game) });
        } catch (error) {
          if (staged) {
            stagedPlayableGames.delete(commitToken);
            const installed = await readPlayableGameDocument(projectRoot, staged.projectId).then((document) => document.games.some((game) => game.gameId === staged?.record.gameId)).catch(() => false);
            if (!installed) await cleanupStagedPlayableGame(staged);
          }
          sendJson(res, error instanceof RequestError ? error.statusCode : 500, { error: error instanceof Error ? error.message : "Unable to commit playable game." });
        }
      });

      server.middlewares.use(endpoint, async (req, res) => {
        if (req.method !== "POST") {
          sendJson(res, 405, { error: "Method not allowed." });
          return;
        }

        try {
          validateSameOriginRequest(req);
          const body = await readBody(req);
          const format = detectAndValidateImage(body);
          validateRequestMetadata(req, format);
          const result = await persistTestImage(projectRoot, body, format);
          sendJson(res, 201, result);
        } catch (error) {
          const statusCode = error instanceof RequestError ? error.statusCode : 500;
          sendJson(res, statusCode, {
            error:
              error instanceof Error
                ? error.message
                : "Unable to persist the test image.",
          });
        }
      });

      server.middlewares.use(projectCoverStageEndpoint, async (req, res) => {
        if (req.method !== "POST") {
          sendJson(res, 405, { error: "Method not allowed." });
          return;
        }
        try {
          validateSameOriginRequest(req);
          const body = await readBody(req);
          const format = detectAndValidateImage(body);
          validateRequestMetadata(req, format);
          const image = await persistImagePair(
            projectRoot,
            body,
            format,
            "content/source-assets/project-covers",
            "public/portfolio-assets/project-covers",
            "project-cover",
          );
          await removeExpiredStages();
          const commitToken = randomUUID();
          stagedProjectCovers.set(commitToken, { createdAt: Date.now(), image });
          sendJson(res, 201, { commitToken, ...toPublicImageResult(image) });
        } catch (error) {
          const statusCode = error instanceof RequestError ? error.statusCode : 500;
          sendJson(res, statusCode, {
            error:
              error instanceof Error ? error.message : "Unable to stage project cover.",
          });
        }
      });

      server.middlewares.use(projectCoverCommitEndpoint, async (req, res) => {
        if (req.method !== "POST") {
          sendJson(res, 405, { error: "Method not allowed." });
          return;
        }
        try {
          validateSameOriginRequest(req);
          const payload = await readJsonBody(req);
          const projectId = validateProjectId(payload.projectId);
          const commitToken = payload.commitToken;
          if (typeof commitToken !== "string" || !commitToken) {
            throw new RequestError("Commit token is required.", 400);
          }
          await removeExpiredStages();
          const staged = stagedProjectCovers.get(commitToken);
          if (!staged) {
            throw new RequestError("Commit token is invalid or expired.", 404);
          }
          await verifyStagedImage(projectRoot, staged.image);
          const current = await readProjectCoverDocument(projectRoot);
          const updatedAt = new Date().toISOString();
          const record: ProjectCoverRecord = {
            publicRelativePath: staged.image.publicRelativePath,
            publicUrl: staged.image.publicUrl,
            sourceRelativePath: staged.image.sourceRelativePath,
            sha256: staged.image.sha256,
            format: staged.image.format,
            size: staged.image.sizeBytes,
            updatedAt,
          };
          const next: ProjectCoverDocument = {
            ...current,
            updatedAt,
            covers: { ...current.covers, [projectId]: record },
          };
          const installed = await writeProjectCoverDocument(projectRoot, next);
          const verifiedRecord = installed.covers[projectId];
          if (!verifiedRecord || verifiedRecord.sha256 !== staged.image.sha256) {
            throw new Error("Committed project cover mapping could not be verified.");
          }
          stagedProjectCovers.delete(commitToken);
          sendJson(res, 200, { projectId, record: verifiedRecord });
        } catch (error) {
          const statusCode = error instanceof RequestError ? error.statusCode : 500;
          sendJson(res, statusCode, {
            error:
              error instanceof Error ? error.message : "Unable to commit project cover.",
          });
        }
      });

      server.middlewares.use(projectCoverResolveEndpoint, async (req, res) => {
        if (req.method !== "GET") {
          sendJson(res, 405, { error: "Method not allowed." });
          return;
        }
        try {
          validateLocalReadRequest(req);
          const requestUrl = new URL(req.url ?? "/", allowedOrigin);
          const projectId = validateProjectId(requestUrl.searchParams.get("projectId"));
          const document = await readProjectCoverDocument(projectRoot);
          sendJson(res, 200, { projectId, record: document.covers[projectId] ?? null });
        } catch (error) {
          const statusCode = error instanceof RequestError ? error.statusCode : 500;
          sendJson(res, statusCode, {
            error:
              error instanceof Error ? error.message : "Unable to read project cover.",
          });
        }
      });

      server.middlewares.use(projectImageStageEndpoint, async (req, res) => {
        if (req.method !== "POST") { sendJson(res, 405, { error: "Method not allowed." }); return; }
        try {
          validateSameOriginRequest(req);
          const projectId = validateProjectId(req.headers["x-portfolio-project-id"]);
          const instanceId = validateTemplateStructureId(req.headers["x-portfolio-instance-id"], "instanceId");
          const itemId = validateTemplateStructureId(req.headers["x-portfolio-item-id"], "itemId");
          const encodedName = typeof req.headers["x-portfolio-original-file-name"] === "string"
            ? req.headers["x-portfolio-original-file-name"]
            : "image";
          const originalFileName = decodeURIComponent(encodedName);
          if (!originalFileName || originalFileName.length > 255 || /[\\/]/.test(originalFileName) || originalFileName.includes("..")) {
            throw new RequestError("Invalid original image filename.", 400);
          }
          const body = await readBody(req);
          const format = detectImageOrThrowWithDiagnostics(req, body);
          const imageId = `image-${randomUUID()}`;
          const image = await persistDynamicProjectImagePair(projectRoot, body, format, projectId, imageId);
          const dimensions = readImageDimensions(body, format);
          await removeExpiredStages();
          const commitToken = randomUUID();
          stagedDynamicProjectImages.set(commitToken, {
            createdAt: Date.now(),
            projectId,
            instanceId,
            itemId,
            imageId,
            originalFileName,
            image,
            dimensions,
          });
          sendJson(res, 201, { commitToken, projectId, instanceId, itemId, imageId, ...toPublicImageResult(image), ...dimensions });
        } catch (error) {
          sendJson(res, error instanceof RequestError ? error.statusCode : 500, { error: error instanceof Error ? error.message : "Unable to stage project image." });
        }
      });

      server.middlewares.use(projectImageCommitEndpoint, async (req, res) => {
        if (req.method !== "POST") { sendJson(res, 405, { error: "Method not allowed." }); return; }
        let stagedForCleanup: StagedDynamicProjectImage | undefined;
        let commitTokenForCleanup = "";
        let mappingInstalled = false;
        try {
          validateSameOriginRequest(req);
          const payload = await readJsonBody(req, maximumProjectDocumentJsonBytes);
          const projectId = validateProjectId(payload.projectId);
          const commitToken = typeof payload.commitToken === "string" ? payload.commitToken : "";
          commitTokenForCleanup = commitToken;
          const itemId = validateTemplateStructureId(payload.itemId, "itemId");
          await removeExpiredStages();
          const staged = stagedDynamicProjectImages.get(commitToken);
          if (!staged || staged.projectId !== projectId) throw new RequestError("Commit token is invalid or expired.", 404);
          stagedForCleanup = staged;
          if (staged.itemId !== itemId) {
            throw new RequestError(`Invalid Image Row itemId: ${JSON.stringify(itemId)}. It does not match the staged itemId ${JSON.stringify(staged.itemId)}.`, 409);
          }
          await verifyStagedImage(projectRoot, staged.image);
          const instance = validateDynamicImageInstance(payload.instance, projectId, {
            imageId: staged.imageId,
            itemId,
            publicUrl: staged.image.publicUrl,
          });
          if (instance.instanceId !== staged.instanceId) {
            throw new RequestError(`Invalid dynamic image instanceId: ${JSON.stringify(instance.instanceId)}. It does not match the staged instanceId ${JSON.stringify(staged.instanceId)}.`, 409);
          }
          const updatedAt = new Date().toISOString();
          const record: DynamicProjectImageRecord = {
            imageId: staged.imageId,
            projectId,
            instanceId: instance.instanceId,
            templateId: instance.templateId,
            itemId,
            originalFileName: staged.originalFileName,
            sourcePath: staged.image.sourceRelativePath,
            publicPath: staged.image.publicRelativePath,
            publicUrl: staged.image.publicUrl,
            sha256: staged.image.sha256,
            format: staged.image.format,
            size: staged.image.sizeBytes,
            width: staged.dimensions.width,
            height: staged.dimensions.height,
            createdAt: updatedAt,
          };
          const current = await readDynamicProjectImageDocument(projectRoot, projectId);
          const replacedRecords = Object.values(current.images).filter((candidate) => (
            candidate.instanceId === instance.instanceId && candidate.itemId === itemId
          ));
          const images = { ...current.images };
          for (const replaced of replacedRecords) delete images[replaced.imageId];
          images[record.imageId] = record;
          const recoveryDirectory = await createProjectImageRecoverySnapshot(
            projectRoot,
            projectId,
            current,
            [...replacedRecords, record],
          );
          const next: DynamicProjectImageDocument = {
            ...current,
            updatedAt,
            images,
            instances: { ...current.instances, [instance.instanceId]: { ...instance, updatedAt } },
          };
          const installed = await writeDynamicProjectImageDocument(projectRoot, next);
          mappingInstalled = true;
          stagedDynamicProjectImages.delete(commitToken);
          const verified = installed.images[record.imageId];
          if (!verified || verified.sha256 !== record.sha256 || verified.publicUrl !== record.publicUrl) {
            throw new Error("Committed project image mapping could not be verified.");
          }
          await finishProjectImageRecoverySnapshot(recoveryDirectory, installed);
          stagedDynamicProjectImages.delete(commitToken);
          sendJson(res, 200, { projectId, image: verified, mapping: installed });
        } catch (error) {
          if (stagedForCleanup && !mappingInstalled) {
            stagedDynamicProjectImages.delete(commitTokenForCleanup);
            await Promise.all([
              rm(stagedForCleanup.image.sourceAbsolutePath, { force: true }),
              rm(stagedForCleanup.image.publicAbsolutePath, { force: true }),
            ]).catch(() => undefined);
          }
          sendJson(res, error instanceof RequestError ? error.statusCode : 500, { error: error instanceof Error ? error.message : "Unable to commit project image." });
        }
      });

      server.middlewares.use(projectImageAbortEndpoint, async (req, res) => {
        if (req.method !== "POST") { sendJson(res, 405, { error: "Method not allowed." }); return; }
        try {
          validateSameOriginRequest(req);
          const payload = await readJsonBody(req);
          const projectId = validateProjectId(payload.projectId);
          const commitToken = typeof payload.commitToken === "string" ? payload.commitToken : "";
          const staged = stagedDynamicProjectImages.get(commitToken);
          if (!staged || staged.projectId !== projectId) throw new RequestError("Staging token is invalid or expired.", 404);
          stagedDynamicProjectImages.delete(commitToken);
          await Promise.all([
            rm(staged.image.sourceAbsolutePath, { force: true }),
            rm(staged.image.publicAbsolutePath, { force: true }),
          ]);
          sendJson(res, 200, { projectId, aborted: true });
        } catch (error) {
          sendJson(res, error instanceof RequestError ? error.statusCode : 500, { error: error instanceof Error ? error.message : "Unable to cancel the staged project image." });
        }
      });

      server.middlewares.use(projectImageMappingEndpoint, async (req, res) => {
        if (req.method !== "GET") { sendJson(res, 405, { error: "Method not allowed." }); return; }
        try {
          validateLocalReadRequest(req);
          const requestUrl = new URL(req.url ?? "/", allowedOrigin);
          const projectId = validateProjectId(requestUrl.searchParams.get("projectId"));
          sendJson(res, 200, { projectId, mapping: await readDynamicProjectImageDocument(projectRoot, projectId) });
        } catch (error) {
          sendJson(res, error instanceof RequestError ? error.statusCode : 500, { error: error instanceof Error ? error.message : "Unable to read project image mapping." });
        }
      });

      server.middlewares.use(projectImageUnbindEndpoint, async (req, res) => {
        if (req.method !== "POST") { sendJson(res, 405, { error: "Method not allowed." }); return; }
        try {
          validateSameOriginRequest(req);
          const payload = await readJsonBody(req, maximumProjectDocumentJsonBytes);
          const projectId = validateProjectId(payload.projectId);
          const instanceId = validateTemplateStructureId(payload.instanceId, "instanceId");
          if (!Array.isArray(payload.imageIds)) throw new RequestError("Image IDs must be an array.", 400);
          const imageIds = payload.imageIds.map((value) => validateProjectImageId(value));
          const current = await readDynamicProjectImageDocument(projectRoot, projectId);
          const records = imageIds.map((imageId) => current.images[imageId]).filter(Boolean);
          if (records.some((record) => record.projectId !== projectId || record.instanceId !== instanceId)) {
            throw new RequestError("An image does not belong to this project instance.", 409);
          }
          const nextInstance = payload.instance === null || payload.instance === undefined
            ? null
            : validateDynamicImageInstance(payload.instance, projectId);
          if (nextInstance && nextInstance.instanceId !== instanceId) throw new RequestError("Dynamic image template instance ID cannot change.", 409);
          const recoveryDirectory = await createProjectImageRecoverySnapshot(projectRoot, projectId, current, records);
          const images = { ...current.images };
          for (const imageId of imageIds) delete images[imageId];
          const instances = { ...current.instances };
          if (nextInstance) instances[instanceId] = { ...nextInstance, updatedAt: new Date().toISOString() };
          else delete instances[instanceId];
          const installed = await writeDynamicProjectImageDocument(projectRoot, {
            ...current,
            updatedAt: new Date().toISOString(),
            images,
            instances,
          });
          await finishProjectImageRecoverySnapshot(recoveryDirectory, installed);
          sendJson(res, 200, { projectId, mapping: installed });
        } catch (error) {
          sendJson(res, error instanceof RequestError ? error.statusCode : 500, { error: error instanceof Error ? error.message : "Unable to remove project image reference." });
        }
      });

      server.middlewares.use(projectBodyStageEndpoint, async (req, res) => {
        if (req.method !== "POST") { sendJson(res, 405, { error: "Method not allowed." }); return; }
        try {
          validateSameOriginRequest(req);
          const projectId = validateProjectId(req.headers["x-portfolio-project-id"]);
          const assetId = validateAssetId(req.headers["x-portfolio-asset-id"]);
          const body = await readBody(req);
          const format = detectAndValidateImage(body);
          validateRequestMetadata(req, format);
          const image = await persistImagePair(
            projectRoot,
            body,
            format,
            path.posix.join("content/source-assets/project-body", projectId),
            path.posix.join("public/portfolio-assets/project-body", projectId),
            "project-body",
          );
          const dimensions = readImageDimensions(body, format);
          await removeExpiredStages();
          const commitToken = randomUUID();
          stagedProjectBodyAssets.set(commitToken, { createdAt: Date.now(), projectId, assetId, image, dimensions });
          sendJson(res, 201, { commitToken, assetId, ...toPublicImageResult(image), ...dimensions });
        } catch (error) {
          sendJson(res, error instanceof RequestError ? error.statusCode : 500, { error: error instanceof Error ? error.message : "Unable to stage project body image." });
        }
      });

      server.middlewares.use(projectBodyCommitEndpoint, async (req, res) => {
        if (req.method !== "POST") { sendJson(res, 405, { error: "Method not allowed." }); return; }
        try {
          validateSameOriginRequest(req);
          const payload = await readJsonBody(req, maximumProjectDocumentJsonBytes);
          const projectId = validateProjectId(payload.projectId);
          const document = validateProjectDocumentPayload(payload.document, projectId);
          if (!Array.isArray(payload.assets)) throw new RequestError("Staged assets must be an array.", 400);
          await removeExpiredStages();
          const stagedEntries = payload.assets.map((entry) => {
            if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new RequestError("Invalid staged asset entry.", 400);
            const candidate = entry as Record<string, unknown>;
            const assetId = validateAssetId(candidate.assetId);
            if (typeof candidate.commitToken !== "string") throw new RequestError("Commit token is required.", 400);
            const staged = stagedProjectBodyAssets.get(candidate.commitToken);
            if (!staged || staged.projectId !== projectId || staged.assetId !== assetId) throw new RequestError("Commit token is invalid or does not match this asset.", 404);
            if (!projectDocumentReferencesAsset(document, assetId)) throw new RequestError("The project document does not reference a staged asset.", 409);
            return { token: candidate.commitToken, staged };
          });
          await Promise.all(stagedEntries.map(({ staged }) => verifyStagedImage(projectRoot, staged.image)));
          const current = await readProjectBodyDiskDocument(projectRoot, projectId);
          const updatedAt = new Date().toISOString();
          const assets = { ...(current?.assets ?? {}) };
          for (const { staged } of stagedEntries) {
            assets[staged.assetId] = {
              assetId: staged.assetId,
              sourceRelativePath: staged.image.sourceRelativePath,
              publicRelativePath: staged.image.publicRelativePath,
              publicUrl: staged.image.publicUrl,
              sha256: staged.image.sha256,
              format: staged.image.format,
              size: staged.image.sizeBytes,
              width: staged.dimensions.width,
              height: staged.dimensions.height,
              updatedAt,
            };
          }
          const installed = await writeProjectBodyDiskDocument(projectRoot, { version: 1, projectId, updatedAt, document: { ...document, updatedAt }, assets });
          for (const { token } of stagedEntries) stagedProjectBodyAssets.delete(token);
          sendJson(res, 200, installed);
        } catch (error) {
          sendJson(res, error instanceof RequestError ? error.statusCode : 500, { error: error instanceof Error ? error.message : "Unable to commit project body images." });
        }
      });

      server.middlewares.use(projectBodyDocumentEndpoint, async (req, res) => {
        try {
          if (req.method === "GET") {
            validateLocalReadRequest(req);
            const requestUrl = new URL(req.url ?? "/", allowedOrigin);
            const projectId = validateProjectId(requestUrl.searchParams.get("projectId"));
            sendJson(res, 200, { projectId, record: await readProjectBodyDiskDocument(projectRoot, projectId) });
            return;
          }
          if (req.method === "POST") {
            validateSameOriginRequest(req);
            const payload = await readJsonBody(req, maximumProjectDocumentJsonBytes);
            const projectId = validateProjectId(payload.projectId);
            const document = validateProjectDocumentPayload(payload.document, projectId);
            const current = await readProjectBodyDiskDocument(projectRoot, projectId);
            const updatedAt = new Date().toISOString();
            const installed = await writeProjectBodyDiskDocument(projectRoot, { version: 1, projectId, updatedAt, document: { ...document, updatedAt }, assets: current?.assets ?? {} });
            sendJson(res, 200, installed);
            return;
          }
          sendJson(res, 405, { error: "Method not allowed." });
        } catch (error) {
          sendJson(res, error instanceof RequestError ? error.statusCode : 500, { error: error instanceof Error ? error.message : "Unable to access the project body document." });
        }
      });

      server.middlewares.use(dynamicProjectRecoveryEndpoint, async (req, res) => {
        if (req.method !== "POST") {
          sendJson(res, 405, { error: "Method not allowed." });
          return;
        }
        try {
          validateSameOriginRequest(req);
          const payload = await readJsonBody(req, maximumProjectDocumentJsonBytes);
          const projectId = validateProjectId(payload.projectId);
          const recovery = validateDynamicProjectRecoveryPayload(payload, projectId);
          const result = await writeDynamicProjectRecovery(projectRoot, projectId, recovery);
          sendJson(res, 201, { projectId, ...result });
        } catch (error) {
          sendJson(res, error instanceof RequestError ? error.statusCode : 500, {
            error: error instanceof Error ? error.message : "Unable to create the project recovery file.",
          });
        }
      });
    },
  };
}
