import type { PlayableGameCoverReference, PlayableGameReference } from "./portfolioContentClient";

// PlayableGameReference (portfolioContentClient.ts) models only the local
// ZIP-upload flow, where entryPublicPath is always present -- it predates
// the "canonical hosted build" pattern (TASKS.md/CHANGELOG.md 2026-08-08),
// where a project instead stores an external playUrl (e.g. Unity Play) and
// never has a local entryPublicPath at all. The persisted/rendered shape
// here needs to represent either, so this widens just the fields Universal
// Media's own reader/renderer touch rather than loosening the strict
// upload-flow type itself (still used as-is everywhere real uploads
// happen).
export type UniversalMediaGameReference = Pick<PlayableGameReference, "gameId" | "displayName"> &
  Partial<Omit<PlayableGameReference, "gameId" | "displayName">> & { playUrl?: string };

export type LocalizedText = { zh: string; en: string };

// This is the existing dynamic-project image reference persisted by the
// project-image pipeline. Universal Media deliberately reuses it instead of
// introducing another image store or asset identifier.
export type UniversalImageReference = {
  imageId?: string;
  localImageId?: string;
  assetId?: string;
  publicPath?: string;
  publicUrl?: string;
  alt?: string | LocalizedText;
};

export type VideoReference = {
  src: string;
  poster?: string;
};

export type UniversalMediaType = "image" | "video" | "figma" | "playable-game";

export type UniversalMedia =
  | { type: "image"; image: UniversalImageReference }
  | { type: "video"; video: VideoReference }
  | { type: "figma"; figmaUrl: string; fallbackImage?: UniversalImageReference }
  | { type: "playable-game"; game: UniversalMediaGameReference; cover?: PlayableGameCoverReference };

export type UniversalMediaContent = {
  heading?: LocalizedText;
  media: UniversalMedia;
  caption?: LocalizedText;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function isUniversalMedia(value: unknown): value is UniversalMedia {
  const media = record(value);
  if (!media) return false;
  if (media.type === "image") return Boolean(record(media.image));
  if (media.type === "video") {
    const video = record(media.video);
    return Boolean(video && typeof video.src === "string");
  }
  if (media.type === "figma") return typeof media.figmaUrl === "string";
  if (media.type === "playable-game") {
    const game = record(media.game);
    return Boolean(game && typeof game.gameId === "string");
  }
  return false;
}

export function normalizeUniversalMediaContent(
  templateId: string,
  content: Record<string, unknown>,
): UniversalMediaContent | null {
  if (templateId === "universal-media" && isUniversalMedia(content.media)) {
    return content as UniversalMediaContent;
  }
  if (templateId === "image-row") {
    const items = Array.isArray(content.items) ? content.items : [];
    if (items.length !== 1) return null;
    const item = record(items[0]);
    const image = record(item?.image);
    if (!image) return null;
    return {
      heading: record(content.heading) as LocalizedText | undefined,
      caption: record(item?.caption) as LocalizedText | undefined,
      media: { type: "image", image: image as UniversalImageReference },
    };
  }
  if (templateId === "figma-prototype" && typeof content.figmaUrl === "string") {
    return {
      heading: record(content.heading) as LocalizedText | undefined,
      caption: record(content.caption) as LocalizedText | undefined,
      media: {
        type: "figma",
        figmaUrl: content.figmaUrl,
        ...(record(content.fallbackImage)
          ? { fallbackImage: content.fallbackImage as UniversalImageReference }
          : {}),
      },
    };
  }
  if (templateId === "playable-game") {
    const game = record(content.game);
    if (!game || typeof game.gameId !== "string") return null;
    return {
      heading: record(content.heading) as LocalizedText | undefined,
      caption: record(content.description) as LocalizedText | undefined,
      media: {
        type: "playable-game",
        game: game as UniversalMediaGameReference,
        ...(record(content.cover) ? { cover: content.cover as PlayableGameCoverReference } : {}),
      },
    };
  }
  return null;
}
