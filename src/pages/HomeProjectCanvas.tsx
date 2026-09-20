import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  getRegisteredProjectCovers,
  setProjectCoverReady,
  subscribeProjectCoverMembership,
} from "./home-webgl/homeProjectCanvasRegistry";
import { COVER_FRAGMENT_SHADER, COVER_VERTEX_SHADER } from "./home-webgl/coverShaders";
import "./home-scroll-shell.css";

// Homepage 3.0, Haoqi-track Phase 3: the one shared canvas -- DOM stays
// layout authority (x/y/width/height/title/year/links/editing all still
// come from HomeProjectFlow.tsx's own grid); this is a rendering-only
// bridge that reads each registered project's DOM rect and paints a
// matching plane behind it. No distortion/hover/transition yet -- see
// coverShaders.ts's own comment.
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

// Homepage 3.0, Haoqi-track Phase 4.1: values confirmed against
// haoqi-design-teardown.md section 4.1 (GLSL/JS extracted directly off
// the live compiled GPU program, cross-checked against Haoqi's own
// Codrops writeup) -- not invented, not approximated from a spec. One
// shared, JS-smoothed scroll-velocity term drives every plane's
// `uCurlStrength` uniform identically; the per-fragment profile
// (screen-space, in the shader) is what makes center-of-viewport read as
// near-zero and top/bottom edges read as strongest, regardless of which
// plane a given fragment belongs to.
//
// Corrected this round from this round's own original Phase 4 spec,
// which asked for a SIGNED effect (preserve scroll direction, clamp
// -1..1) -- the confirmed reference has no directional component at
// all: velocity is `Math.abs(delta)`, normalized 0..1. Since this file
// now has real extracted source to check against, that takes priority
// over the earlier approximation.
const MAX_CURL_STRENGTH = 0.06;
const VELOCITY_NORMALIZE_PX_PER_SEC = 800;
const ATTACK_TAU = 0.025;
const RELEASE_TAU = 0.175;
const MIN_DT = 1 / 240;
const MAX_DT = 0.1;

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
      uCoverScale: { value: new THREE.Vector2(1, 1) },
      uCurlStrength: { value: 0 },
      uRectOrigin: { value: new THREE.Vector2(0, 0) },
      uRectSize: { value: new THREE.Vector2(1, 1) },
    }),
    [],
  );

  useEffect(() => {
    return () => {
      registerMesh(id, null);
      const material = materialRef.current;
      const texture = material?.uniforms.uMap.value as THREE.Texture | undefined;
      texture?.dispose();
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

function HomeProjectCanvasScene({ scroll }: { scroll: number }) {
  const { size, camera } = useThree();
  const meshRecords = useRef(new Map<string, MeshRecord>());
  const lastRects = useRef(new Map<string, LastRect>());
  const notifiedReady = useRef(new Set<string>());
  const frameCounter = useRef(0);
  const lastSize = useRef({ width: 0, height: 0 });
  // Phase 4: derived locally from the same `scroll` value Phase 2.1's
  // Lenis instance already produces (passed down as a prop) -- not a new
  // scroll/wheel listener. Computed as a true px/s rate (scroll delta /
  // real frame delta) rather than reusing Lenis's own `velocity` (a raw
  // per-internal-tick delta, not already in px/s), so the "~800 px/s"
  // reference value means what it says regardless of frame rate.
  const lastScrollValue = useRef(scroll);
  const smoothedVelocity = useRef(0);
  const [projectIds, setProjectIds] = useState<string[]>(() => Array.from(getRegisteredProjectCovers().keys()));

  useEffect(() => {
    return subscribeProjectCoverMembership(() => {
      setProjectIds(Array.from(getRegisteredProjectCovers().keys()));
    });
  }, []);

  useFrame((_state, rawDelta) => {
    frameCounter.current += 1;

    // Confirmed reference algorithm (haoqi-design-teardown.md 4.1):
    // dt clamped to [1/240, 0.1]s to guard against frame-drop/
    // backgrounded-tab spikes; velocity is UNSIGNED (Math.abs), so the
    // curl has no directional component -- same strength scrolling up
    // or down, only speed matters. Normalized against the confirmed
    // ~800px/s reference, clamped to [0, 1], then smoothed with
    // asymmetric attack/release time constants -- fast attack (0.025s)
    // when growing, slow release (0.175s) when decaying, so the effect
    // snaps in quickly on a flick but settles back out smoothly with no
    // oscillation/overshoot (a first-order exponential filter has
    // neither by construction).
    const delta = THREE.MathUtils.clamp(rawDelta, MIN_DT, MAX_DT);
    const rawVelocity = Math.abs(scroll - lastScrollValue.current) / delta;
    lastScrollValue.current = scroll;
    const velocityTarget = THREE.MathUtils.clamp(rawVelocity / VELOCITY_NORMALIZE_PX_PER_SEC, 0, 1);
    const isAttack = velocityTarget > smoothedVelocity.current;
    const tau = isAttack ? ATTACK_TAU : RELEASE_TAU;
    const alpha = 1 - Math.exp(-delta / tau);
    smoothedVelocity.current += (velocityTarget - smoothedVelocity.current) * alpha;
    const curlStrength = smoothedVelocity.current * MAX_CURL_STRENGTH;

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

      mesh.position.set(rect.left + rect.width / 2, -(rect.top + rect.height / 2), 0);
      mesh.scale.set(Math.max(rect.width, 0.001), Math.max(rect.height, 0.001), 1);
      material.uniforms.uCurlStrength.value = curlStrength;

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
      // Viewport-fraction rect, matching the shader's own vScreenUv
      // space -- lets the fragment shader map the already-distorted
      // absolute screen coordinate back into this card's local UV.
      (material.uniforms.uRectOrigin.value as THREE.Vector2).set(rect.left / size.width, rect.top / size.height);
      (material.uniforms.uRectSize.value as THREE.Vector2).set(rect.width / size.width, rect.height / size.height);

      // Texture load / cover-replacement -- keyed on the registry's own
      // coverUrl, checked every frame against what this material last
      // loaded rather than via a React effect dependency, since the
      // registry is a plain external store, not React state. A guard
      // (`userData.loading`) stops a second load from starting while one
      // for the same URL is already in flight.
      if (material.userData.loadedCoverUrl !== entry.coverUrl && material.userData.loading !== entry.coverUrl) {
        material.userData.loading = entry.coverUrl;
        if (!entry.coverUrl) {
          material.userData.loading = null;
        } else {
          const loader = new THREE.TextureLoader();
          loader.load(
            entry.coverUrl,
            (texture) => {
              texture.colorSpace = THREE.SRGBColorSpace;
              const previousTexture = material.uniforms.uMap.value as THREE.Texture | null;
              material.uniforms.uMap.value = texture;
              material.userData.loadedCoverUrl = entry.coverUrl;
              material.userData.loading = null;
              material.userData.textureAspect = texture.image.width / texture.image.height;
              material.userData.textureLoaded = true;
              previousTexture?.dispose();
            },
            undefined,
            () => {
              // Load failed -- never marked ready below, so this
              // project's DOM cover stays visible (the fallback is the
              // absence of a "ready" flag, not a special branch).
              material.userData.loading = null;
            },
          );
        }
      }

      if (material.userData.textureLoaded) {
        const textureAspect = (material.userData.textureAspect as number) ?? entry.ratio;
        applyCoverScale(material, rect.width, rect.height, textureAspect);
        mesh.visible = isVisible && !isHardSkip;
        // "Ready" (DOM cover safe to hide) is about texture+geometry
        // being synced, not current on-screen visibility -- fires once,
        // regardless of culling, exactly as before this round.
        if (!notifiedReady.current.has(id)) {
          notifiedReady.current.add(id);
          setProjectCoverReady(id, true);
        }
      } else {
        mesh.visible = false;
      }
    });
  });

  const registerMesh = (id: string, record: MeshRecord | null) => {
    if (record) meshRecords.current.set(id, record);
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

export function HomeProjectCanvas({ scroll }: { scroll: number }) {
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
        <HomeProjectCanvasScene scroll={scroll} />
      </Canvas>
    </div>
  );
}

