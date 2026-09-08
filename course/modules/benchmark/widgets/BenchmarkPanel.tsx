"use client";

import { BoxPlot } from "@/components/charts/BoxPlot";
import { GroupedBars } from "@/components/charts/GroupedBars";
import { LatencyTimeline } from "@/components/charts/LatencyTimeline";
import { Metric } from "@/components/Metric";
import { MODE_COLOR } from "@/components/experiments/RunsTable";
import { useLocale } from "@/i18n/client";
import { summarize } from "@/lib/experiments/metrics";
import type { ConstraintMode, Run } from "@/lib/experiments/types";
import { formatMs, formatPct } from "@/lib/tokens";
import type { ModuleUi } from "@/modules/types";

const fmtMs = (v: number, locale: string) => formatMs(v, locale);
const fmtTok = (v: number, locale: string) => v.toLocaleString(locale, { maximumFractionDigits: 1 });

/** Timings per mode: totals, per-token cost, compile cold vs cached, and the cost of retries. */
export function BenchmarkPanel({ runs, modes, ui, compact = false }: { runs: Run[]; modes: ConstraintMode[]; ui: ModuleUi; compact?: boolean }) {
  const locale = useLocale();
  const summaries = modes.map((m) => summarize(runs, m)).filter((s) => s.n > 0);
  if (!summaries.length) return <p className="text-sm text-muted">{ui.noRuns}</p>;
  const label = (m: ConstraintMode) => ui[`mode_${m}`];
  const timeline = summaries.map((s) => {
    const full = runs.filter((r) => r.mode === s.mode && r.trace.steps.length > 0);
    const n = Math.min(...full.map((r) => r.trace.steps.length), 40);
    const values = full.length && n > 0 ? Array.from({ length: n }, (_, i) => full.reduce((acc, r) => acc + r.trace.steps[i].dt_ms, 0) / full.length) : [];
    return { label: label(s.mode), color: MODE_COLOR[s.mode], values };
  }).filter((s) => s.values.length > 1);
  const strict = summaries.find((s) => s.mode === "strict");
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 md:grid-cols-3">
        {summaries.map((s) => (
          <div key={s.mode} className="panel flex flex-col gap-2 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: MODE_COLOR[s.mode] }} />
              {label(s.mode)}
              <span className="ml-auto text-xs font-normal text-muted">n = {s.n}</span>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              <Metric label={ui.successRate} value={formatPct(s.successRate, 0, locale)} tone={s.successRate === 1 ? "good" : s.successRate < 0.5 ? "critical" : "warn"} />
              <Metric label={ui.medianTime} value={formatMs(s.totalMs.median, locale)} />
              <Metric label={ui.tokPerS} value={fmtTok(s.tokensPerS.mean, locale)} />
              <Metric label={ui.expectedToValid} value={s.expectedToValidMs === null ? "∞" : formatMs(s.expectedToValidMs, locale)} hint={ui.expectedHint} tone={s.expectedToValidMs !== null && s.successRate < 1 ? "warn" : undefined} />
            </div>
          </div>
        ))}
      </div>
      <div className={`grid gap-6 ${compact ? "md:grid-cols-2" : "md:grid-cols-2"}`}>
        <BoxPlot rows={summaries.map((s) => ({ label: label(s.mode), stat: s.totalMs, color: MODE_COLOR[s.mode] }))} format={fmtMs} title={ui.chartTotal} note={ui.chartTotalNote} locale={locale} />
        <BoxPlot rows={summaries.map((s) => ({ label: label(s.mode), stat: s.msPerToken, color: MODE_COLOR[s.mode] }))} format={fmtMs} title={ui.chartPerToken} note={ui.chartPerTokenNote} locale={locale} />
        {!compact && <GroupedBars rows={summaries.map((s) => ({ label: label(s.mode), value: s.prefillMs.median, color: MODE_COLOR[s.mode] }))} format={fmtMs} title={ui.chartPrefill} note={ui.chartPrefillNote} locale={locale} />}
        {!compact && strict && (
          <GroupedBars
            rows={[
              { label: ui.compileCold, value: strict.compileFirstMs.n ? strict.compileFirstMs.mean : 0, color: "var(--series-chosen)", hint: strict.compileFirstMs.n ? undefined : ui.compileNoCold },
              { label: ui.compileWarm, value: strict.compileCachedMs.n ? strict.compileCachedMs.mean : 0, color: "var(--series-third)" },
              { label: ui.maskPerRun, value: strict.maskMs.mean, color: "var(--series-model)" },
            ]}
            format={fmtMs}
            title={ui.chartCompile}
            note={ui.chartCompileNote}
            locale={locale}
          />
        )}
        {timeline.length > 0 && <LatencyTimeline series={timeline} title={ui.chartTimeline} note={ui.chartTimelineNote} locale={locale} />}
      </div>
    </div>
  );
}
