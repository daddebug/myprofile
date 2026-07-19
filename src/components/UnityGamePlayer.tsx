import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Play, RefreshCw } from "lucide-react";

type UnityGamePlayerProps = {
  title: string;
  iframeUrl: string;
  externalUrl: string;
  locale: "zh" | "en";
};

type UnityLoadStatus = "idle" | "loading" | "ready" | "error";

const remotePayloadUrls = {
  dataUrl: import.meta.env.VITE_UNITY_DATA_URL?.trim(),
  frameworkUrl: import.meta.env.VITE_UNITY_FRAMEWORK_URL?.trim(),
  codeUrl: import.meta.env.VITE_UNITY_WASM_URL?.trim(),
  streamingAssetsUrl: import.meta.env.VITE_UNITY_STREAMING_ASSETS_URL?.trim(),
};

const hasRemotePayloads = Boolean(
  remotePayloadUrls.dataUrl && remotePayloadUrls.frameworkUrl && remotePayloadUrls.codeUrl,
);

function createConfiguredPlayerUrl(iframeUrl: string) {
  if (!hasRemotePayloads) return iframeUrl;
  const params = new URLSearchParams({
    dataUrl: remotePayloadUrls.dataUrl!,
    frameworkUrl: remotePayloadUrls.frameworkUrl!,
    codeUrl: remotePayloadUrls.codeUrl!,
  });
  if (remotePayloadUrls.streamingAssetsUrl) {
    params.set("streamingAssetsUrl", remotePayloadUrls.streamingAssetsUrl);
  }
  return `${iframeUrl}?${params.toString()}`;
}

export function UnityGamePlayer({ title, iframeUrl, externalUrl, locale }: UnityGamePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playerKey, setPlayerKey] = useState(0);
  const [loadStatus, setLoadStatus] = useState<UnityLoadStatus>("idle");
  const [progress, setProgress] = useState(0);
  const configuredPlayerUrl = useMemo(() => createConfiguredPlayerUrl(iframeUrl), [iframeUrl]);
  const canPlay = import.meta.env.DEV || hasRemotePayloads;

  const labels = locale === "zh"
    ? {
        play: "开始游戏",
        external: "在 Unity Play 中打开",
        firstLoad: "首次加载需要下载较大的游戏资源，请耐心等待。",
        configuring: "可玩版本正在配置中。",
        loading: "正在下载并加载游戏",
        failed: "游戏加载失败，请重试或在新标签页中打开。",
        retry: "重新加载游戏",
        openPlayer: "在新标签页中打开",
      }
    : {
        play: "Play game",
        external: "Open on Unity Play",
        firstLoad: "The first launch downloads a large game build and may take some time.",
        configuring: "The playable build is being configured.",
        loading: "Downloading and loading the game",
        failed: "The game could not be loaded. Retry or open it in a new tab.",
        retry: "Reload game",
        openPlayer: "Open in new tab",
      };

  useEffect(() => {
    if (!isPlaying) return undefined;

    function handleUnityMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin || typeof event.data?.type !== "string") return;
      if (event.data.type === "afterwarm-unity-progress") {
        setLoadStatus("loading");
        setProgress(Math.max(0, Math.min(1, Number(event.data.progress) || 0)));
      } else if (event.data.type === "afterwarm-unity-ready") {
        setLoadStatus("ready");
        setProgress(1);
      } else if (event.data.type === "afterwarm-unity-error") {
        setLoadStatus("error");
      }
    }

    window.addEventListener("message", handleUnityMessage);
    return () => window.removeEventListener("message", handleUnityMessage);
  }, [isPlaying, playerKey]);

  function startGame() {
    if (!canPlay) return;
    setProgress(0);
    setLoadStatus("loading");
    setIsPlaying(true);
  }

  function retryGame() {
    setProgress(0);
    setLoadStatus("loading");
    setPlayerKey((current) => current + 1);
  }

  return (
    <section className="mx-auto mt-4 w-full max-w-[1200px] scroll-mt-24" aria-labelledby="afterwarm-player-title">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-acidGreen/78">
            Playable build
          </p>
          <h2 id="afterwarm-player-title" className="mt-2 font-display text-[clamp(2rem,3.6vw,3.75rem)] leading-tight text-softWhite">
            {title}
          </h2>
        </div>
        <a
          href={externalUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={labels.external}
          className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-[#9FAAD2] transition-colors hover:text-acidGreen focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-acidGreen"
        >
          {labels.external}
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </a>
      </div>

      <div
        className="relative aspect-video w-full overflow-hidden rounded-[16px] border border-[#8296ff]/20 bg-[#171743] shadow-[0_18px_48px_rgba(3,5,26,0.22)]"
        data-unity-player-frame
      >
        {isPlaying ? (
          <>
            <iframe
              key={playerKey}
              src={configuredPlayerUrl}
              title={`Play ${title}`}
              className="block h-full w-full border-0 bg-[#171743]"
              allow="autoplay; gamepad"
              tabIndex={0}
            />
            {loadStatus !== "ready" ? (
              <div className="absolute inset-0 grid place-items-center bg-[#171743]/95 px-6 text-center">
                {loadStatus === "error" ? (
                  <div className="max-w-md">
                    <p className="text-base leading-relaxed text-softWhite/80">{labels.failed}</p>
                    <div className="mt-5 flex flex-wrap justify-center gap-3">
                      <button type="button" onClick={retryGame} className="inline-flex items-center gap-2 rounded-full border border-acidGreen px-5 py-2.5 text-sm font-semibold text-acidGreen transition hover:bg-acidGreen hover:text-deepIndigo">
                        <RefreshCw className="h-4 w-4" aria-hidden="true" />
                        {labels.retry}
                      </button>
                      <a href={configuredPlayerUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-softWhite/25 px-5 py-2.5 text-sm font-semibold text-softWhite/75 transition hover:border-softWhite/50 hover:text-softWhite">
                        {labels.openPlayer}
                        <ExternalLink className="h-4 w-4" aria-hidden="true" />
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="w-full max-w-sm">
                    <p className="text-sm font-semibold text-softWhite/82">{labels.loading} · {Math.round(progress * 100)}%</p>
                    <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-softWhite/12">
                      <div className="h-full rounded-full bg-acidGreen transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${Math.round(progress * 100)}%` }} />
                    </div>
                    <p className="mt-4 text-xs leading-relaxed text-[#9FAAD2]">{labels.firstLoad}</p>
                  </div>
                )}
              </div>
            ) : null}
          </>
        ) : (
          <div className="relative grid h-full place-items-center overflow-hidden px-6 text-center">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(83,105,207,0.32),transparent_48%)]" />
            <div className="absolute inset-0 bg-grain bg-[length:18px_18px] opacity-25" />
            <div className="relative flex flex-col items-center">
              <span className="grid h-14 w-14 place-items-center rounded-full border border-acidGreen/45 bg-acidGreen/10 text-acidGreen">
                <Play className="ml-0.5 h-5 w-5 fill-current" aria-hidden="true" />
              </span>
              <p className="mt-5 font-display text-3xl text-softWhite sm:text-4xl">{title}</p>
              {canPlay ? (
                <>
                  <button
                    type="button"
                    className="mt-6 inline-flex items-center gap-2 rounded-full border border-acidGreen bg-deepIndigo/80 px-6 py-3 font-mono text-xs font-bold uppercase tracking-[0.14em] text-acidGreen transition hover:bg-acidGreen hover:text-deepIndigo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-acidGreen motion-reduce:transition-none"
                    aria-label={labels.play}
                    onClick={startGame}
                  >
                    <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                    PLAY GAME
                  </button>
                  <p className="mt-4 max-w-sm text-xs leading-relaxed text-[#9FAAD2]">{labels.firstLoad}</p>
                </>
              ) : (
                <p className="mt-5 text-sm font-semibold text-[#9FAAD2]">{labels.configuring}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
