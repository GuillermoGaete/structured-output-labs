"use client";

import { useT } from "@/i18n/client";

export function Footer() {
  const t = useT();
  return <footer className="border-t border-rule py-4 text-center text-xs text-muted">{t.footer.stack}</footer>;
}
