// Unified browser asset acquisition (Publishing Architecture V2, Phase B).
// The ONE place the V2 exporter tries to obtain new bytes for a changed
// reference. Its job stops at "here are bytes, or there aren't any" -- it
// NEVER decides:
//   - whether a fallback is acceptable (resolveAsset.mjs's job)
//   - whether a missing capture BLOCKs (buildPublishPlan.mjs's job)
//   - integrity/validity of the bytes (assetIntegrity.mjs, server-side)
//   - the final publicPath (registry.mjs / resolveAsset.mjs's job)
//   - publish status (buildPublishPlan.mjs's job)
// A failed acquisition here is just `null` -- the caller records an
// observation and moves on; it is never treated as a silent fallback to old
// content, and never itself decides BLOCKED (that only happens later,
// server-side, when resolveAsset.mjs sees a "changed" reference with no
// bundle-provided bytes).
//
// Two real acquisition sources exist in this codebase today:
//   - IndexedDB (project-body-indexeddb-assets, game-experience-covers):
//     read directly via their own db modules.
//   - dev-server fetch (dynamic-template-images, ui-practice-images,
//     playable-game-covers, project-covers-disk): these adapters' content
//     is staged to an already-serving dev-server URL at EDIT time (not
//     export time -- see DynamicProjectPage.tsx / ProjectCoverEditor.tsx),
//     so acquisition is just re-fetching that URL, exactly like V1's own
//     fetchTemplateImage/fetchDiskProjectCover/fetchDiskPlayableGameCover
//     (productionBundleExport.ts).
import { getGameCoverRecord } from "./gameCoverDb";
import { getProjectBodyAsset } from "./projectBodyAssetDb";
import { getDiskProjectCover } from "./portfolioContentClient";

export type AcquiredAsset = { fileName: string; mimeType: string; bytes: ArrayBuffer };

const DEV_SERVER_FETCH_ADAPTERS = new Set(["dynamic-template-images", "ui-practice-images", "playable-game-covers"]);
const INDEXED_DB_ADAPTERS = new Set(["project-body-indexeddb-assets", "game-experience-covers"]);

async function acquireFromIndexedDb(sourceAdapterId: string, assetId: string): Promise<AcquiredAsset | null> {
  try {
    if (sourceAdapterId === "project-body-indexeddb-assets") {
      const record = await getProjectBodyAsset(assetId);
      if (!record) return null;
      return { fileName: record.fileName, mimeType: record.mimeType, bytes: await record.blob.arrayBuffer() };
    }
    if (sourceAdapterId === "game-experience-covers") {
      const record = await getGameCoverRecord(assetId);
      if (!record) return null;
      return { fileName: record.fileName, mimeType: record.mimeType, bytes: await record.blob.arrayBuffer() };
    }
  } catch {
    return null;
  }
  return null;
}

async function acquireFromUrl(publicPath: string | undefined): Promise<AcquiredAsset | null> {
  if (!publicPath) return null;
  try {
    const response = await fetch(publicPath, { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) return null;
    const blob = await response.blob();
    return {
      fileName: publicPath.split("/").pop() || "asset.bin",
      mimeType: blob.type || response.headers.get("content-type") || "application/octet-stream",
      bytes: await blob.arrayBuffer(),
    };
  } catch {
    return null;
  }
}

// Single-file asset references discovered inside project/document/game-record
// content (see discoverAssetReferences.ts). declaredPublicPath is required
// for the dev-server-fetch adapters -- a reference with no declared path yet
// (e.g. an id that was never actually staged) correctly acquires nothing,
// which the caller reports as an observation, never a silent success.
export async function collectChangedAsset(reference: { sourceAdapterId: string; assetId: string; declaredPublicPath?: string }): Promise<AcquiredAsset | null> {
  if (INDEXED_DB_ADAPTERS.has(reference.sourceAdapterId)) {
    return acquireFromIndexedDb(reference.sourceAdapterId, reference.assetId);
  }
  if (DEV_SERVER_FETCH_ADAPTERS.has(reference.sourceAdapterId)) {
    return acquireFromUrl(reference.declaredPublicPath);
  }
  return null;
}

// project-covers-disk is not discoverable via content-tree walking (a
// project's cover is a separate per-project field, never embedded inside
// draft/document content) -- acquired directly by projectId instead, via
// the same two-step disk-descriptor-then-fetch pattern V1's
// fetchDiskProjectCover uses (portfolioContentClient.ts's
// getDiskProjectCover resolves the current real publicUrl; this then fetches it).
export async function collectChangedProjectCover(projectId: string): Promise<AcquiredAsset | null> {
  try {
    const record = await getDiskProjectCover(projectId);
    if (!record || !record.publicUrl) return null;
    return acquireFromUrl(record.publicUrl);
  } catch {
    return null;
  }
}
