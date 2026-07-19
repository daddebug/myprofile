import { useEffect, useState } from "react";

export const OWNER_MODE_STORAGE_KEY = "dilida-portfolio:owner-mode:v1";

function readOwnerParameter() {
  if (typeof window === "undefined") return null;
  return new URL(window.location.href).searchParams.get("owner");
}

function readInitialOwnerMode() {
  if (typeof window === "undefined" || !import.meta.env.DEV) return false;
  const parameter = readOwnerParameter();
  if (parameter === "1") return true;
  if (parameter === "0") return false;
  return window.localStorage.getItem(OWNER_MODE_STORAGE_KEY) === "1";
}

export function useOwnerMode() {
  const [isOwnerMode, setIsOwnerMode] = useState(readInitialOwnerMode);

  useEffect(() => {
    const parameter = readOwnerParameter();
    if (!import.meta.env.DEV) {
      if (parameter === "1" || parameter === "0") {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete("owner");
        window.history.replaceState(window.history.state, "", `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
      }
      return;
    }

    if (parameter === "1") {
      window.localStorage.setItem(OWNER_MODE_STORAGE_KEY, "1");
      setIsOwnerMode(true);
    } else if (parameter === "0") {
      window.localStorage.removeItem(OWNER_MODE_STORAGE_KEY);
      setIsOwnerMode(false);
    }

    if (parameter === "1" || parameter === "0") {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete("owner");
      window.history.replaceState(window.history.state, "", `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
    }
  }, []);

  return isOwnerMode;
}
