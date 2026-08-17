import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { portfolioProfile } from "../data/portfolioProfile";
import { useGameCover } from "../hooks/useGameCover";
import { useLegacyProjectAsset } from "../hooks/useLegacyProjectAsset";
import { useProjectBodyAsset } from "../hooks/useProjectBodyAsset";
import { useProjectCover } from "../hooks/useProjectCover";
import { formatAchievement, formatPlaytime, gameTitle, type GameExperienceRecord } from "../lib/gameExperience";
import type { PortfolioPdfConfig, PdfProjectItemConfig } from "../lib/portfolioPdf";
import type { PdfProjectBlock, PdfProjectContent, PdfProjectMedia, PdfProjectSection } from "../lib/projectPdfContent";
import { projectPdfThemes, type ProjectPdfCompositionConfig, type ProjectPdfPage, type ProjectPdfThemeId } from "../lib/projectPdfCompositions";
import type { ResolvedProjectMetadata } from "../lib/projectMetadata";
import type { Locale } from "../locales/types";
import type { UiPracticeCatalogItem } from "../lib/uiPracticeCatalog";

type Props = {
  config: PortfolioPdfConfig;
  projects: ResolvedProjectMetadata[];
  projectContents: Record<string, PdfProjectContent>;
  compositionConfig: ProjectPdfCompositionConfig;
  uiWorks: UiPracticeCatalogItem[];
  games: GameExperienceRecord[];
};

type PageDescriptor = { key: string; node: ReactNode; className?: string; style?: CSSProperties; compositionPageId?: string; projectId?: string };

const labels = {
  zh: { profile: "个人简介与经历", projects: "项目案例", ui: "UI 作品", games: "游戏经历", contact: "联系方式", skills: "核心技能", experience: "工作经历", education: "教育经历", challenge: "问题与过程", outcome: "关键判断与结果", playtime: "游玩", achievement: "成就", why: "为什么游玩", strengths: "优点", learned: "对我的帮助" },
  en: { profile: "Profile & Experience", projects: "Selected Projects", ui: "Selected UI Works", games: "Game Experience", contact: "Contact", skills: "Core Skills", experience: "Experience", education: "Education", challenge: "Challenge & Process", outcome: "Key Decisions & Outcome", playtime: "Playtime", achievement: "Achievement", why: "Why I played", strengths: "Strengths", learned: "What I learned" },
} as const;

function chunk<T>(items: T[], size: number) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
}

function excerpt(value: string, limit: number) {
  const clean = value.trim();
  return clean.length > limit ? `${clean.slice(0, limit).trimEnd()}…` : clean;
}

function mediaCount(section: PdfProjectSection) {
  return section.blocks.reduce((total, block) => total + (block.media?.length ?? 0), 0);
}

function splitMediaDenseSection(section: PdfProjectSection) {
  if (mediaCount(section) <= 6) return [section];
  const pages: PdfProjectSection[] = [];
  let blocks: PdfProjectBlock[] = [];
  let pageMedia = 0;
  let first = true;
  const flush = () => {
    if (!blocks.length) return;
    pages.push({ ...section, heading: first ? section.heading : undefined, body: first ? section.body : undefined, blocks });
    blocks = [];
    pageMedia = 0;
    first = false;
  };
  section.blocks.forEach((block) => {
    const blockMedia = block.media?.length ?? 0;
    if (blocks.length && pageMedia + blockMedia > 6) flush();
    if (blockMedia > 6) {
      const mediaGroups = chunk(block.media ?? [], 6);
      mediaGroups.forEach((group, index) => {
        if (blocks.length) flush();
        blocks = [{ ...block, title: index === 0 ? block.title : undefined, body: index === 0 ? block.body : undefined, media: group }];
        pageMedia = group.length;
        flush();
      });
      return;
    }
    blocks.push(block);
    pageMedia += blockMedia;
  });
  flush();
  return pages;
}

function compactProjectPages(sections: PdfProjectSection[]) {
  const expanded = sections.flatMap(splitMediaDenseSection);
  const pages: PdfProjectSection[][] = [];
  expanded.forEach((section) => {
    const previous = pages.at(-1);
    const combined = previous ? [...previous, section] : [section];
    const textLength = combined.reduce((total, entry) => total + `${entry.heading ?? ""}${entry.body ?? ""}${entry.blocks.map((block) => `${block.title ?? ""}${block.body ?? ""}${block.secondaryBody ?? ""}`).join("")}`.length, 0);
    const combinedMedia = combined.reduce((total, entry) => total + mediaCount(entry), 0);
    const matrixRows = combined.reduce((total, entry) => total + entry.blocks.reduce((subtotal, block) => subtotal + (block.rows?.length ?? 0), 0), 0);
    if (previous && previous.length === 1 && combinedMedia <= 1 && matrixRows <= 6 && textLength <= 1100) previous.push(section);
    else pages.push([section]);
  });
  return pages;
}

export function PortfolioPdfDocument({ config, projects, projectContents, compositionConfig, uiWorks, games }: Props) {
  const locale = config.locale;
  const copy = labels[locale];
  const projectById = new Map(projects.map((item) => [item.id, item]));
  const uiById = new Map(uiWorks.map((item) => [item.id, item]));
  const gameById = new Map(games.map((item) => [item.id, item]));
  const enabledSections = [...config.sections].filter((item) => item.enabled).sort((a, b) => a.order - b.order);
  const pages: PageDescriptor[] = [];

  const add = (key: string, node: ReactNode, meta: Omit<PageDescriptor, "key" | "node"> = {}) => pages.push({ key, node, ...meta });

  for (const section of enabledSections) {
    if (section.id === "cover") {
      add("cover", <PdfCover config={config} />);
    }

    if (section.id === "profile") {
      add("profile", <PdfProfile locale={locale} config={config} />);
    }

    if (section.id === "projects") {
      const selected = [...config.projects].filter((item) => item.enabled).sort((a, b) => a.order - b.order);
      selected.forEach((item) => {
        const project = projectById.get(item.id);
        if (!project) return;
        const content = projectContents[item.id];
        const composition = compositionConfig.projects[item.id];
        if (compositionConfig.layoutMode === "designed" && composition?.pages.length) {
          composition.pages.forEach((page, index) => {
            const themeStyle = projectThemeStyle(composition.themeId, config.theme);
            add(`project-${item.id}-composed-${page.id}`, <PdfComposedProjectPage project={project} content={content} page={page} pageIndex={index} pageCount={composition.pages.length} />, { className: "pdf-composed-page-shell", style: themeStyle, compositionPageId: page.id, projectId: item.id });
          });
          return;
        }
        add(`project-${item.id}-overview`, <PdfProjectOverview project={project} item={item} />);
        if (content?.sections.length) {
          const sections = item.selectedSectionIds.length
            ? item.selectedSectionIds.flatMap((id) => content.sections.find((section) => section.id === id) ?? [])
            : content.sections;
          const contentPages = item.detailLevel === "compact" ? compactProjectPages(sections) : sections.flatMap(splitMediaDenseSection).map((section) => [section]);
          contentPages.forEach((group, index) => add(`project-${item.id}-content-${index}`, <PdfProjectContentPage project={project} item={item} content={content} sections={group} pageIndex={index} />));
        }
      });
    }

    if (section.id === "ui-works") {
      const selected = [...config.uiWorks].filter((item) => item.enabled).sort((a, b) => a.order - b.order).flatMap((item) => uiById.get(item.id) ?? []);
      chunk(selected, config.uiOptions.density).forEach((group, index) => add(`ui-${index}`, <PdfUiPage locale={locale} items={group} config={config} />));
    }

    if (section.id === "games") {
      const selected = [...config.games].filter((item) => item.enabled).sort((a, b) => a.order - b.order).flatMap((item) => {
        const game = gameById.get(item.id);
        return game ? [{ game, item }] : [];
      });
      chunk(selected, config.preset === "compact" ? 3 : 2).forEach((group, index) => add(`games-${index}`, <PdfGamesPage locale={locale} records={group} config={config} />));
    }

    if (section.id === "contact") {
      add("contact", <PdfContact locale={locale} />);
    }
  }

  return (
    <div className={`portfolio-pdf-document pdf-theme-${config.theme}`} data-pdf-page-count={pages.length} data-pdf-theme={config.theme}>
      {pages.map((page, index) => (
        <section className={`portfolio-pdf-page ${page.className ?? ""}`} style={page.style} data-pdf-page={index + 1} data-pdf-composition-page-id={page.compositionPageId} data-pdf-composition-project-id={page.projectId} key={page.key}>
          <div className="portfolio-pdf-page-content">{page.node}</div>
          <footer className="portfolio-pdf-footer"><span>{config.documentTitle}</span><span>{index + 1} / {pages.length}</span></footer>
        </section>
      ))}
    </div>
  );
}

function PdfSectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return <header className="pdf-section-heading"><p>{eyebrow}</p><h1>{title}</h1></header>;
}

function PdfCover({ config }: { config: PortfolioPdfConfig }) {
  const locale = config.locale;
  const role = portfolioProfile.role[locale];
  return <div className="pdf-cover-page">
    <div><p className="pdf-kicker">PORTFOLIO / {new Date().getFullYear()}</p><h1>{portfolioProfile.name}</h1><h2>{role}</h2><p className="pdf-cover-positioning">{portfolioProfile.positioning[locale]}</p></div>
    <div className="pdf-cover-meta"><p>{portfolioProfile.contact.email}</p>{portfolioProfile.contact.website ? <p>{portfolioProfile.contact.website}</p> : null}<p>{portfolioProfile.contact.location}</p></div>
  </div>;
}

function PdfProfile({ locale, config }: { locale: Locale; config: PortfolioPdfConfig }) {
  const copy = labels[locale];
  const summary = portfolioProfile.summary[locale];
  return <div>
    <PdfSectionHeading eyebrow="01 / PROFILE" title={copy.profile} />
    <div className="pdf-profile-grid">
      <div><h2>{portfolioProfile.name}</h2><p className="pdf-lead">{portfolioProfile.role[locale]}</p>{summary ? <p>{summary}</p> : null}</div>
      {config.profile.showSkills ? <div><h3>{copy.skills}</h3><div className="pdf-skill-list">{portfolioProfile.skills.map((skill) => <span key={skill}>{skill}</span>)}</div></div> : null}
    </div>
    {config.profile.showExperience && portfolioProfile.experience.length ? <div className="pdf-profile-list"><h3>{copy.experience}</h3>{portfolioProfile.experience.map((item) => <article key={item.id}><strong>{item.company[locale]} · {item.role[locale]}</strong><span>{item.date[locale]}</span>{item.bullets.map((bullet, index) => <p key={index}>{bullet[locale]}</p>)}</article>)}</div> : null}
    {config.profile.showEducation && portfolioProfile.education.length ? <div className="pdf-profile-list"><h3>{copy.education}</h3>{portfolioProfile.education.map((item) => <article key={item.id}><strong>{item.school[locale]} · {item.degree[locale]}</strong><span>{item.date[locale]}</span></article>)}</div> : null}
  </div>;
}

type ProjectThemeStyle = CSSProperties & Record<`--project-${string}`, string>;

function projectThemeStyle(themeId: ProjectPdfThemeId, outputTheme: PortfolioPdfConfig["theme"]): ProjectThemeStyle {
  const theme = projectPdfThemes[themeId];
  if (outputTheme === "print-light") return {
    "--project-background": "#f5f6fa",
    "--project-panel": "#e8ebf3",
    "--project-text": "#17192c",
    "--project-muted": "rgba(23,25,44,.66)",
    "--project-accent": theme.accent,
    "--project-accent-secondary": theme.secondaryAccent,
    "--project-media-border": "rgba(23,25,44,.16)",
  };
  return {
    "--project-background": theme.background,
    "--project-panel": theme.panel,
    "--project-text": theme.primaryText,
    "--project-muted": theme.secondaryText,
    "--project-accent": theme.accent,
    "--project-accent-secondary": theme.secondaryAccent,
    "--project-media-border": theme.mediaBorder,
  };
}

function resolveComposedPage(content: PdfProjectContent | undefined, page: ProjectPdfPage) {
  const sections = page.sectionIds.flatMap((id) => content?.sections.find((section) => section.id === id) ?? []);
  const allBlocks = content?.sections.flatMap((section) => section.blocks) ?? [];
  const blocks = page.blockIds.flatMap((id) => allBlocks.find((block) => block.id === id) ?? []);
  const allMedia = allBlocks.flatMap((block) => block.media ?? []);
  const media = page.mediaIds.flatMap((id) => allMedia.find((item) => item.id === id) ?? []);
  return { sections, blocks, media };
}

function PdfComposedProjectPage({ project, content, page, pageIndex, pageCount }: { project: ResolvedProjectMetadata; content?: PdfProjectContent; page: ProjectPdfPage; pageIndex: number; pageCount: number }) {
  const resolved = resolveComposedPage(content, page);
  const title = resolved.sections[0]?.title || project.title;
  const common = { project, title, sections: resolved.sections, blocks: resolved.blocks, media: resolved.media, showCaptions: page.showCaptions };
  return <div className={`pdf-composed-project-page pdf-composed-template-${page.template}`} data-pdf-project-id={project.id} data-pdf-designed-template={page.template} data-pdf-designed-page={page.id}>
    {page.template === "project-hero" ? <PdfDesignedHero {...common} content={content} /> : null}
    {page.template === "text-media" || page.template === "media-text" ? <PdfDesignedSplit {...common} reverse={page.template === "media-text"} /> : null}
    {page.template === "four-screen-grid" ? <PdfDesignedFourGrid {...common} /> : null}
    {page.template === "comparison" ? <PdfDesignedComparison {...common} /> : null}
    {page.template === "process-flow" ? <PdfDesignedProcess {...common} /> : null}
    {page.template === "full-visual" ? <PdfDesignedFullVisual {...common} /> : null}
    {page.template === "structured-overview" ? <PdfDesignedOverview {...common} /> : null}
    <div className="pdf-composed-page-index"><span>{project.title}</span><span>{String(pageIndex + 1).padStart(2, "0")} / {String(pageCount).padStart(2, "0")}</span></div>
  </div>;
}

type DesignedPageProps = {
  project: ResolvedProjectMetadata;
  title: string;
  sections: PdfProjectSection[];
  blocks: PdfProjectBlock[];
  media: PdfProjectMedia[];
  showCaptions: boolean;
};

function DesignedHeader({ project, title, index }: { project: ResolvedProjectMetadata; title: string; index?: string }) {
  return <header className="pdf-designed-header"><div><p>{index || project.category || "PROJECT STORY"}</p><h2>{title}</h2></div><span>{project.duration}</span></header>;
}

function PdfDesignedHero({ project, content, sections, media, showCaptions }: DesignedPageProps & { content?: PdfProjectContent }) {
  const { image } = useProjectCover(project.id, project.coverImage);
  const heroMedia = media[0];
  const highlights = (content?.sections ?? sections).slice(0, 4);
  return <div className="pdf-designed-hero">
    <div className="pdf-designed-hero-copy"><p className="pdf-designed-kicker">{project.category || "PROJECT CASE STUDY"}</p><h1>{project.title}</h1>{project.summary ? <p className="pdf-designed-hero-summary">{project.summary}</p> : null}<div className="pdf-designed-hero-meta">{project.duration ? <span>{project.duration}</span> : null}{project.role ? <span>{project.role}</span> : null}{project.tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}</div></div>
    <div className="pdf-designed-hero-visual">{image ? <PdfImage src={image} alt={project.title} contain /> : heroMedia ? <PdfUnifiedProjectMedia media={heroMedia} showCaption={showCaptions} /> : <div className="pdf-designed-hero-placeholder" />}</div>
    <div className="pdf-designed-highlights">{highlights.map((section, index) => <div key={section.id}><span>{String(index + 1).padStart(2, "0")}</span><strong>{section.title}</strong></div>)}</div>
  </div>;
}

function PdfDesignedSplit(props: DesignedPageProps & { reverse: boolean }) {
  const main = props.media[0];
  return <div><DesignedHeader project={props.project} title={props.title} /><div className={`pdf-designed-split ${props.reverse ? "is-reversed" : ""}`}><div className="pdf-designed-copy"><ComposedCopy sections={props.sections} blocks={props.blocks} maxParagraphs={3} /></div><div className="pdf-designed-main-media">{main ? <PdfUnifiedProjectMedia media={main} showCaption={props.showCaptions} /> : <div className="pdf-designed-media-placeholder" />}{props.media.length > 1 ? <div className="pdf-designed-support-media">{props.media.slice(1, 3).map((item) => <PdfUnifiedProjectMedia key={item.id} media={item} showCaption={props.showCaptions} />)}</div> : null}</div></div></div>;
}

function PdfDesignedFourGrid(props: DesignedPageProps) {
  return <div><DesignedHeader project={props.project} title={props.title} /><div className="pdf-designed-grid-intro"><ComposedCopy sections={props.sections} blocks={[]} maxParagraphs={1} /></div><div className="pdf-designed-four-grid">{props.media.slice(0, 4).map((item, index) => <div className="pdf-designed-screen" key={item.id}><span>{String(index + 1).padStart(2, "0")}</span><PdfUnifiedProjectMedia media={item} showCaption={props.showCaptions} /></div>)}</div>{props.blocks.find((block) => block.type === "quote") ? <PdfAuthoredBlock block={props.blocks.find((block) => block.type === "quote")!} item={{ selectedMediaIds: props.media.map((item) => item.id) }} /> : null}</div>;
}

function PdfDesignedComparison(props: DesignedPageProps) {
  const comparison = props.blocks.find((block) => block.type === "comparison");
  const labels = comparison?.items ?? [];
  return <div><DesignedHeader project={props.project} title={props.title} /><div className="pdf-designed-comparison-intro"><ComposedCopy sections={props.sections} blocks={[]} maxParagraphs={1} /></div><div className="pdf-designed-comparison">{[0, 1].map((index) => <article key={index}><div className="pdf-designed-comparison-label"><span>{index === 0 ? "01 / BEFORE" : "02 / AFTER"}</span><h3>{labels[index]?.title || props.media[index]?.title || (index === 0 ? "Before" : "After")}</h3></div>{props.media[index] ? <PdfUnifiedProjectMedia media={props.media[index]} showCaption={props.showCaptions} /> : <div className="pdf-designed-media-placeholder" />}{labels[index]?.description ? <p>{labels[index].description}</p> : null}</article>)}</div></div>;
}

function PdfDesignedProcess(props: DesignedPageProps) {
  const flow = props.blocks.find((block) => block.type === "flow");
  const steps = flow?.steps ?? props.blocks.flatMap((block) => block.items?.map((item) => item.title) ?? []).slice(0, 5);
  return <div><DesignedHeader project={props.project} title={props.title} /><div className="pdf-designed-process"><div className="pdf-designed-process-copy"><ComposedCopy sections={props.sections} blocks={[]} maxParagraphs={2} /></div>{props.media[0] ? <div className="pdf-designed-process-media"><PdfUnifiedProjectMedia media={props.media[0]} showCaption={props.showCaptions} /></div> : null}<div className="pdf-designed-process-steps">{steps.slice(0, 5).map((step, index) => <div key={`${step}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><strong>{step}</strong></div>)}</div>{props.blocks.filter((block) => block.type !== "flow").slice(0, 1).map((block) => <PdfAuthoredBlock key={block.id} block={block} item={{ selectedMediaIds: [] }} />)}</div></div>;
}

function PdfDesignedFullVisual(props: DesignedPageProps) {
  return <div><DesignedHeader project={props.project} title={props.title} /><div className={`pdf-designed-full-media pdf-designed-full-media-${Math.min(props.media.length, 3)}`}>{props.media.slice(0, 3).map((item) => <PdfUnifiedProjectMedia key={item.id} media={item} showCaption={props.showCaptions} />)}{!props.media.length ? <div className="pdf-designed-media-placeholder" /> : null}</div><div className="pdf-designed-insight"><ComposedCopy sections={props.sections} blocks={props.blocks.filter((block) => block.type === "quote")} maxParagraphs={2} /></div></div>;
}

function PdfDesignedOverview(props: DesignedPageProps) {
  return <div><DesignedHeader project={props.project} title={props.title} /><div className="pdf-designed-overview"><div className="pdf-designed-overview-copy"><ComposedCopy sections={props.sections} blocks={[]} maxParagraphs={2} /></div><div className="pdf-designed-overview-structure">{props.media.length ? <div className={`pdf-designed-overview-media pdf-designed-overview-media-${Math.min(props.media.length, 2)}`}>{props.media.slice(0, 2).map((item) => <PdfUnifiedProjectMedia key={item.id} media={item} showCaption={props.showCaptions} />)}</div> : null}{props.blocks.map((block) => <PdfAuthoredBlock key={block.id} block={block} item={{ selectedMediaIds: props.media.map((item) => item.id) }} />)}</div></div></div>;
}

function ComposedCopy({ sections, blocks, maxParagraphs }: { sections: PdfProjectSection[]; blocks: PdfProjectBlock[]; maxParagraphs: number }) {
  const lead = sections.map((section) => section.heading).filter(Boolean).slice(0, 1);
  const body = sections.flatMap((section) => section.body ? paragraphs(section.body) : []).slice(0, maxParagraphs);
  const blockBody = blocks.flatMap((block) => [block.body, block.secondaryBody].filter(Boolean) as string[]).flatMap(paragraphs).slice(0, Math.max(0, maxParagraphs - body.length));
  return <>{lead.map((value) => <h3 key={value}>{value}</h3>)}{[...body, ...blockBody].map((value, index) => <p key={`${index}-${value.slice(0, 12)}`}>{value}</p>)}</>;
}

function PdfProjectOverview({ project, item }: { project: ResolvedProjectMetadata; item: PdfProjectItemConfig }) {
  const { image } = useProjectCover(project.id, project.coverImage);
  return <div>
    <PdfSectionHeading eyebrow={`PROJECT / ${String(project.archiveOrder + 1).padStart(2, "0")}`} title={project.title} />
    <div className="pdf-project-meta">{item.showRole && project.role ? <span>{project.role}</span> : null}{item.showTimeline && project.duration ? <span>{project.duration}</span> : null}{project.category ? <span>{project.category}</span> : null}</div>
    {item.showCover ? <PdfImage src={image} alt={project.title} className="pdf-project-cover" /> : null}
    {item.showSummary && project.summary ? <div className="pdf-project-summary"><p>{excerpt(project.summary, item.detailLevel === "compact" ? 420 : 720)}</p></div> : null}
    <div className="pdf-project-tags">{project.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
  </div>;
}

function PdfProjectContentPage({ project, item, content, sections, pageIndex }: { project: ResolvedProjectMetadata; item: PdfProjectItemConfig; content: PdfProjectContent; sections: PdfProjectSection[]; pageIndex: number }) {
  return <div data-pdf-project-id={project.id} data-pdf-project-content-page={pageIndex + 1} data-pdf-project-source={content.sourceType} data-pdf-blocks-encountered={content.blockTypesEncountered.join(",")} data-pdf-blocks-rendered={content.blockTypesRendered.join(",")} data-pdf-blocks-fallback={content.fallbackTypes.join(",")}>
    <PdfSectionHeading eyebrow={`PROJECT STORY / ${String(pageIndex + 1).padStart(2, "0")}`} title={project.title} />
    <div className="pdf-project-section-list">{sections.map((section, index) => <PdfAuthoredSection key={`${section.id}-${index}`} section={section} item={item} />)}</div>
  </div>;
}

function PdfAuthoredSection({ section, item }: { section: PdfProjectSection; item: PdfProjectItemConfig }) {
  return <section className="pdf-project-content-section" data-pdf-project-section={section.id}>
    <h2>{section.title}</h2>
    {section.heading ? <h3 className="pdf-authored-heading">{section.heading}</h3> : null}
    {section.body ? <div className="pdf-authored-body">{paragraphs(section.body).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div> : null}
    <div className="pdf-authored-blocks">{section.blocks.map((block) => <PdfAuthoredBlock key={block.id} block={block} item={item} />)}</div>
  </section>;
}

function PdfAuthoredBlock({ block, item }: { block: PdfProjectBlock; item: Pick<PdfProjectItemConfig, "selectedMediaIds"> }) {
  const selectedMedia = (block.media ?? []).filter((entry) => !item.selectedMediaIds.length || item.selectedMediaIds.includes(entry.id));
  if (block.type === "media") return <section className="pdf-authored-block"><BlockTitle block={block} />{block.body ? <p className="pdf-block-body">{block.body}</p> : null}{selectedMedia.length ? <div className={`pdf-authored-media-grid pdf-authored-media-${Math.min(selectedMedia.length, 4)}`}>{selectedMedia.map((entry) => <PdfUnifiedProjectMedia key={entry.id} media={entry} />)}</div> : block.linkUrl ? <div className="pdf-figma-placeholder">{block.title || "Interactive prototype"}</div> : null}{block.linkUrl ? <p className="pdf-figma-link"><a href={block.linkUrl}>{block.linkLabel || "Open interactive prototype in Figma"}</a><br /><small>{block.linkUrl}</small></p> : null}</section>;
  if (block.type === "comparison") return <section className="pdf-authored-block"><BlockTitle block={block} /><div className="pdf-comparison-grid">{(block.items ?? []).map((entry, index) => <article key={entry.id}><span>{String(index + 1).padStart(2, "0")}</span><h4>{entry.title}</h4><p>{entry.description}</p>{selectedMedia[index] ? <PdfUnifiedProjectMedia media={selectedMedia[index]} /> : null}</article>)}</div></section>;
  if (block.type === "flow") return <section className="pdf-authored-block"><BlockTitle block={block} /><div className="pdf-compact-flow">{(block.steps ?? []).map((step, index) => <div key={`${block.id}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><p>{step}</p></div>)}</div></section>;
  if (block.type === "grid") return <section className="pdf-authored-block"><BlockTitle block={block} />{block.body ? <p className="pdf-block-body">{block.body}</p> : null}<div className="pdf-content-grid">{(block.items ?? []).map((entry) => <article key={entry.id}><h4>{entry.title}</h4><p>{entry.description}</p>{entry.value ? <strong>{entry.value}</strong> : null}</article>)}</div></section>;
  if (block.type === "matrix") return <section className="pdf-authored-block"><BlockTitle block={block} /><table className="pdf-content-matrix"><thead><tr>{(block.columns ?? []).map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{(block.rows ?? []).map((row, rowIndex) => <tr key={`${block.id}-${rowIndex}`}>{row.map((cell, cellIndex) => <td key={`${block.id}-${rowIndex}-${cellIndex}`}>{cell}</td>)}</tr>)}</tbody></table></section>;
  if (block.type === "quote") return <blockquote className="pdf-authored-quote"><BlockTitle block={block} />{block.body ? <p>{block.body}</p> : null}</blockquote>;
  return <section className={`pdf-project-text-block ${block.type === "fallback" ? "pdf-block-fallback" : ""}`}><BlockTitle block={block} />{block.body ? paragraphs(block.body).map((paragraph, index) => <p key={index}>{paragraph}</p>) : null}{block.secondaryBody ? <p>{block.secondaryBody}</p> : null}{selectedMedia.length ? <div className="pdf-authored-media-grid">{selectedMedia.map((entry) => <PdfUnifiedProjectMedia key={entry.id} media={entry} />)}</div> : null}{block.type === "fallback" && block.unsupportedType ? <small>Fallback renderer: {block.unsupportedType}</small> : null}</section>;
}

function BlockTitle({ block }: { block: PdfProjectBlock }) {
  return <>{block.eyebrow ? <p className="pdf-block-eyebrow">{block.eyebrow}</p> : null}{block.title ? <h3>{block.title}</h3> : null}</>;
}

function PdfUnifiedProjectMedia({ media, showCaption = true }: { media: PdfProjectMedia; showCaption?: boolean }) {
  const legacySource = useLegacyProjectAsset(media.projectId, media.assetSource === "legacy" ? media.localImageId : undefined, media.assetSource === "legacy" ? media.publicPath : undefined);
  const documentSource = useProjectBodyAsset(media.assetSource === "project-document" ? media.localImageId : undefined, media.assetSource === "project-document" ? media.publicPath : undefined);
  const src = media.assetSource === "project-document" ? documentSource : legacySource;
  return <figure data-pdf-project-media={media.id}><PdfImage src={src} alt={media.title || media.caption || "Project image"} contain={media.cropMode !== "cover"} />{showCaption && (media.title || media.caption) ? <figcaption>{media.title ? <strong>{media.title}</strong> : null}{media.caption ? <span>{media.caption}</span> : null}</figcaption> : null}</figure>;
}

function paragraphs(value: string) {
  return value.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
}

function PdfUiPage({ locale, items, config }: { locale: Locale; items: UiPracticeCatalogItem[]; config: PortfolioPdfConfig }) {
  return <div><PdfSectionHeading eyebrow="UI WORKS" title={labels[locale].ui} /><div className={`pdf-ui-grid pdf-ui-grid-${config.uiOptions.density}`}>{items.map((item) => <figure key={item.id}><PdfImage src={item.src} alt={item.title || item.filename} contain={config.uiOptions.cropMode === "contain"} />{config.uiOptions.showCaptions && (item.title || item.description) ? <figcaption><strong>{item.title}</strong>{item.description ? <span>{item.description}</span> : null}</figcaption> : null}</figure>)}</div></div>;
}

function PdfGamesPage({ locale, records, config }: { locale: Locale; records: Array<{ game: GameExperienceRecord; item: PortfolioPdfConfig["games"][number] }>; config: PortfolioPdfConfig }) {
  return <div><PdfSectionHeading eyebrow="GAME EXPERIENCE" title={labels[locale].games} /><div className="pdf-game-list">{records.map(({ game, item }) => <PdfGameRecord key={game.id} locale={locale} game={game} detailLevel={item.detailLevel} config={config} />)}</div></div>;
}

function PdfGameRecord({ locale, game, detailLevel, config }: { locale: Locale; game: GameExperienceRecord; detailLevel: "metadata" | "summary" | "detail"; config: PortfolioPdfConfig }) {
  const cover = useGameCover(game.presentation.coverAssetId, game.presentation.coverPublicPath);
  const copy = labels[locale];
  const why = locale === "zh" ? game.reflection.whyPlayedZh : game.reflection.whyPlayedEn;
  const strengths = locale === "zh" ? game.reflection.strengthsZh : game.reflection.strengthsEn;
  const learned = locale === "zh" ? game.reflection.contributionZh : game.reflection.contributionEn;
  const detail = locale === "zh" ? game.detail.zh : game.detail.en;
  const tags = game.presentation.tags.map((tag) => locale === "zh" ? tag.zh || tag.en : tag.en || tag.zh).filter(Boolean);
  const playtime = formatPlaytime(game, locale);
  const achievement = config.gameOptions.showAchievements ? formatAchievement(game, locale) : null;
  const metadata = [playtime ? `${copy.playtime}: ${playtime}` : "", achievement ? `${copy.achievement}: ${achievement}` : ""].filter(Boolean).join(" · ");
  return <article className="pdf-game-record">
    <PdfImage src={cover} alt={gameTitle(game, locale)} className="pdf-game-cover" />
    <div><div className="pdf-game-title-row"><h2>{gameTitle(game, locale)}</h2>{metadata ? <span>{metadata}</span> : null}</div>
      {config.gameOptions.showTags && tags.length ? <div className="pdf-game-tags">{tags.slice(0, 4).map((tag) => <span key={tag}>{tag}</span>)}</div> : null}
      {detailLevel !== "metadata" ? <div className="pdf-game-summary">{why ? <p><strong>{copy.why}</strong>{excerpt(why, 180)}</p> : null}{strengths ? <p><strong>{copy.strengths}</strong>{excerpt(strengths, 220)}</p> : null}{learned ? <p><strong>{copy.learned}</strong>{excerpt(learned, 220)}</p> : null}</div> : null}
      {detailLevel === "detail" && detail.trim() ? <p className="pdf-game-detail">{detail}</p> : null}
    </div>
  </article>;
}

function PdfContact({ locale }: { locale: Locale }) {
  return <div className="pdf-contact-page"><PdfSectionHeading eyebrow="CONTACT" title={labels[locale].contact} /><div><h2>{portfolioProfile.name}</h2><p>{portfolioProfile.role[locale]}</p><a href={`mailto:${portfolioProfile.contact.email}`}>{portfolioProfile.contact.email}</a>{portfolioProfile.contact.website ? <p>{portfolioProfile.contact.website}</p> : null}<p>{portfolioProfile.contact.location}</p></div></div>;
}

function PdfImage({ src, alt, contain = false, className = "" }: { src?: string; alt: string; contain?: boolean; className?: string }) {
  const optimized = usePdfImageSource(src);
  const missing = optimized.ready && !optimized.source;
  return <div className={`pdf-image ${missing ? "pdf-image-missing" : ""} ${className}`} data-pdf-image-ready={!src || optimized.ready}>{src && optimized.source ? <img src={optimized.source} alt={alt} className={contain ? "pdf-image-contain" : ""} /> : <span>{src && !optimized.ready ? "PREPARING IMAGE" : "IMAGE NOT AVAILABLE"}</span>}</div>;
}

function usePdfImageSource(src?: string) {
  const [state, setState] = useState({ source: src ?? "", ready: !src });

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    if (!src) {
      setState({ source: "", ready: true });
      return undefined;
    }
    setState({ source: "", ready: false });
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      const maxWidth = 1400;
      const scale = Math.min(1, maxWidth / image.naturalWidth);
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        if (active) setState({ source: src, ready: true });
        return;
      }
      context.fillStyle = "#f8f9fc";
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (!active) return;
        if (!blob) {
          setState({ source: src, ready: true });
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setState({ source: objectUrl, ready: true });
      }, "image/jpeg", 0.84);
    };
    image.onerror = () => { if (active) setState({ source: "", ready: true }); };
    image.src = src;
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  return state;
}
