import {
  useEffect,
  useRef,
  useState,
  type MouseEventHandler,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import "./floating-image-preview.css";

type TriggerProps = {
  onMouseEnter: MouseEventHandler<HTMLElement>;
  onMouseLeave: MouseEventHandler<HTMLElement>;
  previewActive: boolean;
};

const OPEN_DELAY_MS = 120;
const CLOSE_DELAY_MS = 140;
const SCROLL_CLOSE_DISTANCE = 24;

export function FloatingImagePreview({
  src,
  alt,
  enabled,
  resetKey,
  imageDisplayMode = "cover",
  imageCropRatio = "16:9",
  children,
}: {
  src: string;
  alt: string;
  enabled: boolean;
  resetKey?: unknown;
  imageDisplayMode?: "cover" | "natural";
  imageCropRatio?: "16:9" | "1:1";
  children: (props: TriggerProps) => ReactNode;
}) {
  const prefersReducedMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [triggerHovered, setTriggerHovered] = useState(false);
  const triggerHoveredRef = useRef(false);
  const previewHoveredRef = useRef(false);
  const openTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const exitTimerRef = useRef<number | null>(null);
  const requestVersionRef = useRef(0);
  const openRef = useRef(false);
  const triggerElementRef = useRef<HTMLElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const interactionReadyRef = useRef(false);
  const motionFrameRef = useRef<number | null>(null);
  const motionTargetRef = useRef({ x: 0, y: 0, scale: 1, highlight: 0.04 });
  const motionCurrentRef = useRef({ x: 0, y: 0, scale: 1, highlight: 0.04 });
  const reducedMotionRef = useRef(false);
  reducedMotionRef.current = Boolean(prefersReducedMotion);

  const clearTimer = (timer: typeof openTimerRef) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };

  const finishClose = () => {
    if (motionFrameRef.current !== null) window.cancelAnimationFrame(motionFrameRef.current);
    motionFrameRef.current = null;
    interactionReadyRef.current = false;
    motionTargetRef.current = { x: 0, y: 0, scale: 1, highlight: 0.04 };
    motionCurrentRef.current = { x: 0, y: 0, scale: 1, highlight: 0.04 };
    openRef.current = false;
    setOpen(false);
    setClosing(false);
  };

  const closeNow = (immediate = false) => {
    requestVersionRef.current += 1;
    clearTimer(openTimerRef);
    clearTimer(closeTimerRef);
    clearTimer(exitTimerRef);
    if (!openRef.current || immediate) {
      finishClose();
      return;
    }
    setClosing(true);
    exitTimerRef.current = window.setTimeout(finishClose, 200);
  };

  const scheduleClose = () => {
    clearTimer(openTimerRef);
    clearTimer(closeTimerRef);
    closeTimerRef.current = window.setTimeout(() => {
      if (!triggerHoveredRef.current && !previewHoveredRef.current) closeNow();
    }, CLOSE_DELAY_MS);
  };

  const supportsDesktopHover = () => window.matchMedia("(hover: hover) and (pointer: fine) and (min-width: 769px)").matches;

  const renderMotionFrame = () => {
    motionFrameRef.current = null;
    const surface = surfaceRef.current;
    if (!surface || reducedMotionRef.current) return;
    const current = motionCurrentRef.current;
    const target = motionTargetRef.current;
    current.x += (target.x - current.x) * 0.16;
    current.y += (target.y - current.y) * 0.16;
    current.scale += (target.scale - current.scale) * 0.16;
    current.highlight += (target.highlight - current.highlight) * 0.16;
    const distance = Math.min(1, Math.hypot(current.x, current.y));
    surface.style.setProperty("--preview-rotate-x", `${current.y * -3}deg`);
    surface.style.setProperty("--preview-rotate-y", `${current.x * 4}deg`);
    surface.style.setProperty("--preview-shift-x", `${current.x * 4}px`);
    surface.style.setProperty("--preview-shift-y", `${current.y * 3}px`);
    surface.style.setProperty("--preview-scale", `${current.scale}`);
    surface.style.setProperty("--preview-shadow-x", `${current.x * -16}px`);
    surface.style.setProperty("--preview-shadow-y", `${current.y * -12 + 18}px`);
    surface.style.setProperty("--preview-shadow-blur", `${36 + distance * 16}px`);
    surface.style.setProperty("--preview-shadow-alpha", `${0.42 + distance * 0.08}`);
    surface.style.setProperty("--preview-glow-x", `${(current.x + 1) * 50}%`);
    surface.style.setProperty("--preview-glow-y", `${(current.y + 1) * 50}%`);
    surface.style.setProperty("--preview-highlight-opacity", `${current.highlight}`);
    if (Math.abs(target.x - current.x) > 0.002 || Math.abs(target.y - current.y) > 0.002 || Math.abs(target.scale - current.scale) > 0.0002 || Math.abs(target.highlight - current.highlight) > 0.001) {
      motionFrameRef.current = window.requestAnimationFrame(renderMotionFrame);
    }
  };

  const requestMotionFrame = () => {
    if (motionFrameRef.current === null && !reducedMotionRef.current) {
      motionFrameRef.current = window.requestAnimationFrame(renderMotionFrame);
    }
  };

  const resetSurfaceMotion = () => {
    motionTargetRef.current = { x: 0, y: 0, scale: 1, highlight: 0.04 };
    requestMotionFrame();
  };

  const scheduleOpen = () => {
    if (!enabled || !src || !supportsDesktopHover()) return;
    clearTimer(closeTimerRef);
    clearTimer(openTimerRef);
    clearTimer(exitTimerRef);
    if (openRef.current) {
      setClosing(false);
      return;
    }
    const requestVersion = ++requestVersionRef.current;
    openTimerRef.current = window.setTimeout(() => {
      const candidate = new Image();
      candidate.src = src;
      const ready = candidate.decode ? candidate.decode() : Promise.resolve();
      void ready.then(() => {
        if (requestVersionRef.current !== requestVersion || !triggerHoveredRef.current) return;
        openRef.current = true;
        setClosing(false);
        setOpen(true);
      }).catch(() => undefined);
    }, OPEN_DELAY_MS);
  };

  useEffect(() => {
    closeNow(true);
    if (triggerElementRef.current) triggerElementRef.current.style.removeProperty("cursor");
    setTriggerHovered(false);
    triggerHoveredRef.current = false;
    previewHoveredRef.current = false;
    return () => closeNow(true);
    // resetKey intentionally closes an active preview when edit mode or route-backed content changes.
  }, [enabled, resetKey, src]);

  useEffect(() => {
    if (!open) return;
    const startScrollY = window.scrollY;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeNow();
    };
    const onScroll = () => {
      if (Math.abs(window.scrollY - startScrollY) > SCROLL_CLOSE_DISTANCE) closeNow();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll);
    };
  }, [open]);

  const onTriggerEnter: MouseEventHandler<HTMLElement> = (event) => {
    triggerElementRef.current = event.currentTarget;
    if (enabled) event.currentTarget.style.cursor = "zoom-in";
    triggerHoveredRef.current = true;
    setTriggerHovered(true);
    scheduleOpen();
  };
  const onTriggerLeave: MouseEventHandler<HTMLElement> = () => {
    triggerHoveredRef.current = false;
    setTriggerHovered(false);
    scheduleClose();
  };

  return (
    <>
      {children({ onMouseEnter: onTriggerEnter, onMouseLeave: onTriggerLeave, previewActive: enabled && (triggerHovered || open) })}
      {open && typeof document !== "undefined" ? createPortal(
        <div className={`floating-image-preview ${closing ? "floating-image-preview--closing" : ""}`} aria-hidden="true">
          <motion.div
            className="floating-image-preview__veil"
            initial={{ opacity: 0 }}
            animate={{ opacity: closing ? 0 : 1 }}
            transition={{ duration: prefersReducedMotion ? 0.14 : (closing ? 0.18 : 0.2), ease: closing ? [0.4, 0, 0.7, 0.2] : [0.22, 0.72, 0.28, 1] }}
          />
          <div
            className={`floating-image-preview__stage floating-image-preview__stage--${imageDisplayMode}`}
            onMouseEnter={() => {
              previewHoveredRef.current = true;
              clearTimer(closeTimerRef);
            }}
            onMouseLeave={() => {
              previewHoveredRef.current = false;
              resetSurfaceMotion();
              scheduleClose();
            }}
          >
            <motion.div
              className="floating-image-preview__arrival"
              initial={prefersReducedMotion
                ? { opacity: 0 }
                : { opacity: 0, y: 14, scale: 0.97, rotateX: 1.5, rotateY: -1.4, filter: "blur(4px)" }}
              animate={prefersReducedMotion
                ? { opacity: closing ? 0 : 1 }
                : closing
                  ? { opacity: 0, y: 8, scale: 0.98, rotateX: 0, rotateY: 0, filter: "blur(3px)" }
                  : { opacity: 1, y: 0, scale: 1, rotateX: 0, rotateY: 0, filter: "blur(0px)" }}
              transition={prefersReducedMotion
                ? { duration: 0.14, ease: "linear" }
                : closing
                  ? { duration: 0.19, ease: [0.4, 0, 0.7, 0.2] }
                  : {
                      default: { type: "spring", stiffness: 300, damping: 30, mass: 0.9, delay: 0.035 },
                      opacity: { duration: 0.23, ease: [0.2, 0.8, 0.25, 1], delay: 0.025 },
                      filter: { duration: 0.25, ease: [0.2, 0.8, 0.25, 1], delay: 0.025 },
                    }}
              onAnimationStart={() => {
                interactionReadyRef.current = false;
              }}
              onAnimationComplete={() => {
                interactionReadyRef.current = !closing && !prefersReducedMotion;
              }}
            >
              <div
                ref={surfaceRef}
                className={`floating-image-preview__surface floating-image-preview__surface--${imageDisplayMode} ${imageDisplayMode === "cover" ? `floating-image-preview__surface--crop-${imageCropRatio.replace(":", "-")}` : ""}`}
                onMouseMove={(event) => {
                  if (reducedMotionRef.current || !interactionReadyRef.current) return;
                  const rect = event.currentTarget.getBoundingClientRect();
                  const x = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1));
                  const y = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height) * 2 - 1));
                  const distance = Math.min(1, Math.hypot(x, y));
                  motionTargetRef.current = { x, y, scale: 1.005 + distance * 0.007, highlight: 0.05 + distance * 0.05 };
                  requestMotionFrame();
                }}
                onMouseLeave={resetSurfaceMotion}
              >
                <img src={src} alt={alt} className={`floating-image-preview__image floating-image-preview__image--${imageDisplayMode}`} onError={() => closeNow()} />
                <span className="floating-image-preview__highlight" />
              </div>
            </motion.div>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
