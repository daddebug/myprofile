import { useEffect, useState } from "react";
import { Gamepad2 } from "lucide-react";

export function GameCoverImage({ src, title, className = "" }: { src?: string; title: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) {
    return <div className={`relative grid h-full w-full place-items-center overflow-hidden bg-[linear-gradient(145deg,#263d82,#11173e)] ${className}`} role="img" aria-label={`${title} cover not set`}><div className="absolute -right-8 -top-8 h-28 w-28 rounded-full border border-softWhite/10" /><div className="absolute -bottom-12 -left-10 h-36 w-36 rounded-full bg-electricBlue/16" /><div className="relative px-5 text-center"><Gamepad2 className="mx-auto h-6 w-6 text-acidGreen/62" aria-hidden="true" /><span className="mt-3 block font-mono text-[9px] font-bold tracking-[0.14em] text-softWhite/38">COVER NOT SET</span></div></div>;
  }
  return <img src={src} alt={`${title} cover`} className={className} loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}
