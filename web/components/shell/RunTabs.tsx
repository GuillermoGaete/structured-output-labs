"use client";

import { useEffect, useMemo, useRef } from "react";
import { readKey } from "@/lib/providers";
import { cancelBatch, rerun } from "@/lib/runner";
import { runStore, useBatchesRecord, useBatchOrder, useLocalBusy, usePinned, useRunsRecord, useRunState, useSelectedRun } from "@/lib/runStore";
import { batchStatus, type Batch, type BatchStatus, type Run } from "@/lib/runTypes";
import { formatInt } from "@/lib/tokens";
import { Menu, type MenuItem } from "./Menu";

interface Props {
  backendUrl: string;
  /** Put a run's inputs back in the setup. Return false when this page cannot edit that kind of run. */
  onDuplicate?: (run: Run, batch: Batch) => boolean;
}

const STATUS_DOT: Record<BatchStatus, string> = {
  queued: "bg-muted",
  running: "bg-warning",
  done: "bg-good",
  partial: "bg-warning",
  cancelled: "bg-muted",
};

function describe(run: Run, batch: Batch, runs: Record<string, Run>): string {
  const tail = describeRuns(run, batch, runs);
  return batch.probe ? `${batch.probe.variant} · ${tail}` : tail;
}

function describeRuns(run: Run, batch: Batch, runs: Record<string, Run>): string {
  if (batch.n > 1) {
    const list = batch.runIds.map((id) => runs[id]).filter(Boolean);
    const done = list.filter((r) => r.status === "done").length;
    if (done < batch.n && list.some((r) => r.status === "running" || r.status === "queued")) return `×${batch.n} · ${done} / ${batch.n} done`;
    if (done === 0) return `×${batch.n} · ${batchStatus(batch, runs)}`;
    if (batch.kind === "constrained") {
      const valid = list.filter((r) => r.kind === "constrained" && r.status === "done" && r.summary.valid).length;
      return `×${batch.n} · ${valid} / ${done} valid`;
    }
    return `×${batch.n} · ${done} done`;
  }
  const steps = run.summary.tokenIds.length;
  if (run.status === "running") return steps ? `running · ${formatInt(steps)}` : "starting…";
  if (run.status === "queued") return "queued";
  if (run.status === "error") return "error";
  if (run.status === "cancelled") return steps ? `stopped · ${formatInt(steps)}` : "stopped";
  if (run.kind === "constrained") return `${run.summary.valid ? "valid" : "invalid"} · ${formatInt(steps)} steps`;
  return `${formatInt(steps)} tokens`;
}

/** One tab per batch, oldest on the left; the selected run's batch is lit. */
export function RunTabs({ backendUrl, onDuplicate }: Props) {
  const order = useBatchOrder();
  const batches = useBatchesRecord();
  const runs = useRunsRecord();
  const selected = useSelectedRun();
  const selectedBatchId = useRunState((s) => s.selectedBatchId);
  const pinned = usePinned();
  const busy = useLocalBusy();
  const activeRef = useRef<HTMLDivElement | null>(null);

  const list = useMemo(
    () =>
      [...order]
        .reverse()
        .map((id, i) => ({ batch: batches[id], ordinal: i + 1 }))
        .filter((x): x is { batch: Batch; ordinal: number } => !!x.batch),
    [order, batches],
  );

  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [selected?.batchId, selectedBatchId]);

  if (!list.length) return null;
  const atStart = !selected && !selectedBatchId;

  return (
    <div className="tabs" role="tablist" aria-label="Runs">
      <div className={`tab tab-start ${atStart ? "tab-active" : ""}`} role="presentation">
        <button
          type="button"
          role="tab"
          aria-selected={atStart}
          className="tab-main pr-3"
          title="Back to the presets; every run stays in its tab"
          onClick={() => runStore.dispatch({ type: "select", runId: null, batchId: null })}
        >
          <span className="font-medium">Start</span>
        </button>
      </div>
      {list.map(({ batch, ordinal }) => {
        const first = runs[batch.runIds[0]];
        if (!first) return null;
        const status = batchStatus(batch, runs);
        const active = selected?.batchId === batch.id || selectedBatchId === batch.id;
        const hosted = first.kind === "logprobs" && first.provider !== null;
        const unseeded = first.request.seed === null && first.request.temperature > 0;
        const items: MenuItem[] = [
          {
            label: "Re-run · same seed",
            hint: hosted ? "A hosted model takes no seed; this is a fresh sample" : unseeded ? "This run had no seed, so the re-run will differ" : "Same request, same seed: the same trace again",
            disabled: busy && !hosted,
            onSelect: () => rerun(first, batch, "same", backendUrl, hosted ? readKey(first.provider!) : undefined),
          },
          {
            label: "Re-run · new seed",
            hint: "Same request, another seed",
            disabled: busy && !hosted,
            onSelect: () => rerun(first, batch, "new", backendUrl, hosted ? readKey(first.provider!) : undefined),
          },
          ...(batch.n === 1
            ? [
                {
                  label: pinned.includes(first.id) ? "Unpin" : "Pin to compare",
                  hint: "Two pinned runs are shown side by side, token by token",
                  onSelect: () => runStore.dispatch({ type: "togglePin", runId: first.id }),
                },
              ]
            : []),
          {
            label: "Duplicate & edit",
            hint: "Put this run's schema, prompt and knobs back in the setup",
            disabled: !onDuplicate,
            onSelect: () => {
              onDuplicate?.(first, batch);
            },
          },
          ...(status === "running" || status === "queued"
            ? [{ label: "Stop", hint: "Cancel what is left of this batch", onSelect: () => cancelBatch(batch.id) }]
            : []),
          { label: "Close", hint: "Forget this run", onSelect: () => runStore.dispatch({ type: "removeBatch", batchId: batch.id }) },
        ];
        return (
          <div key={batch.id} ref={active ? activeRef : undefined} className={`tab ${active ? "tab-active" : ""} ${pinned.includes(first.id) ? "tab-pinned" : ""}`} role="presentation">
            <button
              type="button"
              role="tab"
              aria-selected={active}
              className="tab-main"
              title={`${batch.label}${first.branch ? ` · branch at step ${first.branch.atStep}` : ""}${batch.baseSeed !== null ? ` · seed ${batch.baseSeed}` : ""}`}
              onClick={() => runStore.dispatch({ type: "select", runId: batch.n > 1 ? null : first.id, batchId: batch.n > 1 ? batch.id : null })}
            >
              <span className={`inline-block w-2 h-2 rounded-full ${STATUS_DOT[status]}`} aria-hidden="true" />
              <span className="font-medium">
                {first.branch ? "↳ " : ""}#{ordinal}
              </span>
              <span className="text-ink-2">{describe(first, batch, runs)}</span>
            </button>
            <Menu label="⋯" items={items} className="tab-menu" ariaLabel={`Actions for run #${ordinal}`} />
          </div>
        );
      })}
      <button
        type="button"
        className="btn py-0.5 px-2 text-xs ml-auto shrink-0 talk-hide"
        onClick={() => {
          if (window.confirm("Forget every run?")) runStore.dispatch({ type: "clear" });
        }}
        title="Forget every run"
      >
        Clear
      </button>
    </div>
  );
}
