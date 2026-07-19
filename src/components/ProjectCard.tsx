import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowUpRight, Gamepad2 } from "lucide-react";
import type { Project } from "../types/project";
import { ImageWithFallback } from "./ImageWithFallback";
import { useLocale } from "../locales/LocaleContext";

type ProjectCardProps = {
  project: Project;
  featured?: boolean;
  index?: number;
  variant?: "standard" | "large";
};

export function ProjectCard({
  project,
  featured = false,
  index,
  variant = "standard",
}: ProjectCardProps) {
  const isLarge = variant === "large";
  const { pathFor } = useLocale();
  const number = typeof index === "number" ? String(index + 1).padStart(2, "0") : project.year;

  return (
    <motion.article
      whileHover={{ y: -6 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className={`group h-full ${isLarge ? "md:col-span-2" : ""}`}
    >
      <Link
        to={pathFor(`/work/${project.slug}`)}
        className="relative block h-full overflow-hidden rounded-[24px] border border-softWhite/12 bg-archiveBlue/34 p-3 outline-none transition duration-300 hover:border-acidGreen/55 focus-visible:ring-2 focus-visible:ring-acidGreen"
      >
        <div className="absolute right-5 top-5 z-10 h-8 w-8 rounded-full bg-acidGreen transition duration-300 group-hover:translate-x-1 group-hover:-translate-y-1" />
        <div className="absolute right-11 top-8 z-10 h-12 w-20 rounded-[18px] bg-electricBlue/40 transition duration-300 group-hover:translate-x-1" />
        <div
          className={`relative overflow-hidden rounded-[18px] border border-softWhite/10 bg-deepIndigo ${
            isLarge ? "aspect-[16/9]" : featured ? "aspect-[16/10]" : "aspect-[5/4]"
          }`}
        >
          <ImageWithFallback
            src={project.cover}
            alt={`${project.title} cover`}
            className="h-full w-full object-cover opacity-90 transition duration-700 group-hover:scale-[1.035]"
            placeholderClassName="h-full w-full"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-deepIndigo/92 via-deepIndigo/18 to-transparent" />
          <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-4">
            <div>
              <p className="mb-2 font-mono text-sm font-bold text-acidGreen">{number}</p>
              <h3 className={`font-display leading-none text-softWhite ${isLarge ? "text-4xl md:text-5xl" : "text-3xl"}`}>
                {project.title}
              </h3>
            </div>
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-softWhite/16 bg-softWhite/8 text-softWhite transition group-hover:bg-acidGreen group-hover:text-deepIndigo">
              <ArrowUpRight className="h-5 w-5" aria-hidden="true" />
            </span>
          </div>
        </div>
        <div className="grid gap-4 p-3 pt-5">
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs font-semibold">
            <span className="text-softWhite/78">{project.category}</span>
            <span className="text-softWhite/28">/</span>
            <span className="text-softWhite/64">{project.year}</span>
            {project.playable ? (
              <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-acidGreen/35 px-3 py-1 text-acidGreen">
                <Gamepad2 className="h-3 w-3" aria-hidden="true" />
                Play
              </span>
            ) : null}
          </div>
          <p className="text-sm leading-6 text-softWhite/66">{project.subtitle}</p>
        </div>
      </Link>
    </motion.article>
  );
}
