import { useEffect, useState } from "react";

const readers: Record<string, (id: string) => Promise<{ blob: Blob } | undefined>> = {};

export function useLegacyProjectAsset(projectId: string, localImageId?: string, publicPath?: string) {
  const [source, setSource] = useState(publicPath || "");

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    setSource(publicPath || "");
    if (!localImageId || !readers[projectId]) return undefined;
    readers[projectId](localImageId).then((record) => {
      if (!active || !record?.blob) return;
      objectUrl = URL.createObjectURL(record.blob);
      setSource(objectUrl);
    }).catch(() => undefined);
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [localImageId, projectId, publicPath]);

  return source;
}
