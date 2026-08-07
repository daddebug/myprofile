import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

const TRAIL_POINT_COUNT = 5;
const INTERACTIVE_SELECTOR = [
  "a[href]",
  "button:not(:disabled)",
  "input:not(:disabled)",
  "select:not(:disabled)",
  "textarea:not(:disabled)",
  "summary",
  '[role="button"]',
  '[role="link"]',
  "[data-cursor-interactive]",
  ".cursor-pointer",
].join(",");

type CursorPoint = {
  x: number;
  y: number;
};

export function CustomCursor() {
  const layerRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLSpanElement>(null);
  const trailRefs = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => {
    const layer = layerRef.current;
    const main = mainRef.current;
    if (!layer || !main) return undefined;

    const precisePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pointer: CursorPoint = { x: 0, y: 0 };
    const trail = Array.from({ length: TRAIL_POINT_COUNT }, () => ({ x: 0, y: 0 }));
    let enabled = false;
    let hasPointerPosition = false;
    let frame = 0;
    let releaseTimer = 0;
    let latestPointerTarget: EventTarget | null = null;

    const setVisible = (visible: boolean) => {
      layer.classList.toggle("is-visible", enabled && visible);
    };

    const setInteractive = (target: EventTarget | null) => {
      const element = target instanceof Element ? target : null;
      layer.classList.toggle("is-interactive", Boolean(element?.closest(INTERACTIVE_SELECTOR)));
    };

    const updateAvailability = () => {
      enabled = precisePointer.matches && !reducedMotion.matches;
      document.documentElement.classList.toggle("custom-cursor-active", enabled);
      layer.hidden = !enabled;
      if (!enabled) {
        hasPointerPosition = false;
        layer.classList.remove("is-visible", "is-interactive", "is-pressed", "is-released");
      }
    };

    const placePoint = (element: HTMLElement | null, point: CursorPoint) => {
      if (!element) return;
      element.style.left = `${point.x}px`;
      element.style.top = `${point.y}px`;
    };

    const animate = () => {
      if (enabled && hasPointerPosition) {
        setInteractive(latestPointerTarget);
        placePoint(main, pointer);

        trail.forEach((point, index) => {
          const target = index === 0 ? pointer : trail[index - 1];
          const followRate = 0.34 - index * 0.035;
          point.x += (target.x - point.x) * followRate;
          point.y += (target.y - point.y) * followRate;

          const remainingX = target.x - point.x;
          const remainingY = target.y - point.y;
          const remainingDistance = Math.hypot(remainingX, remainingY);
          const maximumDelayDistance = 12 + index * 4;
          if (remainingDistance > maximumDelayDistance) {
            point.x = target.x - (remainingX / remainingDistance) * maximumDelayDistance;
            point.y = target.y - (remainingY / remainingDistance) * maximumDelayDistance;
          }

          placePoint(trailRefs.current[index], point);
        });
      }

      frame = window.requestAnimationFrame(animate);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!enabled || event.pointerType === "touch") return;
      pointer.x = event.clientX;
      pointer.y = event.clientY;

      if (!hasPointerPosition) {
        trail.forEach((point) => {
          point.x = pointer.x;
          point.y = pointer.y;
        });
        hasPointerPosition = true;
      }

      latestPointerTarget = event.target;
      setVisible(true);
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (!enabled || event.pointerType === "touch") return;
      window.clearTimeout(releaseTimer);
      layer.classList.remove("is-released");
      layer.classList.add("is-pressed");
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (!enabled || event.pointerType === "touch") return;
      layer.classList.remove("is-pressed");
      layer.classList.remove("is-released");
      void layer.offsetWidth;
      layer.classList.add("is-released");
      releaseTimer = window.setTimeout(() => layer.classList.remove("is-released"), 210);
    };

    const handlePointerOut = (event: PointerEvent) => {
      if (!event.relatedTarget) setVisible(false);
    };

    const handleWindowBlur = () => setVisible(false);

    updateAvailability();
    precisePointer.addEventListener("change", updateAvailability);
    reducedMotion.addEventListener("change", updateAvailability);
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerdown", handlePointerDown, { passive: true });
    window.addEventListener("pointerup", handlePointerUp, { passive: true });
    window.addEventListener("pointercancel", handlePointerUp, { passive: true });
    window.addEventListener("pointerout", handlePointerOut, { passive: true });
    window.addEventListener("blur", handleWindowBlur);
    frame = window.requestAnimationFrame(animate);

    return () => {
      document.documentElement.classList.remove("custom-cursor-active");
      window.cancelAnimationFrame(frame);
      window.clearTimeout(releaseTimer);
      precisePointer.removeEventListener("change", updateAvailability);
      reducedMotion.removeEventListener("change", updateAvailability);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      window.removeEventListener("pointerout", handlePointerOut);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, []);

  return createPortal(
    <div
      ref={layerRef}
      className="custom-cursor-layer"
      data-custom-cursor
      data-exact-export="hide"
      aria-hidden="true"
      hidden
    >
      {Array.from({ length: TRAIL_POINT_COUNT }, (_, index) => (
        <span
          key={index}
          ref={(element) => {
            trailRefs.current[index] = element;
          }}
          className={`custom-cursor-trail custom-cursor-trail-${index + 1}`}
        />
      ))}
      <span ref={mainRef} className="custom-cursor-main">
        <span className="custom-cursor-center" />
      </span>
    </div>,
    document.body,
  );
}
