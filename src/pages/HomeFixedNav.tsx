import "./home-scroll-shell.css";

// Homepage 3.0, Haoqi-track Phase 2.1: structural recreation of the
// reference's confirmed fixed top nav (`WORK / CONTACT / THEME / SOUND`,
// `position:fixed`, always pinned regardless of scroll) -- a reference
// baseline only, not personalized styling or content logic yet. Kept as
// its own module (not folded into HomePage.tsx) so it can be replaced
// wholesale in the later Personalization Phase without touching the
// scroll architecture around it.
//
// WORK is wired to something real (scrolls the Homepage's own scroll
// container to the project field) because that's a direct, low-risk way
// to verify this round's scroll-container work, not because it's been
// personalized. CONTACT/THEME/SOUND are rendered as inert structural
// placeholders -- Haoqi's own versions open a contact link and toggle
// theme/sound, but building that is a separate feature outside this
// round's scroll-architecture scope, so they are left honestly
// non-functional rather than faked.
export function HomeFixedNav({ onWorkClick }: { onWorkClick: () => void }) {
  return (
    <nav className="home-fixed-nav" aria-label="Homepage">
      <button type="button" className="home-fixed-nav__item" onClick={onWorkClick}>
        WORK
      </button>
      <span className="home-fixed-nav__item home-fixed-nav__item--placeholder">CONTACT</span>
      <span className="home-fixed-nav__item home-fixed-nav__item--placeholder">THEME</span>
      <span className="home-fixed-nav__item home-fixed-nav__item--placeholder">SOUND</span>
    </nav>
  );
}
