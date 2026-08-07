// Shared helper for migrations that have source fields with no real
// destination in the unified schema (dead/legacy data the live bespoke
// renderer never showed, but which the project's "never overwrite or drop
// authored content" rule still requires to be preserved). Each such field
// becomes its own small, individually editable/deletable/movable block
// inside one hidden, owner-only "Unplaced migrated content" section —
// never rendered publicly (both the section AND each block are marked
// hidden, belt-and-suspenders) until the owner explicitly moves the
// content into a real section and removes the placeholder.

import { createStableId, localized, type ProjectDocumentBlock, type ProjectDocumentSection } from "../projectDocuments";

export function createUnplacedTextBlock(path: string, valueZh: string, valueEn = ""): ProjectDocumentBlock {
  return {
    id: createStableId("block"),
    type: "text",
    layout: "caption-footnote",
    variant: "quiet",
    visibility: "hidden",
    content: { eyebrow: localized(path, path), title: localized(), body: localized(valueZh, valueEn), items: [], media: [], nodes: [] },
    settings: {},
  };
}

export function createUnplacedImageBlock(path: string, assetId: string | undefined, publicPath: string | undefined): ProjectDocumentBlock {
  return {
    id: createStableId("block"),
    type: "media",
    layout: "contained-image",
    variant: "quiet",
    visibility: "hidden",
    content: {
      eyebrow: localized(path, path), title: localized(), body: localized(), items: [], nodes: [],
      media: [{ id: createStableId("media"), assetId, publicPath: assetId ? undefined : publicPath, alt: localized(path), caption: localized(path), cropMode: "contain", focalPosition: "50% 50%", aspectRatio: "16:9" }],
    },
    settings: {},
  };
}

export function createUnplacedSection(blocks: ProjectDocumentBlock[]): ProjectDocumentSection | null {
  if (!blocks.length) return null;
  return {
    id: createStableId("section"),
    type: "unplaced",
    title: localized("未放置的迁移内容（仅所有者可见）", "Unplaced migrated content (owner-only)"),
    visibility: "hidden",
    blocks,
  };
}
