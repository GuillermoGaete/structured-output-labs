"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useHref, useT } from "@/i18n/client";
import type { ModuleId } from "@/modules/types";

export function ModuleTabs({ moduleId, slideCount }: { moduleId: ModuleId; slideCount: number }) {
  const t = useT();
  const href = useHref();
  const pathname = usePathname();
  const tabs = [
    { key: "overview", label: t.moduleLayout.overview, to: href(`/${moduleId}`) },
    { key: "slides", label: `${t.moduleLayout.slides} · ${slideCount}`, to: href(`/${moduleId}/slides/1`) },
    { key: "lab", label: t.moduleLayout.lab, to: href(`/${moduleId}/lab`) },
  ];
  return (
    <div className="flex items-center gap-1 text-sm">
      {tabs.map((tab) => {
        const active = tab.key === "overview" ? pathname === tab.to : pathname.startsWith(tab.to.replace(/\/1$/, ""));
        return (
          <Link
            key={tab.key}
            href={tab.to}
            className={`rounded-full px-3 py-1.5 font-semibold ${active ? "bg-accent-soft text-accent-strong" : "text-ink-2 hover:bg-raised"}`}
            aria-current={active ? "page" : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
