"use client";

import { useState } from "react";
import { TokenChips } from "@/components/tokens/TokenChips";
import { useLocale } from "@/i18n/client";
import type { Trace } from "@/lib/types";
import { MaskSummary } from "./MaskSummary";
import { StepPanel, type StepPanelLabels } from "./StepPanel";
import { Transport } from "./Transport";

export interface ScrubberLabels extends StepPanelLabels {
  first: string;
  prev: string;
  play: string;
  pause: string;
  next: string;
  last: string;
  textSoFar: string;
  compact: string;
  engine: string;
  meanKept: string;
  meanRemoved: string;
  minAllowed: string;
  maxDepth: string;
  compile: string;
  cached: string;
  fresh: string;
  tokPerS: string;
  overriddenCount: string;
}

/** The Time Machine: scrub a recorded (or streaming) run step by step. Never fetches. */
export function Scrubber({ trace, initialIndex = 0, onIndex, streaming = false, labels, digits = 1, log = false, topK = 8, focusable = false }: { trace: Trace; initialIndex?: number; onIndex?: (i: number) => void; streaming?: boolean; labels: ScrubberLabels; digits?: number; log?: boolean; topK?: number; focusable?: boolean }) {
  const locale = useLocale();
  const [picked, setPicked] = useState(initialIndex);
  const [follow, setFollow] = useState(true);
  const count = trace.steps.length;
  // While a run streams in and the user has not scrubbed back, the newest step is shown.
  const index = streaming && follow && count > 0 ? count - 1 : Math.min(picked, Math.max(count - 1, 0));
  const go = (i: number) => {
    setPicked(i);
    setFollow(i >= count - 1);
    onIndex?.(i);
  };
  const step = trace.steps[index];
  const mode = trace.meta?.mode ?? "fsm";
  if (!count) return <p className="text-sm text-muted">{labels.compact}</p>;
  return (
    <div className="flex flex-col gap-4">
      <Transport index={index} count={count} onIndex={go} labels={labels} focusable={focusable} />
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{labels.textSoFar}</span>
        <TokenChips tokens={trace.steps.map((s) => ({ id: s.token_id, token: s.token, text: s.text }))} activeIndex={index} limit={index + 1} onPick={go} />
      </div>
      {step && <StepPanel step={step} mode={mode} digits={digits} log={log} topK={topK} labels={labels} locale={locale} />}
      {trace.done && <MaskSummary meta={trace.meta} done={trace.done} labels={{ engine: labels.engine, overridden: labels.overriddenCount, kept: labels.meanKept, removed: labels.meanRemoved, minAllowed: labels.minAllowed, depth: labels.maxDepth, compile: labels.compile, cached: labels.cached, fresh: labels.fresh, tokPerS: labels.tokPerS }} locale={locale} />}
    </div>
  );
}
