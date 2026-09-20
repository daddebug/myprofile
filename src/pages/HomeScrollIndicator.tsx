import { useEffect, useRef, useState } from "react";
import "./home-scroll-indicator.css";

// Homepage 3.0, Haoqi-track Phase 2. Confirmed structure from the live
// reference (haoqi.design DOM): a fixed div at the right edge, vertically
// centered, containing one SVG with a dim full-height track line and a
// solid marker segment whose position within the track tracks scroll
// progress -- `M 16 6 V 194` (track) / `M 16 6 V 26` (marker, moving to
// `M 16 25 V 45` etc. as scrollTop increases). It fades in during active
// scroll and back out after a short idle period (`transition-opacity
// duration-500`, `opacity-0` at rest) -- confirmed the marker updates
// live; the exact fade trigger is inferred from the class names (not
// independently re-verified frame-by-frame), so this reproduces "visible
// while scrolling, fades after ~600ms idle" rather than a fully proven
// per-millisecond timing.
const TRACK_TOP = 6;
const TRACK_BOTTOM = 194;
const MARKER_LENGTH = 20;
const IDLE_HIDE_MS = 600;

export function HomeScrollIndicator({ progress }: { progress: number }) {
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastProgress = useRef(progress);

  useEffect(() => {
    if (progress !== lastProgress.current) {
      lastProgress.current = progress;
      setVisible(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setVisible(false), IDLE_HIDE_MS);
    }
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [progress]);

  const travel = TRACK_BOTTOM - TRACK_TOP - MARKER_LENGTH;
  const markerTop = TRACK_TOP + progress * travel;

  return (
    <div className={`home-scroll-indicator${visible ? " home-scroll-indicator--visible" : ""}`} aria-hidden="true">
      <svg width="32" height="200" viewBox="0 0 32 200">
        <path
          d={`M 16 ${TRACK_TOP} V ${TRACK_BOTTOM}`}
          stroke="currentColor"
          strokeOpacity="0.2"
          strokeWidth="6"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path
          d={`M 16 ${markerTop} V ${markerTop + MARKER_LENGTH}`}
          stroke="currentColor"
          strokeWidth="6"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
