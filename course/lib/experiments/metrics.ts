import type { FailureClass } from "@/lib/types";
import type { ConstraintMode, Run } from "./types";

export interface Stat {
  n: number;
  mean: number;
  median: number;
  p90: number;
  min: number;
  max: number;
  values: number[];
}

export function stat(values: number[]): Stat {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return { n: 0, mean: 0, median: 0, p90: 0, min: 0, max: 0, values: [] };
  const at = (q: number) => v[Math.min(v.length - 1, Math.floor(q * (v.length - 1) + 0.5))];
  return { n: v.length, mean: v.reduce((a, b) => a + b, 0) / v.length, median: at(0.5), p90: at(0.9), min: v[0], max: v[v.length - 1], values: v };
}

export interface ModeSummary {
  mode: ConstraintMode;
  n: number;
  ok: number;
  successRate: number;
  /** After the usual fence/preamble stripping. */
  rescuedRate: number;
  failures: Partial<Record<FailureClass, number>>;
  totalMs: Stat;
  prefillMs: Stat;
  msPerToken: Stat;
  tokensPerS: Stat;
  compileFirstMs: Stat;
  compileCachedMs: Stat;
  maskMs: Stat;
  newTokens: Stat;
  /** Expected wall time until one valid JSON, retrying failures: total / p(ok). */
  expectedToValidMs: number | null;
}

export function summarize(runs: Run[], mode: ConstraintMode): ModeSummary {
  const rs = runs.filter((r) => r.mode === mode);
  const done = rs.map((r) => r.trace.done).filter((d): d is NonNullable<typeof d> => d !== null);
  const ok = rs.filter((r) => r.outcome.ok).length;
  const rescued = rs.filter((r) => r.outcome.ok || r.outcome.rescuable).length;
  const failures: Partial<Record<FailureClass, number>> = {};
  for (const r of rs) if (!r.outcome.ok) failures[r.outcome.failureClass] = (failures[r.outcome.failureClass] ?? 0) + 1;
  const timing = done.map((d) => d.timing);
  const successRate = rs.length ? ok / rs.length : 0;
  const totalMs = stat(timing.map((t) => t.total_ms));
  return {
    mode,
    n: rs.length,
    ok,
    successRate,
    rescuedRate: rs.length ? rescued / rs.length : 0,
    failures,
    totalMs,
    prefillMs: stat(timing.map((t) => t.prefill_ms)),
    msPerToken: stat(timing.filter((t) => t.n_new_tokens > 1).map((t) => t.decode_ms / (t.n_new_tokens - 1))),
    tokensPerS: stat(timing.map((t) => t.tokens_per_s)),
    compileFirstMs: stat(timing.filter((t) => t.compile_cached === false).map((t) => t.compile_ms)),
    compileCachedMs: stat(timing.filter((t) => t.compile_cached === true).map((t) => t.compile_ms)),
    maskMs: stat(timing.map((t) => t.processor_ms)),
    newTokens: stat(timing.map((t) => t.n_new_tokens)),
    expectedToValidMs: rs.length && successRate > 0 ? totalMs.mean / successRate : null,
  };
}
