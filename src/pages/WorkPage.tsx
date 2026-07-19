import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { PageTransition } from "../components/PageTransition";
import { useProjectCatalog } from "../hooks/useProjectCatalog";
import { useLocale } from "../locales/LocaleContext";

const archiveCopy = {
  zh: {
    eyebrow: "/ 项目档案",
    title: "项目档案",
    description: "这里整理了商业案例、游戏交互探索与个人实验。",
  },
  en: {
    eyebrow: "/ Archive",
    title: "Project Archive",
    description: "A visual index of case studies, game interaction explorations, and personal experiments.",
  },
};

export function WorkPage() {
  const { locale, pathFor } = useLocale();
  const projectCatalog = useProjectCatalog(locale);
  const copy = archiveCopy[locale];
  const orderedProjects = projectCatalog
    .filter((project) => project.route?.startsWith("/work/"))
    .sort((left, right) => (left.archiveOrder ?? Number.MAX_SAFE_INTEGER) - (right.archiveOrder ?? Number.MAX_SAFE_INTEGER));

  return (
    <PageTransition>
      <main className="min-h-screen bg-deepIndigo text-softWhite">
        <section className="border-b border-softWhite/10 py-16 md:py-20">
          <div className="site-container">
            <p className="font-mono text-[11px] font-bold tracking-[0.18em] text-acidGreen">{copy.eyebrow}</p>
            <h1 className="project-archive-title mt-4 font-display font-semibold text-softWhite">
              {copy.title}
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-softWhite/64">{copy.description}</p>
          </div>
        </section>

        <section className="pb-28 pt-8 md:pb-36 md:pt-12">
          <div className="site-container border-b border-softWhite/10">
            {orderedProjects.map((project, index) => {
              const tags = project.tags.slice(0, 2).join(" / ") || project.category;

              return (
                <Link
                  key={project.id}
                  to={pathFor(project.route ?? "/work")}
                  className="project-archive-row group min-w-0 border-t border-softWhite/10 py-7 outline-none transition-colors duration-300 hover:bg-softWhite/[0.025] focus-visible:bg-softWhite/[0.04] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-acidGreen/70 md:py-9"
                >
                  <span className="pt-1 font-mono text-[11px] font-bold tracking-[0.12em] text-softWhite/32">
                    {String(index + 1).padStart(2, "0")}
                  </span>

                  <div className="min-w-0">
                    <h2 className="project-archive-project-title font-display font-semibold text-softWhite transition-colors duration-300 group-hover:text-acidGreen group-focus-visible:text-acidGreen">
                      {project.title}
                    </h2>
                    <p className="mt-3 max-w-3xl text-base leading-7 text-softWhite/60">{project.summary}</p>
                  </div>

                  <div className="project-archive-metadata min-w-0">
                    <p className="font-mono text-[10px] font-bold uppercase leading-5 tracking-[0.12em] text-softWhite/42">
                      {tags}
                    </p>
                    <p className="mt-1 font-mono text-[10px] tracking-[0.1em] text-[#9FAAD2]">{project.duration}</p>
                  </div>

                  <ArrowRight className="project-archive-arrow h-5 w-5 text-softWhite/34 transition duration-300 group-hover:translate-x-1 group-hover:text-acidGreen group-focus-visible:translate-x-1 group-focus-visible:text-acidGreen" aria-hidden="true" />
                </Link>
              );
            })}
          </div>
        </section>
      </main>
    </PageTransition>
  );
}
