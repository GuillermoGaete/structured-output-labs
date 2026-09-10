"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useBackend } from "./BackendProvider";
import { BackendSettings, BackendStatusPill, ModelPicker } from "./BackendSettings";

const MODES = [
  { href: "/", label: "Constrained", title: "A schema compiled to an automaton that masks the logits" },
  { href: "/logprobs", label: "Logprobs", title: "No schema: the raw distribution behind every token" },
];

/** Thin top bar: the app name, the two modes, the backend state, and its URL. */
export function Header() {
  const { phase } = useBackend();
  const pathname = usePathname();
  const notReady = phase !== "online";
  const [open, setOpen] = useState(false);
  const shown = open || notReady;

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex h-12 max-w-[1800px] items-center gap-4 px-5">
        <span className="font-semibold tracking-tight">Structured Output Labs</span>
        <nav className="flex items-center gap-1 text-sm">
          {MODES.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              title={m.title}
              aria-current={pathname === m.href ? "page" : undefined}
              className={`rounded-md px-2.5 py-1 ${pathname === m.href ? "bg-surface-2 text-ink" : "text-ink-2 hover:text-ink"}`}
            >
              {m.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          {/* The logprobs mode reaches hosted models too, so it carries its own
              picker; two "Model" dropdowns on one screen only confuse. */}
          {pathname !== "/logprobs" && <ModelPicker />}
          <BackendStatusPill compact />
          <button
            className={`btn px-2 py-1 text-xs ${shown ? "border-accent" : ""}`}
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={shown}
            aria-label="Backend URL"
            title="Backend URL"
          >
            ⚙
          </button>
        </div>
      </div>
      {shown && (
        <div className="mx-auto max-w-[1800px] px-5 pb-3">
          <BackendSettings />
        </div>
      )}
    </header>
  );
}
