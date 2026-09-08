"use client";

import { Metric } from "@/components/Metric";
import { formatInt, formatPct } from "@/lib/tokens";
import type { Done, Meta } from "@/lib/types";

/** What the mask did over the whole run. */
export function MaskSummary({ meta, done, labels, locale = "en" }: { meta: Meta | null; done: Done | null; labels: { engine: string; overridden: string; kept: string; removed: string; minAllowed: string; depth: string; compile: string; cached: string; fresh: string; tokPerS: string }; locale?: string }) {
  if (!done) return null;
  const s = done.summary;
  const t = done.timing;
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-3">
      <Metric label={labels.engine} value={done.engine_backend} hint={meta?.regex ? `regex ${meta.regex.length} chars` : undefined} />
      <Metric label={labels.overridden} value={`${s.n_overridden} / ${done.n_steps}`} tone={s.n_overridden > 0 ? "warn" : undefined} />
      <Metric label={labels.kept} value={formatPct(s.mean_vocab_kept, 1, locale)} />
      <Metric label={labels.removed} value={formatPct(s.mean_mass_removed, 1, locale)} />
      <Metric label={labels.minAllowed} value={formatInt(s.min_n_allowed, locale)} />
      <Metric label={labels.depth} value={`${s.max_stack_depth}`} />
      <Metric label={labels.compile} value={`${Math.round(t.compile_ms)} ms`} hint={t.compile_cached === null ? undefined : t.compile_cached ? labels.cached : labels.fresh} />
      <Metric label={labels.tokPerS} value={t.tokens_per_s.toLocaleString(locale, { maximumFractionDigits: 2 })} />
    </div>
  );
}
