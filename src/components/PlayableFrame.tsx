import { ExternalLink, Gamepad2, Play } from "lucide-react";

type PlayableFrameProps = {
  title: string;
  description?: string;
  iframeUrl: string;
  openInNewTabUrl?: string;
};

export function PlayableFrame({
  title,
  description,
  iframeUrl,
  openInNewTabUrl,
}: PlayableFrameProps) {
  return (
    <section className="overflow-hidden rounded-[30px] border border-softWhite/12 bg-deepIndigo shadow-archive">
      <div className="relative overflow-hidden border-b border-softWhite/10 bg-archiveBlue/56 px-5 py-5 text-softWhite md:px-7">
        <div className="absolute inset-0 bg-grain bg-[length:18px_18px] opacity-25" />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-acidGreen text-deepIndigo">
              <Gamepad2 className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="font-mono text-xs font-bold uppercase tracking-[0.22em] text-acidGreen">live little world</p>
              <h3 className="mt-1 font-display text-3xl leading-tight md:text-4xl">{title}</h3>
              {description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-softWhite/72">{description}</p> : null}
            </div>
          </div>
          {openInNewTabUrl ? (
            <a
              href={openInNewTabUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-softWhite/18 bg-deepIndigo/38 px-4 py-2 text-sm font-bold text-softWhite transition hover:-translate-y-1 hover:border-acidGreen hover:text-acidGreen"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              Open in New Tab
            </a>
          ) : null}
        </div>
      </div>
      <div className="relative bg-[#08082b] p-3">
        <div className="pointer-events-none absolute left-6 top-6 z-10 inline-flex items-center gap-2 rounded-full border border-softWhite/14 bg-deepIndigo/78 px-3 py-1 font-mono text-xs font-semibold text-softWhite backdrop-blur">
          <Play className="h-3 w-3 fill-current text-acidGreen" aria-hidden="true" />
          Window is live
        </div>
        <iframe
          src={iframeUrl}
          title={title}
          className="h-[480px] w-full rounded-[22px] border-0 bg-softWhite md:h-[640px]"
          loading="lazy"
          allow="fullscreen; gamepad; autoplay"
        />
      </div>
    </section>
  );
}
