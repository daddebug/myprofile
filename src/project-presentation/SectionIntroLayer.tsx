import { InlineTemplateField } from "../components/template-tools/InlineTemplateField";
import type { TemplateProps } from "../lib/templateLibrary";

type LocalizedText = { zh?: string; en?: string };

function localizedText(content: TemplateProps["content"], key: string, locale: "zh" | "en") {
  const value = content[key] as LocalizedText | undefined;
  return value?.[locale]?.trim() ?? "";
}

function localizedRawText(content: TemplateProps["content"], key: string, locale: "zh" | "en") {
  const value = content[key] as LocalizedText | undefined;
  return value?.[locale] ?? "";
}

// A normal web section sharing the current Figma "小标题" composition.
// Its content and number are data-driven; all layout lives in CSS so the
// section can grow naturally rather than inheriting the former Artboard.
export function SectionIntroLayer({
  content,
  locale,
  sectionIntroIndex,
  inlineEditor,
}: {
  content: TemplateProps["content"];
  locale: TemplateProps["locale"];
  sectionIntroIndex: number;
  inlineEditor?: TemplateProps["inlineEditor"];
}) {
  const number = String(sectionIntroIndex + 1).padStart(2, "0");
  // Existing `leftTitle` data is retained as the editable section kicker.
  // It is no longer rendered as the old oversized secondary title.
  const kicker = localizedText(content, "leftTitle", locale);
  const headline = localizedText(content, "statement", locale);
  const body = localizedText(content, "body", locale);

  return (
    <section
      className="project-web-section project-section-intro"
      aria-label={headline || kicker || (locale === "zh" ? "章节介绍" : "Section introduction")}
    >
      <div className="project-section-intro-stage">
          <span className="project-section-intro-number" aria-hidden="true">{number}</span>

          <div className="project-section-intro-content">
            <div className="project-section-intro-context">
              {inlineEditor ? (
                <InlineTemplateField
                  value={localizedRawText(content, "leftTitle", locale)}
                  onChange={(value) => inlineEditor.onLocalizedTextChange("leftTitle", value)}
                  ariaLabel={locale === "zh" ? "章节标签" : "Section label"}
                  placeholder={locale === "zh" ? "章节标签" : "Section label"}
                  className="project-section-intro-kicker"
                />
              ) : kicker ? (
                <p className="project-section-intro-kicker">{kicker}</p>
              ) : null}
            </div>

            <div className="project-section-intro-panel">
              <span className="project-section-intro-divider-end" aria-hidden="true" />
              {inlineEditor ? (
                <InlineTemplateField
                  value={localizedRawText(content, "statement", locale)}
                  onChange={(value) => inlineEditor.onLocalizedTextChange("statement", value)}
                  ariaLabel={locale === "zh" ? "核心观点" : "Headline"}
                  placeholder={locale === "zh" ? "核心观点" : "Headline"}
                  className="project-section-intro-headline"
                />
              ) : headline ? (
                <h2 className="project-section-intro-headline">{headline}</h2>
              ) : null}
              {inlineEditor ? (
                <InlineTemplateField
                  value={localizedRawText(content, "body", locale)}
                  onChange={(value) => inlineEditor.onLocalizedTextChange("body", value)}
                  ariaLabel={locale === "zh" ? "解释正文" : "Supporting body"}
                  placeholder={locale === "zh" ? "解释正文" : "Supporting body"}
                  className="project-section-intro-body"
                />
              ) : body ? (
                <p className="project-section-intro-body">{body}</p>
              ) : null}
            </div>
          </div>
      </div>
    </section>
  );
}
