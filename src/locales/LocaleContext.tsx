import { createContext, useContext, useEffect, type PropsWithChildren } from "react";
import { enCommon } from "./en/common";
import { zhCommon } from "./zh/common";
import type { CommonMessages, Locale } from "./types";

export const LOCALE_STORAGE_KEY = "dilida-portfolio:locale";
export const DEFAULT_LOCALE: Locale = "zh";

const messages: Record<Locale, CommonMessages> = { zh: zhCommon, en: enCommon };

type LocaleContextValue = {
  locale: Locale;
  messages: CommonMessages;
  pathFor: (path: string, targetLocale?: Locale) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function isLocale(value: string | undefined): value is Locale {
  return value === "zh" || value === "en";
}

export function localizePath(path: string, locale: Locale) {
  if (/^(mailto:|https?:|#)/.test(path)) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const withoutLocale = normalized.replace(/^\/(zh|en)(?=\/|$)/, "") || "/";
  return `/${locale}${withoutLocale === "/" ? "/" : withoutLocale}`;
}

export function readPreferredLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  return isLocale(saved ?? undefined) ? (saved as Locale) : DEFAULT_LOCALE;
}

export function LocaleProvider({ locale, children }: PropsWithChildren<{ locale: Locale }>) {
  useEffect(() => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  }, [locale]);

  const value: LocaleContextValue = {
    locale,
    messages: messages[locale],
    pathFor: (path, targetLocale = locale) => localizePath(path, targetLocale),
  };

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useLocale must be used inside LocaleProvider.");
  return context;
}
