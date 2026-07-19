import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import logoUrl from "../../logo.svg";

type AnimatedPart = {
  element: SVGGraphicsElement;
  centerX: number;
  centerY: number;
  entranceComplete: boolean;
  enterDelay: number;
  fromX: number;
  fromY: number;
  fromScale: number;
  idleX: number;
  idleY: number;
  idleScale: number;
  duration: number;
  phase: number;
  parallaxX: number;
  parallaxY: number;
};

const easeOut = (value: number) => 1 - Math.pow(1 - value, 3);
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const svgNamespace = "http://www.w3.org/2000/svg";

function getTransformOrigin(element: SVGGraphicsElement) {
  const box = element.getBBox();
  return {
    centerX: box.x + box.width / 2,
    centerY: box.y + box.height / 2,
  };
}

function setLayerTransform(element: SVGGraphicsElement, x: number, y: number, scale: number, centerX: number, centerY: number) {
  element.setAttribute(
    "transform",
    `translate(${x} ${y}) translate(${centerX} ${centerY}) scale(${scale}) translate(${-centerX} ${-centerY})`,
  );
}

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

export function AnimatedLogo() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [logoMarkup, setLogoMarkup] = useState("");
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    let active = true;

    fetch(logoUrl)
      .then((response) => response.text())
      .then((markup) => {
        if (active) setLogoMarkup(markup);
      })
      .catch(() => {
        if (active) setLogoMarkup("");
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

    const panelMotion = [
      { idleX: -8, idleY: 0, duration: 7.4, phase: 0.1, parallaxX: -2.5, parallaxY: 1.5 },
      { idleX: 0, idleY: 7, duration: 8.6, phase: 0.34, parallaxX: 2.2, parallaxY: -1.6 },
      { idleX: 6, idleY: 0, duration: 6.8, phase: 0.58, parallaxX: -3.8, parallaxY: -2.2 },
      { idleX: 0, idleY: -8, duration: 9.7, phase: 0.76, parallaxX: 4.2, parallaxY: 2.4 },
      { idleX: 5, idleY: 0, duration: 8.1, phase: 0.9, parallaxX: 3.1, parallaxY: -2.8 },
    ];

    const circleMotion = [
      { idleX: 2, idleY: -3, idleScale: 0.026, duration: 6.3, phase: 0.2, parallaxX: 3.2, parallaxY: -2.5 },
      { idleX: -3, idleY: 2, idleScale: 0.018, duration: 7.6, phase: 0.52, parallaxX: -2.6, parallaxY: 3.4 },
      { idleX: 2.5, idleY: 2, idleScale: 0.032, duration: 8.9, phase: 0.74, parallaxX: 3.6, parallaxY: 2.1 },
      { idleX: -2, idleY: -2.5, idleScale: 0.014, duration: 7.1, phase: 0.08, parallaxX: -3.1, parallaxY: -2.8 },
      { idleX: 3, idleY: 1.5, idleScale: 0.024, duration: 9.4, phase: 0.38, parallaxX: 2.4, parallaxY: 3.5 },
      { idleX: -2.5, idleY: 3, idleScale: 0.02, duration: 6.9, phase: 0.66, parallaxX: -3.4, parallaxY: 2.2 },
      { idleX: 2, idleY: -2, idleScale: 0.03, duration: 8.2, phase: 0.86, parallaxX: 2.8, parallaxY: -3.2 },
    ];

    const parts: AnimatedPart[] = [
      ...panelGroups.map((element, index) => {
        const motion = panelMotion[index % panelMotion.length];
        const origin = getTransformOrigin(element);
        return {
          element,
          ...origin,
          entranceComplete: false,
          enterDelay: index * 60,
          fromX: index % 2 === 0 ? -14 : 14,
          fromY: index % 2 === 0 ? 8 : -8,
          fromScale: 0.96,
          idleScale: 0,
          ...motion,
        };
      }),
      ...circles.map((element, index) => {
        const motion = circleMotion[index % circleMotion.length];
        const origin = getTransformOrigin(element);
        return {
          element,
          ...origin,
          entranceComplete: false,
          enterDelay: 300 + index * 45,
          fromX: index % 2 === 0 ? 6 : -6,
          fromY: index % 3 === 0 ? -7 : 7,
          fromScale: 0.94,
          ...motion,
        };
      }),
    ];

    parts.forEach(({ element }) => {
      element.style.willChange = reduceMotion ? "opacity" : "opacity, transform";
      element.style.opacity = "0";
      element.removeAttribute("transform");
    });

    const pointer = { x: 0, y: 0 };
    const easedPointer = { x: 0, y: 0 };
    let frame = 0;
    let active = true;
    const startedAt = performance.now();

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

    const render = (now: number) => {
      if (!active) return;

      easedPointer.x += (pointer.x - easedPointer.x) * 0.075;
      easedPointer.y += (pointer.y - easedPointer.y) * 0.075;

      let entranceStillRunning = false;

      parts.forEach((part) => {
        const enterProgress = part.entranceComplete ? 1 : clamp01((now - startedAt - part.enterDelay) / 620);
        const easedEnter = easeOut(enterProgress);
        const introX = part.fromX * (1 - easedEnter);
        const introY = part.fromY * (1 - easedEnter);
        const introScale = part.fromScale + (1 - part.fromScale) * easedEnter;

        if (enterProgress >= 1 && !part.entranceComplete) {
          part.entranceComplete = true;
          part.element.style.opacity = "1";
        }

        if (!part.entranceComplete) {
          entranceStillRunning = true;
          part.element.style.opacity = `${easedEnter}`;
        }

        if (reduceMotion) {
          setLayerTransform(part.element, introX, introY, introScale, part.centerX, part.centerY);
          return;
        }

        const idleRamp = clamp01((now - startedAt - 950) / 500);
        const wave = Math.sin((now / (part.duration * 1000) + part.phase) * Math.PI * 2);
        const alternateWave = Math.cos((now / (part.duration * 1000) + part.phase) * Math.PI * 2);
        const idleX = part.idleX * wave * idleRamp;
        const idleY = part.idleY * alternateWave * idleRamp;
        const idleScale = 1 + part.idleScale * wave * idleRamp;
        const parallaxX = canParallax ? part.parallaxX * easedPointer.x : 0;
        const parallaxY = canParallax ? part.parallaxY * easedPointer.y : 0;

        setLayerTransform(
          part.element,
          introX + idleX + parallaxX,
          introY + idleY + parallaxY,
          introScale * idleScale,
          part.centerX,
          part.centerY,
        );
      });

      if (reduceMotion && !entranceStillRunning) {
        parts.forEach(({ element }) => {
          element.style.opacity = "1";
          element.removeAttribute("transform");
          element.style.willChange = "auto";
        });
        return;
      }

      frame = requestAnimationFrame(render);
    };

    frame = requestAnimationFrame(render);

    return () => {
      active = false;
      cancelAnimationFrame(frame);
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
