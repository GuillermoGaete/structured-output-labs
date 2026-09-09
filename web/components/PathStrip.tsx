"use client";

import { useEffect, useRef } from "react";
import type { Step } from "@/lib/types";
import { visibleToken } from "@/lib/tokens";

interface Props {
  steps: Step[];
  index: number;
  /** Maps a step's automaton state (outlines id) to the id drawn in the graph, or null if not drawn. */
  graphIdOf: (rawState: number | null) => number | null;
  onPick: (i: number) => void;
}

/**
 * The path the run has taken through the automaton so far:
 * state —token→ state —token→ … up to the current step. Each step's
 * `fsm_state` is the state the mask was read from *before* that token, so
 * the token of step k is the edge from state k to state k+1.
 */
export function PathStrip({ steps, index, graphIdOf, onPick }: Props) {
  const currentRef = useRef<HTMLButtonElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  // scrollIntoView would scroll every ancestor, including the page, once per streamed token.
  useEffect(() => {
    const box = boxRef.current;
    const chip = currentRef.current;
    if (!box || !chip) return;
    box.scrollTo({ left: chip.offsetLeft - box.clientWidth / 2 + chip.clientWidth / 2, behavior: "auto" });
  }, [index]);

  if (!steps.length) return null;
  const shown = steps.slice(0, index + 1);
  const next = steps[index + 1];
  const distinct = new Set(shown.map((s) => s.fsm_state)).size;

  const chip = (raw: number | null, i: number, kind: "past" | "current" | "next") => {
    const id = graphIdOf(raw);
    const label = raw === null ? "—" : id === null ? `${raw}*` : `${id}`;
    const cls =
      kind === "current"
        ? "bg-forced text-white border-forced"
        : kind === "next"
          ? "border-line-2 text-muted border-dashed"
          : "bg-accent-soft border-accent text-ink";
    return (
      <button
        key={`s${i}`}
        ref={kind === "current" ? currentRef : undefined}
        type="button"
        onClick={() => onPick(Math.min(i, steps.length - 1))}
        className={`shrink-0 font-mono text-[12px] tabular-nums px-2 py-0.5 rounded-full border ${cls}`}
        title={
          raw === null
            ? "no automaton state (CFG engine)"
            : `state ${id ?? raw}${id === null ? " (not among the drawn states)" : ""} · before token ${i}`
        }
      >
        {label}
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <span className="eyebrow">Path so far</span>
        <span className="text-xs text-muted" title="Click a state to jump there">
          {shown.length} steps · {distinct} states
        </span>
      </div>
      <div ref={boxRef} className="flex items-center gap-1 overflow-x-auto py-1.5 px-1 -mx-1" role="list" aria-label="States visited so far">
        {shown.map((s, i) => (
          <span key={i} className="flex items-center gap-1 shrink-0" role="listitem">
            {chip(s.fsm_state, i, i === index ? "current" : "past")}
            <span className={`font-mono text-[11px] whitespace-pre ${i === index ? "text-forced" : "text-muted"}`} title={`token ${i}: ${JSON.stringify(s.token)}`}>
              —{visibleToken(s.text).slice(0, 10)}→
            </span>
          </span>
        ))}
        {next ? (
          chip(next.fsm_state, index + 1, "next")
        ) : (
          <span className="shrink-0 font-mono text-[12px] px-2 py-0.5 rounded-full border border-good text-good">end</span>
        )}
      </div>
    </div>
  );
}
