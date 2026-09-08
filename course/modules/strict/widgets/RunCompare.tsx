"use client";

import { TokenChips } from "@/components/tokens/TokenChips";
import type { Run } from "@/lib/experiments/types";
import type { ModuleUi } from "@/modules/types";
import { MODE_COLOR } from "@/components/experiments/RunsTable";

/** The same seed without and with the constraint, side by side. */
export function RunCompare({ plain, strict, ui }: { plain: Run | null; strict: Run | null; ui: ModuleUi }) {
  const cell = (run: Run | null, label: string) => (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: run ? MODE_COLOR[run.mode] : "var(--rule-2)" }} />
        {label}
        {run && <span className={`ml-auto rounded-full px-2 py-0.5 text-xs ${run.outcome.ok ? "bg-good/15 text-good" : "bg-critical/15 text-critical"}`}>{run.outcome.ok ? ui.ok : ui[`class_${run.outcome.failureClass}`] ?? run.outcome.failureClass}</span>}
      </div>
      {run ? (
        run.trace.steps.length ? (
          <TokenChips tokens={run.trace.steps.map((s) => ({ id: s.token_id, token: s.token, text: s.text }))} size="sm" />
        ) : (
          <pre className="mono max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-rule bg-panel p-2 text-[12px]">{run.trace.done?.validation.raw_text ?? run.trace.error}</pre>
        )
      ) : (
        <p className="text-xs text-muted">{ui.noRuns}</p>
      )}
      {run?.trace.done && (
        <span className="mono text-xs text-ink-2">
          {run.trace.done.timing.n_new_tokens} {ui.tokens} · {run.trace.done.summary.n_overridden} {ui.tm_overriddenCount}
        </span>
      )}
    </div>
  );
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {cell(plain, ui.mode_plain)}
      {cell(strict, ui.mode_strict)}
    </div>
  );
}
