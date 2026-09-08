"use client";

import { StackedBar } from "@/components/charts/StackedBar";
import { Metric } from "@/components/Metric";
import { summarize } from "@/lib/experiments/metrics";
import type { ConstraintMode, Run } from "@/lib/experiments/types";
import { formatMs, formatPct } from "@/lib/tokens";
import type { FailureClass } from "@/lib/types";
import type { ModuleUi } from "@/modules/types";
import { MODE_COLOR } from "./RunsTable";

const CLASS_ORDER: FailureClass[] = ["fence", "preamble", "invalid_json", "truncated", "schema_missing_key", "schema_extra_key", "schema_type"];
const CLASS_COLOR: Record<FailureClass, string> = {
  ok: "var(--status-good)",
  fence: "var(--series-chosen)",
  preamble: "var(--series-third)",
  invalid_json: "var(--status-critical)",
  truncated: "var(--ink-3)",
  schema_missing_key: "var(--series-model)",
  schema_extra_key: "var(--accent-strong)",
  schema_type: "var(--status-warn)",
};

export function RunSummaryBar({ runs, modes, ui, locale = "en" }: { runs: Run[]; modes: ConstraintMode[]; ui: ModuleUi; locale?: string }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {modes.map((mode) => {
        const s = summarize(runs, mode);
        const segments = [{ label: ui.ok, value: s.ok, color: CLASS_COLOR.ok }, ...CLASS_ORDER.map((c) => ({ label: ui[`class_${c}`] ?? c, value: s.failures[c] ?? 0, color: CLASS_COLOR[c] }))];
        return (
          <div key={mode} className="panel flex flex-col gap-3 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: MODE_COLOR[mode] }} />
              {ui[`mode_${mode}`]}
              <span className="ml-auto text-xs font-normal text-muted">
                n = {s.n}
              </span>
            </div>
            {s.n === 0 ? (
              <p className="text-sm text-muted">{ui.noRuns}</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  <Metric label={ui.successRate} value={formatPct(s.successRate, 0, locale)} tone={s.successRate === 1 ? "good" : s.successRate < 0.5 ? "critical" : "warn"} />
                  <Metric label={ui.rescuedRate} value={formatPct(s.rescuedRate, 0, locale)} hint={ui.rescuedHint} />
                  <Metric label={ui.medianTime} value={formatMs(s.totalMs.median, locale)} />
                  <Metric label={ui.meanTokPerS} value={s.tokensPerS.mean.toLocaleString(locale, { maximumFractionDigits: 1 })} />
                  <Metric label={ui.meanTokens} value={s.newTokens.mean.toLocaleString(locale, { maximumFractionDigits: 0 })} />
                </div>
                <StackedBar segments={segments} total={s.n} locale={locale} />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
