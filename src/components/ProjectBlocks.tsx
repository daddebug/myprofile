import type { FlowStep, InteractionCostType, ProjectBlock, StateItem } from "../types/project";
import { CaseStudyVisual } from "./CaseStudyVisual";
import { ImageWithFallback } from "./ImageWithFallback";
import { PlayableFrame } from "./PlayableFrame";

type ProjectBlocksProps = {
  blocks: ProjectBlock[];
};

const costLabel: Record<InteractionCostType, string> = {
  navigation: "Navigation",
  interpretation: "Interpretation",
  memory: "Memory",
};

const costClass: Record<InteractionCostType, string> = {
  navigation: "border-acidGreen/45 text-acidGreen",
  interpretation: "border-peach/55 text-peach",
  memory: "border-softWhite/24 text-softWhite/78",
};

export function ProjectBlocks({ blocks }: ProjectBlocksProps) {
  return (
    <div className="space-y-16 md:space-y-28">
      {blocks.map((block, index) => {
        if (block.type === "text") {
          if (block.title?.includes("Cross-platform Adaptation")) {
            return (
              <section key={index} className="mx-auto max-w-7xl py-8 md:py-16">
                <p className="mb-5 font-mono text-xs font-bold uppercase tracking-[0.2em] text-acidGreen">
                  Reflection
                </p>
                <h2 className="max-w-5xl font-display text-[clamp(3rem,7vw,7.5rem)] leading-[0.92] text-softWhite">
                  {block.title}
                </h2>
                <p className="mt-8 max-w-4xl whitespace-pre-line text-xl leading-9 text-softWhite/70 md:text-2xl md:leading-10">
                  {block.body}
                </p>
              </section>
            );
          }

          return (
            <section key={index} className="mx-auto grid max-w-5xl gap-5 md:grid-cols-[170px_1fr]">
              <p className="h-fit rounded-full border border-acidGreen/45 bg-acidGreen/10 px-3 py-1 font-mono text-xs font-bold uppercase tracking-[0.16em] text-acidGreen">
                Field note {String(index + 1).padStart(2, "0")}
              </p>
              <div>
                {block.title ? (
                  <h2 className="font-display text-4xl leading-tight text-softWhite md:text-5xl">{block.title}</h2>
                ) : null}
                <p className="mt-5 whitespace-pre-line text-lg leading-8 text-softWhite/72 md:text-xl md:leading-9">{block.body}</p>
              </div>
            </section>
          );
        }

        if (block.type === "image") {
          return (
            <figure key={index} className="overflow-hidden rounded-[30px] border border-softWhite/12 bg-archiveBlue/34 p-3">
              <ImageWithFallback
                src={block.src}
                alt={block.alt}
                className="max-h-[860px] w-full rounded-[22px] object-cover"
                placeholderClassName="min-h-[460px] rounded-[22px]"
              />
              {block.caption ? (
                <figcaption className="px-4 pb-2 pt-4 text-sm font-medium text-softWhite/62 md:px-5">
                  {block.caption}
                </figcaption>
              ) : null}
            </figure>
          );
        }

        if (block.type === "imageGrid") {
          return (
            <section key={index} className="grid gap-5 md:grid-cols-2">
              {block.images.map((image, imageIndex) => (
                <figure
                  key={image.src}
                  className={`overflow-hidden rounded-[28px] border border-softWhite/12 bg-archiveBlue/34 p-2 ${
                    block.images.length === 3 && imageIndex === 0 ? "md:col-span-2" : ""
                  }`}
                >
                  <ImageWithFallback
                    src={image.src}
                    alt={image.alt}
                    className="aspect-[4/3] w-full rounded-[20px] object-cover transition duration-700 hover:scale-[1.025]"
                    placeholderClassName="aspect-[4/3] min-h-0 rounded-[20px]"
                  />
                  {image.caption ? (
                    <figcaption className="px-4 py-3 text-sm font-medium text-softWhite/62">{image.caption}</figcaption>
                  ) : null}
                </figure>
              ))}
            </section>
          );
        }

        if (block.type === "quote") {
          return (
            <blockquote
              key={index}
              className="mx-auto max-w-5xl rounded-[30px] border border-acidGreen/35 bg-deepIndigo p-8 text-softWhite md:p-12"
            >
              <p className="mb-6 w-fit rounded-full border border-acidGreen/35 bg-acidGreen/10 px-3 py-1 font-mono text-xs font-bold uppercase tracking-[0.18em] text-acidGreen">
                design clue
              </p>
              <p className="font-display text-4xl leading-tight md:text-6xl">"{block.text}"</p>
              {block.author ? (
                <footer className="mt-6 font-mono text-sm font-semibold uppercase tracking-[0.2em] text-acidGreen">{block.author}</footer>
              ) : null}
            </blockquote>
          );
        }

        if (block.type === "twoColumn") {
          return (
            <section key={index} className="rounded-[30px] border border-softWhite/12 bg-archiveBlue/34 p-6 md:p-10">
              {block.title ? (
                <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h2 className="font-display text-4xl text-softWhite md:text-5xl">{block.title}</h2>
                  <span className="w-fit rounded-full border border-acidGreen/45 bg-acidGreen/10 px-3 py-1 font-mono text-xs font-bold uppercase tracking-[0.16em] text-acidGreen">
                    interaction fragment
                  </span>
                </div>
              ) : null}
              <div className="grid gap-6 md:grid-cols-2 md:gap-10">
                <p className="border-l-2 border-acidGreen pl-5 text-lg leading-8 text-softWhite/70">{block.left}</p>
                <p className="border-l-2 border-peach pl-5 text-lg leading-8 text-softWhite/70">{block.right}</p>
              </div>
            </section>
          );
        }

        if (block.type === "contextComparison") {
          return (
            <section key={index} className="mx-auto max-w-7xl py-8 md:py-16">
              {block.title ? <SectionTitle title={block.title} /> : null}
              <div className="mt-8 grid gap-6 md:grid-cols-[0.9fr_1.1fr]">
                <div>
                  {block.intro?.map((paragraph) => (
                    <p key={paragraph} className="mt-4 max-w-3xl text-lg leading-8 text-softWhite/70">
                      {paragraph}
                    </p>
                  ))}
                </div>
                <div className="grid gap-6 md:grid-cols-2">
                <ListPanel title={block.leftTitle} items={block.leftItems} />
                <ListPanel title={block.rightTitle} items={block.rightItems} accent />
                </div>
              </div>
              {block.statement ? (
                <p className="mt-12 max-w-5xl font-display text-[clamp(3rem,6vw,6.5rem)] leading-[0.94] text-softWhite">
                  {block.statement}
                </p>
              ) : null}
              {block.placeholder ? <PlaceholderNote text={block.placeholder} /> : null}
            </section>
          );
        }

        if (block.type === "interactionCostMap") {
          return (
            <section key={index} className="mx-auto max-w-7xl">
              {block.title ? <SectionTitle title={block.title} /> : null}
              {block.body ? <p className="mt-5 max-w-4xl text-lg leading-8 text-softWhite/70">{block.body}</p> : null}
              <div className="mt-8 grid gap-5 border-y border-softWhite/10 py-6 md:grid-cols-3">
                {block.items.map((item) => (
                  <article key={item.label} className="min-w-0">
                    <p className={`w-fit rounded-full border px-3 py-1 font-mono text-xs font-bold uppercase tracking-[0.14em] ${costClass[item.costType]}`}>
                      {costLabel[item.costType]}
                    </p>
                    <h3 className="mt-5 font-display text-2xl text-softWhite">{item.label}</h3>
                    <p className="mt-3 text-sm leading-6 text-softWhite/64">{item.description}</p>
                  </article>
                ))}
              </div>
              {block.flow?.length ? <FlowRail steps={block.flow} className="mt-8" /> : null}
              {block.placeholder ? <PlaceholderNote text={block.placeholder} /> : null}
            </section>
          );
        }

        if (block.type === "principleGrid") {
          return (
            <section key={index} className="mx-auto max-w-7xl py-8 md:py-16">
              {block.title ? <SectionTitle title={block.title} /> : null}
              {block.statement ? (
                <p className="mt-5 max-w-5xl font-display text-[clamp(3rem,6vw,6.5rem)] leading-[0.94] text-softWhite">
                  {block.statement}
                </p>
              ) : null}
              <div className="mt-10 divide-y divide-softWhite/10 border-y border-softWhite/10">
                {block.items.map((item, itemIndex) => (
                  <article key={item.title} className="grid min-w-0 gap-4 py-5 md:grid-cols-[72px_0.9fr_1.1fr] md:items-start">
                    <span className="font-mono text-sm font-bold text-acidGreen">{String(itemIndex + 1).padStart(2, "0")}</span>
                    <h3 className="font-display text-2xl leading-tight text-softWhite md:text-3xl">{item.title}</h3>
                    <p className="text-sm leading-6 text-softWhite/64">{item.description}</p>
                  </article>
                ))}
              </div>
              {block.note ? <PlaceholderNote text={block.note} /> : null}
            </section>
          );
        }

        if (block.type === "turningPoint") {
          return (
            <section key={index} className="mx-auto max-w-7xl py-10 md:py-20">
              {block.eyebrow ? <Eyebrow text={block.eyebrow} /> : null}
              <h2 className="max-w-5xl font-display text-[clamp(3rem,7vw,7.5rem)] leading-[0.9] text-softWhite">
                {block.statement}
              </h2>
              <div className="mt-8 grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
                <div>
                  <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-acidGreen">{block.title}</p>
                  {block.body ? <p className="mt-4 text-lg leading-8 text-softWhite/70">{block.body}</p> : null}
                </div>
                {block.before && block.after ? (
                  <div className="grid min-w-0 gap-4 md:grid-cols-2">
                    <CaseStudyVisual image={block.before} />
                    <CaseStudyVisual image={block.after} />
                  </div>
                ) : null}
              </div>
            </section>
          );
        }

        if (block.type === "flowComparison") {
          return (
            <section key={index} className="mx-auto max-w-7xl">
              {block.eyebrow ? <Eyebrow text={block.eyebrow} /> : null}
              {block.title ? <SectionTitle title={block.title} /> : null}
              <div className="mt-8 grid min-w-0 gap-5 lg:grid-cols-2">
                <FlowPanel label={block.beforeLabel ?? "Before"} steps={block.before} />
                <FlowPanel label={block.afterLabel ?? "After"} steps={block.after} accent />
              </div>
              {block.fields?.length ? <FieldGrid fields={block.fields} /> : null}
            </section>
          );
        }

        if (block.type === "annotatedComparison") {
          return (
            <section key={index} className="mx-auto max-w-7xl">
              {block.eyebrow ? <Eyebrow text={block.eyebrow} /> : null}
              {block.title ? <SectionTitle title={block.title} /> : null}
              {block.body ? <p className="mt-5 max-w-4xl text-lg leading-8 text-softWhite/70">{block.body}</p> : null}
              <div className="mt-8 grid gap-5 lg:grid-cols-2">
                <CaseStudyVisual image={block.before} />
                <CaseStudyVisual image={block.after} />
              </div>
              {block.model?.length ? (
              <div className="mt-6 grid gap-3 md:grid-cols-3">
                  {block.model.map((item) => (
                    <article key={item.label} className="rounded-[22px] border border-softWhite/12 bg-deepIndigo/44 p-4">
                      <p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-acidGreen">{item.label}</p>
                      <p className="mt-2 text-sm leading-6 text-softWhite/66">{item.description}</p>
                    </article>
                  ))}
                </div>
              ) : null}
              {block.fields?.length ? <FieldGrid fields={block.fields} /> : null}
            </section>
          );
        }

        if (block.type === "stateMatrix") {
          return (
            <section key={index} className="mx-auto max-w-7xl">
              {block.eyebrow ? <Eyebrow text={block.eyebrow} /> : null}
              {block.title ? <SectionTitle title={block.title} /> : null}
              {block.body ? <p className="mt-5 max-w-4xl text-lg leading-8 text-softWhite/70">{block.body}</p> : null}
              <div className="mt-8 grid min-w-0 gap-4 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
                {block.items.map((item) => (
                  <StateCard key={item.name} item={item} />
                ))}
              </div>
              {block.note ? <PlaceholderNote text={block.note} /> : null}
            </section>
          );
        }

        if (block.type === "visualAdaptation") {
          return (
            <section key={index} className="mx-auto max-w-7xl">
              {block.title ? <SectionTitle title={block.title} /> : null}
              {block.body ? <p className="mt-5 max-w-4xl text-lg leading-8 text-softWhite/70">{block.body}</p> : null}
              <div className="mt-8 grid gap-5 border-y border-softWhite/10 py-6 md:grid-cols-3">
                {block.columns.map((column) => (
                  <article key={column.label} className="min-w-0">
                    <p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-acidGreen">{column.label}</p>
                    <p className="mt-4 text-sm leading-6 text-softWhite/68">{column.value}</p>
                  </article>
                ))}
              </div>
              {block.visuals?.length ? (
                <div className="mt-5 grid gap-5 md:grid-cols-3">
                  {block.visuals.map((visual) => (
                    <CaseStudyVisual key={visual.alt} image={visual} />
                  ))}
                </div>
              ) : null}
            </section>
          );
        }

        if (block.type === "constraintGrid") {
          return (
            <section key={index} className="mx-auto max-w-6xl">
              {block.title ? <SectionTitle title={block.title} /> : null}
              {block.statement ? (
                <p className="mt-5 max-w-5xl font-display text-3xl leading-tight text-softWhite md:text-5xl">
                  {block.statement}
                </p>
              ) : null}
              <div className="mt-8 divide-y divide-softWhite/10 border-y border-softWhite/10">
                {block.items.map((item) => (
                  <article key={item.label} className="grid min-w-0 gap-4 py-5 md:grid-cols-[160px_1fr]">
                    <p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-acidGreen">{item.label}</p>
                    <div className="grid min-w-0 gap-3 md:grid-cols-3">
                      <FieldStack label="CONSTRAINT" value={item.constraint} quiet />
                      {item.whyItMattered ? <FieldStack label="WHY IT MATTERED" value={item.whyItMattered} quiet /> : null}
                      {item.designResponse ? <FieldStack label="DESIGN RESPONSE" value={item.designResponse} quiet /> : null}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          );
        }

        if (block.type === "outcomeGrid") {
          return (
            <section key={index} className="mx-auto max-w-6xl">
              {block.title ? <SectionTitle title={block.title} /> : null}
              <div className="mt-8 divide-y divide-softWhite/10 border-y border-softWhite/10">
                {block.items.map((item) => (
                  <article key={item.label} className="grid min-w-0 gap-3 py-5 md:grid-cols-[180px_1fr_1fr] md:items-start">
                    <p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-acidGreen">
                      {item.mode ?? "structural"}
                    </p>
                    <h3 className="font-display text-2xl leading-tight text-softWhite">{item.label}</h3>
                    <p className="text-sm leading-6 text-softWhite/64">{item.result}</p>
                  </article>
                ))}
              </div>
              {block.note ? <PlaceholderNote text={block.note} /> : null}
            </section>
          );
        }

        return (
          <PlayableFrame
            key={index}
            title={block.title}
            description={block.description}
            iframeUrl={block.iframeUrl}
            openInNewTabUrl={block.openInNewTabUrl}
          />
        );
      })}
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <h2 className="max-w-5xl whitespace-pre-line font-display text-[clamp(2.75rem,5vw,5.75rem)] leading-[0.96] text-softWhite">
      {title}
    </h2>
  );
}

function Eyebrow({ text }: { text: string }) {
  return <p className="mb-4 font-mono text-xs font-bold uppercase tracking-[0.2em] text-acidGreen">{text}</p>;
}

function PlaceholderNote({ text }: { text: string }) {
  return (
    <p className="mt-6 border-l border-softWhite/16 pl-4 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-softWhite/48">
      {text}
    </p>
  );
}

function ListPanel({ title, items, accent = false }: { title: string; items: string[]; accent?: boolean }) {
  return (
    <article className="min-w-0 border-t border-softWhite/12 pt-5">
      <h3 className="font-display text-3xl text-softWhite">{title}</h3>
      <ul className="mt-5 space-y-3">
        {items.map((item) => (
          <li key={item} className="flex gap-3 text-sm leading-6 text-softWhite/68">
            <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${accent ? "bg-acidGreen" : "bg-electricBlue"}`} />
            {item}
          </li>
        ))}
      </ul>
    </article>
  );
}

function FlowRail({ steps, className = "" }: { steps: FlowStep[]; className?: string }) {
  return (
    <div className={`max-w-full overflow-x-auto rounded-[28px] border border-softWhite/12 bg-deepIndigo/44 p-4 ${className}`}>
      <div className="flex min-w-max items-stretch gap-3">
        {steps.map((step, index) => (
          <div key={`${step.label}-${index}`} className="flex items-center gap-3">
            <FlowStepCard step={step} />
            {index < steps.length - 1 ? <span className="font-mono text-acidGreen">-&gt;</span> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function FlowPanel({ label, steps, accent = false }: { label: string; steps: FlowStep[]; accent?: boolean }) {
  return (
    <article className="min-w-0 rounded-[30px] border border-softWhite/12 bg-archiveBlue/34 p-5">
      <p className={`font-mono text-xs font-bold uppercase tracking-[0.18em] ${accent ? "text-acidGreen" : "text-softWhite/62"}`}>
        {label}
      </p>
      <FlowRail steps={steps} className="mt-4" />
    </article>
  );
}

function FlowStepCard({ step }: { step: FlowStep }) {
  return (
    <div className="w-44 rounded-[18px] border border-softWhite/12 bg-archiveBlue/56 p-3">
      <p className="font-mono text-xs font-bold uppercase tracking-[0.08em] text-softWhite">{step.label}</p>
      {step.note ? <p className="mt-2 text-xs leading-5 text-softWhite/56">{step.note}</p> : null}
      {step.tags?.length ? (
        <div className="mt-3 flex flex-wrap gap-1">
          {step.tags.map((tag) => (
            <span key={tag} className={`rounded-full border px-2 py-0.5 font-mono text-[10px] ${costClass[tag]}`}>
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FieldGrid({ fields }: { fields: { label: string; value: string }[] }) {
  return (
    <div className="mt-6 grid gap-4 border-y border-softWhite/10 py-5 md:grid-cols-2">
      {fields.map((field) => (
        <FieldStack key={field.label} label={field.label} value={field.value} quiet />
      ))}
    </div>
  );
}

function FieldStack({ label, value, quiet = false }: { label: string; value: string; quiet?: boolean }) {
  return (
    <div className={quiet ? "min-w-0 border-l border-softWhite/12 pl-4" : "min-w-0 rounded-[22px] border border-softWhite/12 bg-deepIndigo/44 p-4"}>
      <p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-acidGreen">{label}</p>
      <p className="mt-3 break-words text-sm leading-6 text-softWhite/66">{value}</p>
    </div>
  );
}

function StateCard({ item }: { item: StateItem }) {
  return (
    <article className="min-w-0 rounded-[26px] border border-softWhite/12 bg-archiveBlue/34 p-3">
      <ImageWithFallback
        src={item.image ?? ""}
        alt={`${item.name} state`}
        className="aspect-[4/3] w-full rounded-[18px] object-cover"
        placeholderClassName="aspect-[4/3] min-h-0 rounded-[18px]"
      />
      <div className="p-2 pt-4">
        <h3 className="font-mono text-sm font-bold uppercase tracking-[0.14em] text-acidGreen">{item.name}</h3>
        {item.description ? <p className="mt-3 text-sm leading-6 text-softWhite/66">{item.description}</p> : null}
        {item.note ? <p className="mt-3 text-xs leading-5 text-softWhite/48">{item.note}</p> : null}
      </div>
    </article>
  );
}
