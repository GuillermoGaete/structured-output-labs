"use client";

import { useState, type ReactNode } from "react";
import { IconClose } from "@/components/icons";

/**
 * The setup column. On a wide screen it is a sticky column; on a narrow one it
 * folds into a sheet that slides up from a bar at the bottom, so the result
 * keeps the screen.
 */
export function SetupColumn({ summary, children }: { summary: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className={`setup-col ${open ? "setup-open" : ""}`}>
        <div className="setup-sheet-head lg:hidden">
          <span className="eyebrow">Setup</span>
          <button type="button" className="btn btn-icon" onClick={() => setOpen(false)} aria-label="Close setup">
            <IconClose />
          </button>
        </div>
        <div className="setup lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pr-1">{children}</div>
      </div>
      {!open && (
        <button type="button" className="setup-bar lg:hidden" onClick={() => setOpen(true)} aria-expanded={open}>
          <span className="eyebrow">Setup</span>
          <span className="section-summary">{summary}</span>
          <span className="text-accent text-xs shrink-0">open ▴</span>
        </button>
      )}
      {open && <div className="setup-backdrop lg:hidden" onClick={() => setOpen(false)} aria-hidden="true" />}
    </>
  );
}
