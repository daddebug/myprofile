import { useEffect, useState, type RefObject } from "react";
import Lenis from "lenis";

// Homepage 3.0, Haoqi-track Phase 2.1: bound explicitly to the Homepage's
// own scroll container (see HomeScrollContainer.tsx) via `wrapper`/
// `content`, not `window`. Confirmed against the live reference: its
// html/body are overflow:hidden and the real scrollable element is an
// inner `.lenis` `overflow-y:auto` div that the reference's own Lenis
// instance binds to -- Phase 2's first pass wrapped `window` instead,
// which was a fidelity deviation this hook now corrects.
//
// Every scroll-reactive Homepage module (the indicator now, the Phase 3
// WebGL bridge and Phase 4 shader distortion later) should read the one
// state object this hook returns -- called once in HomePage.tsx -- rather
// than creating a second Lenis instance or attaching its own listener.
export type LenisScrollState = {
  scroll: number;
  limit: number;
  progress: number;
  velocity: number;
  direction: 1 | -1 | 0;
};

const INITIAL_STATE: LenisScrollState = { scroll: 0, limit: 0, progress: 0, velocity: 0, direction: 0 };

export function useLenisScroll(
  wrapperRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>,
): LenisScrollState {
  const [state, setState] = useState<LenisScrollState>(INITIAL_STATE);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const content = contentRef.current;
    if (!wrapper || !content) return undefined;

    const lenis = new Lenis({ wrapper, content, autoRaf: true });
    const handleScroll = (instance: Lenis) => {
      setState({
        scroll: instance.scroll,
        limit: instance.limit,
        progress: instance.progress,
        velocity: instance.velocity,
        direction: instance.direction,
      });
    };
    lenis.on("scroll", handleScroll);
    return () => {
      lenis.off("scroll", handleScroll);
      lenis.destroy();
    };
  }, [wrapperRef, contentRef]);

  return state;
}
