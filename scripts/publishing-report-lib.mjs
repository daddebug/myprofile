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
    removed: items.filter((item) => item.status === "REMOVED").length,
    unpublished: items.filter((item) => item.status === "UNPUBLISHED").length,
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

// RETIRED from the live publish path (Publishing Architecture V2, Cutover).
// Kept only for parity/rollback reference -- no longer reachable from
// import-production-bundle.mjs. It independently re-read `currentPublished`
// and V1's rewrittenPreflight manifest to compute its own NEW/UPDATED/
// UNCHANGED/BLOCKED judgment (Root Cause 5's "judgment pass 3") -- the exact
// duplicated-judgment pattern V2's PublishPlan replaces. See
// renderPublishPlanReportV2 below for its live V2 replacement, which is a
// pure view over an already-computed PublishPlan and performs none of this
// function's own diffing/status logic.
export async function writeBlockedPublishReport({ root, manifest, catalog = {}, productionUrl }) {
  const items = blockedItems(manifest, catalog);
  return writeReport(root, {
    version: 1,
    generatedAt: new Date().toISOString(),
    phase: "preflight",
    outcome: "blocked",
    diffStatus: "not-run",
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

// RETIRED from the live publish path (Publishing Architecture V2, Cutover).
// Kept only for parity/rollback reference (still used by
// scripts/publishing-preflight.mjs's old code path prior to its own
// reduction -- see that file) -- no longer reachable from
// import-production-bundle.mjs. See renderPublishPlanReportV2 below for its
// live replacement.
export async function writePublishPlanReport({ root, manifest, output, uiPractice, assets, productionUrl, deletedProjectIds = new Set(), inheritedProjectIds = new Set(), inheritedCatalogProjectIds = new Set() }) {
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
  // A previously-published project absent from this export's own catalog
  // must be considered too, not just the ones the bundle happens to declare
  // -- otherwise it gets no report line at all (the exact silent-omission
  // gap this project-level union closes). output.projectCatalog is already
  // the caller's fully-merged result (bundle + inherited + minus deletions),
  // so it's the authoritative "who to report on" list for anything that
  // survives into the output; manifest.projects is unioned in too in case
  // preflight ever discovers a project this way that isn't reflected there
  // yet. currentOutput.projectCatalog is unioned in as well specifically for
  // the explicit-delete case: a project that was published before, is absent
  // from this export's bundle catalog entirely, and is explicitly deleted
  // has no entry in either of the other two sources (it was never in the
  // bundle, and it's deliberately excluded from output) -- without this, the
  // deletion itself would silently produce no report line at all.
  const projectIds = [...new Set([...manifest.projects.map((project) => project.projectId), ...Object.keys(output.projectCatalog || {}), ...Object.keys(currentOutput.projectCatalog || {})])];
  const catalogForTitles = { ...currentOutput.projectCatalog, ...output.projectCatalog };
  for (const projectId of projectIds) {
    const title = projectTitle(catalogForTitles, projectId);
    const currentMetadata = currentOutput.projectCatalog?.[projectId];
    const nextMetadata = output.projectCatalog?.[projectId];
    const previousHasProject = currentMetadata !== undefined;
    const nextHasProject = nextMetadata !== undefined;
    const catalogDeleteIntended = deletedProjectIds.has(projectId);
    const catalogInherited = inheritedCatalogProjectIds.has(projectId);
    const metadataStatus = !previousHasProject
      ? "NEW"
      : !nextHasProject
        ? (catalogDeleteIntended ? "REMOVED" : "BLOCKED")
        : equalJson(currentMetadata, nextMetadata)
          ? "UNCHANGED"
          : "UPDATED";
    const metadataReason = catalogDeleteIntended
      ? "Removed via explicit project deletion intent."
      : "Published project is missing from the current export's catalog, and there is no explicit delete intent for it.";
    items.push({
      id: `${projectId}:metadata`, projectId, title, category: "Project metadata", sourceAdapterIds: ["project-catalog"],
      status: metadataStatus,
      description: metadataStatus === "REMOVED" || metadataStatus === "BLOCKED"
        ? metadataReason
        : metadataStatus === "UNCHANGED" && catalogInherited
          ? "Not present in this export's catalog; inherited unchanged from the currently-published state."
          : "Project title, summary, category, dates, visibility and archive metadata.",
      ...(metadataStatus === "BLOCKED" ? { reason: metadataReason, action: "This should not happen once the export/import catalog-inherit path is intact -- investigate why this project was neither supplied by the export nor inherited from the currently-published catalog." } : {}),
      ...(metadataStatus === "REMOVED" ? { reason: metadataReason } : {}),
    });


    const currentDraft = currentOutput.drafts?.[projectId];
    const currentDocument = currentOutput.projectDocuments?.documents?.[projectId];
    const nextDraft = output.drafts?.[projectId];
    const nextDocument = output.projectDocuments?.documents?.[projectId];
    const previousHasBody = currentDraft !== undefined || currentDocument !== undefined;
    const nextHasBody = nextDraft !== undefined || nextDocument !== undefined;
    // A project body that already exists in the currently-published site must
    // never silently disappear just because this run's export doesn't include
    // it (e.g. a browser session whose localStorage never had that project's
    // draft) -- that is "no local edit this cycle," not "delete this body."
    // The caller (import-production-bundle.mjs) already implements that:
    // when its export has no fresh draft for a project, it inherits the
    // currently-published body verbatim into `output`, so by the time this
    // function compares current vs. output, a genuinely-untouched project's
    // nextDraft equals its currentDraft and naturally resolves to UNCHANGED
    // below -- no special case needed for that, it falls out of the normal
    // equalJson comparison. previousHasBody && !nextHasBody can therefore
    // only mean one of two things: an explicit, caller-supplied delete intent
    // (deletedProjectIds) -- reported as REMOVED -- or some other, unforeseen
    // way the body ended up missing from `output` despite previously existing
    // -- which must still fail closed as BLOCKED rather than silently drop
    // (never reported as UNCHANGED, never silently skipped).
    if (previousHasBody || nextHasBody) {
      const deleteIntended = deletedProjectIds.has(projectId);
      const isInherited = inheritedProjectIds.has(projectId);
      const status = !previousHasBody
        ? "NEW"
        : !nextHasBody
          ? (deleteIntended ? "REMOVED" : "BLOCKED")
          : equalJson([currentDraft, currentDocument], [nextDraft, nextDocument])
            ? "UNCHANGED"
            : "UPDATED";
      const reason = deleteIntended
        ? "Removed via explicit project deletion intent."
        : "Published project body is missing from the current export, and there is no explicit delete intent for it.";
      const description = status === "REMOVED" || status === "BLOCKED"
        ? reason
        : status === "UNCHANGED" && isInherited
          ? "No local edit draft found in this export; inherited unchanged from the currently-published state."
          : "Project narrative, template instances, order and layout settings.";
      items.push({
        id: `${projectId}:body`, projectId, title, category: "Project body", sourceAdapterIds: ["dynamic-project-drafts", "project-documents"],
        status,
        description,
        ...(status === "BLOCKED" ? { reason, action: "This should not happen once the export/import inherit path is intact -- investigate why this project's body was neither supplied by the export nor inherited from the currently-published state." } : {}),
        ...(status === "REMOVED" ? { reason } : {}),
      });
    }

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
    const currentRecordsById = new Map((currentGame?.records ?? []).map((record) => [record.id, record]));
    const nextRecordIds = new Set((output.gameExperience.records ?? []).map((record) => record.id));
    const changedRecordCount = (output.gameExperience.records ?? []).filter((record) => !equalJson(currentRecordsById.get(record.id), record)).length
      + (currentGame?.records ?? []).filter((record) => !nextRecordIds.has(record.id)).length;
    // Per-cover asset integrity breakdown -- 33 covers collapsed into one
    // report item must never hide that any single one of them failed
    // integrity validation (see assetIntegrity.mjs / the 2026-08-17
    // incident): invalid = present in this bundle but failed validation
    // (always drives BLOCKED, via manifest.issues -- see blockedItems below);
    // valid = present in this bundle and passed; inherited = not re-supplied
    // by this bundle at all, so the record's own already-resolved
    // coverPublicPath carries forward unchanged (never re-validated here,
    // same as any other untouched published asset).
    const coverAssetIds = new Set((output.gameExperience.records ?? []).flatMap((record) => [
      record.presentation?.coverAssetId, record.presentation?.detectedCoverAssetId,
    ].filter((id) => typeof id === "string" && id)));
    const gameCoverAssetsByAssetId = new Map(
      manifest.assets.filter((asset) => asset.sourceAdapterId === "game-experience-covers").map((asset) => [asset.assetId, asset]),
    );
    let validCoverCount = 0;
    let invalidCoverCount = 0;
    let inheritedCoverCount = 0;
    for (const id of coverAssetIds) {
      const asset = gameCoverAssetsByAssetId.get(id);
      if (asset?.status === "invalid") invalidCoverCount += 1;
      else if (asset?.status === "collected") validCoverCount += 1;
      else inheritedCoverCount += 1;
    }
    items.push({
      id: "game-experience:records", projectId: "", title: "Game Experience", category: "Game Experience", sourceAdapterIds: ["game-experience-records", "game-experience-covers"],
      status: !currentGame ? "NEW" : !equalJson(currentGame, output.gameExperience) || gameStates.some((state) => state !== "UNCHANGED") ? "UPDATED" : "UNCHANGED",
      description: changedRecordCount > 0
        ? `${changedRecordCount} records changed; ${output.gameExperience.records?.length ?? 0} records and configured cover images.`
        : `${output.gameExperience.records?.length ?? 0} records and configured cover images.`,
      assetIntegrity: { totalCovers: coverAssetIds.size, valid: validCoverCount, invalid: invalidCoverCount, inherited: inheritedCoverCount },
    });
  }

  items.push(...blockedItems(manifest, output.projectCatalog));
  const isBlocked = items.some((item) => item.status === "BLOCKED");

  return writeReport(root, {
    version: 1,
    generatedAt: new Date().toISOString(),
    phase: "preflight",
    outcome: isBlocked ? "blocked" : "ready",
    diffStatus: "complete",
    productionUrl,
    counts: counts(items),
    items,
  });
}

function planItemTitle(catalogForTitles, entityId, entityType) {
  if (entityType === "project") return projectTitle(catalogForTitles, entityId);
  if (entityType === "gameExperienceRecord") return "Game Experience";
  return entityId || "Portfolio";
}

function planItemDescription(item) {
  if (item.reason) return item.reason;
  if (item.assetResolutions?.length) {
    const inherited = item.assetResolutions.filter((r) => r.source === "published-fallback").length;
    const fresh = item.assetResolutions.length - inherited;
    return `${item.assetResolutions.length} referenced asset(s) (${fresh} from this edit, ${inherited} inherited unchanged).`;
  }
  return item.status === "UNCHANGED" ? "No change from the currently-published state." : "Content and referenced assets.";
}

// The live V2 report renderer (Publishing Architecture V2, Cutover, Section
// B). A PURE VIEW over already-built PublishPlan(s) -- consumes ONLY
// plan.items / plan.counts / plan.blocked / plan.assetIntegrity / plan.writeset
// (per plan, passed in already computed) plus plain display lookups
// (catalogForTitles, for a human-readable project name). It never re-reads
// currentPublished, never re-derives NEW/UPDATED/UNCHANGED, never re-judges
// missing/BLOCKED -- every one of those was already decided once, by
// buildPublishPlan.mjs, before this function is ever called. Report status
// can never disagree with plan status because it is not computed twice.
export async function renderPublishPlanReportV2({ root, plans, catalogForTitles = {}, productionUrl }) {
  const items = [];
  for (const plan of plans) {
    for (const planItem of plan.items) {
      items.push({
        id: `${planItem.entityId}:${planItem.entityType}`,
        projectId: planItem.entityType === "project" ? planItem.entityId : "",
        title: planItemTitle(catalogForTitles, planItem.entityId, planItem.entityType),
        category: planItem.entityType === "project" ? "Project" : planItem.entityType === "gameExperienceRecord" ? "Game Experience" : planItem.entityType,
        status: planItem.status,
        description: planItemDescription(planItem),
        ...(planItem.reason ? { reason: planItem.reason } : {}),
      });
    }
  }
  const blocked = plans.some((plan) => plan.blocked);
  const totalWriteset = plans.reduce((sum, plan) => sum + plan.writeset.length, 0);
  const assetIntegrity = plans.reduce((sum, plan) => ({
    total: sum.total + plan.assetIntegrity.total,
    valid: sum.valid + plan.assetIntegrity.valid,
    invalid: sum.invalid + plan.assetIntegrity.invalid,
    inherited: sum.inherited + plan.assetIntegrity.inherited,
  }), { total: 0, valid: 0, invalid: 0, inherited: 0 });

  return writeReport(root, {
    version: 2,
    generatedAt: new Date().toISOString(),
    phase: "preflight",
    outcome: blocked ? "blocked" : "ready",
    diffStatus: "complete",
    productionUrl,
    counts: counts(items),
    items,
    writesetSize: totalWriteset,
    assetIntegrity,
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
