import { useLayoutEffect, useState, type ReactNode } from "react";
import "./project-entry-gate.css";

const PROJECT_ENTRY_READY_EVENT = "portfolio:project-entry-ready";

export function ProjectRouteLoadingLayer({ isLeaving = false }: { isLeaving?: boolean }) {
  return (
    <div
      className={isLeaving ? "project-entry-loading is-leaving" : "project-entry-loading"}
      aria-label="Loading project"
      role="status"
    >
      <span className="project-entry-loading-line" aria-hidden="true">
        <i />
      </span>
    </div>
  );
}

export function ProjectRouteTransitionCover({ routeKey }: { routeKey: string }) {
  const [isLeaving, setIsLeaving] = useState(false);
  const [isMounted, setIsMounted] = useState(true);

  useLayoutEffect(() => {
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });

    const handleReady = (event: Event) => {
      if (!(event instanceof CustomEvent) || event.detail?.routeKey !== routeKey) return;
      setIsLeaving(true);
    };

    window.addEventListener(PROJECT_ENTRY_READY_EVENT, handleReady);
    return () => {
      window.removeEventListener(PROJECT_ENTRY_READY_EVENT, handleReady);
      window.history.scrollRestoration = previousRestoration;
    };
  }, [routeKey]);

  if (!isMounted) return null;

  return (
    <div
      onTransitionEnd={() => {
        if (isLeaving) setIsMounted(false);
      }}
    >
      <ProjectRouteLoadingLayer isLeaving={isLeaving} />
    </div>
  );
}

export function ProjectEntryGate({
  routeKey,
  children,
}: {
  routeKey: string;
  children: ReactNode;
}) {
  const [isReady, setIsReady] = useState(false);

  useLayoutEffect(() => {
    setIsReady(false);

    const body = document.body;
    const previousBodyOverflow = body.style.overflow;
    const previousRestoration = window.history.scrollRestoration;
    let firstFrame = 0;
    let secondFrame = 0;
    let cancelled = false;

    body.style.overflow = "hidden";
    window.history.scrollRestoration = "manual";
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });

    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        if (cancelled) return;
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
        body.style.overflow = previousBodyOverflow;
        setIsReady(true);
        window.dispatchEvent(
          new CustomEvent(PROJECT_ENTRY_READY_EVENT, {
            detail: { routeKey },
          }),
        );
      });
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      body.style.overflow = previousBodyOverflow;
      window.history.scrollRestoration = previousRestoration;
    };
  }, [routeKey]);

  return (
    <>
      <div
        className={isReady ? "project-entry-content is-ready" : "project-entry-content"}
        aria-hidden={!isReady}
      >
        {children}
      </div>
      {!isReady ? <ProjectRouteLoadingLayer /> : null}
    </>
  );
}
