import { useEffect, useMemo, useState } from "react";
import { Gamepad2 } from "lucide-react";
import { InlineTemplateField } from "../components/template-tools/InlineTemplateField";
import type { TemplateMeta, TemplateProps } from "../lib/templateLibrary";
import { figmaPrototypeUrlErrorMessage, normalizeFigmaPrototypeUrl } from "../lib/figmaEmbed";
import { isUniversalMedia, type LocalizedText, type UniversalMedia, type UniversalMediaType } from "../lib/universalMedia";
import "./universal-media-template.css";

export const templateMeta: TemplateMeta = {
  id: "universal-media",
  nameZh: "万能单媒体",
  nameEn: "Universal Media",
  descriptionZh: "以同一版式展示图片、视频、Figma 原型或可玩游戏。",
  descriptionEn: "One visual frame for an image, video, Figma prototype, or playable game.",
  schema: [
    { id: "heading", labelZh: "顶部标题", labelEn: "Heading", type: "text" },
    { id: "media", labelZh: "媒体", labelEn: "Media", type: "media", required: true },
    { id: "caption", labelZh: "说明", labelEn: "Caption", type: "text" },
  ],
  createdAt: "2026-09-10T00:00:00.000Z",
};

function localized(value: unknown, locale: "zh" | "en") {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const text = value as Partial<LocalizedText>;
  return text[locale] ?? text.zh ?? "";
}

function mediaSource(image: { publicPath?: string; publicUrl?: string } | undefined) {
  return image?.publicPath || image?.publicUrl || "";
}

function MediaFrame({ media, title, locale }: { media: UniversalMedia; title: string; locale: "zh" | "en" }) {
  if (media.type === "image") {
    const src = mediaSource(media.image);
    return src ? <img className="universal-media-asset" src={src} alt={localized(media.image.alt, "zh") || title} /> : <div className="universal-media-empty" />;
  }
  if (media.type === "video") {
    return media.video.src ? (
      <video
        className="universal-media-asset"
        src={media.video.src}
        poster={media.video.poster || undefined}
        autoPlay
        muted
        loop
        playsInline
        controls={false}
        disablePictureInPicture
      />
    ) : <div className="universal-media-empty" />;
  }
  if (media.type === "figma") {
    const parsed = normalizeFigmaPrototypeUrl(media.figmaUrl);
    const fallback = mediaSource(media.fallbackImage);
    if (parsed.ok) {
      return <iframe className="universal-media-embed" src={parsed.embedUrl} title={title || "Figma prototype"} allowFullScreen />;
    }
    return fallback ? <img className="universal-media-asset" src={fallback} alt={title} /> : <div className="universal-media-empty" />;
  }
  const source = media.game.entryPublicPath;
  if (source) {
    return <iframe className="universal-media-embed" src={source} title={title || media.game.displayName || "Playable game"} sandbox="allow-scripts allow-same-origin allow-pointer-lock" allow="fullscreen; gamepad" allowFullScreen />;
  }
  // entryPublicPath (local build) and playUrl (external canonical hosted
  // build, e.g. Unity Play) are mutually exclusive hosting strategies for
  // the same conceptual game reference -- see PlayableGameTemplate.tsx's
  // own documented rule. An externally-hosted game is never put in an
  // iframe here either, for the same reasons that template gives: Unity
  // Play does not reliably render when framed, and never assigning an
  // external URL to an iframe src structurally rules out a recursive
  // "portfolio inside portfolio" failure mode.
  if (media.game.playUrl) {
    const coverSrc = mediaSource(media.cover);
    return (
      <a className="universal-media-external-game" href={media.game.playUrl} target="_blank" rel="noreferrer">
        {coverSrc ? <img className="universal-media-asset" src={coverSrc} alt="" /> : <div className="universal-media-empty"><Gamepad2 aria-hidden="true" /></div>}
        <span className="universal-media-external-game-label">{locale === "zh" ? "打开游戏 / Play Game" : "Play Game"}</span>
      </a>
    );
  }
  return <div className="universal-media-empty"><Gamepad2 aria-hidden="true" /></div>;
}

function UniversalMediaEditor({ content, locale, editor }: { content: Record<string, unknown>; locale: "zh" | "en"; editor: NonNullable<TemplateProps["inlineEditor"]>["universalMedia"] }) {
  const current = isUniversalMedia(content.media) ? content.media : { type: "image", image: {} } as const;
  const [intent, setIntent] = useState<UniversalMediaType>(current.type);
  const [videoSrc, setVideoSrc] = useState(current.type === "video" ? current.video.src : "");
  const [videoPoster, setVideoPoster] = useState(current.type === "video" ? current.video.poster ?? "" : "");
  const [figmaUrl, setFigmaUrl] = useState(current.type === "figma" ? current.figmaUrl : "");
  const [figmaError, setFigmaError] = useState("");

  useEffect(() => {
    setIntent(current.type);
  }, [current.type]);

  const confirmTypeChange = (nextType: UniversalMediaType) => (
    current.type === nextType
    || window.confirm(locale === "zh"
      ? "应用新媒体后将替换当前媒体。现有资源不会在选择或上传成功前被更改。继续吗？"
      : "Applying the new media will replace the current media. The current resource stays unchanged until selection or upload succeeds. Continue?")
  );
  const applyVideo = () => {
    const src = videoSrc.trim();
    if (!src || !confirmTypeChange("video")) return;
    editor?.onMediaChange({ type: "video", video: { src, ...(videoPoster.trim() ? { poster: videoPoster.trim() } : {}) } });
  };
  const applyFigma = () => {
    const value = figmaUrl.trim();
    const parsed = normalizeFigmaPrototypeUrl(value);
    if (!parsed.ok) {
      setFigmaError(figmaPrototypeUrlErrorMessage(parsed.error));
      return;
    }
    if (!confirmTypeChange("figma")) return;
    setFigmaError("");
    editor?.onMediaChange({
      type: "figma",
      figmaUrl: value,
      ...(current.type === "figma" && current.fallbackImage ? { fallbackImage: current.fallbackImage } : {}),
    });
  };

  return (
    <div className="universal-media-editor" data-exact-export="hide">
      <label>
        <span>{locale === "zh" ? "媒体类型" : "Media Type"}</span>
        <select value={intent} onChange={(event) => setIntent(event.target.value as UniversalMediaType)}>
          <option value="image">Image</option>
          <option value="video">Video</option>
          <option value="figma">Figma</option>
          <option value="playable-game">Playable Game</option>
        </select>
      </label>
      {intent !== current.type ? <p>{locale === "zh" ? "当前资源会保留，直到新资源成功应用。" : "The current resource stays active until the replacement is successfully applied."}</p> : null}
      {intent === "image" ? <button type="button" className="editor-action" onClick={() => { if (confirmTypeChange("image")) editor?.onChooseImage(); }}>{locale === "zh" ? "选择图片" : "Choose image"}</button> : null}
      {intent === "video" ? (
        <div className="universal-media-editor-fields">
          <input value={videoSrc} onChange={(event) => setVideoSrc(event.target.value)} placeholder="Video src" />
          <input value={videoPoster} onChange={(event) => setVideoPoster(event.target.value)} placeholder="Poster (optional)" />
          <button type="button" className="editor-action" disabled={!videoSrc.trim()} onClick={applyVideo}>{locale === "zh" ? "应用视频" : "Apply video"}</button>
        </div>
      ) : null}
      {intent === "figma" ? (
        <div className="universal-media-editor-fields">
          <input value={figmaUrl} onChange={(event) => setFigmaUrl(event.target.value)} placeholder="https://www.figma.com/proto/..." />
          <button type="button" className="editor-action" disabled={!figmaUrl.trim()} onClick={applyFigma}>{locale === "zh" ? "应用 Figma" : "Apply Figma"}</button>
          {current.type === "figma" ? <button type="button" className="editor-action" onClick={editor?.onChooseFigmaFallback}>{locale === "zh" ? "选择备用图片" : "Choose fallback image"}</button> : null}
          {figmaError ? <p className="universal-media-editor-error">{figmaError}</p> : null}
        </div>
      ) : null}
      {intent === "playable-game" ? (
        <div className="universal-media-editor-fields">
          <button type="button" className="editor-action" onClick={() => { if (confirmTypeChange("playable-game")) editor?.onChooseGameFolder(); }}>{locale === "zh" ? "选择游戏文件夹" : "Choose game folder"}</button>
          <button type="button" className="editor-action" onClick={() => { if (confirmTypeChange("playable-game")) editor?.onChooseGameZip(); }}>{locale === "zh" ? "选择 ZIP" : "Choose ZIP"}</button>
          {editor?.availableGames.map((game) => <button type="button" className="editor-action" key={game.gameId} onClick={() => { if (confirmTypeChange("playable-game")) void editor.onUseSavedGame(game.gameId); }}>{game.displayName || game.originalFileName}</button>)}
          {current.type === "playable-game" ? <button type="button" className="editor-action" onClick={editor?.onChooseGameCover}>{locale === "zh" ? "选择封面" : "Choose cover"}</button> : null}
        </div>
      ) : null}
      {editor?.error ? <p className="universal-media-editor-error">{editor.error}</p> : null}
    </div>
  );
}

export default function UniversalMediaTemplate({ content, locale, inlineEditor }: TemplateProps) {
  const media = useMemo(() => isUniversalMedia(content.media) ? content.media : { type: "image", image: {} } as UniversalMedia, [content.media]);
  const heading = localized(content.heading, locale);
  const caption = localized(content.caption, locale);
  return (
    <section className="universal-media-template p2-page-rail">
      {inlineEditor ? (
        <InlineTemplateField value={heading} onChange={(value) => inlineEditor.onLocalizedTextChange("heading", value)} className="universal-media-inline-heading" placeholder={locale === "zh" ? "顶部标题" : "Heading"} ariaLabel={locale === "zh" ? "顶部标题" : "Heading"} />
      ) : heading ? <h2>{heading}</h2> : null}
      <div className="universal-media-frame"><MediaFrame media={media} title={heading || caption} locale={locale} /></div>
      {inlineEditor ? (
        <InlineTemplateField value={caption} onChange={(value) => inlineEditor.onLocalizedTextChange("caption", value)} className="universal-media-caption universal-media-inline-caption" placeholder={locale === "zh" ? "说明" : "Caption"} ariaLabel={locale === "zh" ? "说明" : "Caption"} />
      ) : caption ? <p className="universal-media-caption">{caption}</p> : null}
      {inlineEditor?.universalMedia ? <UniversalMediaEditor content={content} locale={locale} editor={inlineEditor.universalMedia} /> : null}
    </section>
  );
}
