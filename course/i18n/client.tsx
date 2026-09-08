"use client";

import { createContext, useContext, useMemo } from "react";
import type { Dictionary } from "./dictionaries/es";
import { localizedPath, type Locale } from "./config";

interface I18nValue {
  locale: Locale;
  t: Dictionary;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ locale, dictionary, children }: { locale: Locale; dictionary: Dictionary; children: React.ReactNode }) {
  const value = useMemo(() => ({ locale, t: dictionary }), [locale, dictionary]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT(): Dictionary {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useT must be used inside I18nProvider");
  return ctx.t;
}

export function useLocale(): Locale {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useLocale must be used inside I18nProvider");
  return ctx.locale;
}

/** `/{locale}{path}` for links inside client components. */
export function useHref(): (path: string) => string {
  const locale = useLocale();
  return (path: string) => localizedPath(locale, path.startsWith("/") ? path : `/${path}`);
}

/** Tiny template helper: fill("{model} loaded", { model: "x" }). */
export function fill(template: string, values: Record<string, string | number | null | undefined>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
}
