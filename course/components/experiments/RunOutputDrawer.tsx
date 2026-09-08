"use client";

import { useState } from "react";
import type { Run } from "@/lib/experiments/types";
import type { ModuleUi } from "@/modules/types";

/** The raw text with the stripped part highlighted, the parser / validator error, and the prompt as rendered. */
export function RunOutputDrawer({ run, ui }: { run: Run; ui: ModuleUi }) {
  const [showPrompt, setShowPrompt] = useState(false);
  const done = run.trace.done;
  if (!done) return <p className="text-sm text-critical">{run.trace.error ?? ui.noAnswer}</p>;
  const v = done.validation;
  const raw = v.raw_text;
  const idx = v.stripped_text ? raw.indexOf(v.stripped_text) : -1;
  const parts = idx >= 0 ? [raw.slice(0, idx), v.stripped_text, raw.slice(idx + v.stripped_text.length)] : [raw, "", ""];
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${run.outcome.ok ? "bg-good/15 text-good" : "bg-critical/15 text-critical"}`}>{run.outcome.ok ? ui.ok : ui[`class_${run.outcome.failureClass}`] ?? run.outcome.failureClass}</span>
        {run.outcome.hints.map((h) => (
          <span key={h} className="rounded-full bg-raised px-2 py-0.5 text-xs text-ink-2">
            {ui[`hint_${h}`] ?? h}
          </span>
        ))}
        <span className="mono ml-auto text-xs text-muted">
          {ui.stop}: {done.stop_reason} · {done.timing.n_new_tokens} {ui.tokens}
        </span>
      </div>
      <pre className="mono max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-rule bg-panel p-3 text-[12px] leading-relaxed">
        {parts[0] && <span className="rounded bg-chosen/25 line-through decoration-chosen">{parts[0]}</span>}
        <span>{parts[1]}</span>
        {parts[2] && <span className="rounded bg-chosen/25 line-through decoration-chosen">{parts[2]}</span>}
        {!raw && <span className="text-muted">(∅)</span>}
      </pre>
      {run.outcome.detail && (
        <p className="text-ink-2">
          <span className="font-semibold">{v.parse_error ? ui.parserSays : ui.validatorSays}:</span> <span className="mono">{run.outcome.detail}</span>
        </p>
      )}
      {!run.outcome.ok && (
        <p className="text-ink-2">
          {ui.afterStrip}: <span className="font-semibold">{v.failure_class_stripped === "ok" ? ui.wouldPass : ui[`class_${v.failure_class_stripped}`] ?? v.failure_class_stripped}</span>
          {run.outcome.rescuable ? ` · ${ui.rescuableLong}` : ""}
        </p>
      )}
      <button type="button" className="btn self-start text-xs" onClick={() => setShowPrompt((p) => !p)}>
        {showPrompt ? ui.hidePrompt : ui.showPrompt}
      </button>
      {showPrompt && <pre className="mono max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-rule bg-panel p-3 text-[11px] text-ink-2">{run.trace.meta?.prompt_rendered ?? run.request.prompt}</pre>}
    </div>
  );
}
