"use client";

import { useState, type ReactNode } from "react";
import { runChips } from "@/lib/runChips";
import { useBatch } from "@/lib/runStore";
import type { Run } from "@/lib/runTypes";
import { setStep, useHasRuns, useStep } from "@/lib/stepState";

/** Step 1: what runs on the left, at full width; how it runs in a narrower aside on the right. */
export function SetupStep({ main, aside }: { main: ReactNode; aside: ReactNode }) {
  return (
    <div className="setup-step">
      <div className="flex flex-col gap-7 min-w-0">{main}</div>
      <aside className="setup-aside panel" aria-label="How it runs">
        {aside}
      </aside>
    </div>
  );
}

/** A titled group in the main column of the setup. */
export function Block({ title, hint, actions, children }: { title: string; hint?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5 min-w-0">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        <span className="flex items-baseline gap-3 flex-wrap">
          {hint && <span className="text-[12.5px] text-muted">{hint}</span>}
          {actions}
        </span>
      </div>
      {children}
    </section>
  );
}

export interface StartItem {
  id: string;
  name: string;
  description: string;
  group?: string;
  /** A second line, such as "6 variants". */
  note?: string;
}

/** More cards than this and the grid shows one group at a time. */
const GROUPED_ABOVE = 8;

/**
 * Starting points as cards. Pressing one loads it into the setup; nothing runs
 * until the action bar says so. A long catalogue shows one group at a time,
 * opening on the group of the card in use.
 */
export function StartCards({ items, activeId, onPick, disabled = false }: { items: StartItem[]; activeId?: string | null; onPick: (id: string) => void; disabled?: boolean }) {
  const groups = [...new Set(items.map((it) => it.group ?? ""))];
  const grouped = items.length > GROUPED_ABOVE && groups.length > 1;
  const activeGroup = items.find((it) => it.id === activeId)?.group ?? groups[0];
  const [picked, setPicked] = useState<string | null>(null);
  const group = picked ?? activeGroup;
  const shown = grouped ? items.filter((it) => (it.group ?? "") === group) : items;
  return (
    <div className="flex flex-col gap-2.5">
      {grouped && (
        <div className="segmented self-start flex-wrap" role="group" aria-label="Groups">
          {groups.map((g) => (
            <button key={g} type="button" aria-pressed={g === group} onClick={() => setPicked(g)}>
              {g || "Other"} <span className="text-muted">{items.filter((it) => (it.group ?? "") === g).length}</span>
            </button>
          ))}
        </div>
      )}
      <div className="start-grid">
        {shown.map((it) => (
          <button key={it.id} type="button" className={`card text-left ${it.id === activeId ? "card-active" : ""}`} onClick={() => onPick(it.id)} disabled={disabled} aria-pressed={it.id === activeId}>
            {it.group && !grouped && <span className="eyebrow text-[10px]">{it.group}</span>}
            <span className="font-medium text-[13.5px]">{it.name}</span>
            {it.description && <span className="text-xs text-ink-2 leading-snug">{it.description}</span>}
            {it.note && <span className="text-xs text-muted">{it.note}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Fixed to the foot of the screen on both steps: what the next run will do, and the button that runs it. */
export function ActionBar({ sentence, children }: { sentence: ReactNode; children: ReactNode }) {
  return (
    <div className="action-bar">
      <div className="action-bar-in">
        <p className="action-sentence">{sentence}</p>
        {children}
      </div>
    </div>
  );
}

/** Step 2's head: what the run on screen was asked for, and the way back to the setup. */
export function InferenceHead({ run }: { run: Run | null }) {
  const batch = useBatch(run?.batchId ?? null);
  const chips = run ? runChips(run, batch) : [];
  return (
    <div className="panel px-4 py-2.5 flex items-center gap-3 flex-wrap">
      <span className="eyebrow shrink-0">{run ? "Setup of the run on screen" : "Runs"}</span>
      <span className="flex gap-1.5 flex-wrap flex-1 min-w-0">
        {chips.map((c, i) => (
          <span key={`${c.text}-${i}`} className={`chip ${c.tone === "warning" ? "chip-warning" : ""}`} title={c.hint}>
            {c.text}
          </span>
        ))}
      </span>
      <button className="btn py-1 px-2.5 text-[13px]" type="button" onClick={() => setStep(1)}>
        ← Edit setup
      </button>
    </div>
  );
}

/** The two steps, in the top bar. */
export function Stepper() {
  const step = useStep();
  const hasRuns = useHasRuns();
  return (
    <div className="stepper" role="navigation" aria-label="Steps">
      <button className="step" type="button" aria-current={step === 1 ? "step" : undefined} onClick={() => setStep(1)}>
        <span className="step-n">1</span>Setup
      </button>
      <span className="step-sep" aria-hidden="true" />
      <button
        className="step"
        type="button"
        aria-current={step === 2 ? "step" : undefined}
        onClick={() => setStep(2)}
        disabled={!hasRuns}
        title={hasRuns ? "The runs and what they wrote" : "Run something first"}
      >
        <span className="step-n">2</span>Inference
      </button>
    </div>
  );
}
