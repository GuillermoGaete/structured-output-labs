"use client";

import { useMemo } from "react";
import { constrainedBatchStats, logprobsBatchStats, prefixTree, type Dist, type PrefixNode } from "@/lib/batchStats";
import { cancelRun } from "@/lib/runner";
import { runStore, useBatchOrder, useRunsRecord, useSelectedRun } from "@/lib/runStore";
import { batchStatus, type Batch, type ConstrainedRun, type LogprobsRun, type Run } from "@/lib/runTypes";
import { formatInt, formatPct, visibleToken } from "@/lib/tokens";
import { BranchPoint } from "./BranchPoint";
import { Stats, type StatProps } from "./Stat";

const pm = (d: Dist, digits = 1, unit = "") => (d.n ? `${d.mean.toFixed(digits)}${d.n > 1 ? ` ± ${d.sd.toFixed(digits)}` : ""}${unit}` : "—");

function Bar({ share, tone = "accent" }: { share: number; tone?: "accent" | "critical" | "masked" }) {
  const color = tone === "accent" ? "var(--accent)" : tone === "critical" ? "var(--critical)" : "var(--series-masked)";
  return (
    <span className="inline-block h-2.5 rounded-sm align-middle" style={{ width: `${Math.max(2, Math.round(share * 100))}%`, background: color }} aria-hidden="true" />
  );
}

function TreeRows({ node, depth, total, onPick }: { node: PrefixNode; depth: number; total: number; onPick: (n: PrefixNode) => void }) {
  return (
    <>
      {node.children.map((c) => {
        const only = c.count === total && c.children.length <= 1 && depth > 0;
        void only;
        return (
          <div key={`${depth}-${c.token}`}>
            <button
              type="button"
              className="flex items-center gap-2 font-mono text-[12px] leading-[20px] hover:bg-surface-2 rounded px-1 -mx-1 w-full text-left"
              style={{ paddingLeft: depth * 14 }}
              onClick={() => onPick(c)}
              title={`${c.count} of ${total} runs wrote this token here`}
            >
              <span className="text-muted">{depth > 0 ? "└" : ""}</span>
              <span className="text-ink">{visibleToken(c.token)}</span>
              <span className={`ml-auto ${c.count < total ? "text-forced" : "text-muted"}`}>×{c.count}</span>
            </button>
            {c.children.length > 0 && <TreeRows node={c} depth={depth + 1} total={total} onPick={onPick} />}
          </div>
        );
      })}
    </>
  );
}

/** Collapses chains where every run agrees into one row, so only the forks take space. */
function foldTree(node: PrefixNode): PrefixNode {
  const children = node.children.map(foldTree);
  const merged: PrefixNode[] = [];
  for (const c of children) {
    let cur = c;
    while (cur.children.length === 1 && cur.children[0].count === cur.count) {
      const only = cur.children[0];
      cur = { token: `${cur.token}${only.token}`, count: cur.count, children: only.children };
    }
    merged.push(cur);
  }
  return { ...node, children: merged };
}

/** What N runs of one request say together, with a way down to any one of them. */
export function BatchPanel({ batch }: { batch: Batch }) {
  const runs = useRunsRecord();
  const order = useBatchOrder();
  const selected = useSelectedRun();
  const list = useMemo(() => batch.runIds.map((id) => runs[id]).filter((r): r is Run => !!r), [batch.runIds, runs]);
  const ordinal = order.length - order.indexOf(batch.id);
  const status = batchStatus(batch, runs);
  const pick = (runId: string) => runStore.dispatch({ type: "select", runId, batchId: batch.id });

  // A batch of branches from one step: every run shares the parent and the prefix, so the comparison starts there.
  const branch = useMemo(() => {
    const b = list[0]?.branch;
    return b && list.every((r) => r.branch && r.branch.parentRunId === b.parentRunId && r.branch.atStep === b.atStep && r.branch.forcedTokenId === b.forcedTokenId) ? b : null;
  }, [list]);
  const from = branch ? branch.atStep + (branch.forcedTokenId !== null ? 1 : 0) : 0;
  const parentBatchId = useMemo(() => (branch ? runs[branch.parentRunId]?.batchId ?? null : null), [branch, runs]);
  const parentOrdinal = parentBatchId && order.includes(parentBatchId) ? order.length - order.indexOf(parentBatchId) : null;

  const constrained = batch.kind === "constrained" ? (list as ConstrainedRun[]) : null;
  const logprobs = batch.kind === "logprobs" ? (list as LogprobsRun[]) : null;
  const cs = useMemo(() => (constrained ? constrainedBatchStats(constrained, { from }) : null), [constrained, from]);
  const ls = useMemo(() => (logprobs ? logprobsBatchStats(logprobs) : null), [logprobs]);
  const tree = useMemo(() => {
    const seqs = list.filter((r) => r.status === "done").map((r) => r.summary.tokens.slice(from));
    return foldTree(prefixTree(seqs, 14));
  }, [list, from]);
  const nDone = cs?.nDone ?? ls?.nDone ?? 0;

  const tiles: StatProps[] = [];
  if (cs) {
    tiles.push({
      label: "Valid",
      value: `${cs.nValid} / ${cs.nDone}`,
      tone: cs.nDone && cs.nValid === cs.nDone ? "good" : cs.nValid === 0 && cs.nDone ? "critical" : undefined,
      hint: `pass@${batch.n} ${formatPct(cs.passAtK, 0)} · pass^${batch.n} ${formatPct(cs.passPowK, 0)} (at least one valid; all valid)`,
    });
    tiles.push({ label: "Distinct outputs", value: `${cs.outputs.length}`, hint: `${cs.outputEntropyBits.toFixed(2)} bits of spread across outputs; 0 means identical` });
    tiles.push({ label: "Steps", value: pm(cs.nSteps), hint: "Mean ± sample sd over finished runs" });
    tiles.push({ label: "Time", value: pm(cs.elapsedS, 1, " s") });
    if (constrained?.[0]?.request.mode !== "none") {
      tiles.push({ label: "Overridden", value: pm(cs.overridden), hint: "Steps per run where the mask forbade the model's argmax" });
      tiles.push({ label: "Probability removed", value: cs.meanMassRemoved.n ? formatPct(cs.meanMassRemoved.mean, 1) : "—", hint: "Mean over runs of the mean mass removed per step" });
    }
  } else if (ls) {
    tiles.push({ label: "Distinct completions", value: `${ls.completions.length}`, hint: `${ls.outputEntropyBits.toFixed(2)} bits of spread across completions` });
    tiles.push({ label: "Tokens", value: pm(ls.nSteps) });
    tiles.push({ label: "Time", value: pm(ls.elapsedS, 1, " s") });
    tiles.push({ label: "Speed", value: pm(ls.tokensPerS, 1, " tok/s") });
    tiles.push({ label: "Mean entropy", value: pm(ls.meanEntropyRawBits, 2, " bits"), hint: "Per run, the mean raw entropy over its tokens" });
    tiles.push({ label: "Tail picks", value: pm(ls.tailPicks), hint: "Tokens per run sampled from below the reported top-k" });
  }

  const outputs = cs?.outputs ?? ls?.completions ?? [];
  const div = cs?.divergence ?? ls?.divergence ?? null;
  const first = list[0];
  const T = first?.request.temperature ?? 0;

  return (
    <section className="panel p-4 flex flex-col gap-5">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <span className="flex items-baseline gap-3 flex-wrap">
          <span className="eyebrow">Batch #{ordinal} · ×{batch.n}</span>
          <span className="text-sm">{batch.label.replace(/ · ×\d+$/, "")}</span>
        </span>
        <span className="flex items-center gap-2 flex-wrap">
          <span className="chip" title="Sampling temperature of every run, and top-k when it was on">
            T {T === 0 ? "0 · greedy" : T.toFixed(2)}
            {T > 0 && first?.kind === "constrained" && first.request.top_k_sampling > 0 ? ` · top-k ${first.request.top_k_sampling}` : ""}
          </span>
          <span className="chip" title="Seed policy of the batch">
            {batch.seedPolicy === "fresh" && batch.baseSeed !== null ? `seeds ${batch.baseSeed}…${batch.baseSeed + batch.n - 1}` : batch.seedPolicy === "same" ? `same seed ${batch.baseSeed}` : "no seed"}
          </span>
          <span className={`chip ${status === "done" ? "chip-good" : status === "running" || status === "queued" ? "chip-warning" : ""}`}>{status}</span>
        </span>
      </div>

      <Stats items={tiles} />

      {branch && constrained && batch.n > 1 && <BranchPoint runs={constrained} branch={branch} parentOrdinal={parentOrdinal} />}

      {outputs.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="eyebrow">{cs ? "Outputs" : "Completions"} · {nDone} finished</span>
          <div className="flex flex-col gap-1">
            {outputs.slice(0, 12).map((g) => {
              const invalid = g.key.startsWith(" invalid:");
              const why = invalid ? constrained?.find((r) => r.id === g.runIds[0])?.summary.validationError : null;
              return (
                <button
                  key={g.key}
                  type="button"
                  className="grid grid-cols-[120px_36px_minmax(0,1fr)] items-center gap-3 text-left rounded px-1 -mx-1 hover:bg-surface-2"
                  onClick={() => pick(g.runIds[0])}
                  title={`${why ? `${why}\n` : ""}${g.count} of ${nDone} · open one of these runs`}
                >
                  <span>
                    <Bar share={g.count / Math.max(nDone, 1)} tone={invalid ? "critical" : "accent"} />
                  </span>
                  <span className="font-mono text-[12px] tabular-nums text-ink-2">×{g.count}</span>
                  <span className={`font-mono text-[12px] truncate ${invalid ? "text-critical" : ""}`}>{invalid ? `invalid · ${g.sample}` : g.sample}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {cs && cs.fields.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="eyebrow" title="Per JSON path, how the valid runs agree. The mask fixes the shape; this is the content.">
            Field agreement · {cs.nValid} valid runs
          </span>
          <div className="flex flex-col gap-1">
            {cs.fields.slice(0, 24).map((f) => (
              <div key={f.path} className="grid grid-cols-[minmax(80px,160px)_120px_44px_minmax(0,1fr)] items-center gap-3">
                <span className="font-mono text-[12px] truncate" title={f.path}>
                  {f.path}
                </span>
                <span>
                  <Bar share={f.agreement} tone={f.agreement === 1 ? "accent" : "masked"} />
                </span>
                <span className="font-mono text-[12px] tabular-nums text-ink-2">{formatPct(f.agreement, 0)}</span>
                <span className="font-mono text-[12px] truncate text-ink-2">
                  {f.values
                    .slice(0, 3)
                    .map((v) => `${v.key} ×${v.count}`)
                    .join(" · ")}
                  {f.values.length > 3 ? ` · +${f.values.length - 3}` : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {div && nDone > 1 && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-start">
          <div className="flex flex-col gap-2 min-w-0">
            <span className="eyebrow">
              Divergence · {div.identical ? (from ? "all branches identical after the prefix" : "all runs identical") : `first at token ${div.firstDivergence}`}
              {from ? ` · from step ${from}` : ""}
            </span>
            <div className="flex flex-col">
              <TreeRows node={tree} depth={0} total={nDone} onPick={() => undefined} />
            </div>
          </div>
          <div className="flex flex-col gap-2 min-w-0">
            <span className="eyebrow" title="Distinct tokens at each position across the finished runs">Distinct tokens by position</span>
            <div className="flex items-end gap-[2px] h-10" role="img" aria-label="Distinct tokens per position">
              {div.perPosition.slice(0, 120).map((d, i) => (
                <span
                  key={i}
                  className="inline-block w-1.5 rounded-sm"
                  style={{ height: `${Math.max(8, (d / Math.max(nDone, 1)) * 100)}%`, background: d > 1 ? "var(--series-forced)" : "var(--series-masked)" }}
                  title={`position ${i}: ${d} distinct`}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <span className="eyebrow">Runs</span>
        <div className="flex flex-col gap-0.5">
          {list.map((r, i) => {
            const st = r.summary;
            const steps = st.tokenIds.length;
            const verdict = r.kind === "constrained" ? (st.finished ? ((st as ConstrainedRun["summary"]).valid ? "valid" : "invalid") : "") : "";
            const active = selected?.id === r.id;
            return (
              <div key={r.id} className={`grid grid-cols-[52px_90px_80px_minmax(0,1fr)_70px] items-center gap-3 font-mono text-[12px] rounded px-1 -mx-1 ${active ? "bg-accent-soft" : "hover:bg-surface-2"}`}>
                <button type="button" className="text-left" onClick={() => pick(r.id)} title="Open this run in the inspector">
                  #{ordinal}.{i + 1}
                </button>
                <span className="text-ink-2">seed {r.request.seed ?? "—"}</span>
                <span className={r.status === "error" ? "text-critical" : r.status === "running" ? "text-forced" : "text-ink-2"}>{r.status}</span>
                <button type="button" className="text-left truncate" onClick={() => pick(r.id)} title={st.text ?? ""}>
                  {formatInt(steps)} steps{st.elapsedS !== null ? ` · ${st.elapsedS.toFixed(1)} s` : ""}
                  {verdict ? ` · ${verdict}` : ""}
                  {r.error ? ` · ${r.error}` : ""}
                </button>
                <span className="text-right">
                  {(r.status === "running" || r.status === "queued") && (
                    <button type="button" className="btn py-0 px-2 text-[11px]" onClick={() => cancelRun(r.id)}>
                      Stop
                    </button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
