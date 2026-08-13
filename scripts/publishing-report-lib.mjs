import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const LAUNCHER_REPORT_PATH = "output/publishing-launcher-report.json";

const ACTIONS = {
  DISCOVERED_UNREGISTERED_SOURCE_FAMILY: "Register this source family in the publishing registry.",
  FORBIDDEN_PUBLISHED_REFERENCE: "Replace the local, blob, or development-only reference with a registered publishable source.",
  MISSING_GAME_EXPERIENCE_COVER: "Restore or select the configured Game Experience cover before publishing.",
  MISSING_PLAYABLE_BUILD: "Restore the registered playable build files before publishing.",
  MISSING_PLAYABLE_COVER: "Restore or select the registered playable cover before publishing.",
  MISSING_PROJECT_IMAGE: "Restore the mapped project image file before publishing.",
  MISSING_REFERENCED_ASSET: "Restore the referenced asset or remove its reference explicitly.",
  PUBLISHED_FILE_NOT_IN_OUTPUT: "Ensure the responsible registered source adapter collects this file.",
  UNREGISTERED_BUNDLE_ASSET: "Register the asset source before publishing.",
};

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().filter((key) => key !== "generatedAt").map((key) => [key, stableJson(value[key])]));
}

function equalJson(left, right) {
  return JSON.stringify(stableJson(left)) === JSON.stringify(stableJson(right));
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function sameBytes(file, bytes) {
  try {
    const current = await readFile(file);
    if (current.byteLength !== bytes.byteLength) return false;
    return createHash("sha256").update(current).digest("hex") === createHash("sha256").update(bytes).digest("hex");
  } catch {
    return false;
  }
}

function projectTitle(catalog, projectId) {
  const project = catalog?.[projectId];
  return project?.titleZh || project?.titleEn || projectId || "Portfolio";
}

function projectIdFromIssue(issue, manifest) {
  const haystack = `${issue.sourcePath ?? ""} ${issue.message ?? ""}`;
  return manifest.projects.map((project) => project.projectId).find((projectId) => haystack.includes(projectId)) ?? "";
}

function blockedItems(manifest, catalog) {
  return manifest.issues.filter((issue) => issue.severity === "error").map((issue, index) => {
    const projectId = projectIdFromIssue(issue, manifest);
    return {
      id: `blocked:${issue.code}:${index}`,
      projectId,
      title: projectId ? projectTitle(catalog, projectId) : issue.sourceAdapterId,
      category: issue.sourceAdapterId,
      status: "BLOCKED",
      description: issue.message,
      sourceAdapterIds: [issue.sourceAdapterId],
      sourcePath: issue.sourcePath ?? "",
      action: ACTIONS[issue.code] ?? "Resolve this publishing preflight error and run the check again.",
    };
  });
}

function counts(items) {
  return {
    new: items.filter((item) => item.status === "NEW").length,
    updated: items.filter((item) => item.status === "UPDATED").length,
    unchanged: items.filter((item) => item.status === "UNCHANGED").length,
    blocked: items.filter((item) => item.status === "BLOCKED").length,
    published: items.filter((item) => item.status === "PUBLISHED").length,
    failed: items.filter((item) => item.status === "FAILED").length,
  };
}

async function writeReport(root, report) {
  const file = path.join(root, LAUNCHER_REPORT_PATH);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

export async function writeBlockedPublishReport({ root, manifest, catalog = {}, productionUrl }) {
  const items = blockedItems(manifest, catalog);
  return writeReport(root, {
    version: 1,
    generatedAt: new Date().toISOString(),
    phase: "preflight",
    outcome: "blocked",
    productionUrl,
    counts: counts(items),
    items,
  });
}

function combineStatus(contentExists, contentChanged, assetStates) {
  if (!contentExists && assetStates.includes("NEW")) return "NEW";
  if (contentChanged || assetStates.includes("UPDATED") || assetStates.includes("NEW")) return contentExists ? "UPDATED" : "NEW";
  return "UNCHANGED";
}

export async function writePublishPlanReport({ root, manifest, output, uiPractice, assets, productionUrl }) {
  const currentOutput = await readJson(path.join(root, "src/data/publishedPortfolio.json"), {});
  const currentUiPractice = await readJson(path.join(root, "src/data/uiPracticeMetadata.json"), null);
  const assetState = new Map();
  for (const asset of assets) {
    let state = "NEW";
    try {
      await readFile(path.join(root, asset.relativePath));
      state = await sameBytes(path.join(root, asset.relativePath), asset.bytes) ? "UNCHANGED" : "UPDATED";
    } catch {
      state = "NEW";
    }
    assetState.set(`${asset.sourceAdapterId}\u0000${asset.sourceId}`, state);
  }

  const statesFor = (adapterIds, projectId = "") => manifest.assets
    .filter((asset) => adapterIds.includes(asset.sourceAdapterId) && (!projectId || asset.projectId === projectId || asset.assetId === projectId))
    .map((asset) => assetState.get(`${asset.sourceAdapterId}\u0000${asset.assetId}`) ?? (asset.status === "missing" ? "UPDATED" : "UNCHANGED"));
  const items = [];
  const projectIds = manifest.projects.map((project) => project.projectId);
  for (const projectId of projectIds) {
    const title = projectTitle(output.projectCatalog, projectId);
    const currentMetadata = currentOutput.projectCatalog?.[projectId];
    items.push({
      id: `${projectId}:metadata`, projectId, title, category: "Project metadata", sourceAdapterIds: ["project-catalog"],
      status: !currentMetadata ? "NEW" : equalJson(currentMetadata, output.projectCatalog?.[projectId]) ? "UNCHANGED" : "UPDATED",
      description: "Project title, summary, category, dates, visibility and archive metadata.",
    });

    const currentDraft = currentOutput.drafts?.[projectId];
    const currentDocument = currentOutput.projectDocuments?.documents?.[projectId];
    const nextDraft = output.drafts?.[projectId];
    const nextDocument = output.projectDocuments?.documents?.[projectId];
    const hasBody = nextDraft !== undefined || nextDocument !== undefined;
    if (hasBody) items.push({
      id: `${projectId}:body`, projectId, title, category: "Project body", sourceAdapterIds: ["dynamic-project-drafts", "project-documents"],
      status: currentDraft === undefined && currentDocument === undefined ? "NEW" : equalJson([currentDraft, currentDocument], [nextDraft, nextDocument]) ? "UNCHANGED" : "UPDATED",
      description: "Project narrative, template instances, order and layout settings.",
    });

    if (output.covers?.[projectId]) {
      const coverStates = statesFor(["project-covers-indexeddb", "project-covers-disk"], projectId);
      items.push({
        id: `${projectId}:cover`, projectId, title, category: "Project cover", sourceAdapterIds: ["project-covers-indexeddb", "project-covers-disk"],
        status: combineStatus(Boolean(currentOutput.covers?.[projectId]), currentOutput.covers?.[projectId] !== output.covers[projectId], coverStates),
        description: "Archive and project header cover image.",
      });
    }

    const templateStates = statesFor(["dynamic-template-images", "project-body-indexeddb-assets"], projectId);
    if (templateStates.length) items.push({
      id: `${projectId}:template-images`, projectId, title, category: "Template images", sourceAdapterIds: ["dynamic-template-images", "project-body-indexeddb-assets"],
      status: templateStates.includes("UPDATED") ? "UPDATED" : templateStates.includes("NEW") ? "NEW" : "UNCHANGED",
      description: `${templateStates.length} referenced project/template image assets.`,
    });

    const playableStates = statesFor(["playable-game-builds", "playable-game-covers"], projectId);
    const hasPlayableRecord = manifest.contentRecords.some((record) => record.projectId === projectId && record.sourceAdapterId === "playable-game-builds");
    if (playableStates.length || hasPlayableRecord) items.push({
      id: `${projectId}:playable`, projectId, title, category: "Playable Game", sourceAdapterIds: ["playable-game-builds", "playable-game-covers"],
      status: playableStates.includes("UPDATED") ? "UPDATED" : playableStates.includes("NEW") ? "NEW" : "UNCHANGED",
      description: "Playable entry URL, cover and registered web build files.",
    });
  }

  if (uiPractice) {
    const uiStates = statesFor(["ui-practice-images"]);
    items.push({
      id: "ui-personal-practice:gallery", projectId: "ui-personal-practice", title: "UI Personal Practice", category: "UI Practice", sourceAdapterIds: ["ui-practice-metadata", "ui-practice-images"],
      status: !currentUiPractice ? "NEW" : !equalJson(currentUiPractice, uiPractice) || uiStates.some((state) => state !== "UNCHANGED") ? "UPDATED" : "UNCHANGED",
      description: `${uiPractice.items?.length ?? 0} gallery items and their registered images.`,
    });
  }

  if (output.gameExperience) {
    const gameStates = statesFor(["game-experience-covers"]);
    const currentGame = currentOutput.gameExperience;
    items.push({
      id: "game-experience:records", projectId: "", title: "Game Experience", category: "Game Experience", sourceAdapterIds: ["game-experience-records", "game-experience-covers"],
      status: !currentGame ? "NEW" : !equalJson(currentGame, output.gameExperience) || gameStates.some((state) => state !== "UNCHANGED") ? "UPDATED" : "UNCHANGED",
      description: `${output.gameExperience.records?.length ?? 0} records and configured cover images.`,
    });
  }

  items.push(...blockedItems(manifest, output.projectCatalog));
  const isBlocked = items.some((item) => item.status === "BLOCKED");

  return writeReport(root, {
    version: 1,
    generatedAt: new Date().toISOString(),
    phase: "preflight",
    outcome: isBlocked ? "blocked" : "ready",
    productionUrl,
    counts: counts(items),
    items,
  });
}

export async function finalizePublishReport({ root, outcome, error = "" }) {
  const report = await readJson(path.join(root, LAUNCHER_REPORT_PATH), null);
  if (!report) return null;
  if (report.outcome === "blocked" && outcome === "failed") return report;
  const items = report.items.map((item) => {
    if (outcome === "published" && (item.status === "NEW" || item.status === "UPDATED")) return { ...item, status: "PUBLISHED" };
    if (outcome === "failed" && (item.status === "NEW" || item.status === "UPDATED")) return { ...item, status: "FAILED" };
    return item;
  });
  return writeReport(root, { ...report, generatedAt: new Date().toISOString(), phase: "result", outcome, error, counts: counts(items), items });
}
