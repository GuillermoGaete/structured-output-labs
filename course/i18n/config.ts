export const LOCALES = ["es", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "es";
export const LOCALE_COOKIE = "sol.locale";
export const LOCALE_NAMES: Record<Locale, string> = { es: "Español", en: "English" };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Minimal Accept-Language parsing: the first supported base language by q-value. */
export function pickLocale(acceptLanguage: string | null | undefined): Locale | null {
  if (!acceptLanguage) return null;
  const ranked = acceptLanguage
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      return { base: tag.trim().toLowerCase().split("-")[0], q: q ? Number(q.split("=")[1]) : 1, index };
    })
    .sort((a, b) => b.q - a.q || a.index - b.index);
  for (const { base } of ranked) if (isLocale(base)) return base;
  return null;
}

/** Swap the locale segment of a pathname, keeping the rest. */
export function localizedPath(locale: Locale, pathname: string): string {
  const stripped = pathname.replace(/^\/(es|en)(?=\/|$)/, "");
  return `/${locale}${stripped || ""}`;
}

/** Remember the visitor's choice for the proxy's redirect of bare paths. */
export function rememberLocale(locale: Locale): void {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}
