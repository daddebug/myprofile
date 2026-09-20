import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { InlineLayoutTextField } from "../components/template-tools/InlineLayoutTextField";
import { hasIntroPlayedThisSession } from "./home-motion/introSession";
import { INTRO_CONTENT_SETTLE_DELAY, INTRO_CONTENT_SETTLE_DURATION, INTRO_EASE } from "./home-motion/motionTokens";
import "./home-hero.css";

// Kept deliberately simpler than the Project flow below it -- per this
// round's own instruction, the Hero gets its depth from spacing/scale/
// entry timing, not a decorative WebGL sculpture (the prior continuous-
// ambient-scene experiment framing this section has been removed
// outright). No cursive font, no procedural 3D letters, no oversized
// editorial typography competing with Project.
//
// No PROJECT/EXPLORE section-visibility toggle here anymore -- Phase B
// replaced the manually-bound two-list slot system with one continuous,
// catalog-driven flow (HomeProjectFlow.tsx) that has no PROJECT/EXPLORE
// public categorization left to toggle. HomeContent.showProjectSection/
// showExploreSection remain in the stored schema (never deleted, per this
// project's non-destructive-migration rule) but are unused going forward.
export function HomeHero({
  nameText,
  introText,
  roleLineText,
  onCommitField,
  isEditingUI,
  revealed,
}: {
  nameText: string;
  introText: string;
  roleLineText: string;
  onCommitField: (field: "name" | "intro" | "roleLine", value: string) => void;
  isEditingUI: boolean;
  revealed: boolean;
}) {
  const prefersReducedMotion = useReducedMotion();
  // Same first-entry gate HomeIntroTransition uses, read independently
  // (not prop-drilled) so this module stays self-contained -- the
  // content "arriving" scale/opacity settle only plays alongside the
  // aperture reveal on a real first entry; a return visit or reduced
  // motion renders the already-settled state directly.
  const playEntrance = useMemo(() => !prefersReducedMotion && !hasIntroPlayedThisSession(), []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <motion.section
      className={`home-v2__hero${revealed ? " is-revealed" : ""}`}
      initial={playEntrance ? { opacity: 0.85, scale: 0.97 } : false}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: INTRO_CONTENT_SETTLE_DURATION, delay: INTRO_CONTENT_SETTLE_DELAY, ease: INTRO_EASE }}
    >
      {/* Hero name is always plain, readable, click-to-edit DOM
          typography -- never letterform/tube 3D geometry. */}
      <InlineLayoutTextField
        as="h1"
        value={nameText}
        onChange={(value) => onCommitField("name", value)}
        className="home-v2__name"
        ariaLabel="Name"
        placeholder="Name"
        editable={isEditingUI}
      />

      <InlineLayoutTextField
        as="p"
        value={introText}
        onChange={(value) => onCommitField("intro", value)}
        className="home-v2__intro"
        ariaLabel="Introduction"
        placeholder="Introduction"
        editable={isEditingUI}
        multiline
      />

      <InlineLayoutTextField
        as="p"
        value={roleLineText}
        onChange={(value) => onCommitField("roleLine", value)}
        className="home-v2__role-line"
        ariaLabel="Role line"
        placeholder="Role line"
        editable={isEditingUI}
      />
    </motion.section>
  );
}
