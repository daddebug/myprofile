import { useEffect, useState } from "react";
import { getProjectBodyAsset, PROJECT_BODY_ASSET_CHANGED_EVENT } from "../lib/projectBodyAssetDb";

export function useProjectBodyAsset(assetId?: string, publicPath?: string) {
  const [source, setSource] = useState(publicPath ?? "");

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    const resolve = async () => {
      if (publicPath?.startsWith("/portfolio-assets/project-body/")) {
        setSource(publicPath);
        return;
      }
      if (!assetId || !import.meta.env.DEV) {
        setSource(publicPath ?? "");
        return;
      }
      try {
        const record = await getProjectBodyAsset(assetId);
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
    const onChange = () => void resolve();
    window.addEventListener(PROJECT_BODY_ASSET_CHANGED_EVENT, onChange);
    return () => {
      active = false;
      window.removeEventListener(PROJECT_BODY_ASSET_CHANGED_EVENT, onChange);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assetId, publicPath]);

  return source;
}
