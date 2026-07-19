import { ExternalLink, Mail } from "lucide-react";
import { PageTransition } from "../components/PageTransition";
import { SectionHeading } from "../components/SectionHeading";
import { BrandGeometry } from "../components/BrandGeometry";

const links = [
  { label: "Email", url: "mailto:hello@example.com" },
  { label: "Behance", url: "https://www.behance.net/" },
  { label: "GitHub", url: "https://github.com/" },
  { label: "Itch.io", url: "https://itch.io/" },
];

export function ContactPage() {
  return (
    <PageTransition>
      <section className="relative overflow-hidden bg-deepIndigo py-16 text-softWhite md:py-20">
        <div className="absolute inset-0 bg-grain bg-[length:18px_18px] opacity-35" />
        <div className="relative mx-auto max-w-7xl px-4 md:px-6">
          <SectionHeading
            eyebrow="Contact"
            title="Send a Note to the Archive"
            subtitle="Open to UX, Game UX, interaction design, and playful little-world projects."
            dark
          />
        </div>
      </section>

      <section className="bg-deepIndigo py-16 text-softWhite">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 md:grid-cols-[1fr_0.9fr] md:px-6">
          <div className="relative overflow-hidden rounded-[32px] border border-softWhite/12 bg-archiveBlue/34 p-8">
            <BrandGeometry compact className="absolute -right-20 -top-20 h-60 w-72 opacity-70" />
            <span className="relative grid h-14 w-14 place-items-center rounded-full bg-acidGreen text-deepIndigo">
              <Mail className="h-6 w-6" aria-hidden="true" />
            </span>
            <h1 className="relative mt-6 font-display text-4xl text-softWhite">
              For project notes, collaborations, and tiny playable ideas.
            </h1>
            <p className="relative mt-5 text-lg leading-8 text-softWhite/68">
              Send a note about the world, interface, game, or interaction question you are exploring.
            </p>
            <a
              className="relative mt-7 inline-flex items-center gap-2 rounded-full bg-acidGreen px-5 py-3 text-sm font-bold text-deepIndigo transition hover:-translate-y-1 hover:bg-softWhite"
              href="mailto:hello@example.com"
            >
              hello@example.com
            </a>
          </div>
          <div className="grid content-start gap-3">
            {links.map((link) => (
              <a
                key={link.label}
                href={link.url}
                target={link.url.startsWith("mailto:") ? undefined : "_blank"}
                rel={link.url.startsWith("mailto:") ? undefined : "noreferrer"}
                className="flex items-center justify-between rounded-[24px] border border-softWhite/12 bg-archiveBlue/34 px-5 py-4 font-bold text-softWhite transition hover:-translate-y-1 hover:border-acidGreen hover:text-acidGreen"
              >
                {link.label}
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
            ))}
          </div>
        </div>
      </section>
    </PageTransition>
  );
}
