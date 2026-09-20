import { useState } from "react";
import { InlineTemplateField } from "../components/template-tools/InlineTemplateField";
import type { TemplateLayoutControlDefinition, TemplateMeta, TemplateProps } from "../lib/templateLibrary";
import "./direction-compare-template.css";

type LocalizedText = { zh?: string; en?: string };
type CompareImage = { publicPath?: string };
type Side = "left" | "right";

export const layoutControlSchema: TemplateLayoutControlDefinition[] = [];

export const templateMeta: TemplateMeta = {
  id: "direction-compare",
  nameZh: "修改前 / 修改后",
  nameEn: "Notification / Before-After",
  descriptionZh: "在同一位置切换修改前后的媒体与说明。",
  descriptionEn: "Switch between before and after media with matching copy.",
  schema: [
    { id: "heading", labelZh: "章节标签", labelEn: "Section label", type: "text" },
    { id: "leftLabel", labelZh: "修改前按钮", labelEn: "Before button", type: "text" },
    { id: "rightLabel", labelZh: "修改后按钮", labelEn: "After button", type: "text" },
    { id: "leftTitle", labelZh: "修改前标题", labelEn: "Before title", type: "text" },
    { id: "rightTitle", labelZh: "修改后标题", labelEn: "After title", type: "text" },
    { id: "leftDescription", labelZh: "修改前说明", labelEn: "Before description", type: "textarea" },
    { id: "rightDescription", labelZh: "修改后说明", labelEn: "After description", type: "textarea" },
    { id: "leftImage", labelZh: "修改前媒体", labelEn: "Before media", type: "image" },
    { id: "rightImage", labelZh: "修改后媒体", labelEn: "After media", type: "image" },
    { id: "direction", labelZh: "旧方向字段", labelEn: "Legacy direction", type: "select" },
  ],
  createdAt: "2026-08-03T00:00:12.000Z",
};

function text(content: TemplateProps["content"], key: string, locale: "zh" | "en") {
  return (content[key] as LocalizedText | undefined)?.[locale] ?? "";
}

function image(content: TemplateProps["content"], key: string) {
  const value = content[key] as CompareImage | undefined;
  return value?.publicPath || "";
}

export default function DirectionCompareTemplate({ content, locale, inlineEditor }: TemplateProps) {
  const [active, setActive] = useState<Side>("right");
  const prefix = active === "left" ? "left" : "right";
  const heading = text(content, "heading", locale);
  const title = text(content, `${prefix}Title`, locale);
  const description = text(content, `${prefix}Description`, locale);
  const beforeLabel = text(content, "leftLabel", locale) || (locale === "zh" ? "修改前交互" : "Before");
  const afterLabel = text(content, "rightLabel", locale) || (locale === "zh" ? "修改后交互" : "After");
  const mediaSrc = image(content, `${prefix}Image`);
  const editor = inlineEditor?.directionCompare;
  const editable = (key: string, value: string, className: string, label: string) => inlineEditor ? (
    <InlineTemplateField value={value} onChange={(next) => inlineEditor.onLocalizedTextChange(key, next)} ariaLabel={label} placeholder={label} className={className} />
  ) : value ? key.endsWith("Title") ? <h2 className={className}>{value}</h2> : <p className={className}>{value}</p> : null;

  return (
    <section className="portfolio2-notification">
      <div className="portfolio2-notification__rail p2-page-rail">
        <div className="portfolio2-notification__media">
          {mediaSrc ? <img src={mediaSrc} alt={title} /> : <div className="portfolio2-notification__empty" />}
          {inlineEditor ? (
            <button type="button" className="portfolio2-notification__media-action" onClick={() => editor?.onUploadImage(active)}>
              {mediaSrc ? (locale === "zh" ? "替换媒体" : "Replace media") : (locale === "zh" ? "上传媒体" : "Add media")}
            </button>
          ) : null}
        </div>
        <div className="portfolio2-notification__content">
          {editable("heading", heading, "portfolio2-notification__kicker", locale === "zh" ? "章节标签" : "Section label")}
          {editable(`${prefix}Title`, title, "portfolio2-notification__title", locale === "zh" ? "标题" : "Title")}
          {editable(`${prefix}Description`, description, "portfolio2-notification__description", locale === "zh" ? "说明" : "Description")}
          <div className="portfolio2-notification__switch" data-exact-export="keep">
            {(["left", "right"] as const).map((side) => {
              const key = side === "left" ? "leftLabel" : "rightLabel";
              const label = side === "left" ? beforeLabel : afterLabel;
              return (
                <button key={side} type="button" className={active === side ? "is-active" : ""} onClick={() => setActive(side)}>
                  {inlineEditor ? <InlineTemplateField value={label} onChange={(next) => inlineEditor.onLocalizedTextChange(key, next)} ariaLabel={label} placeholder={label} className="portfolio2-notification__button-label" /> : label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
