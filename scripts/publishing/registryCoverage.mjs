// Registry coverage matrix (Publishing Architecture V2, Phase C, revised).
// A machine-readable cross-reference between every adapter
// publishSourceRegistry.json currently declares and V2's real handling of
// it -- deliberately split into separate DISCOVERY / ACQUISITION /
// RESOLUTION ownership columns and a separate publish-ready verdict, so
// "the resolver knows this adapter exists" and "this adapter's changed
// content can actually be published today" are never conflated into one
// "covered" bit again (that conflation is exactly what the first version of
// this matrix got wrong).
//
// No silent UNKNOWN pass-through: every adapter still in the registry MUST
// have an explicit entry in ADAPTER_MATRIX, or the CLI entry point exits
// non-zero.
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { readPublishSourceRegistry } from "./registry.mjs";

// referenceType:
//   "single"   -- one file, discovered by discoverReferences.mjs's `kind: "asset"`
//   "tree"     -- a directory of files, discovered by `kind: "asset-tree"`
//   "external" -- a URL, discovered by `kind: "external"`
//   "metadata" -- structured, non-asset content owned directly by an
//                  entity's merge in buildPublishPlan.mjs, not by any
//                  reference resolver
//
// editable: can this adapter's content be changed via the real DEV
// owner-editing UI at all, today? "NO" means it has no dirty-intent path by
// construction, so it is inherently inherited-only in practice (not a gap).
//
// inheritedSupported: does V2 correctly carry this adapter's content forward
// unchanged when nothing edits it this cycle?
//
// changedPublishSupported: if this adapter's content genuinely changes, can
// V2 (discovery + acquisition + resolution, end to end) actually publish
// that change today? This is the field the first coverage matrix was
// missing -- an adapter can have a real resolver AND still not be
// changed-publish-ready if acquisition isn't wired for it.
//
// publishReady: the actual verdict -- true only if every relevant
// capability for how this adapter is really used is in place. For a
// non-editable adapter, publishReady === inheritedSupported (there is no
// "changed" case to prove). For an editable adapter, publishReady requires
// BOTH inherited and changed support.
const ADAPTER_MATRIX = {
  "project-catalog": {
    role: "Project catalog metadata (title, slug, visibility, ...)",
    entityOwner: "project (buildPublishPlan.mjs)",
    referenceType: "metadata",
    discoveryOwner: "N/A -- structured field, not reference-discovered",
    acquisitionOwner: "readProjectPublicMetaOverrides() (projectMetadata.ts)",
    resolutionOwner: "buildPublishPlan.mjs entity merge",
    editable: true, inheritedSupported: true, changedPublishSupported: true,
  },
  "dynamic-project-drafts": {
    role: "Project body (TemplateInstance-based pages)",
    entityOwner: "project (buildPublishPlan.mjs) -- folded together with project-documents as one project's `body`",
    referenceType: "metadata",
    discoveryOwner: "N/A at this level (its CONTENTS are reference-discovered, see the asset adapters below)",
    acquisitionOwner: "readLocalProjectBody() (productionBundleExportV2.ts)",
    resolutionOwner: "buildPublishPlan.mjs entity merge",
    editable: true, inheritedSupported: true, changedPublishSupported: true,
  },
  "project-documents": {
    role: "Legacy bespoke project body (ProjectDocument)",
    entityOwner: "project (buildPublishPlan.mjs) -- folded together with dynamic-project-drafts as one project's `body`",
    referenceType: "metadata",
    discoveryOwner: "N/A at this level",
    acquisitionOwner: "readLocalProjectBody() (productionBundleExportV2.ts, via getProjectDocument())",
    resolutionOwner: "buildPublishPlan.mjs entity merge",
    editable: true, inheritedSupported: true, changedPublishSupported: true,
  },
  "ui-practice-metadata": {
    role: "UI Practice gallery metadata (titles, order, descriptions)",
    entityOwner: "uiPractice (buildPublishPlan.mjs, generic entity support)",
    referenceType: "metadata",
    discoveryOwner: "N/A",
    acquisitionOwner: "NONE -- no local override store exists; this metadata is a static, source-controlled JSON file today (see uiPracticeCatalog.ts), never edited via the DEV UI",
    resolutionOwner: "buildPublishPlan.mjs entity merge (proven generically; never exercised with real data since nothing produces an intent)",
    editable: false, inheritedSupported: true, changedPublishSupported: false,
    note: "Not a V2 gap -- V1 has no real edit path for this either; both sides are equally inherited-only in practice.",
  },
  "game-experience-records": {
    role: "Game Experience library records",
    entityOwner: "gameExperienceRecord (buildPublishPlan.mjs)",
    referenceType: "metadata",
    discoveryOwner: "N/A at this level",
    acquisitionOwner: "toPublishableGameExperienceRecord() (productionBundleExportV2.ts)",
    resolutionOwner: "buildPublishPlan.mjs entity merge",
    editable: true, inheritedSupported: true, changedPublishSupported: true,
  },

  "project-covers-indexeddb": {
    role: "Project card/header cover (dead IndexedDB path)",
    entityOwner: "project (cover field)",
    referenceType: "single",
    discoveryOwner: "N/A -- not embedded in content, a separate per-project field",
    acquisitionOwner: "NONE -- IndexedDB store has had zero real writers for a while (see projectCoverDb.ts)",
    resolutionOwner: "resolveAsset.mjs (bundle-only candidate; matches V1, which also has no disk fallback here)",
    editable: false, inheritedSupported: true, changedPublishSupported: false,
    note: "Dead in both V1 and V2 -- real cover edits go through project-covers-disk instead.",
  },
  "project-covers-disk": {
    role: "Project card/header cover (real path -- ProjectCoverEditor.tsx dev-server stage/commit)",
    entityOwner: "project (cover field)",
    referenceType: "single",
    discoveryOwner: "discoverReferences.mjs (dedicated projectCoverId/publicUrl shape, Pre-Cutover Closure) -- not embedded in body content, so acquired directly by projectId and represented in this shape on the entity's `cover` field, which the SAME generic discovery walk then finds",
    acquisitionOwner: "collectChangedProjectCover() (collectChangedAsset.ts, via getDiskProjectCover())",
    resolutionOwner: "resolveAsset.mjs (bundle + published-fallback, same generic path as every other single-file adapter)",
    editable: true, inheritedSupported: true, changedPublishSupported: true,
    note: "Closed via Pre-Cutover Closure: no second resolver, no project-cover-specific branch in buildPublishPlan.mjs -- the cover field is just another discoverable reference now.",
  },
  "project-body-indexeddb-assets": {
    role: "In-body images (project-body/document content)",
    entityOwner: "project (via its body's discovered references)",
    referenceType: "single",
    discoveryOwner: "discoverReferences.mjs / discoverAssetReferences.ts",
    acquisitionOwner: "collectChangedAsset.ts (IndexedDB, via projectBodyAssetDb.ts)",
    resolutionOwner: "resolveAsset.mjs (bundle + published-fallback)",
    editable: true, inheritedSupported: true, changedPublishSupported: true,
  },
  "dynamic-template-images": {
    role: "Template-instance images (image rows etc.)",
    entityOwner: "project (via its body's discovered references)",
    referenceType: "single",
    discoveryOwner: "discoverReferences.mjs / discoverAssetReferences.ts",
    acquisitionOwner: "collectChangedAsset.ts (dev-server fetch via declaredPublicPath, staged at edit time)",
    resolutionOwner: "resolveAsset.mjs (bundle + published-fallback)",
    editable: true, inheritedSupported: true, changedPublishSupported: true,
  },
  "ui-practice-images": {
    role: "UI Practice gallery images",
    entityOwner: "uiPractice (via its content's discovered references, when populated)",
    referenceType: "single",
    discoveryOwner: "discoverReferences.mjs / discoverAssetReferences.ts",
    acquisitionOwner: "collectChangedAsset.ts (dev-server fetch, same mechanism as dynamic-template-images)",
    resolutionOwner: "resolveAsset.mjs (bundle + published-fallback)",
    editable: false, inheritedSupported: true, changedPublishSupported: false,
    note: "Acquisition/resolution both exist and are shared with dynamic-template-images; changedPublishSupported is false only because the owning uiPractice entity itself has no real edit path (see ui-practice-metadata) -- not an asset-layer gap.",
  },
  "game-experience-covers": {
    role: "Game Experience record cover image",
    entityOwner: "gameExperienceRecord (via its discovered coverAssetId reference)",
    referenceType: "single",
    discoveryOwner: "discoverReferences.mjs / discoverAssetReferences.ts",
    acquisitionOwner: "collectChangedAsset.ts (IndexedDB, via gameCoverDb.ts)",
    resolutionOwner: "resolveAsset.mjs (bundle-only candidate, matches V1's lack of disk fallback)",
    editable: true, inheritedSupported: true, changedPublishSupported: true,
  },
  "playable-game-builds": {
    role: "Playable game web build (whole directory)",
    entityOwner: "project (via its body's discovered gameId reference)",
    referenceType: "tree",
    discoveryOwner: "discoverReferences.mjs (kind: asset-tree)",
    acquisitionOwner: "N/A -- not browser-editable (see note)",
    resolutionOwner: "resolveAssetTree.mjs",
    editable: false, inheritedSupported: true, changedPublishSupported: false,
    note: "Not browser-editable in practice (builds are deployed via a separate upload pipeline, see upload-unity-to-vercel-blob.mjs) -- inherited-only by design, not a gap.",
  },
  "playable-game-covers": {
    role: "Playable game's own launch-screen cover (distinct from the project card cover)",
    entityOwner: "project (via its body's discovered coverId reference)",
    referenceType: "single",
    discoveryOwner: "discoverReferences.mjs / discoverAssetReferences.ts",
    acquisitionOwner: "collectChangedAsset.ts (dev-server fetch, same mechanism as dynamic-template-images)",
    resolutionOwner: "resolveAsset.mjs (bundle + published-fallback)",
    editable: true, inheritedSupported: true, changedPublishSupported: true,
    note: "Real edits go through the same dev-server disk-stage flow as project-covers-disk, so real-world change frequency is low, but the mechanism is genuinely wired and tested (unlike project-covers-disk's resolution gap).",
  },
  "ui-practice-bundled-images": {
    role: "Vite-bundled UI Practice display assets",
    entityOwner: "N/A -- build output",
    referenceType: "metadata",
    discoveryOwner: "N/A", acquisitionOwner: "N/A", resolutionOwner: "N/A -- never part of the writeset in V1 either",
    editable: false, inheritedSupported: true, changedPublishSupported: false,
    note: "Not a gap -- a Vite build artifact, out of the publish pipeline in both V1 and V2 by design.",
  },
  "legacy-static-game-build": {
    role: "One legacy static game build (afterwarm)",
    entityOwner: "N/A -- standalone, not attached to a project entity",
    referenceType: "tree",
    discoveryOwner: "N/A -- not referenced from any discoverable content today",
    acquisitionOwner: "N/A -- not browser-editable",
    resolutionOwner: "resolveAssetTree.mjs (mechanism exists, proven via playable-game-builds' shared test coverage)",
    editable: false, inheritedSupported: true, changedPublishSupported: false,
    note: "Inherited-only by design, same as playable-game-builds.",
  },
  "external-embeds": {
    role: "figmaUrl / sourceUrl / embedUrl / playUrl references",
    entityOwner: "project (via its body's discovered external references)",
    referenceType: "external",
    discoveryOwner: "discoverReferences.mjs (kind: external)",
    acquisitionOwner: "N/A -- a URL carries no bytes to acquire",
    resolutionOwner: "resolveExternalReference.mjs",
    editable: true, inheritedSupported: true, changedPublishSupported: true,
  },
  "published-assets": {
    role: "Registry bookkeeping marker for the publish destination itself",
    entityOwner: "N/A", referenceType: "metadata",
    discoveryOwner: "N/A", acquisitionOwner: "N/A", resolutionOwner: "N/A -- not a source",
    editable: false, inheritedSupported: true, changedPublishSupported: false,
    note: "Not a real source adapter -- registry bookkeeping only.",
  },
};

function publishReadyFor(entry) {
  if (!entry.editable) return entry.inheritedSupported; // inherited-only source: ready iff it inherits correctly
  return entry.inheritedSupported && entry.changedPublishSupported;
}

/**
 * @param {{ root: string }} options
 */
export async function checkRegistryCoverage({ root }) {
  const registry = await readPublishSourceRegistry(root);
  const rows = [];

  for (const source of registry.sources) {
    const entry = ADAPTER_MATRIX[source.id];
    if (!entry) {
      rows.push({
        adapterId: source.id, sourceType: source.sourceType, role: "UNKNOWN", entityOwner: "UNKNOWN",
        referenceType: "UNKNOWN", discoveryOwner: "NONE", acquisitionOwner: "NONE", resolutionOwner: "NONE",
        editable: null, inheritedSupported: false, changedPublishSupported: false, publishReady: false, unknown: true,
      });
      continue;
    }
    rows.push({
      adapterId: source.id, sourceType: source.sourceType, unknown: false,
      role: entry.role, entityOwner: entry.entityOwner, referenceType: entry.referenceType,
      discoveryOwner: entry.discoveryOwner, acquisitionOwner: entry.acquisitionOwner, resolutionOwner: entry.resolutionOwner,
      editable: entry.editable, inheritedSupported: entry.inheritedSupported, changedPublishSupported: entry.changedPublishSupported,
      publishReady: publishReadyFor(entry), note: entry.note,
    });
  }

  return {
    total: rows.length,
    unknown: rows.filter((r) => r.unknown).map((r) => r.adapterId),
    publishReady: rows.filter((r) => r.publishReady).map((r) => r.adapterId),
    inheritedOnly: rows.filter((r) => !r.editable && r.inheritedSupported).map((r) => r.adapterId),
    editableNotReady: rows.filter((r) => r.editable && !r.publishReady).map((r) => r.adapterId),
    rows,
  };
}

const isMainModule = process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);
if (isMainModule) {
  const root = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
  const result = await checkRegistryCoverage({ root });
  console.log(`\nRegistry Coverage Matrix: ${result.total} adapters total.\n`);
  console.log(`  publish-ready: ${result.publishReady.length} -- ${result.publishReady.join(", ")}`);
  console.log(`  inherited-only (by design, not a gap): ${result.inheritedOnly.length} -- ${result.inheritedOnly.join(", ")}`);
  console.log(`  editable but NOT publish-ready (real gaps): ${result.editableNotReady.length}${result.editableNotReady.length ? ` -- ${result.editableNotReady.join(", ")}` : ""}`);
  console.log(`  UNKNOWN (missing from ADAPTER_MATRIX entirely): ${result.unknown.length}${result.unknown.length ? ` -- ${result.unknown.join(", ")}` : ""}`);
  console.log("\n  Per-adapter detail:");
  for (const row of result.rows) {
    console.log(`\n  [${row.publishReady ? "PUBLISH-READY" : row.unknown ? "UNKNOWN" : row.editable ? "GAP" : "INHERITED-ONLY"}] ${row.adapterId}`);
    console.log(`    role: ${row.role}`);
    console.log(`    entityOwner: ${row.entityOwner} | referenceType: ${row.referenceType}`);
    console.log(`    discovery: ${row.discoveryOwner}`);
    console.log(`    acquisition: ${row.acquisitionOwner}`);
    console.log(`    resolution: ${row.resolutionOwner}`);
    console.log(`    editable: ${row.editable} | inherited: ${row.inheritedSupported} | changedPublish: ${row.changedPublishSupported}`);
    if (row.note) console.log(`    note: ${row.note}`);
  }
  if (result.unknown.length) {
    console.error(`\nERROR: ${result.unknown.length} adapter(s) missing from ADAPTER_MATRIX entirely.`);
    process.exit(1);
  }
}
