import { useMemo, useRef, useState } from "react";
import { PageTransition } from "../components/PageTransition";
import { InlineLayoutTextField } from "../components/template-tools/InlineLayoutTextField";
import { useOwnerMode } from "../hooks/useOwnerMode";
import { useEditingMode } from "../hooks/useEditingMode";
import { useSurfaceSignal } from "../hooks/useSurfaceSignal";
import { useLenisScroll } from "../hooks/useLenisScroll";
import { useLocale } from "../locales/LocaleContext";
import { loadHomeContent, saveHomeContent, textForLocale, type HomeContent, type LocalizedText } from "../lib/homeContentConfig";
import { getPublishedGeneratedAt } from "../lib/publishedPortfolio";
import { HomeIntroTransition } from "./HomeIntroTransition";
import { HomeHero } from "./HomeHero";
import { HomeProjectFlow } from "./HomeProjectFlow";
import { HomeScrollIndicator } from "./HomeScrollIndicator";
import { HomeScrollContainer } from "./HomeScrollContainer";
import { HomeFixedLayer } from "./HomeFixedLayer";
import { HomeFixedNav } from "./HomeFixedNav";
import { HomeProjectCanvas } from "./HomeProjectCanvas";
import { isWebglSupported } from "./home-webgl/isWebglSupported";
import "../project-presentation/portfolio2-layout.css";
import "../project-presentation/project-end-sections.css";
import "./home-v2.css";

// Retained only for src/lib/portfolioStaticHtmlExport.ts's own unrelated
// carousel-slide-count logic (the /export static-HTML snapshot pipeline,
// not touched this round) -- no longer used by this component itself,
// which has no carousel.
export const VISIBLE_COUNT = 3;

export function HomePage() {
  const { locale, pathFor } = useLocale();
  // Homepage's own light (#F7F6ED) background, declared for
  // ProductionExportDock's surface-adaptive glass buttons -- see
  // useSurfaceSignal's own comment for why this can't just be page CSS.
  useSurfaceSignal("light");
  // isOwner: project-click PERMISSION only. isEditingUI: whether editor
  // chrome (cover-upload overlays, etc.) actually renders -- these are
  // deliberately two separate conditions, never one flag reused for both.
  // A project stays clickable for the owner even with editingMode off.
  const isOwner = useOwnerMode();
  const editingMode = useEditingMode();
  const isEditingUI = isOwner && editingMode;

  // Phase 2.1's one shared scroll-state source, bound to the Homepage's
  // own scroll container (see HomeScrollContainer.tsx) rather than
  // `window` -- HomeScrollIndicator reads it here; the Phase 3/4 WebGL
  // bridge and shader distortion will read from this same hook instance
  // rather than attaching their own listener.
  const scrollWrapperRef = useRef<HTMLDivElement | null>(null);
  const scrollContentRef = useRef<HTMLDivElement | null>(null);
  const { scroll, progress: scrollProgress } = useLenisScroll(scrollWrapperRef, scrollContentRef);

  // Phase 3: checked once, not per-frame -- if WebGL genuinely isn't
  // available, HomeProjectCanvas is never mounted at all, no project's
  // registry entry is ever marked ready, and every HomeProjectCard's DOM
  // <img> simply stays visible at its default opacity (see
  // homeProjectCanvasRegistry.ts's own comment on setProjectCoverReady).
  const webglSupported = useMemo(() => isWebglSupported(), []);

  const scrollToProjects = () => {
    // Lenis owns this container's scroll position via its own per-frame
    // sync -- a native `behavior: "smooth"` scrollIntoView animates in
    // tiny increments that Lenis reads back and eases toward its still-
    // unmoved internal target every frame, which nets out to no visible
    // movement at all (confirmed: scrollTop never left 0 across 1.5s).
    // `"instant"` fires a single native scroll event that Lenis just
    // absorbs as its new position, which is why this works reliably.
    const grid = scrollWrapperRef.current?.querySelector<HTMLElement>(".home-project-flow");
    grid?.scrollIntoView({ behavior: "instant", block: "start" });
  };

  const [content, setContent] = useState<HomeContent>(() => loadHomeContent());

  // Intro/role-line entrance reveal: driven by HomeIntroTransition's own
  // onComplete -- it fires immediately for reduced motion or a same-
  // session return visit (no aperture played), and after the aperture
  // finishes opening on a real first entry, so the Hero's own reveal
  // never happens hidden behind an already-gone overlay or, worse, before
  // one still covering it.
  const [revealed, setRevealed] = useState(false);

  // Every editable field is a LocalizedText -- edits always write into the
  // CURRENT viewing locale's slot, leaving the other locale's value
  // untouched, so zh/en content evolves independently.
  function commitField(field: "name" | "intro" | "roleLine" | "longDescription" | "footerCredit", value: string) {
    const nextField: LocalizedText = { ...content[field], [locale]: value };
    const next: HomeContent = { ...content, [field]: nextField, updatedAt: new Date().toISOString() };
    setContent(next);
    saveHomeContent(next);
  }

  const nameText = textForLocale(content.name, locale);
  const introText = textForLocale(content.intro, locale);
  const roleLineText = textForLocale(content.roleLine, locale);
  const longDescriptionText = textForLocale(content.longDescription, locale);
  const footerCreditText = textForLocale(content.footerCredit, locale);

  const generatedAt = getPublishedGeneratedAt();
  const parsedGeneratedAt = generatedAt ? new Date(generatedAt) : null;
  const lastUpdateDisplay = parsedGeneratedAt && !Number.isNaN(parsedGeneratedAt.getTime())
    ? String(parsedGeneratedAt.getFullYear())
    : "—";

  return (
    <PageTransition>
      <div className="home-v2" data-home-v2>
        {/* Opening aperture -- plays once per browser session on a real
            first entry, skipped outright for reduced motion or a same-
            session return visit. See HomeIntroTransition.tsx; the failed
            continuous-3D-ambient-scene experiment this used to sit
            alongside has been removed outright, not replaced with
            another decorative layer. Fixed/full-viewport on its own, so
            it doesn't need to live inside HomeFixedLayer to stay pinned
            above the scroll container. */}
        <HomeIntroTransition onComplete={() => setRevealed(true)} />

        <HomeFixedLayer>
          {webglSupported ? <HomeProjectCanvas scroll={scroll} /> : null}
          <HomeFixedNav onWorkClick={scrollToProjects} />
          <HomeScrollIndicator progress={scrollProgress} />
        </HomeFixedLayer>

        <HomeScrollContainer wrapperRef={scrollWrapperRef} contentRef={scrollContentRef}>
          <div className="home-v2__content-stage">
            <HomeHero
              nameText={nameText}
              introText={introText}
              roleLineText={roleLineText}
              onCommitField={commitField}
              isEditingUI={isEditingUI}
              revealed={revealed}
            />

            {/* Phase B: one continuous, catalog-driven, archive-order flow --
                no manually-bound Homepage-only slot array, no PROJECT/EXPLORE
                public categorization. See HomeProjectFlow.tsx. */}
            <HomeProjectFlow isOwner={isOwner} isEditingUI={isEditingUI} pathFor={pathFor} />

            <section className="home-v2__long">
              <InlineLayoutTextField
                as="p"
                value={longDescriptionText}
                onChange={(value) => commitField("longDescription", value)}
                className="home-v2__long-text"
                ariaLabel="Long-form description"
                placeholder="Long-form description"
                editable={isEditingUI}
                multiline
              />
            </section>
          </div>

          <footer className="portfolio2-project-footer" data-home-footer>
            <div className="portfolio2-project-footer__inner p2-page-rail">
              <InlineLayoutTextField
                as="span"
                value={footerCreditText}
                onChange={(value) => commitField("footerCredit", value)}
                ariaLabel="Footer credit"
                placeholder="Footer credit"
                editable={isEditingUI}
                renderEmpty
              />
              <span>{`Last update:${lastUpdateDisplay}`}</span>
            </div>
          </footer>
        </HomeScrollContainer>
      </div>
    </PageTransition>
  );
}

