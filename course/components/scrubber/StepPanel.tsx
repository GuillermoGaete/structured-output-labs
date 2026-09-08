"use client";

import { Metric } from "@/components/Metric";
import { ProbabilityBars } from "@/components/charts/ProbabilityBars";
import { formatInt, formatPct, visibleToken } from "@/lib/tokens";
import type { Mode, Step } from "@/lib/types";

export interface StepPanelLabels {
  step: string;
  chosen: string;
  allowed: string;
  kept: string;
  removed: string;
  state: string;
  depth: string;
  overridden: string;
  overriddenText: string;
  notOverridden: string;
  original: string;
  forced: string;
  originalNote: string;
  forcedNote: string;
  noMask: string;
  legend: string;
}

/** One decoding step: the metrics, the "overridden" verdict, and original vs forced top-K. */
export function StepPanel({ step, mode, digits = 1, log = false, topK = 8, labels, locale = "en" }: { step: Step; mode: Mode; digits?: number; log?: boolean; topK?: number; labels: StepPanelLabels; locale?: string }) {
  const original = step.top_original.slice(0, topK);
  const forced = step.top_forced.slice(0, topK);
  const share = step.n_allowed / step.vocab_size;
  const unconstrained = mode === "none";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        <Metric label={labels.step} value={`${step.i}`} />
        <Metric label={labels.chosen} value={visibleToken(step.text) || "⟨eos⟩"} hint={`id ${step.token_id} · ${JSON.stringify(step.token)}`} />
        <Metric label={labels.allowed} value={`${formatInt(step.n_allowed, locale)} / ${formatInt(step.vocab_size, locale)}`} />
        <Metric label={labels.kept} value={formatPct(share, Math.max(digits, 2), locale)} />
        <Metric label={labels.removed} value={formatPct(step.mass_removed, digits, locale)} tone={step.mass_removed > 0.5 ? "warn" : undefined} />
        {mode === "fsm" ? <Metric label={labels.state} value={step.fsm_state === null ? "—" : `${step.fsm_state}`} /> : <Metric label={labels.depth} value={`${step.stack_depth}`} />}
      </div>
      {unconstrained ? (
        <p className="text-sm text-ink-2">{labels.noMask}</p>
      ) : step.was_overridden ? (
        <p className="rounded-xl bg-accent-soft px-3 py-2 text-sm text-ink">
          <strong>{labels.overridden}</strong>{" "}
          {labels.overriddenText
            .replace("{top}", visibleToken(original[0]?.text ?? ""))
            .replace("{topP}", formatPct(original[0]?.p ?? 0, digits, locale))
            .replace("{chosen}", visibleToken(step.text) || "⟨eos⟩")
            .replace("{before}", formatPct(step.p_original, Math.max(digits, 2), locale))
            .replace("{after}", formatPct(step.p_forced, digits, locale))}
        </p>
      ) : (
        <p className="text-sm text-ink-2">{labels.notOverridden.replace("{before}", formatPct(step.p_original, digits, locale)).replace("{after}", formatPct(step.p_forced, digits, locale))}</p>
      )}
      <div className={`grid gap-6 ${unconstrained ? "" : "md:grid-cols-2"}`}>
        <ProbabilityBars entries={original} color="var(--series-model)" chosen={step.token_id} title={labels.original} note={labels.originalNote} digits={digits} log={log} locale={locale} />
        {!unconstrained && <ProbabilityBars entries={forced} color="var(--series-chosen)" chosen={step.token_id} title={labels.forced} note={labels.forcedNote} digits={digits} log={log} locale={locale} />}
      </div>
      {!unconstrained && <p className="text-xs text-muted">{labels.legend}</p>}
    </div>
  );
}
