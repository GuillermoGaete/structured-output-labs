"use client";

import { useMemo } from "react";
import { divergence, entropyBits, groupBy } from "@/lib/batchStats";
import { useRunState } from "@/lib/runStore";
import type { Branch, ConstrainedRun } from "@/lib/runTypes";
import { formatPct, visibleToken } from "@/lib/tokens";
import type { Trace } from "@/lib/types";

interface Props {
  /** The branches: every run of the batch, all from the same parent and step. */
  runs: ConstrainedRun[];
  branch: Branch;
  parentOrdinal: number | null;
}

interface Row {
  tokenId: number;
  label: string;
  /** The parent's probability for this token at the branch point; null when it was not in the parent's top-K. */
  p: number | null;
  count: number;
  chosenByParent: boolean;
}

/**
 * N branches from one step: what the model said the next token would be, and
 * what N samples actually drew. The expected side comes from the parent's trace,
 * while it is still in memory; the observed side from the branches' summaries,
 * so it survives a reload.
 *
 * When the first sampled position has only one possible token (the mask left no
 * choice), the panel moves to the first position where the branches actually
 * part ways; the parent's distribution there is comparable as long as the parent
 * wrote the same tokens up to that point.
 */
export function BranchPoint({ runs, branch, parentOrdinal }: Props) {
  const parentTrace = useRunState((s) => s.traces[branch.parentRunId]) as Trace | undefined;
  const parentIds = useRunState((s) => s.runs[branch.parentRunId]?.summary.tokenIds ?? null);
  // With a forced token the first sampled position is one later.
  const at = branch.forcedTokenId === null ? branch.atStep : branch.atStep + 1;

  const { rows, n, distinct, hObserved, hModel, prefix, split, expectedStep } = useMemo(() => {
    const finished = runs.filter((r) => r.status === "done" && r.summary.tokenIds.length > at);
    const div = divergence(finished.map((r) => r.summary.tokenIds.slice(at)));
    const split = at + (div.firstDivergence ?? 0);
    const done = finished.filter((r) => r.summary.tokenIds.length > split);
    // The parent's distribution at `split` describes the same state only if it wrote the same tokens up to there.
    const shared = done[0]?.summary.tokenIds.slice(0, split) ?? [];
    const comparable = !!parentTrace && !!parentIds && parentIds.length >= split && shared.every((v, i) => parentIds[i] === v);
    const expectedStep = comparable ? parentTrace?.steps?.[split] : undefined;
    const observed = groupBy(
      done.map((r) => ({ runId: r.id, value: r.summary.tokenIds[split] })),
      (v) => String(v),
    );
    const labelOf = new Map<number, string>();
    for (const r of done) labelOf.set(r.summary.tokenIds[split], visibleToken(r.summary.tokens[split] ?? "", r.summary.tokens[split]));
    const expected = new Map<number, { p: number; label: string }>();
    for (const e of expectedStep?.top_forced ?? []) if (e.allowed) expected.set(e.token_id, { p: e.p, label: visibleToken(e.text, e.token) });
    const counts = new Map(observed.map((g) => [g.sample, g.count] as const));
    const ids = new Set<number>([...expected.keys(), ...counts.keys()]);
    const list: Row[] = [...ids].map((tokenId) => ({
      tokenId,
      label: expected.get(tokenId)?.label ?? labelOf.get(tokenId) ?? `#${tokenId}`,
      p: expected.get(tokenId)?.p ?? null,
      count: counts.get(tokenId) ?? 0,
      chosenByParent: expectedStep?.token_id === tokenId,
    }));
    list.sort((a, b) => b.count - a.count || (b.p ?? -1) - (a.p ?? -1));
    const shownP = [...expected.values()].map((e) => e.p);
    const mass = shownP.reduce((a, b) => a + b, 0);
    const hModelBits = mass > 0 ? -shownP.reduce((a, p) => (p > 0 ? a + (p / mass) * Math.log2(p / mass) : a), 0) : null;
    const before = expectedStep ? (split > 0 ? parentTrace?.steps?.[split - 1]?.partial_text : "") : undefined;
    const prefixText = before ?? done[0]?.summary.tokens.slice(0, split).join("") ?? "";
    return { rows: list.slice(0, 12), n: done.length, distinct: observed.length, hObserved: entropyBits(observed.map((g) => g.count)), hModel: hModelBits, prefix: prefixText, split, expectedStep };
  }, [runs, at, parentTrace, parentIds]);

  if (!n) return null;
  const tail = prefix.length > 72 ? `…${prefix.slice(-72)}` : prefix;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <span
          className="eyebrow"
          title={
            split > at
              ? `Every branch replayed the same prefix and sampled from step ${at}, but the mask left one token there; step ${split} is where they first part ways`
              : "Every run of this batch replayed the same prefix, then sampled with its own seed"
          }
        >
          Branch point · step {at}
          {split > at ? ` · first split at step ${split}` : ""} · {n} branches · {distinct} distinct next token{distinct === 1 ? "" : "s"}
        </span>
        <span className="text-xs text-muted">
          {parentOrdinal !== null ? `from #${parentOrdinal}` : "from an earlier run"}
          {branch.forcedTokenId !== null ? ` · forced ${visibleToken(runs[0]?.summary.tokens[branch.atStep] ?? "", runs[0]?.summary.tokens[branch.atStep])} first` : ""}
        </span>
      </div>
      <pre className="mono text-[11.5px] leading-snug text-ink-2 whitespace-pre-wrap break-all max-h-16 overflow-hidden" title={prefix}>
        {tail}
        <span className="text-forced">▌</span>
      </pre>
      <div className="grid grid-cols-[minmax(80px,160px)_minmax(0,1fr)_minmax(0,1fr)_44px] items-center gap-3 font-mono text-[11px] text-muted">
        <span>next token</span>
        <span title="The probability the parent run's model put on this token at this step, after the mask">model p{expectedStep ? "" : parentTrace ? " · parent took another path" : " · parent trace gone"}</span>
        <span title="How many of the branches drew this token, over the branches that got this far">observed</span>
        <span />
      </div>
      <div className="flex flex-col gap-1">
        {rows.map((r) => (
          <div key={r.tokenId} className="grid grid-cols-[minmax(80px,160px)_minmax(0,1fr)_minmax(0,1fr)_44px] items-center gap-3 font-mono text-[12px]">
            <span className="truncate" title={`token id ${r.tokenId}${r.chosenByParent ? " · the parent wrote this one" : ""}`}>
              {r.label}
              {r.chosenByParent ? <span className="text-muted"> ·parent</span> : null}
            </span>
            <span className="flex items-center gap-2">
              {r.p !== null ? (
                <>
                  <span className="inline-block h-2.5 rounded-sm" style={{ width: `${Math.max(2, Math.round(r.p * 100))}%`, background: "var(--series-original)" }} aria-hidden="true" />
                  <span className="tabular-nums text-ink-2">{formatPct(r.p, 1)}</span>
                </>
              ) : (
                <span className="text-muted">{expectedStep ? "below top-K" : "—"}</span>
              )}
            </span>
            <span className="flex items-center gap-2">
              <span className="inline-block h-2.5 rounded-sm" style={{ width: `${Math.max(r.count ? 2 : 0, Math.round((r.count / n) * 100))}%`, background: "var(--series-forced)" }} aria-hidden="true" />
              <span className="tabular-nums text-ink-2">{r.count ? formatPct(r.count / n, 0) : ""}</span>
            </span>
            <span className="tabular-nums text-ink-2 text-right">{r.count ? `×${r.count}` : ""}</span>
          </div>
        ))}
      </div>
      <span className="text-xs text-muted">
        spread: observed {hObserved.toFixed(2)} bits
        {hModel !== null ? ` · model ${hModel.toFixed(2)} bits over its top-K` : ""}
        {n < 8 ? " · few samples: the shares are rough" : ""}
      </span>
    </div>
  );
}
