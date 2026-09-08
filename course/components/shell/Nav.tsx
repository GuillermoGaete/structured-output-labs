"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BackendStatusPill } from "@/components/backend/BackendSettings";
import { useHref, useT } from "@/i18n/client";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { ModelSelector } from "./ModelSelector";
import { ThemeToggle } from "./ThemeToggle";

export function Nav() {
  const t = useT();
  const href = useHref();
  const pathname = usePathname();
  const home = href("/");
  return (
    <nav className="border-b border-rule bg-panel">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-5">
        <Link href={home} className="font-extrabold tracking-tight" aria-current={pathname === home ? "page" : undefined}>
          {t.course.name}
        </Link>
        <div className="ml-auto flex items-center gap-3">
          <ModelSelector compact />
          <BackendStatusPill compact />
          <ThemeToggle />
          <LocaleSwitcher />
        </div>
      </div>
    </nav>
  );
}
