import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { ArrowUp } from "lucide-react";
import { useLocale } from "../locales/LocaleContext";

export function ProjectBackToTop() {
  const { locale } = useLocale();
  const prefersReducedMotion = useReducedMotion();
  const [visible, setVisible] = useState(false);
  const [bottomOffset, setBottomOffset] = useState(16);

  useEffect(() => {
    const updatePosition = () => {
      const viewportHeight = window.innerHeight;
      const baseOffset = window.innerWidth >= 768 ? 28 : 16;
      let nextBottom = baseOffset;

      document.querySelectorAll<HTMLElement>("[data-project-bottom-navigation], footer").forEach((element) => {
        const bounds = element.getBoundingClientRect();
        if (bounds.top < viewportHeight && bounds.bottom > 0) {
          nextBottom = Math.max(nextBottom, Math.min(viewportHeight - 64, viewportHeight - bounds.top + 16));
        }
      });

      setVisible(window.scrollY >= viewportHeight * 0.9);
      setBottomOffset(nextBottom);
    };

    updatePosition();
    window.addEventListener("scroll", updatePosition, { passive: true });
    window.addEventListener("resize", updatePosition);

    return () => {
      window.removeEventListener("scroll", updatePosition);
      window.removeEventListener("resize", updatePosition);
    };
  }, []);

  const label = locale === "zh" ? "回到顶部" : "Back to top";

  return (
    <button
      type="button"
      className={`fixed right-4 z-[70] grid h-11 w-11 place-items-center rounded-full border border-[#9FAAD2]/45 bg-deepIndigo/94 text-[#B9C4EA] shadow-[0_8px_22px_rgba(3,5,26,0.18)] transition-[opacity,transform,border-color,color,background-color] duration-300 ease-out hover:border-acidGreen/70 hover:bg-archiveBlue hover:text-acidGreen focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acidGreen motion-reduce:transition-none md:right-7 ${
        visible ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
      }`}
      style={{
        bottom: `calc(${bottomOffset}px + env(safe-area-inset-bottom, 0px))`,
        marginRight: "env(safe-area-inset-right, 0px)",
      }}
      aria-label={label}
      title={label}
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      onClick={() => window.scrollTo({ top: 0, behavior: prefersReducedMotion ? "auto" : "smooth" })}
      data-project-back-to-top
    >
      <ArrowUp className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}
