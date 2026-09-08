"use client";

import { useT } from "@/i18n/client";
import { useTheme } from "@/lib/theme";

export function ThemeToggle() {
  const t = useT();
  const { resolved, toggle } = useTheme();
  return (
    <button type="button" className="btn text-xs" onClick={toggle} title={t.theme.toggle} aria-label={t.theme.toggle}>
      {resolved === "dark" ? t.theme.light : t.theme.dark}
    </button>
  );
}
