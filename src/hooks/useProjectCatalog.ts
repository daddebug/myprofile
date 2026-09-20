import { useEffect, useMemo, useState } from "react";
import {
  PROJECT_PUBLIC_META_CHANGED_EVENT,
  PROJECT_PUBLIC_META_STORAGE_KEY,
  resolveProjectCatalog,
  type ProjectLocale,
} from "../lib/projectMetadata";
import { useDirtyIntents } from "../lib/dirtyIntentStore";

const watchedStorageKeys = new Set([
  PROJECT_PUBLIC_META_STORAGE_KEY,
]);

// Raw catalog: published baseline + every local project-metadata override/
// dynamic-project draft, WITHOUT regard to a pending local DELETE intent.
// Only ever used directly by callers that genuinely need a pending-deletion
// project too (Project Control Center's own pending-deletion strip and its
// edit/undo lookups) -- every other caller wants useOwnerProjectCatalog
// below instead.
export function useProjectCatalog(locale: ProjectLocale) {
  const [catalog, setCatalog] = useState(() => resolveProjectCatalog(locale));

  useEffect(() => {
    const refresh = () => setCatalog(resolveProjectCatalog(locale));
    const handleStorage = (event: StorageEvent) => {
      if (!event.key || watchedStorageKeys.has(event.key)) refresh();
    };

    refresh();
    window.addEventListener("storage", handleStorage);
    window.addEventListener(PROJECT_PUBLIC_META_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(PROJECT_PUBLIC_META_CHANGED_EVENT, refresh);
    };
  }, [locale]);

  return catalog;
}

// The one canonical "what does the owner currently have" resolution: the
// raw catalog above, minus any project with an open local DELETE dirty
// intent. Project Control Center's own main archive list, Homepage, Other
// Projects, and the PDF/Static-HTML/Collection export project picker must
// all derive their visible project set from this single hook -- never
// re-filter dirty-intents ad hoc per call site, which is exactly how a
// project the owner has locally marked for deletion could leak back into
// one list (Homepage, say) while correctly staying hidden from another.
export function useOwnerProjectCatalog(locale: ProjectLocale) {
  const catalog = useProjectCatalog(locale);
  const dirtyIntents = useDirtyIntents("project");
  return useMemo(() => {
    const deletedIds = new Set(
      dirtyIntents.filter((entry) => entry.kind === "DELETE").map((entry) => entry.entityId),
    );
    return catalog.filter((project) => !deletedIds.has(project.id));
  }, [catalog, dirtyIntents]);
}
