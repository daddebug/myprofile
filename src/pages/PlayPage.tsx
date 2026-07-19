import { ExternalLink, Play, Sparkles } from "lucide-react";
import { playableProjects } from "../data/projects";
import { PageTransition } from "../components/PageTransition";
import { SectionHeading } from "../components/SectionHeading";
import { ImageWithFallback } from "../components/ImageWithFallback";
import { PlayableFrame } from "../components/PlayableFrame";

export function PlayPage() {
  const firstPlayable = playableProjects[0];

  return (
    <PageTransition>
      <section className="relative overflow-hidden bg-deepIndigo py-16 text-softWhite md:py-20">
        <div className="absolute inset-0 bg-grain bg-[length:18px_18px] opacity-35" />
        <div className="relative mx-auto grid max-w-7xl gap-8 px-4 md:grid-cols-[0.85fr_1.15fr] md:items-end md:px-6">
          <SectionHeading
            eyebrow="Play"
            title="Little World Cabinet"
            subtitle="Playable objects, toy-like prototypes, and tiny systems you can click into."
            dark
          />
          {firstPlayable?.playable ? (
            <a
              href="#embedded-demo"
              className="group overflow-hidden rounded-[30px] border border-softWhite/12 bg-archiveBlue/38 p-3 transition duration-300 hover:-translate-y-1 hover:border-acidGreen/55"
            >
              <div className="relative overflow-hidden rounded-[22px]">
                <ImageWithFallback
                  src={firstPlayable.cover}
                  alt={`${firstPlayable.title} playable preview`}
                  className="aspect-[16/10] w-full object-cover transition duration-700 group-hover:scale-105"
                  placeholderClassName="aspect-[16/10] rounded-[22px]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-deepIndigo/86 via-deepIndigo/10 to-transparent" />
                <span className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full bg-acidGreen px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.14em] text-deepIndigo">
                  <Play className="h-3 w-3 fill-current" aria-hidden="true" />
                  Open little world
                </span>
              </div>
              <div className="px-2 pb-2 pt-4">
                <h2 className="font-display text-4xl leading-tight text-softWhite">{firstPlayable.playable.title}</h2>
                <p className="mt-2 text-sm leading-6 text-softWhite/68">{firstPlayable.playable.description}</p>
              </div>
            </a>
          ) : null}
        </div>
      </section>

      <section className="bg-deepIndigo py-16 text-softWhite md:py-20">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-acidGreen">demo shelf</p>
              <h2 className="mt-3 font-display text-5xl leading-tight text-softWhite">Pick a playable object</h2>
            </div>
            <p className="max-w-xl text-sm leading-6 text-softWhite/62">
              The shelf can hold Unity WebGL, Godot web exports, and lightweight HTML5 builds.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {playableProjects.map((project) => (
              <article
                key={project.slug}
                className="group overflow-hidden rounded-[30px] border border-softWhite/12 bg-archiveBlue/34 p-3 transition duration-300 hover:-translate-y-1 hover:border-acidGreen/55"
              >
                <div className="relative overflow-hidden rounded-[22px]">
                  <ImageWithFallback
                    src={project.cover}
                    alt={`${project.title} cover`}
                    className="aspect-[16/10] w-full object-cover transition duration-700 group-hover:scale-105"
                    placeholderClassName="aspect-[16/10]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-deepIndigo/86 via-transparent to-transparent" />
                  <span className="absolute bottom-4 left-4 inline-flex items-center gap-2 rounded-full bg-acidGreen px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.14em] text-deepIndigo">
                    <Sparkles className="h-3 w-3" aria-hidden="true" />
                    playable object
                  </span>
                </div>
                <div className="p-4 pt-5">
                  <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-acidGreen">game window ready</p>
                  <h2 className="mt-2 font-display text-3xl text-softWhite">{project.playable?.title}</h2>
                  <p className="mt-3 text-sm leading-6 text-softWhite/64">{project.playable?.description}</p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <a
                      href="#embedded-demo"
                      className="inline-flex items-center gap-2 rounded-full bg-acidGreen px-4 py-2 text-sm font-bold text-deepIndigo transition hover:-translate-y-1 hover:bg-softWhite"
                    >
                      <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                      Launch demo
                    </a>
                    {project.playable?.openInNewTabUrl ? (
                      <a
                        href={project.playable.openInNewTabUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-full border border-softWhite/14 bg-deepIndigo/42 px-4 py-2 text-sm font-bold text-softWhite transition hover:-translate-y-1 hover:border-acidGreen hover:text-acidGreen"
                      >
                        <ExternalLink className="h-4 w-4" aria-hidden="true" />
                        New tab
                      </a>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="embedded-demo" className="bg-archiveBlue py-16 text-softWhite md:py-20">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <div className="grid gap-8">
            {playableProjects.map((project) =>
              project.playable ? <PlayableFrame key={project.slug} {...project.playable} /> : null,
            )}
          </div>
        </div>
      </section>
    </PageTransition>
  );
}
