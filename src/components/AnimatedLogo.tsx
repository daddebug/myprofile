import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import logoUrl from "../../logo.svg";

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const svgNamespace = "http://www.w3.org/2000/svg";

function getPanelGroups(svg: SVGSVGElement) {
  const existingGroups = Array.from(svg.querySelectorAll(":scope > g[data-logo-panel]")) as SVGGraphicsElement[];
  if (existingGroups.length) return existingGroups;

  const rects = Array.from(svg.querySelectorAll(":scope > rect")) as SVGRectElement[];

  return rects.map((rect, index) => {
    const group = document.createElementNS(svgNamespace, "g") as SVGGElement;
    group.dataset.logoPanel = String(index + 1);
    rect.parentNode?.insertBefore(group, rect);
    group.appendChild(rect);
    return group;
  });
}

export function AnimatedLogo({ onComplete }: { onComplete?: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const completedRef = useRef(false);
  const [logoMarkup, setLogoMarkup] = useState("");
  const reduceMotion = useReducedMotion();

  const finishOpening = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete?.();
  };

  useEffect(() => {
    let active = true;

    fetch(logoUrl)
      .then((response) => response.text())
      .then((markup) => {
        if (active) setLogoMarkup(markup);
      })
      .catch(() => {
        if (active) {
          setLogoMarkup("");
          finishOpening();
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!logoMarkup) return undefined;

    const container = containerRef.current;
    if (!container) return undefined;

    container.innerHTML = logoMarkup;

    const svg = container.querySelector("svg");
    if (!svg) return undefined;

    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Dilida Duman logo");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

    const panelGroups = getPanelGroups(svg);
    const circles = Array.from(svg.querySelectorAll(":scope > circle")) as SVGGraphicsElement[];
    const canParallax =
      !reduceMotion &&
      window.matchMedia("(hover: hover)").matches &&
      window.matchMedia("(pointer: fine)").matches;

    // The logo is one complete mark, not a set of independently choreographed
    // parts: every panel/circle is simply opaque and fixed relative to the
    // others. The single subtle idle drift + pointer parallax below is
    // applied once, to this container, so the whole mark moves together --
    // never per-panel/per-circle motion.
    const parts = [...panelGroups, ...circles];
    parts.forEach((element) => {
      element.style.opacity = "1";
      element.removeAttribute("transform");
    });

    const idleMotion = { x: 7, y: 5, duration: 8.4, phase: 0.12 };
    const parallaxAmount = { x: 9, y: 6 };
    const pointer = { x: 0, y: 0 };
    const easedPointer = { x: 0, y: 0 };
    let frame = 0;
    let active = true;
    const startedAt = performance.now();
    const completionTimer = window.setTimeout(finishOpening, reduceMotion ? 0 : 1700);

    const handlePointerMove = (event: PointerEvent) => {
      const x = event.clientX / window.innerWidth - 0.5;
      const y = event.clientY / window.innerHeight - 0.5;
      pointer.x = x * 2;
      pointer.y = y * 2;
    };

    const handlePointerLeave = () => {
      pointer.x = 0;
      pointer.y = 0;
    };

    if (canParallax) {
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerleave", handlePointerLeave);
    }

    if (reduceMotion) {
      container.style.transform = "";
    } else {
      container.style.willChange = "transform";

      const render = (now: number) => {
        if (!active) return;

        easedPointer.x += (pointer.x - easedPointer.x) * 0.075;
        easedPointer.y += (pointer.y - easedPointer.y) * 0.075;

        const idleRamp = clamp01((now - startedAt) / 280);
        const wave = Math.sin((now / (idleMotion.duration * 1000) + idleMotion.phase) * Math.PI * 2);
        const alternateWave = Math.cos((now / (idleMotion.duration * 1000) + idleMotion.phase) * Math.PI * 2);
        const idleX = idleMotion.x * wave * idleRamp;
        const idleY = idleMotion.y * alternateWave * idleRamp;
        const parallaxX = canParallax ? parallaxAmount.x * easedPointer.x : 0;
        const parallaxY = canParallax ? parallaxAmount.y * easedPointer.y : 0;

        // .animated-logo-size already centers this container via a CSS
        // translate(-50%,-50%); layering the idle/parallax offset on top of
        // that same transform (rather than replacing it) keeps the centering
        // intact.
        container.style.transform = `translate(-50%, -50%) translate(${idleX + parallaxX}px, ${idleY + parallaxY}px)`;

        frame = requestAnimationFrame(render);
      };

      const visibilityObserver = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            if (!frame) frame = requestAnimationFrame(render);
          } else if (frame) {
            cancelAnimationFrame(frame);
            frame = 0;
          }
        },
        { threshold: 0 },
      );
      visibilityObserver.observe(container);

      return () => {
        active = false;
        visibilityObserver.disconnect();
        cancelAnimationFrame(frame);
        window.clearTimeout(completionTimer);
        if (canParallax) {
          window.removeEventListener("pointermove", handlePointerMove);
          window.removeEventListener("pointerleave", handlePointerLeave);
        }
      };
    }

    return () => {
      active = false;
      window.clearTimeout(completionTimer);
      if (canParallax) {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerleave", handlePointerLeave);
      }
    };
  }, [logoMarkup, reduceMotion]);

  return (
    <div
      ref={containerRef}
      className="animated-logo-scene animated-logo-size"
      aria-label="Dilida Duman logo"
    />
  );
}
