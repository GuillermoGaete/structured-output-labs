"use client";

import { useState } from "react";
import { useBackend } from "./BackendProvider";
import { BackendSettings, BackendStatusPill } from "./BackendSettings";

/** Thin top bar: the app name, the backend state, and a disclosure for its URL. No navigation. */
export function Header() {
  const { phase } = useBackend();
  const notReady = phase !== "online";
  const [open, setOpen] = useState(false);
  const shown = open || notReady;

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex h-12 max-w-[1800px] items-center gap-4 px-5">
        <span className="font-semibold tracking-tight">Structured Output Labs</span>
        <div className="ml-auto flex items-center gap-3">
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
