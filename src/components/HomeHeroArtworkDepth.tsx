import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type RefObject,
} from "react";

type HomeHeroArtworkDepthProps = {
  heroRef: RefObject<HTMLElement | null>;
  imageSrc: string;
  depthSrc: string;
  disabled?: boolean;
  onOrientationPermissionChange?: (state: HomeHeroOrientationPermissionState) => void;
};

export type HomeHeroOrientationPermissionState = "hidden" | "prompt" | "granted" | "denied";

export type HomeHeroArtworkDepthHandle = {
  requestOrientationPermission: () => void;
};

type DeviceOrientationEventConstructorWithPermission = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const normalizeTilt = (degrees: number) => {
  const deadZone = 1.5;
  const limit = 15;
  const magnitude = Math.abs(degrees);
  if (magnitude <= deadZone) return 0;
  return Math.sign(degrees) * clamp((magnitude - deadZone) / (limit - deadZone), 0, 1);
};

const getScreenAngle = () => {
  const legacyWindow = window as Window & { orientation?: number };
  return screen.orientation?.angle ?? legacyWindow.orientation ?? 0;
};

const orientToScreen = (beta: number, gamma: number) => {
  const radians = (getScreenAngle() * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: gamma * cosine + beta * sine,
    y: -gamma * sine + beta * cosine,
  };
};

const vertexShaderSource = `
attribute vec2 aPosition;
varying vec2 vUv;

void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
  vUv = vec2(aPosition.x * 0.5 + 0.5, 1.0 - (aPosition.y * 0.5 + 0.5));
}
`;

const fragmentShaderSource = `
precision mediump float;

uniform sampler2D uImage;
uniform sampler2D uDepth;
uniform vec2 uMouse;
uniform vec2 uUvScale;
uniform vec2 uUvOffset;
uniform vec2 uMaxDisplacement;

varying vec2 vUv;

void main() {
  vec2 baseUv = vUv * uUvScale + uUvOffset;
  float depth = texture2D(uDepth, baseUv).r;
  float influence = mix(0.10, 1.0, depth * depth);
  vec2 displacedUv = clamp(
    baseUv + uMouse * uMaxDisplacement * influence,
    vec2(0.001),
    vec2(0.999)
  );

  gl_FragColor = texture2D(uImage, displacedUv);
}
`;

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load image texture: ${src}`));
    image.src = src;
  });
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext) {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
  if (!vertexShader || !fragmentShader) {
    if (vertexShader) gl.deleteShader(vertexShader);
    if (fragmentShader) gl.deleteShader(fragmentShader);
    return null;
  }

  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    return null;
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

function createTexture(gl: WebGLRenderingContext, image: HTMLImageElement, unit: number) {
  const texture = gl.createTexture();
  if (!texture) return null;

  gl.activeTexture(unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  return texture;
}

export const HomeHeroArtworkDepth = forwardRef<HomeHeroArtworkDepthHandle, HomeHeroArtworkDepthProps>(function HomeHeroArtworkDepth({
  heroRef,
  imageSrc,
  depthSrc,
  disabled = false,
  onOrientationPermissionChange,
}, ref) {
  const layerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const permissionRequestRef = useRef<() => void>(() => undefined);

  useImperativeHandle(ref, () => ({
    requestOrientationPermission: () => permissionRequestRef.current(),
  }), []);

  useEffect(() => {
    const layer = layerRef.current;
    const canvas = canvasRef.current;
    const hero = heroRef.current;
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine) and (min-width: 768px)");
    if (!layer || !canvas || !hero || disabled) return;

    const desktopInput = finePointer.matches;

    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
    });
    if (!gl) return;

    const program = createProgram(gl);
    if (!program) return;

    const positionLocation = gl.getAttribLocation(program, "aPosition");
    const imageLocation = gl.getUniformLocation(program, "uImage");
    const depthLocation = gl.getUniformLocation(program, "uDepth");
    const mouseLocation = gl.getUniformLocation(program, "uMouse");
    const uvScaleLocation = gl.getUniformLocation(program, "uUvScale");
    const uvOffsetLocation = gl.getUniformLocation(program, "uUvOffset");
    const displacementLocation = gl.getUniformLocation(program, "uMaxDisplacement");
    const positionBuffer = gl.createBuffer();

    if (
      positionLocation < 0
      || !imageLocation
      || !depthLocation
      || !mouseLocation
      || !uvScaleLocation
      || !uvOffsetLocation
      || !displacementLocation
      || !positionBuffer
    ) {
      gl.deleteProgram(program);
      if (positionBuffer) gl.deleteBuffer(positionBuffer);
      return;
    }

    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1i(imageLocation, 0);
    gl.uniform1i(depthLocation, 1);

    let active = true;
    let frame = 0;
    let bounds: DOMRect | null = null;
    let imageTexture: WebGLTexture | null = null;
    let depthTexture: WebGLTexture | null = null;
    let imageWidth = 1;
    let imageHeight = 1;
    let texturesReady = false;
    const target = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };
    const surface = { x: 0, y: 0 };
    const mobileDepthX = 8;
    const mobileDepthY = 6;
    const surfaceRangeX = desktopInput ? 3 : 2;
    const surfaceRangeY = desktopInput ? 2 : 1.5;
    let orientationBaseline: { x: number; y: number } | null = null;
    let orientationActive = false;
    let orientationListening = false;
    let touchActive = false;

    const updateGeometry = () => {
      const cssWidth = Math.max(1, canvas.clientWidth);
      const cssHeight = Math.max(1, canvas.clientHeight);
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const width = Math.max(1, Math.round(cssWidth * dpr));
      const height = Math.max(1, Math.round(cssHeight * dpr));

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, width, height);

      const canvasAspect = cssWidth / cssHeight;
      const imageAspect = imageWidth / imageHeight;
      let scaleX = 1;
      let scaleY = 1;
      let offsetX = 0;
      let offsetY = 0;

      if (canvasAspect < imageAspect) {
        scaleX = canvasAspect / imageAspect;
        offsetX = (1 - scaleX) * 0.42;
      } else {
        scaleY = imageAspect / canvasAspect;
        offsetY = (1 - scaleY) * 0.5;
      }

      gl.uniform2f(uvScaleLocation, scaleX, scaleY);
      gl.uniform2f(uvOffsetLocation, offsetX, offsetY);
      gl.uniform2f(
        displacementLocation,
        ((desktopInput ? 14 : mobileDepthX) * scaleX) / cssWidth,
        ((desktopInput ? 10 : mobileDepthY) * scaleY) / cssHeight,
      );
    };

    const draw = () => {
      if (!texturesReady) return;
      gl.uniform2f(mouseLocation, current.x, current.y);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    const animate = () => {
      const deltaX = target.x - current.x;
      const deltaY = target.y - current.y;
      const surfaceTargetX = target.x * -surfaceRangeX;
      const surfaceTargetY = target.y * -surfaceRangeY;
      const surfaceDeltaX = surfaceTargetX - surface.x;
      const surfaceDeltaY = surfaceTargetY - surface.y;
      current.x += deltaX * 0.08;
      current.y += deltaY * 0.08;
      surface.x += surfaceDeltaX * 0.045;
      surface.y += surfaceDeltaY * 0.045;
      canvas.style.transform = `translate3d(${surface.x.toFixed(2)}px, ${surface.y.toFixed(2)}px, 0)`;
      draw();

      if (
        Math.abs(deltaX) > 0.002
        || Math.abs(deltaY) > 0.002
        || Math.abs(surfaceDeltaX) > 0.01
        || Math.abs(surfaceDeltaY) > 0.01
      ) {
        frame = window.requestAnimationFrame(animate);
      } else {
        current.x = target.x;
        current.y = target.y;
        surface.x = surfaceTargetX;
        surface.y = surfaceTargetY;
        canvas.style.transform = `translate3d(${surface.x.toFixed(2)}px, ${surface.y.toFixed(2)}px, 0)`;
        draw();
        frame = 0;
      }
    };

    const requestMotion = () => {
      if (!frame) frame = window.requestAnimationFrame(animate);
    };
    const handleDesktopEnter = () => {
      bounds = hero.getBoundingClientRect();
    };
    const handleDesktopMove = (event: PointerEvent) => {
      if (!bounds) bounds = hero.getBoundingClientRect();
      target.x = Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width - 0.5) * 2));
      target.y = Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / bounds.height - 0.5) * 2));
      requestMotion();
    };
    const resetMotion = () => {
      bounds = null;
      target.x = 0;
      target.y = 0;
      requestMotion();
    };
    const handleTouchStart = (event: PointerEvent) => {
      if (event.pointerType !== "touch" || orientationActive) return;
      touchActive = true;
      bounds = hero.getBoundingClientRect();
    };
    const handleTouchMove = (event: PointerEvent) => {
      if (event.pointerType !== "touch" || !touchActive || orientationActive) return;
      if (!bounds) bounds = hero.getBoundingClientRect();
      target.x = clamp(((event.clientX - bounds.left) / bounds.width - 0.5) * 2, -1, 1);
      target.y = clamp(((event.clientY - bounds.top) / bounds.height - 0.5) * 2, -1, 1);
      requestMotion();
    };
    const handleTouchEnd = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      touchActive = false;
      if (!orientationActive) resetMotion();
    };
    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (event.beta == null || event.gamma == null) return;
      const oriented = orientToScreen(event.beta, event.gamma);
      if (!orientationBaseline) {
        orientationBaseline = oriented;
        orientationActive = true;
        touchActive = false;
        resetMotion();
        return;
      }
      target.x = normalizeTilt(oriented.x - orientationBaseline.x);
      target.y = normalizeTilt(oriented.y - orientationBaseline.y);
      requestMotion();
    };
    const startOrientation = () => {
      if (orientationListening) return;
      window.addEventListener("deviceorientation", handleOrientation);
      orientationListening = true;
    };
    const handleScreenOrientationChange = () => {
      orientationBaseline = null;
      orientationActive = false;
      resetMotion();
    };
    const handleVisibilityChange = () => {
      if (document.hidden) resetMotion();
    };
    const handleContextLost = () => {
      layer.classList.remove("is-depth-ready");
    };

    const resizeObserver = new ResizeObserver(() => {
      updateGeometry();
      draw();
      bounds = null;
    });

    if (desktopInput) {
      hero.addEventListener("pointerenter", handleDesktopEnter);
      hero.addEventListener("pointermove", handleDesktopMove);
      hero.addEventListener("pointerleave", resetMotion);
      onOrientationPermissionChange?.("hidden");
    } else {
      hero.addEventListener("pointerdown", handleTouchStart);
      hero.addEventListener("pointermove", handleTouchMove);
      hero.addEventListener("pointerup", handleTouchEnd);
      hero.addEventListener("pointercancel", handleTouchEnd);
      screen.orientation?.addEventListener("change", handleScreenOrientationChange);
      document.addEventListener("visibilitychange", handleVisibilityChange);

      const orientationConstructor = window.DeviceOrientationEvent as DeviceOrientationEventConstructorWithPermission | undefined;
      if (orientationConstructor?.requestPermission) {
        onOrientationPermissionChange?.("prompt");
        permissionRequestRef.current = () => {
          void orientationConstructor.requestPermission?.()
            .then((permission) => {
              if (!active) return;
              if (permission === "granted") {
                onOrientationPermissionChange?.("granted");
                startOrientation();
              } else {
                onOrientationPermissionChange?.("denied");
              }
            })
            .catch(() => {
              if (active) onOrientationPermissionChange?.("denied");
            });
        };
      } else if (orientationConstructor) {
        onOrientationPermissionChange?.("hidden");
        startOrientation();
      } else {
        onOrientationPermissionChange?.("hidden");
      }
    }
    canvas.addEventListener("webglcontextlost", handleContextLost);
    resizeObserver.observe(canvas);

    void Promise.all([loadImage(imageSrc), loadImage(depthSrc)])
      .then(([image, depth]) => {
        if (!active) return;
        if (image.naturalWidth !== depth.naturalWidth || image.naturalHeight !== depth.naturalHeight) return;
        imageWidth = image.naturalWidth;
        imageHeight = image.naturalHeight;
        imageTexture = createTexture(gl, image, gl.TEXTURE0);
        depthTexture = createTexture(gl, depth, gl.TEXTURE1);
        if (!imageTexture || !depthTexture) return;
        texturesReady = true;
        updateGeometry();
        draw();
        layer.classList.add("is-depth-ready");
      })
      .catch(() => {
        layer.classList.remove("is-depth-ready");
      });

    return () => {
      active = false;
      permissionRequestRef.current = () => undefined;
      layer.classList.remove("is-depth-ready");
      hero.removeEventListener("pointerenter", handleDesktopEnter);
      hero.removeEventListener("pointermove", handleDesktopMove);
      hero.removeEventListener("pointerleave", resetMotion);
      hero.removeEventListener("pointerdown", handleTouchStart);
      hero.removeEventListener("pointermove", handleTouchMove);
      hero.removeEventListener("pointerup", handleTouchEnd);
      hero.removeEventListener("pointercancel", handleTouchEnd);
      if (orientationListening) window.removeEventListener("deviceorientation", handleOrientation);
      screen.orientation?.removeEventListener("change", handleScreenOrientationChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      resizeObserver.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      canvas.style.transform = "";
      if (imageTexture) gl.deleteTexture(imageTexture);
      if (depthTexture) gl.deleteTexture(depthTexture);
      gl.deleteBuffer(positionBuffer);
      gl.deleteProgram(program);
    };
  }, [depthSrc, disabled, heroRef, imageSrc, onOrientationPermissionChange]);

  return (
    <div ref={layerRef} className="home-hero-artwork-layer" aria-hidden="true">
      <img className="home-hero-artwork" src={imageSrc} alt="" />
      <canvas ref={canvasRef} className="home-hero-depth-canvas" data-exact-export="hide" />
    </div>
  );
});
