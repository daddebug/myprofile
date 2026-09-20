import { useEffect, type PropsWithChildren, type RefObject } from "react";
import "./home-scroll-shell.css";

// Homepage 3.0, Haoqi-track Phase 2.1: the inner scroll container Lenis
// binds to (see useLenisScroll.ts). `home-scroll-lock` is added to
// <html> only while this component is mounted -- i.e. only while the
// Homepage route is active -- and removed on unmount, so leaving the
// Homepage restores ordinary document scrolling immediately for every
// other route (project pages, /work, etc.). Never a static global rule.
export function HomeScrollContainer({
  wrapperRef,
  contentRef,
  children,
}: PropsWithChildren<{
  wrapperRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
}>) {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("home-scroll-lock");
    return () => root.classList.remove("home-scroll-lock");
  }, []);

  return (
    <div ref={wrapperRef} className="home-scroll-container">
      <div ref={contentRef} className="home-scroll-container__content">
        {children}
      </div>
    </div>
  );
}
