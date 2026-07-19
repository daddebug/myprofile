import { useEffect, useState } from "react";
import {
  getProjectCover,
  PROJECT_COVER_CHANGED_EVENT,
} from "../lib/projectCoverDb";

type ProjectCoverState = {
  image: string;
  hasLocalCover: boolean;
};

export function useProjectCover(projectId: string, publicPath: string) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<ProjectCoverState>({ image: publicPath, hasLocalCover: false });

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

    setState({ image: publicPath, hasLocalCover: false });
    getProjectCover(projectId)
      .then((record) => {
        if (cancelled || !record) return;
        objectUrl = URL.createObjectURL(record.blob);
        setState({ image: objectUrl, hasLocalCover: true });
      })
      .catch(() => {
        if (!cancelled) setState({ image: publicPath, hasLocalCover: false });
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [projectId, publicPath, revision]);

  return state;
}
