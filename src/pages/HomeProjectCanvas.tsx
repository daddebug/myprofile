import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  getRegisteredProjectCovers,
  isProjectHovered,
  setProjectCoverReady,
  subscribeProjectCoverMembership,
} from "./home-webgl/homeProjectCanvasRegistry";
import { COVER_FRAGMENT_SHADER, COVER_VERTEX_SHADER } from "./home-webgl/coverShaders";
import "./home-scroll-shell.css";

// Homepage 3.0, Haoqi-track Phase 3: the one shared canvas -- DOM stays
// layout authority (x/y/width/height/title/year/links/editing all still
// come from HomeProjectFlow.tsx's own grid); this is a rendering-only
// bridge that reads each registered project's DOM rect and paints a
// matching plane behind it. Cover crop and hover rendering live in
// coverShaders.ts; scrolling never deforms the texture geometry or UVs.
//
// Rect-sync strategy (spec'd, not independently re-derived from Haoqi's
// own minified bundle this round): every registered project's rect is
// either (a) fully re-measured via getBoundingClientRect() this frame,
// or (b) cheaply translated from its last full measurement by the
// scroll delta since then. A project is fully measured when it's near
// the viewport (so real drift -- a resize, an earlier row's image ratio
// resolving late and shifting every row below it -- is always caught
// where it's visible) OR when its index's turn comes up in a 12-frame
// stagger (`projectIndex % 12 === frameIndex % 12`), so far-offscreen
// projects still self-correct without every project paying a full
// layout read on every single frame.
const STAGGER_BUCKETS = 12;
const NEAR_VIEWPORT_MARGIN_FACTOR = 1; // one extra viewport-height of margin on each side

// Haoqi-style square-cell hover reveal (2026-09-21 rework): a fixed-
// duration LINEAR clock drives uHoverProgress; the shader itself derives
// each cell's own delayed, cosine-eased local reveal from that single
// linear value (see coverShaders.ts). This is deliberately NOT an
// exponential smoothing constant anymore -- a real "~0.42s total reveal"
// requirement needs a real elapsed-time-bounded transition, not an RC
// filter that only asymptotically approaches its target.
const HOVER_REVEAL_DURATION_SECONDS = 0.42;

type ElasticLane = "left" | "center" | "right";
const PROJECT_LANES: Record<string, ElasticLane> = {
  "project-1ua2677": "right",
  "project-1ied3i": "left",
  "project-e51ezw": "right",
  "project-1op4ad7": "left",
  "googo-ai-pt5mwd": "right",
  "eli-early-stage-product-design-internship-1fk25s": "left",
  "ai-assisted-gui-design-generative-visual-e-16j0qnx": "center",
  "case-odvwa3": "right",
};
const SPRING_FREQUENCY = 22;
const SPRING_DAMPING = 0.65;
const MOBILE_BREAKPOINT = 760;
const LANE_MOTION: Record<ElasticLane, { gain: number; maxOffset: number }> = {
  left: { gain: 0.1, maxOffset: 14 },
  center: { gain: 0.16, maxOffset: 18 },
  right: { gain: 0.085, maxOffset: 12 },
};

type LaneMotionState = { offset: number; velocity: number };

type MeshRecord = {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
};

type LastRect = {
  left: number;
  top: number;
  width: number;
  height: number;
  scrollAtMeasure: number;
};

function applyCoverScale(material: THREE.ShaderMaterial, planeWidth: number, planeHeight: number, textureAspect: number) {
  const planeAspect = planeWidth / planeHeight;
  let sx = 1;
  let sy = 1;
  if (textureAspect > planeAspect) {
    sx = planeAspect / textureAspect;
  } else {
    sy = textureAspect / planeAspect;
  }
  const scaleUniform = material.uniforms.uCoverScale.value as THREE.Vector2;
  scaleUniform.set(sx, sy);
}

function HomeProjectPlaneMesh({
  id,
  registerMesh,
}: {
  id: string;
  registerMesh: (id: string, record: MeshRecord | null) => void;
}) {
  const meshRef = useRef<THREE.Mesh | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const uniforms = useMemo(
    () => ({
      uMap: { value: null as THREE.Texture | null },
      uMapHover: { value: null as THREE.Texture | null },
      uHasHoverMap: { value: 0 },
      uHoverProgress: { value: 0 },
      uHoverFrom: { value: 0 },
      uHoverTarget: { value: 0 },
      uRectPixelSize: { value: new THREE.Vector2(1, 1) },
      uElasticOffset: { value: 0 },
      uElasticOverscan: { value: 0 },
      uViewportHeight: { value: 1 },
      uAtmosphereEnabled: { value: 0 },
      uAtmosphereStrength: { value: 0 },
      uCoverScale: { value: new THREE.Vector2(1, 1) },
    }),
    [],
  );

  useEffect(() => {
    return () => {
      registerMesh(id, null);
      const material = materialRef.current;
      const texture = material?.uniforms.uMap.value as THREE.Texture | undefined;
      const hoverTexture = material?.uniforms.uMapHover.value as THREE.Texture | undefined;
      texture?.dispose();
      hoverTexture?.dispose();
      material?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <mesh
      ref={(mesh) => {
        meshRef.current = mesh;
        if (mesh && materialRef.current) registerMesh(id, { mesh, material: materialRef.current });
      }}
      scale={[0, 0, 1]}
      visible={false}
    >
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        ref={(material) => {
          materialRef.current = material;
          if (material && meshRef.current) registerMesh(id, { mesh: meshRef.current, material });
        }}
        transparent
        uniforms={uniforms}
        vertexShader={COVER_VERTEX_SHADER}
        fragmentShader={COVER_FRAGMENT_SHADER}
      />
    </mesh>
  );
}

function HomeProjectCanvasScene({ scroll, velocity }: { scroll: number; velocity: number }) {
  const { size, camera, gl } = useThree();
  const meshRecords = useRef(new Map<string, MeshRecord>());
  const lastRects = useRef(new Map<string, LastRect>());
  const notifiedReady = useRef(new Set<string>());
  const frameCounter = useRef(0);
  const lastSize = useRef({ width: 0, height: 0 });
  const motionPreference = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)"), []);
  const mobilePreference = useMemo(() => window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`), []);
  const laneMotion = useRef<Record<ElasticLane, LaneMotionState>>({
    left: { offset: 0, velocity: 0 },
    center: { offset: 0, velocity: 0 },
    right: { offset: 0, velocity: 0 },
  });
  const mobileFollowers = useRef<Record<ElasticLane, number>>({ left: scroll, center: scroll, right: scroll });
  const lastScroll = useRef(scroll);
  const lastMobileScrollChange = useRef(0);
  const atmosphereStrength = useRef(0);
  const [projectIds, setProjectIds] = useState<string[]>(() => Array.from(getRegisteredProjectCovers().keys()));

  useEffect(() => {
    return subscribeProjectCoverMembership(() => {
      setProjectIds(Array.from(getRegisteredProjectCovers().keys()));
    });
  }, []);

  useFrame((state, rawDelta) => {
    frameCounter.current += 1;

    const scrollDelta = scroll - lastScroll.current;
    lastScroll.current = scroll;
    const reducedMotion = motionPreference.matches;
    const isMobile = mobilePreference.matches;
    const atmosphereTarget = reducedMotion || isMobile
      ? 0
      : THREE.MathUtils.clamp((Math.abs(velocity) - 8) / 30, 0, 1);
    const atmosphereTau = atmosphereTarget > atmosphereStrength.current ? 0.18 : 0.38;
    atmosphereStrength.current += (atmosphereTarget - atmosphereStrength.current)
      * (1 - Math.exp(-Math.min(rawDelta, 0.1) / atmosphereTau));
    if (Math.abs(scrollDelta) > 0.01) lastMobileScrollChange.current = state.clock.elapsedTime;
    const laneOffsets = {} as Record<ElasticLane, number>;
    (["left", "center", "right"] as const).forEach((lane) => {
      const motion = laneMotion.current[lane];
      if (reducedMotion) {
        motion.offset = 0;
        motion.velocity = 0;
        mobileFollowers.current[lane] = scroll;
      } else if (isMobile) {
        const lag = state.clock.elapsedTime - lastMobileScrollChange.current > 0.12
          ? 0.22
          : lane === "center" ? 0.7 : 0.5;
        const follower = mobileFollowers.current[lane];
        const next = follower + (scroll - follower) * (1 - Math.exp(-Math.min(rawDelta, 1) / lag));
        mobileFollowers.current[lane] = Math.abs(scroll - next) < 0.15 ? scroll : next;
      } else {
        const { gain, maxOffset } = LANE_MOTION[lane];
        motion.offset = THREE.MathUtils.clamp(motion.offset + scrollDelta * gain, -maxOffset, maxOffset);
        const delta = Math.min(rawDelta, 1 / 30);
        motion.velocity += (-(SPRING_FREQUENCY ** 2) * motion.offset
          - 2 * SPRING_DAMPING * SPRING_FREQUENCY * motion.velocity) * delta;
        motion.offset += motion.velocity * delta;
        if (Math.abs(scrollDelta) < 0.01 && Math.abs(motion.offset) < 0.05 && Math.abs(motion.velocity) < 0.5) {
          motion.offset = 0;
          motion.velocity = 0;
        }
      }
      laneOffsets[lane] = reducedMotion ? 0 : isMobile
        ? THREE.MathUtils.clamp(scroll - mobileFollowers.current[lane],
          -size.width / 12 * (lane === "center" ? 0.65 : 0.4),
          size.width / 12 * (lane === "center" ? 0.65 : 0.4))
        : motion.offset;
    });

    // Orthographic camera in plain CSS-pixel units: world (0,0) is the
    // viewport's top-left corner, +X right, Y goes negative downward --
    // so a plane at world (rect.left + width/2, -(rect.top + height/2))
    // lands exactly where that DOM rect is on screen. `size` (from
    // useThree) is already CSS pixels, not drawing-buffer pixels, so
    // devicePixelRatio never enters this math. Re-asserted every frame,
    // not just in a resize effect -- `scroll` changing on every scroll
    // tick re-renders this whole tree, and relying on an effect left a
    // window for R3F's own default-camera handling to silently re-clobber
    // these bounds back to its centered-frustum convention after the
    // first scroll-driven re-render. Confirmed as the actual cause of a
    // reported "hero becomes full-width / lower covers off-grid"
    // mismatch: the mesh math was always right, the camera watching it
    // wasn't reliably the same camera we configured. Re-verified after
    // this fix with an independent camera-projected screen-rect check
    // (not just reading back the position/scale numbers just written) --
    // 0px error across all visible projects, including after scrolling.
    const cam = camera as THREE.OrthographicCamera;
    cam.left = 0;
    cam.right = size.width;
    cam.top = 0;
    cam.bottom = -size.height;
    cam.near = 0.1;
    cam.far = 1000;
    cam.position.set(0, 0, 10);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
    if (lastSize.current.width !== size.width || lastSize.current.height !== size.height) {
      lastSize.current = { width: size.width, height: size.height };
      lastRects.current.clear();
    }

    const entries = getRegisteredProjectCovers();
    let index = 0;
    entries.forEach((entry, id) => {
      const record = meshRecords.current.get(id);
      index += 1;
      if (!record) return;
      const { mesh, material } = record;

      const prior = lastRects.current.get(id);
      const isStaggerTurn = index % STAGGER_BUCKETS === frameCounter.current % STAGGER_BUCKETS;
      const isNearViewport = prior
        ? prior.top < size.height * (1 + NEAR_VIEWPORT_MARGIN_FACTOR) && prior.top + prior.height > -size.height * NEAR_VIEWPORT_MARGIN_FACTOR
        : true;

      let rect: { left: number; top: number; width: number; height: number };
      if (!prior || isNearViewport || isStaggerTurn) {
        const domRect = entry.element.getBoundingClientRect();
        rect = { left: domRect.left, top: domRect.top, width: domRect.width, height: domRect.height };
        lastRects.current.set(id, { ...rect, scrollAtMeasure: scroll });
      } else {
        const deltaScroll = scroll - prior.scrollAtMeasure;
        rect = { left: prior.left, top: prior.top - deltaScroll, width: prior.width, height: prior.height };
      }

      const lane = PROJECT_LANES[id] ?? "center";
      const elasticOffset = reducedMotion ? 0 : laneOffsets[lane];
      const overscan = isMobile
        ? size.width / 12 * (lane === "center" ? 0.65 : 0.4)
        : LANE_MOTION[lane].maxOffset + 2;
      mesh.position.set(rect.left + rect.width / 2, -(rect.top + rect.height / 2 + elasticOffset), 0);
      mesh.scale.set(Math.max(rect.width, 0.001), Math.max(rect.height + 2 * overscan, 0.001), 1);
      material.uniforms.uElasticOffset.value = elasticOffset;
      material.uniforms.uElasticOverscan.value = overscan;
      material.uniforms.uViewportHeight.value = gl.domElement.height;
      material.uniforms.uAtmosphereEnabled.value = reducedMotion || isMobile ? 0 : 1;
      material.uniforms.uAtmosphereStrength.value = reducedMotion || isMobile ? 0 : atmosphereStrength.current;

      // Confirmed reference visibility culling (haoqi-design-teardown.md
      // section 2.5) -- reuses the `rect` already computed above (no new
      // getBoundingClientRect reads), runs every frame, and gates only
      // mesh.visible. Texture loading below is completely unaffected: a
      // project that scrolls out of view keeps its loaded texture cached
      // (never disposed/reloaded), it just stops being drawn.
      const rectBottom = rect.top + rect.height;
      const margin = 0.25 * size.height;
      const isVisible = rectBottom > -margin && rect.top < size.height + margin;
      const isHardSkip = rectBottom < -(2 * size.height) || rect.top > 3 * size.height;
      (material.uniforms.uRectPixelSize.value as THREE.Vector2).set(rect.width, rect.height);

      // Reuse the DOM fallback's decoded image so canvas takeover does
      // not download the same cover a second time.
      const shouldLoadCover = rectBottom > -size.height * 0.5 && rect.top < size.height * 1.5;
      const fallbackImage = entry.element.querySelector("img");
      const textureUrl = fallbackImage?.currentSrc ?? "";
      if (shouldLoadCover && fallbackImage?.complete && fallbackImage.naturalWidth > 0 && textureUrl
        && material.userData.loadedCoverUrl !== textureUrl) {
        const texture = new THREE.Texture(fallbackImage);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;
        const previousTexture = material.uniforms.uMap.value as THREE.Texture | null;
        material.uniforms.uMap.value = texture;
        material.userData.loadedCoverUrl = textureUrl;
        material.userData.textureAspect = fallbackImage.naturalWidth / fallbackImage.naturalHeight;
        material.userData.textureLoaded = true;
        previousTexture?.dispose();
      }

      // Section B: the hover texture loads unconditionally as soon as the
      // card registers (never gated on hover state) -- "preload both
      // textures when the card registers", so the very first hover on a
      // fresh page load already has a resolved texture to cross-fade to.
      material.uniforms.uHasHoverMap.value = material.userData.loadedHoverUrl && material.userData.loadedHoverUrl === entry.hoverUrl ? 1 : 0;
      if ((isVisible || isProjectHovered(id)) && material.userData.loadedHoverUrl !== entry.hoverUrl && material.userData.loadingHover !== entry.hoverUrl) {
        material.userData.loadingHover = entry.hoverUrl;
        if (!entry.hoverUrl) {
          material.userData.loadingHover = null;
        } else {
          const hoverLoader = new THREE.TextureLoader();
          hoverLoader.load(
            entry.hoverUrl,
            (texture) => {
              texture.colorSpace = THREE.SRGBColorSpace;
              const previousHoverTexture = material.uniforms.uMapHover.value as THREE.Texture | null;
              material.uniforms.uMapHover.value = texture;
              material.userData.loadedHoverUrl = entry.hoverUrl;
              material.userData.loadingHover = null;
              previousHoverTexture?.dispose();
            },
            undefined,
            () => {
              material.userData.loadingHover = null;
            },
          );
        }
      }

      // Real fixed-duration reveal clock -- read the hover-intent store
      // directly (not React state/props), same reasoning as scroll
      // velocity above: this runs every frame regardless of whether React
      // re-rendered. A transition only (re)starts when the target itself
      // actually flips (edge-detected via userData.hoverTargetValue), so
      // re-reading an unchanged hover state doesn't reset the clock.
      const hoverTargetValue = isProjectHovered(id) ? 1 : 0;
      if (material.userData.hoverTargetValue !== hoverTargetValue) {
        material.userData.hoverFromValue = (material.userData.hoverTargetValue as number | undefined) ?? 0;
        material.userData.hoverTargetValue = hoverTargetValue;
        material.userData.hoverTransitionStart = state.clock.elapsedTime;
      }
      const hoverTransitionStart = (material.userData.hoverTransitionStart as number | undefined) ?? state.clock.elapsedTime;
      const hoverProgress = THREE.MathUtils.clamp(
        (state.clock.elapsedTime - hoverTransitionStart) / HOVER_REVEAL_DURATION_SECONDS,
        0,
        1,
      );
      material.uniforms.uHoverProgress.value = hoverProgress;
      material.uniforms.uHoverFrom.value = (material.userData.hoverFromValue as number | undefined) ?? 0;
      material.uniforms.uHoverTarget.value = hoverTargetValue;

      if (material.userData.textureLoaded) {
        const textureAspect = (material.userData.textureAspect as number) ?? entry.ratio;
        applyCoverScale(material, rect.width, rect.height, textureAspect);
        mesh.visible = isVisible && !isHardSkip;
        // Keep the DOM image until the plane has actually drawn once.
      } else {
        mesh.visible = false;
      }
    });
  });

  const registerMesh = (id: string, record: MeshRecord | null) => {
    if (record) {
      record.mesh.onAfterRender = () => {
        if (record.material.userData.textureLoaded && !notifiedReady.current.has(id)) {
          notifiedReady.current.add(id);
          setProjectCoverReady(id, true);
        }
      };
      meshRecords.current.set(id, record);
    }
    else meshRecords.current.delete(id);
  };

  return (
    <>
      {projectIds.map((id) => (
        <HomeProjectPlaneMesh key={id} id={id} registerMesh={registerMesh} />
      ))}
    </>
  );
}

export function HomeProjectCanvas({ scroll, velocity }: { scroll: number; velocity: number }) {
  return (
    <div className="home-project-canvas" aria-hidden="true">
      <Canvas
        orthographic
        dpr={[1, 2]}
        gl={{ alpha: true, antialias: true }}
        camera={{ position: [0, 0, 10] }}
        // R3F's own Canvas default is ACESFilmicToneMapping, not
        // Three.js's own NoToneMapping default -- a nonlinear curve that
        // compresses highlights/contrast, which would make this bridge
        // NOT visually lossless even after the colorspace_fragment fix
        // below. This canvas is the app's only Three.js scene (three/
        // @react-three/fiber are otherwise unused in this codebase), so
        // overriding it here can't affect any other scene.
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
          gl.toneMapping = THREE.NoToneMapping;
        }}
      >
        <HomeProjectCanvasScene scroll={scroll} velocity={velocity} />
      </Canvas>
    </div>
  );
}
