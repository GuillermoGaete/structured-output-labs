"use client";

import { usePathname, useRouter } from "next/navigation";
import { LOCALES, LOCALE_NAMES, localizedPath, rememberLocale, type Locale } from "@/i18n/config";
import { useLocale, useT } from "@/i18n/client";

export function LocaleSwitcher() {
  const t = useT();
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const switchTo = (next: Locale) => {
    rememberLocale(next);
    const href = `${localizedPath(next, pathname)}${window.location.search}${window.location.hash}`;
    router.replace(href);
  };
  return (
    <div className="inline-flex overflow-hidden rounded-full border border-rule-2 text-xs" role="group" aria-label={t.common.language}>
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          className={`px-2.5 py-1 font-semibold ${l === locale ? "bg-accent text-accent-ink" : "text-ink-2 hover:bg-raised"}`}
          aria-pressed={l === locale}
          onClick={() => l !== locale && switchTo(l)}
          title={LOCALE_NAMES[l]}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
