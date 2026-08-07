import { useEffect, useState } from "react";
import { GAME_COVER_CHANGE_EVENT, getGameCoverRecord } from "../lib/gameCoverDb";

export function useGameCover(assetId?: string, publicPath?: string) {
  const [source, setSource] = useState(publicPath ?? "");

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    const resolve = async () => {
      if (!assetId || !import.meta.env.DEV) {
        setSource(publicPath ?? "");
        return;
      }
      try {
        const record = await getGameCoverRecord(assetId);
        if (!active) return;
        if (record?.blob) {
          objectUrl = URL.createObjectURL(record.blob);
          setSource(objectUrl);
        } else {
          setSource(publicPath ?? "");
        }
      } catch {
        if (active) setSource(publicPath ?? "");
      }
    };
    void resolve();
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string }>).detail;
      if (!detail?.id || detail.id === assetId) void resolve();
    };
    window.addEventListener(GAME_COVER_CHANGE_EVENT, onChange);
    return () => {
      active = false;
      window.removeEventListener(GAME_COVER_CHANGE_EVENT, onChange);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assetId, publicPath]);

  return source;
}
