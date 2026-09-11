"use client";

import { useMemo } from "react";
import { flattenLeaves, canonicalJson } from "@/lib/batchStats";
import { alignTokens } from "@/lib/diff";
import { runStore, useBatchesRecord, useBatchOrder, useRunsRecord } from "@/lib/runStore";
import type { Run } from "@/lib/runTypes";
import { formatInt, pastelFor, tokenDisplay } from "@/lib/tokens";
import { IconClose } from "@/components/icons";

/** Two pinned runs side by side: the tokens they share and the ones they do not, and their JSON leaf by leaf. */
export function ComparePanel({ runIds }: { runIds: string[] }) {
  const runs = useRunsRecord();
  const batches = useBatchesRecord();
  const order = useBatchOrder();
  const pair = runIds.map((id) => runs[id]).filter((r): r is Run => !!r);
  const align = useMemo(() => (pair.length === 2 ? alignTokens(pair[0].summary.tokens, pair[1].summary.tokens) : null), [pair]);
  const leaves = useMemo(() => {
    if (pair.length !== 2 || pair.some((r) => r.kind !== "constrained")) return null;
    const a = pair[0].kind === "constrained" && pair[0].summary.valid ? flattenLeaves(pair[0].summary.parsed) : [];
    const b = pair[1].kind === "constrained" && pair[1].summary.valid ? flattenLeaves(pair[1].summary.parsed) : [];
    const paths = [...new Set([...a.map(([p]) => p), ...b.map(([p]) => p)])];
    const av = new Map(a);
    const bv = new Map(b);
    return paths.map((p) => ({ path: p, a: av.has(p) ? canonicalJson(av.get(p)) : "—", b: bv.has(p) ? canonicalJson(bv.get(p)) : "—" }));
  }, [pair]);
  if (pair.length !== 2 || !align) return null;

  const ordinal = (r: Run) => order.length - order.indexOf(r.batchId);
  const differing = leaves?.filter((l) => l.a !== l.b).length ?? 0;

  const column = (r: Run, same: boolean[]) => {
    const s = r.summary;
    const batch = batches[r.batchId];
    const verdict = r.kind === "constrained" ? (s.finished ? ((r.summary.valid ? "valid" : "invalid")) : r.status) : r.status;
    return (
      <div className="flex flex-col gap-2 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" className="font-mono text-[12px] font-medium hover:underline" onClick={() => runStore.dispatch({ type: "select", runId: r.id })} title="Open this run in the inspector">
            #{ordinal(r)}
          </button>
          <span className="text-xs text-ink-2 truncate">{batch?.label.replace(/ · ×\d+$/, "")}</span>
          <span className={`chip ${verdict === "valid" ? "chip-good" : verdict === "invalid" ? "chip-critical" : ""}`}>{verdict}</span>
          <span className="chip">{formatInt(s.tokens.length)} tokens</span>
          {r.request.seed !== null && <span className="chip">seed {r.request.seed}</span>}
          <span className="chip">T {r.request.temperature === 0 ? "0" : r.request.temperature.toFixed(2)}</span>
          <button type="button" className="btn btn-icon ml-auto" onClick={() => runStore.dispatch({ type: "togglePin", runId: r.id })} aria-label="Unpin">
            <IconClose size={14} />
          </button>
        </div>
        <div className="tokens font-mono text-[15px] leading-[2] whitespace-pre-wrap break-all">
          {s.tokens.map((text, i) => {
            const { shown, isEnd } = tokenDisplay(text, s.tokens[i]);
            return (
              <span
                key={i}
                title={same[i] ? `#${i} · shared` : `#${i} · only in this run`}
                style={{
                  backgroundColor: pastelFor(i),
                  color: "#000000",
                  padding: "2px 1px",
                  borderRadius: 2,
                  opacity: same[i] ? 0.55 : 1,
                  outline: same[i] ? "none" : "2px solid var(--critical)",
                  outlineOffset: 1,
                }}
              >
                {isEnd ? "⟨eos⟩" : shown || " "}
              </span>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <section className="panel p-4 flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <span className="flex items-baseline gap-3">
          <span className="eyebrow">Compare</span>
          <span className="text-xs text-muted">{align.common} tokens shared · outlined ones differ</span>
        </span>
        <button type="button" className="btn py-0.5 px-2 text-xs" onClick={() => runStore.dispatch({ type: "unpinAll" })}>
          Unpin both
        </button>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {column(pair[0], align.a)}
        {column(pair[1], align.b)}
      </div>
      {leaves && leaves.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="eyebrow">
            Fields · {differing} of {leaves.length} differ
          </span>
          <div className="tbl-plain">
            {leaves.map((l) => (
              <div key={l.path} className={`grid grid-cols-[minmax(80px,180px)_minmax(0,1fr)_minmax(0,1fr)] gap-3 font-mono text-[12px] px-1 -mx-1 rounded ${l.a !== l.b ? "bg-accent-soft" : ""}`}>
                <span className="truncate text-ink-2" title={l.path}>
                  {l.path}
                </span>
                <span className="truncate">{l.a}</span>
                <span className="truncate">{l.b}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
