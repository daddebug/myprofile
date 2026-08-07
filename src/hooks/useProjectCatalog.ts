import { useEffect, useState } from "react";
import {
  PROJECT_PUBLIC_META_CHANGED_EVENT,
  PROJECT_PUBLIC_META_STORAGE_KEY,
  resolveProjectCatalog,
  type ProjectLocale,
} from "../lib/projectMetadata";

const watchedStorageKeys = new Set([
  PROJECT_PUBLIC_META_STORAGE_KEY,
]);

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
