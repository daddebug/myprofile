import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, ExternalLink, Sparkles } from "lucide-react";
import { getAdjacentProjects, getProjectBySlug } from "../data/projects";
import { PageTransition } from "../components/PageTransition";
import { ImageWithFallback } from "../components/ImageWithFallback";
import { ProjectBlocks } from "../components/ProjectBlocks";
import { PlayableFrame } from "../components/PlayableFrame";
import { CaseStudyVisual } from "../components/CaseStudyVisual";
import { CrossPlatformDraftPage } from "./CrossPlatformDraftPage";
import { GameJamDraftPage } from "./GameJamDraftPage";
import { ThreeDCharacterUiDraftPage } from "./ThreeDCharacterUiDraftPage";
import { UIPracticePage } from "./UIPracticePage";
import { useLocale } from "../locales/LocaleContext";
import { getProjectTranslation } from "../content/projects/translations";
import { useProjectCatalog } from "../hooks/useProjectCatalog";
import { ProjectBackToTop } from "../components/ProjectBackToTop";
import { InteractionProfileAgentPage } from "./InteractionProfileAgentPage";
import { CaseStudyEditorDock, CaseStudyEditorProvider, useCaseStudyEditor } from "../components/CaseStudyEditor";

export function ProjectPage() {
  return (
    <CaseStudyEditorProvider>
      <ProjectPageFrame />
    </CaseStudyEditorProvider>
  );
}

function ProjectPageFrame() {
  const { isEditing, toggleEditing } = useCaseStudyEditor();
  return (
    <>
      <ProjectBackToTop />
      <CaseStudyEditorDock isEditing={isEditing} onToggle={toggleEditing} />
      <ProjectPageContent />
    </>
  );
}

function ProjectPageContent() {
  const { slug } = useParams();
  const { locale, messages, pathFor } = useLocale();
  const projectCatalog = useProjectCatalog(locale);
  const publicMetadata = projectCatalog.find((item) => item.id === slug);

  if (slug === "interaction-profile-agent") {
    return <InteractionProfileAgentPage />;
  }

  if (slug && locale === "en" && getProjectTranslation(slug, "en")?.status !== "complete") {
    return <EnglishProjectPlaceholder slug={slug} />;
  }

  if (slug === "cross-platform-game-ux") {
    return <CrossPlatformDraftPage />;
  }

  if (slug === "from-theme-to-playable-rule") {
    return <GameJamDraftPage />;
  }

  if (slug === "3d-character-ui-rhythm") {
    return <ThreeDCharacterUiDraftPage />;
  }

  if (slug === "ui-personal-practice") {
    return <UIPracticePage />;
  }

  const project = slug ? getProjectBySlug(slug) : undefined;

  if (!project) {
    return <Navigate to={pathFor("/work")} replace />;
  }

  const { previous, next } = getAdjacentProjects(project.slug);
  const metadata = project.metadata ?? [
    ["Role", project.role],
    ["Timeline", publicMetadata?.duration ?? project.timeline],
    ["Tools", project.tools.join(", ")],
    ["Type", project.type],
  ].map(([label, value]) => ({ label, value }));

  return (
    <PageTransition>
      <article className="bg-deepIndigo text-softWhite">
        <section className="relative overflow-hidden bg-deepIndigo">
          <div className="absolute inset-0 bg-grain bg-[length:18px_18px] opacity-35" />
          <div className="site-container relative py-14 md:py-18">
            <Link
              to={pathFor("/work")}
              className="mb-8 inline-flex items-center gap-2 rounded-full border border-softWhite/18 bg-archiveBlue/36 px-3 py-2 text-sm font-bold text-acidGreen transition hover:-translate-y-1 hover:border-acidGreen"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {messages.project.backToArchive}
            </Link>
            <div className="grid gap-10 md:grid-cols-[0.85fr_1.15fr] md:items-end">
              <div>
                <p className="w-fit rounded-full border border-acidGreen/35 bg-acidGreen/10 px-3 py-1 font-mono text-xs font-bold uppercase tracking-[0.18em] text-acidGreen">
                  artifact {project.year} / {publicMetadata?.category ?? project.category}
                </p>
                <h1 className="mt-5 font-display text-[clamp(3.5rem,8vw,7.5rem)] leading-none text-softWhite">{publicMetadata?.title ?? project.title}</h1>
                <p className="mt-5 text-lg leading-8 text-softWhite/76">{publicMetadata?.summary ?? project.subtitle}</p>
                {project.primaryQuestion ? (
                  <p className="mt-6 max-w-3xl text-2xl font-semibold leading-9 text-softWhite md:text-3xl md:leading-10">
                    {project.primaryQuestion}
                  </p>
                ) : null}
                <p className="mt-5 text-base leading-8 text-softWhite/66">{project.summary}</p>
                <div className="mt-8 flex flex-wrap gap-2">
                  {project.highlights.slice(0, 3).map((highlight) => (
                    <span
                      key={highlight}
                      className="rounded-full border border-softWhite/14 bg-archiveBlue/38 px-3 py-1 text-xs font-bold text-softWhite/78"
                    >
                      {highlight}
                    </span>
                  ))}
                </div>
              </div>
              {project.heroComparison ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <CaseStudyVisual image={project.heroComparison.before} />
                  <CaseStudyVisual image={project.heroComparison.after} />
                </div>
              ) : (
                <div className="relative overflow-hidden rounded-[30px] border border-softWhite/14 bg-archiveBlue/34 p-3 shadow-archive">
                  <ImageWithFallback
                    src={publicMetadata?.coverImage || project.cover}
                    alt={`${publicMetadata?.title ?? project.title} cover`}
                    className="aspect-[4/3] w-full rounded-[22px] object-cover md:aspect-[16/10]"
                    placeholderClassName="aspect-[4/3] rounded-[22px] md:aspect-[16/10]"
                  />
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="bg-archiveBlue py-8">
          <div className="site-container grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {metadata.map(({ label, value }) => (
              <div key={label} className="rounded-[24px] border border-softWhite/12 bg-deepIndigo/46 p-5">
                <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-acidGreen">{label}</p>
                <p className="mt-3 text-sm leading-6 text-softWhite/72">{value}</p>
              </div>
            ))}
          </div>
        </section>

        {project.caseMap?.length ? (
          <section className="bg-deepIndigo py-5">
            <div className="site-container">
              <div className="flex gap-5 overflow-x-auto border-y border-softWhite/10 py-3">
                {project.caseMap.map((item) => (
                  <span
                    key={`${item.label}-${item.title}`}
                    className="shrink-0 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-softWhite/54"
                  >
                    <span className="text-acidGreen">{item.label}</span> {item.title}
                  </span>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <section className="bg-deepIndigo py-16 md:py-20">
          <div className="site-container grid gap-10 md:grid-cols-[280px_1fr]">
            <aside className="h-fit rounded-[30px] border border-softWhite/12 bg-archiveBlue/34 p-5 md:sticky md:top-24">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-acidGreen text-deepIndigo">
                  <Sparkles className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-acidGreen">Archive map</p>
                  <p className="mt-1 text-sm font-bold text-softWhite">{publicMetadata?.title ?? project.title}</p>
                </div>
              </div>
              <div className="mt-6 grid gap-3 text-sm leading-6 text-softWhite/68">
                <p>{project.summary}</p>
                <div className="border-t border-softWhite/10 pt-4">
                  <p className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-acidGreen">Role</p>
                  <p className="mt-1">{project.role}</p>
                </div>
              </div>
            </aside>
            <div>
              <p className="w-fit rounded-full border border-acidGreen/45 bg-acidGreen/10 px-3 py-1 font-mono text-xs font-bold uppercase tracking-[0.18em] text-acidGreen">
                {project.openingEyebrow ?? "opening spread"}
              </p>
              <h2 className="mt-3 max-w-4xl font-display text-5xl leading-tight text-softWhite md:text-6xl">
                {project.openingTitle ?? "A small project world about rules, feeling, and interface trust."}
              </h2>
              <div className="mt-8 grid gap-6 md:grid-cols-[1fr_0.8fr]">
                <p className="text-xl leading-9 text-softWhite/72">{project.openingSummary ?? project.summary}</p>
                <p className="text-base leading-8 text-softWhite/62">{project.background}</p>
              </div>
              <div className="mt-10 grid gap-4 lg:grid-cols-2">
                <InfoList title="Design clues" items={project.designGoals} />
                <InfoList title="Notable traces" items={project.highlights} />
              </div>
            </div>
          </div>
        </section>

        <section className="bg-[#121239] py-16 md:py-20">
          <div className="site-container">
            <div className="mb-14 grid gap-8 md:grid-cols-[0.55fr_1fr]">
              <div>
                <p className="w-fit rounded-full border border-acidGreen/45 bg-acidGreen/10 px-3 py-1 font-mono text-xs font-bold uppercase tracking-[0.18em] text-acidGreen">
                  process zine
                </p>
                <h2 className="mt-3 font-display text-5xl leading-tight text-softWhite md:text-6xl">
                  {project.processTitle ?? "Behind the Interface"}
                </h2>
              </div>
              <div className="grid gap-3">
                {project.process.map((step, index) => (
                  <div
                    key={step}
                    className="grid gap-3 rounded-[24px] border border-softWhite/12 bg-archiveBlue/34 p-4 sm:grid-cols-[72px_1fr]"
                  >
                    <span className="font-mono text-3xl font-semibold text-acidGreen">{String(index + 1).padStart(2, "0")}</span>
                    <p className="text-sm leading-6 text-softWhite/70">{step}</p>
                  </div>
                ))}
              </div>
            </div>

            <ProjectBlocks blocks={project.blocks} />

            {project.playable ? (
              <div className="mt-10">
                <PlayableFrame {...project.playable} />
              </div>
            ) : null}

            {project.externalLinks?.length ? (
              <div className="mt-10 flex flex-wrap gap-3">
                {project.externalLinks.map((link) => (
                  <a
                    key={link.label}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-softWhite/12 bg-archiveBlue/34 px-4 py-2 text-sm font-bold text-softWhite transition hover:-translate-y-1 hover:border-acidGreen hover:text-acidGreen"
                  >
                    {link.label}
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        <nav className="bg-deepIndigo py-10 text-softWhite" data-project-bottom-navigation>
          <div className="site-container grid gap-4 md:grid-cols-2">
            {previous ? (
              <Link className="project-nav-link" to={pathFor(`/work/${previous.slug}`)}>
                <ArrowLeft className="h-5 w-5" aria-hidden="true" />
                <span>
                  <span className="block font-mono text-xs uppercase tracking-[0.2em] text-acidGreen">{messages.project.previousProject}</span>
                  <span className="font-display text-2xl">{previous.title}</span>
                </span>
              </Link>
            ) : null}
            {next ? (
              <Link className="project-nav-link justify-end text-right" to={pathFor(`/work/${next.slug}`)}>
                <span>
                  <span className="block font-mono text-xs uppercase tracking-[0.2em] text-acidGreen">{messages.project.nextProject}</span>
                  <span className="font-display text-2xl">{next.title}</span>
                </span>
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </Link>
            ) : null}
          </div>
        </nav>
      </article>
    </PageTransition>
  );
}

function EnglishProjectPlaceholder({ slug }: { slug: string }) {
  const { messages, pathFor } = useLocale();

  return (
    <PageTransition>
      <main className="grid min-h-[70svh] place-items-center bg-deepIndigo px-4 py-20 text-center text-softWhite md:px-6">
        <div className="max-w-2xl">
          <h1 className="font-display text-5xl leading-tight md:text-7xl">{messages.project.englishInProgress}</h1>
          <p className="mt-6 text-lg leading-8 text-softWhite/68">{messages.project.chineseAvailable}</p>
          <Link
            className="mt-8 inline-flex items-center gap-2 rounded-[12px] border border-acidGreen/45 px-4 py-2 text-sm font-bold text-acidGreen transition hover:bg-acidGreen hover:text-deepIndigo"
            to={pathFor(`/work/${slug}`, "zh")}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {messages.project.viewChineseVersion}
          </Link>
        </div>
      </main>
    </PageTransition>
  );
}

function InfoList({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="rounded-[30px] border border-softWhite/12 bg-archiveBlue/34 p-6">
      <h3 className="font-display text-3xl text-softWhite">{title}</h3>
      <ul className="mt-5 space-y-3">
        {items.map((item) => (
          <li key={item} className="flex gap-3 text-sm leading-6 text-softWhite/70">
            <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-acidGreen" />
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
