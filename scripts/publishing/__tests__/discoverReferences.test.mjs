import assert from "node:assert/strict";
import { applyResolvedReferences, assetReferenceKey, discoverReferences } from "../discoverReferences.mjs";

// 1. deeply nested localImageId is discovered, with its sibling publicPath
// captured as declaredPublicPath.
{
  const value = {
    templateInstances: [
      { instanceId: "a", templateId: "figma-prototype", content: { heading: { zh: "" }, fallbackImage: { localImageId: "asset-1", publicPath: "/images/published/project-body/p1/asset-1.png" } } },
    ],
  };
  const refs = discoverReferences(value, { projectId: "p1" });
  const found = refs.find((r) => r.kind === "asset" && r.sourceAdapterId === "project-body-indexeddb-assets" && r.assetId === "asset-1");
  assert(found, `expected to discover the deeply nested localImageId, got: ${JSON.stringify(refs)}`);
  assert.equal(found.declaredPublicPath, "/images/published/project-body/p1/asset-1.png");
  assert.equal(found.fieldPath, "templateInstances[0].content.fallbackImage.localImageId");
}
console.log("1. deeply nested localImageId discovered, passed");

// 2. deeply nested imageId is discovered (dynamic-template-images for a
// normal project, ui-practice-images for the UI Practice project id).
{
  const value = { templateInstances: [{ content: { imageRow: { images: [{ imageId: "img-1", publicPath: "/images/published/template-images/p2/img-1.png" }] } } }] };
  const refs = discoverReferences(value, { projectId: "p2" });
  const found = refs.find((r) => r.kind === "asset" && r.assetId === "img-1");
  assert(found, `expected to discover the deeply nested imageId, got: ${JSON.stringify(refs)}`);
  assert.equal(found.sourceAdapterId, "dynamic-template-images");

  const uiValue = { items: [{ imageId: "img-2", publicPath: "/images/published/template-images/ui-personal-practice/img-2.png" }] };
  const uiRefs = discoverReferences(uiValue, { projectId: "ui-personal-practice" });
  const uiFound = uiRefs.find((r) => r.assetId === "img-2");
  assert.equal(uiFound.sourceAdapterId, "ui-practice-images", "imageId under the UI Practice project must resolve to ui-practice-images");
}
console.log("2. deeply nested imageId discovered (both adapters), passed");

// 3. posterAssetId is discovered with posterPublicPath as its declared path
// (not publicPath).
{
  const value = { templateInstances: [{ content: { video: { posterAssetId: "poster-1", posterPublicPath: "/images/published/project-body/p3/poster-1.png" } } }] };
  const refs = discoverReferences(value, { projectId: "p3" });
  const found = refs.find((r) => r.assetId === "poster-1");
  assert(found, `expected to discover posterAssetId, got: ${JSON.stringify(refs)}`);
  assert.equal(found.sourceAdapterId, "project-body-indexeddb-assets");
  assert.equal(found.declaredPublicPath, "/images/published/project-body/p3/poster-1.png");
  assert.equal(found.publicPathFieldKey, "posterPublicPath");
}
console.log("3. posterAssetId discovered with posterPublicPath, passed");

// Additional coverage beyond the 3 explicitly requested, verifying the rest
// of V1's real collectContentTree table and the "no duplicate/no false
// positive" properties the judgment-free discovery layer must have.

// coverId/publicUrl (playable-game-covers) discovered as ONE reference, not two.
{
  const value = { play: { coverId: "cover-1", publicUrl: "/images/published/playable-game-covers/p4/cover-1.png" } };
  const refs = discoverReferences(value, { projectId: "p4" });
  const assetRefs = refs.filter((r) => r.kind === "asset");
  assert.equal(assetRefs.length, 1, `expected exactly one reference for the coverId/publicUrl pair, got: ${JSON.stringify(refs)}`);
  assert.equal(assetRefs[0].sourceAdapterId, "playable-game-covers");
  assert.equal(assetRefs[0].publicPathFieldKey, "publicUrl");
}
console.log("coverId/publicUrl -> exactly one playable-game-covers reference, passed");

// gameId -> asset-tree kind, entryPublicPath folded in, no separate reference.
{
  const value = { play: { gameId: "game-1", entryPublicPath: "/playable-games/p5/game-1/index.html" } };
  const refs = discoverReferences(value, { projectId: "p5" });
  assert.equal(refs.length, 1, `expected exactly one reference for gameId+entryPublicPath, got: ${JSON.stringify(refs)}`);
  assert.equal(refs[0].kind, "asset-tree");
  assert.equal(refs[0].treeId, "game-1");
  assert.equal(refs[0].declaredEntryPublicPath, "/playable-games/p5/game-1/index.html");
}
console.log("gameId/entryPublicPath -> exactly one asset-tree reference, passed");

// A migrated game (playUrl sibling present) -> only the external reference,
// gameId/entryPublicPath excluded entirely.
{
  const value = { play: { gameId: "game-2", entryPublicPath: "/playable-games/p6/game-2/index.html", playUrl: "https://play.unity.com/mg/other/game-2" } };
  const refs = discoverReferences(value, { projectId: "p6" });
  assert.equal(refs.length, 1, `expected only the external playUrl reference once migrated, got: ${JSON.stringify(refs)}`);
  assert.equal(refs[0].kind, "external");
  assert.equal(refs[0].url, "https://play.unity.com/mg/other/game-2");
}
console.log("migrated game (playUrl present) -> gameId/entryPublicPath excluded, passed");

// figmaUrl/sourceUrl/embedUrl -> external.
{
  const value = { content: { figmaUrl: "https://figma.com/x", sourceUrl: "https://example.com/s", embedUrl: "https://example.com/e" } };
  const refs = discoverReferences(value, { projectId: "p7" });
  assert.equal(refs.filter((r) => r.kind === "external").length, 3);
  assert(refs.every((r) => r.sourceAdapterId === "external-embeds"));
}
console.log("figmaUrl/sourceUrl/embedUrl all discovered as external, passed");

// coverAssetId (Game Experience) -> game-experience-covers, always keyed to the
// real, fixed sibling field name coverPublicPath (never the generic
// publicPath/publicUrl guess -- see src/lib/gameExperience.ts /
// gameExperiencePublishSchema.ts, the only field name ever used for this
// adapter across the whole codebase).
{
  const value = { presentation: { coverAssetId: "gcover-1", coverPublicPath: "/images/published/game-covers/gcover-1.png", publicPath: "/ignored", publicUrl: "/ignored-too" } };
  const refs = discoverReferences(value, {});
  const found = refs.find((r) => r.assetId === "gcover-1");
  assert.equal(found.sourceAdapterId, "game-experience-covers");
  assert.equal(found.publicPathFieldKey, "coverPublicPath");
  assert.equal(found.declaredPublicPath, "/images/published/game-covers/gcover-1.png");
}
console.log("coverAssetId discovered as game-experience-covers, keyed to coverPublicPath, passed");

// No reference at all when there's nothing to find (plain content).
{
  const refs = discoverReferences({ title: "hello", nested: { deeper: { still: "no refs here" } } }, { projectId: "p8" });
  assert.equal(refs.length, 0);
}
console.log("plain content with no reference-shaped fields -> zero references, passed");

// applyResolvedReferences rewrites the exact declared sibling field, leaving
// everything else untouched.
{
  const value = { templateInstances: [{ content: { fallbackImage: { localImageId: "asset-9", publicPath: "/stale/path.png" }, heading: { zh: "kept" } } }] };
  const refs = discoverReferences(value, { projectId: "p9" });
  const resolved = new Map([[assetReferenceKey({ sourceAdapterId: "project-body-indexeddb-assets", assetId: "asset-9" }), "/images/published/project-body/p9/asset-9.png"]]);
  const rewritten = applyResolvedReferences(value, refs, resolved);
  assert.equal(rewritten.templateInstances[0].content.fallbackImage.publicPath, "/images/published/project-body/p9/asset-9.png");
  assert.equal(rewritten.templateInstances[0].content.heading.zh, "kept", "unrelated fields must survive untouched");
  assert.equal(value.templateInstances[0].content.fallbackImage.publicPath, "/stale/path.png", "the original value must never be mutated in place");
}
console.log("applyResolvedReferences rewrites exactly the resolved sibling field, original untouched, passed");

console.log("discoverReferences.mjs coverage tests passed");
