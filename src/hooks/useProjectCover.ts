import { useEffect, useState } from "react";
import {
  getProjectCover,
  PROJECT_COVER_CHANGED_EVENT,
} from "../lib/projectCoverDb";
import { getDiskProjectCover } from "../lib/portfolioContentClient";
import { getPublishedProjectCover } from "../lib/publishedPortfolio";

type ProjectCoverState = {
  image: string;
  hasLocalCover: boolean;
  source: "disk" | "legacy" | "fallback";
};

export function useProjectCover(projectId: string, publicPath: string) {
  const publishedPath = getPublishedProjectCover(projectId);
  const fallbackPath = publishedPath || publicPath;
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<ProjectCoverState>({
    image: fallbackPath,
    hasLocalCover: false,
    source: "fallback",
  });

  useEffect(() => {
    const handleCoverChange = (event: Event) => {
      const changedProjectId = (event as CustomEvent<{ projectId?: string }>).detail?.projectId;
      if (!changedProjectId || changedProjectId === projectId) setRevision((value) => value + 1);
    };

    window.addEventListener(PROJECT_COVER_CHANGED_EVENT, handleCoverChange);
    return () => window.removeEventListener(PROJECT_COVER_CHANGED_EVENT, handleCoverChange);
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";

    if (!import.meta.env.DEV) {
      setState({ image: fallbackPath, hasLocalCover: false, source: "fallback" });
      return undefined;
    }

    // Deliberately does NOT reset state to fallbackPath before the lookup
    // resolves: the sharp image and glow both share this state, so an eager
    // reset would blank both out and make them flash back in on every cover
    // change event (initial load, replace, or an unrelated re-render) — the
    // previously-resolved image (if any) keeps rendering until we know what
    // should replace it.
    void (async () => {
      try {
        const diskRecord = await getDiskProjectCover(projectId).catch(() => null);
        if (cancelled) return;
        if (diskRecord) {
          setState({ image: diskRecord.publicUrl, hasLocalCover: true, source: "disk" });
          return;
        }

        const legacyRecord = await getProjectCover(projectId);
        if (cancelled) return;
        if (!legacyRecord) {
          setState({ image: fallbackPath, hasLocalCover: false, source: "fallback" });
          return;
        }
        objectUrl = URL.createObjectURL(legacyRecord.blob);
        setState({ image: objectUrl, hasLocalCover: true, source: "legacy" });
      } catch {
        if (!cancelled) {
          setState({ image: fallbackPath, hasLocalCover: false, source: "fallback" });
        }
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [projectId, fallbackPath, revision]);

  return state;
}
