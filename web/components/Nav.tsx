"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BackendStatusPill } from "./BackendSettings";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/fsm", label: "Schema → Automaton" },
  { href: "/time-machine", label: "Time Machine" },
  { href: "/about", label: "How it works" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="border-b border-line bg-surface">
      <div className="max-w-6xl mx-auto px-5 h-14 flex items-center gap-6">
        <Link href="/" className="font-semibold tracking-tight">
          Structured Output Labs
        </Link>
        <ul className="flex items-center gap-1 text-sm">
          {LINKS.map((l) => {
            const active = pathname === l.href;
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className={`px-2.5 py-1.5 rounded-md ${active ? "bg-surface-2 text-ink" : "text-ink-2 hover:text-ink"}`}
                  aria-current={active ? "page" : undefined}
                >
                  {l.label}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="ml-auto">
          <BackendStatusPill compact />
        </div>
      </div>
    </nav>
  );
}
