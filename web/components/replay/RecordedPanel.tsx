"use client";

import { useMemo } from "react";
import { Stats, type StatProps } from "@/components/shell/Stat";
import { promptText } from "@/lib/chat";
import { batchVsRecorded, compareToRecorded, type Piece } from "@/lib/replayCompare";
import { useRunsRecord, useTrace } from "@/lib/runStore";
import type { Batch, Run } from "@/lib/runTypes";
import { formatPct } from "@/lib/tokens";

/** What a run wrote so far: its final text, or the last partial while it streams. */
function replyText(run: Run, partial: string | undefined): string {
  return run.summary.text ?? partial ?? "";
}

function replyValue(run: Run): unknown {
  return run.kind === "constrained" && run.summary.parsed !== null ? run.summary.parsed : undefined;
}

/** The trace's recorded reply against the replay: the selected run word by word and field by field, and the batch in numbers. */
export function RecordedPanel({ batch, run }: { batch: Batch; run: Run | null }) {
  const info = batch.replay;
  const runs = useRunsRecord();
  const trace = useTrace(run?.id ?? null);
  const partial = trace?.steps.length ? trace.steps[trace.steps.length - 1].partial_text : undefined;
  const text = run ? replyText(run, partial) : "";
  const recorded = info?.recorded ?? null;

  const single = useMemo(
    () => (run && recorded !== null ? compareToRecorded(recorded, text, info?.recordedStructured, replyValue(run)) : null),
    [run, recorded, text, info?.recordedStructured],
  );
  const finished = batch.runIds.map((id) => runs[id]).filter((r): r is Run => !!r && r.status === "done");
  const many = useMemo(
    () => (batch.n > 1 && recorded !== null ? batchVsRecorded(finished.map((r) => ({ text: r.summary.text ?? "", value: replyValue(r) })), recorded, info?.recordedStructured) : null),
    [batch.n, recorded, finished, info?.recordedStructured],
  );
  if (!info) return null;

  const notes = trace?.meta?.template_notes ?? [];
  // The logprobs viewer does not show its prompt; the conversation is the point here.
  const sentText = trace?.meta && "prompt_rendered" in trace.meta ? trace.meta.prompt_rendered : null;
  const conversation = run?.kind === "logprobs" ? (sentText ?? promptText(run.request)) : null;

  const stats: StatProps[] = [];
  if (single) {
    stats.push({ label: "Exact", value: single.exact ? "yes" : "no", tone: single.exact ? "good" : undefined, hint: "The same text, whitespace aside" });
    stats.push({ label: "Words in common", value: formatPct(single.wordOverlap, 0), hint: `2 × shared words ÷ words on both sides, in order${single.capped ? "; only the first 1,500 words are aligned" : ""}` });
    if (single.fieldsEqual !== null) stats.push({ label: "Fields equal", value: formatPct(single.fieldsEqual, 0), tone: single.jsonEqual ? "good" : undefined, hint: "JSON leaves with the same value on both sides" });
  }
  if (many && many.finished) {
    stats.push({ label: `Exact · batch`, value: `${many.exact}/${many.finished}`, hint: "Runs of this batch that wrote the recorded reply" });
    if (many.meanWordOverlap !== null) stats.push({ label: "Words · mean", value: formatPct(many.meanWordOverlap, 0), hint: "Words in common with the recorded reply, averaged over the batch" });
    if (many.parsed) stats.push({ label: "Same JSON · batch", value: `${many.jsonEqual}/${many.parsed}`, hint: "Among the runs whose output parses as JSON" });
  }

  return (
    <section className="panel p-4 flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <span className="flex items-baseline gap-2 flex-wrap">
          <span className="eyebrow">Replay vs trace</span>
          <span className="text-xs text-ink-2">
            {info.traceName} · {info.callLabel} · cut after message {info.cutAt}
          </span>
        </span>
        <span className="flex items-center gap-1.5 flex-wrap">
          {info.edited && <span className="chip chip-warning" title="The conversation sent was edited: a counterfactual">edited context</span>}
          {notes.map((n) => (
            <span key={n} className="chip chip-warning" title="The model's chat template refused the conversation as it was">
              {n}
            </span>
          ))}
        </span>
      </div>

      {recorded === null ? (
        <p className="text-xs text-muted">The trace recorded no reply at this cut: there is nothing to compare with, only the replay.</p>
      ) : (
        <>
          {stats.length > 0 && <Stats items={stats} />}
          {run && single && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Column title={`Recorded${info.recordedModel ? ` · ${info.recordedModel}` : ""}`} pieces={single.recorded} empty="(empty)" />
              <Column title={`Replay · ${run.status === "running" ? "writing…" : run.status}`} pieces={single.replay} empty={run.status === "running" || run.status === "queued" ? "…" : "(nothing)"} />
            </div>
          )}
          {single?.fields && single.fields.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="eyebrow">
                Fields · {single.fields.filter((f) => !f.equal).length} of {single.fields.length} differ
              </span>
              <div className="tbl-plain">
                <div className="grid grid-cols-[minmax(80px,180px)_minmax(0,1fr)_minmax(0,1fr)] gap-3 font-mono text-[11px] text-muted px-1">
                  <span>path</span>
                  <span>recorded</span>
                  <span>replay</span>
                </div>
                {single.fields.map((f) => (
                  <div key={f.path} className={`grid grid-cols-[minmax(80px,180px)_minmax(0,1fr)_minmax(0,1fr)] gap-3 font-mono text-[12px] px-1 -mx-1 rounded ${f.equal ? "" : "bg-accent-soft"}`}>
                    <span className="truncate text-ink-2" title={f.path}>
                      {f.path}
                    </span>
                    <span className="truncate" title={f.recorded ?? undefined}>
                      {f.recorded ?? "—"}
                    </span>
                    <span className="truncate" title={f.replay ?? undefined}>
                      {f.replay ?? "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {conversation !== null && (
        <details className="text-xs">
          <summary className="cursor-pointer eyebrow select-none" title={sentText ? "The exact text that was tokenized, chat template included" : "Composed from the request; the chat template is added on the server"}>
            {sentText ? "Conversation as sent" : "Conversation · composed from the request"}
          </summary>
          <pre className="mono text-[12px] leading-snug whitespace-pre-wrap break-words max-h-72 overflow-auto mt-2">{conversation}</pre>
        </details>
      )}
    </section>
  );
}

function Column({ title, pieces, empty }: { title: string; pieces: Piece[]; empty: string }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <span className="eyebrow truncate">{title}</span>
      <div className="mono text-[13px] leading-relaxed whitespace-pre-wrap break-words max-h-80 overflow-auto">
        {pieces.length === 0 ? (
          <span className="text-muted">{empty}</span>
        ) : (
          pieces.map((p, i) =>
            p.same ? (
              <span key={i}>{p.text}</span>
            ) : (
              <span key={i} className="rounded-sm" style={{ outline: "1.5px solid var(--critical)", outlineOffset: 0 }} title="Not in the other side">
                {p.text}
              </span>
            ),
          )
        )}
      </div>
    </div>
  );
}
