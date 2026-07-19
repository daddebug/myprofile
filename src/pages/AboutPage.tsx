import { Mail, PenTool, Shapes, Sparkles, WandSparkles } from "lucide-react";
import { PageTransition } from "../components/PageTransition";
import { SectionHeading } from "../components/SectionHeading";
import { BrandGeometry } from "../components/BrandGeometry";

const questionCards = [
  "How can complex systems feel less heavy?",
  "What makes a menu feel like part of a game world?",
  "When does playful motion help decision-making?",
  "How do people recover from mistakes in social interfaces?",
];

const tools = ["Figma", "FigJam", "Unity", "Godot", "HTML/CSS", "TypeScript", "After Effects", "Photoshop"];

export function AboutPage() {
  return (
    <PageTransition>
      <section className="relative overflow-hidden bg-deepIndigo py-16 text-softWhite md:py-20">
        <div className="absolute inset-0 bg-grain bg-[length:18px_18px] opacity-35" />
        <div className="relative mx-auto grid max-w-7xl gap-8 px-4 md:grid-cols-[1fr_0.72fr] md:items-end md:px-6">
          <SectionHeading
            eyebrow="Profile card"
            title="Designer Character Sheet"
            subtitle="I design interfaces like systems, and systems like little worlds."
            dark
          />
          <div className="rounded-[28px] border border-softWhite/12 bg-archiveBlue/36 p-5">
            <p className="font-display text-3xl leading-tight text-softWhite">
              My favorite interface question is where a rule becomes a feeling.
            </p>
            <p className="mt-4 text-sm leading-6 text-softWhite/66">
              I like the in-between space: interface logic with atmosphere, game UX with clarity, and visual systems
              that quietly explain how to move.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-deepIndigo py-16 text-softWhite md:py-20">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 md:grid-cols-[0.74fr_1.26fr] md:px-6">
          <aside className="relative overflow-hidden rounded-[32px] border border-softWhite/12 bg-archiveBlue/34 p-6">
            <BrandGeometry compact className="absolute -right-16 -top-16 h-52 w-64 opacity-70" />
            <div className="relative grid h-24 w-24 place-items-center rounded-[28px] bg-acidGreen font-mono text-4xl font-bold text-deepIndigo">
              d.d
            </div>
            <div className="relative">
              <p className="mt-6 w-fit rounded-full border border-acidGreen/45 bg-acidGreen/10 px-3 py-1 font-mono text-xs font-bold uppercase tracking-[0.18em] text-acidGreen">
                character file
              </p>
              <h1 className="mt-4 font-display text-5xl leading-tight text-softWhite">Dilida Duman</h1>
              <p className="mt-4 text-base leading-7 text-softWhite/68">
                Game UX / interaction designer collecting tiny worlds, soft interface rules, and visual systems with a
                little warmth.
              </p>
              <div className="mt-6 grid grid-cols-2 gap-3">
                {["UX systems", "Game feel", "Prototype logic", "Soft visuals"].map((item) => (
                  <span key={item} className="rounded-[18px] border border-softWhite/12 bg-deepIndigo/38 px-3 py-3 text-xs font-bold text-softWhite/82">
                    {item}
                  </span>
                ))}
              </div>
              <a
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-acidGreen px-4 py-2 text-sm font-bold text-deepIndigo transition hover:-translate-y-1 hover:bg-softWhite"
                href="mailto:hello@example.com"
              >
                <Mail className="h-4 w-4" aria-hidden="true" />
                hello@example.com
              </a>
            </div>
          </aside>

          <div className="grid gap-5">
            {[
              {
                icon: PenTool,
                title: "I make interfaces with a sense of place",
                body: "Interaction flows, game UX systems, soft interfaces, prototypes, case pieces, visual UI systems, and small experiments that explain themselves through use.",
              },
              {
                icon: Shapes,
                title: "I care about what the system feels like",
                body: "Readable states, emotional clarity, tactile feedback, social context, gentle recovery, and interfaces that feel shaped rather than assembled.",
              },
              {
                icon: WandSparkles,
                title: "I research tiny behavior loops",
                body: "Player decision-making, menu behavior, playful affordances, low-pressure onboarding, and the hidden UX work inside games.",
              },
            ].map(({ icon: Icon, title, body }) => (
              <article key={title} className="rounded-[30px] border border-softWhite/12 bg-archiveBlue/34 p-6 transition hover:-translate-y-1 hover:border-acidGreen/45">
                <div className="flex gap-4">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-acidGreen text-deepIndigo">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h2 className="font-display text-3xl text-softWhite">{title}</h2>
                    <p className="mt-3 text-sm leading-6 text-softWhite/66">{body}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-archiveBlue py-16 text-softWhite md:py-20">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 md:grid-cols-2 md:px-6">
          <div>
            <SectionHeading
              eyebrow="Questions"
              title="Questions I Keep Around"
              subtitle="The pieces I enjoy most usually begin as a behavioral question, not a screen list."
              dark
            />
            <div className="mt-8 grid gap-3">
              {questionCards.map((question) => (
                <div key={question} className="flex items-start gap-3 rounded-[22px] border border-softWhite/12 bg-deepIndigo/46 p-4 text-sm font-bold leading-6 text-softWhite/76">
                  <Sparkles className="mt-1 h-4 w-4 shrink-0 text-acidGreen" aria-hidden="true" />
                  {question}
                </div>
              ))}
            </div>
          </div>
          <div>
            <SectionHeading
              eyebrow="Tools"
              title="Tool Shelf"
              subtitle="A practical shelf for thinking, prototyping, testing, and polishing."
              dark
            />
            <div className="mt-8 flex flex-wrap gap-3">
              {tools.map((tool) => (
                <span key={tool} className="rounded-full border border-softWhite/12 bg-deepIndigo/44 px-4 py-2 text-sm font-bold text-softWhite transition hover:-translate-y-0.5 hover:border-acidGreen hover:text-acidGreen">
                  {tool}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>
    </PageTransition>
  );
}
