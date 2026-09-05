import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useReducedMotion } from "framer-motion";
import { AnimatedLogo } from "./AnimatedLogo";
import {
  HomeHeroArtworkDepth,
  type HomeHeroArtworkDepthHandle,
  type HomeHeroOrientationPermissionState,
} from "./HomeHeroArtworkDepth";
import { PortfolioTrackTabs } from "./PortfolioTrackTabs";
import type { ActivePortfolioTrack } from "../lib/portfolioTrackContext";
import { useLocale } from "../locales/LocaleContext";

const heroIllustration = "/images/profile/home-hero-artwork.jpg";
const heroIllustrationDepth = "/images/profile/home-hero-artwork-depth.webp";

export function HomePortfolioCover({ onSelectTrack }: { onSelectTrack?: (track: ActivePortfolioTrack) => void }) {
  const { locale } = useLocale();
  const reduceMotion = useReducedMotion();
  const [openingComplete, setOpeningComplete] = useState(false);
  const [orientationPermission, setOrientationPermission] = useState<HomeHeroOrientationPermissionState>("hidden");
  const heroRef = useRef<HTMLElement>(null);
  const depthArtworkRef = useRef<HomeHeroArtworkDepthHandle>(null);

  const handleOrientationPermissionChange = useCallback((state: HomeHeroOrientationPermissionState) => {
    setOrientationPermission(state);
  }, []);

  useEffect(() => {
    if (reduceMotion) setOpeningComplete(true);
  }, [reduceMotion]);

  const copy = locale === "zh"
    ? {
        intro: "关注游戏体验、系统交互与 AI 辅助设计，持续将复杂机制转化为更清晰、可验证、可落地的体验。拥有商业游戏项目与跨平台设计经验，擅长从玩法目标、信息结构与界面表现之间建立更稳定的连接。",
        caption: "游戏 UX/UI · 交互设计 · AI 辅助工作流",
        tracks: "选择作品方向",
        enableDepth: "启用动态景深",
      }
    : {
        intro: "I focus on game experience, systemic interaction, and AI-assisted design, continually turning complex mechanics into clearer, testable, shippable experiences. With experience across commercial game projects and cross-platform design, I build steadier connections between gameplay goals, information structure, and interface expression.",
        caption: "Game UX/UI · Interaction Design · AI-assisted workflows",
        tracks: "Choose a portfolio track",
        enableDepth: "Enable depth motion",
      };

  return (
    <section ref={heroRef} className="home-portfolio-hero" data-home-portfolio-cover>
      <div className="home-hero-visual" aria-hidden="true">
        <HomeHeroArtworkDepth
          ref={depthArtworkRef}
          heroRef={heroRef}
          imageSrc={heroIllustration}
          depthSrc={heroIllustrationDepth}
          disabled={Boolean(reduceMotion)}
          onOrientationPermissionChange={handleOrientationPermissionChange}
        />
        <div className="home-hero-water-grid" />
        <div className="home-hero-caustic" />
      </div>
      <div className="home-hero-horizon-fade" aria-hidden="true" />

      {orientationPermission === "prompt" ? (
        <button
          type="button"
          className="home-hero-depth-permission"
          data-exact-export="hide"
          onClick={() => depthArtworkRef.current?.requestOrientationPermission()}
        >
          {copy.enableDepth}
        </button>
      ) : null}

      <div className={`site-container home-hero-composition ${openingComplete ? "is-revealed" : "is-opening"}`}>
        <div className="home-hero-copy">
          <h1 className="home-hero-name">Dilida Duman</h1>
          <p className="home-hero-intro">{copy.intro}</p>
          <p className="home-hero-caption">{copy.caption}</p>
        </div>

        <div className="home-hero-tracks">
          <p>{copy.tracks}</p>
          <PortfolioTrackTabs onSelect={onSelectTrack} showAllTab={false} />
        </div>
      </div>

      {!openingComplete && typeof document !== "undefined"
        ? createPortal(
            <div className="home-opening-layer" aria-hidden="true">
              <AnimatedLogo onComplete={() => setOpeningComplete(true)} />
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}
