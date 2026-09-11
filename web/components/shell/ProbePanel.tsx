"use client";

import { useMemo } from "react";
import { canonicalJson, distribution, groupBy } from "@/lib/batchStats";
import { runStore, useBatchesRecord, useRunsRecord, useTracesRecord } from "@/lib/runStore";
import type { Batch, ConstrainedRun, LogprobsRun, Run } from "@/lib/runTypes";
import { formatPct, visibleToken } from "@/lib/tokens";

type Schema = Record<string, unknown>;

/** Properties whose value is a decision: booleans, enums and numbers. Free text is not compared. */
function decisionFields(schema: Schema | null): string[] {
  if (!schema) return [];
  let root = schema;
  const ref = root.$ref;
  if (typeof ref === "string") {
    const defs = (root.$defs ?? {}) as Record<string, Schema>;
    root = defs[ref.split("/").pop() ?? ""] ?? root;
  }
  const props = (root.properties ?? {}) as Record<string, Schema>;
  return Object.entries(props)
    .filter(([, s]) => s.enum !== undefined || s.type === "boolean" || s.type === "integer" || s.type === "number")
    .map(([k]) => k)
    .slice(0, 4);
}

function Share({ share, tone }: { share: number; tone: "accent" | "masked" }) {
  return <span className="inline-block h-2 rounded-sm align-middle mr-1" style={{ width: `${Math.max(2, Math.round(share * 56))}px`, background: tone === "accent" ? "var(--accent)" : "var(--series-masked)" }} aria-hidden="true" />;
}

/**
 * One row per variant of a counterfactual probe, all its batches pooled: the
 * decision fields side by side, so a gap between rows is the model's prior
 * about the attribute that was swapped.
 */
export function ProbePanel({ batch }: { batch: Batch }) {
  const batches = useBatchesRecord();
  const runs = useRunsRecord();
  const traces = useTracesRecord();
  const probe = batch.probe!;

  const rows = useMemo(() => {
    const siblings = Object.values(batches).filter((b) => b.probe?.presetId === probe.presetId);
    const byVariant = new Map<string, { runs: Run[]; batches: Batch[] }>();
    for (const b of siblings.sort((a, c) => a.createdAt - c.createdAt)) {
      const v = b.probe!.variant;
      if (!byVariant.has(v)) byVariant.set(v, { runs: [], batches: [] });
      const slot = byVariant.get(v)!;
      slot.batches.push(b);
      for (const id of b.runIds) if (runs[id]) slot.runs.push(runs[id]);
    }
    return [...byVariant.entries()].map(([variant, slot]) => ({ variant, ...slot }));
  }, [batches, runs, probe.presetId]);

  const first = rows[0]?.runs[0];
  const kind = first?.kind ?? batch.kind;
  const schema = first?.kind === "constrained" ? (first.request.schema as Schema) : null;
  const fields = decisionFields(schema);

  const select = (b: Batch) => runStore.dispatch({ type: "select", runId: b.n > 1 ? null : b.runIds[0], batchId: b.n > 1 ? b.id : null });
  // The same table serves two comparisons: an attribute swapped in the prompt, or the mask switched off.
  const modes = rows.some((r) => r.variant === "prompt only");

  return (
    <section className="panel p-4 flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <span className="flex items-baseline gap-3 flex-wrap">
          <span className="eyebrow">Probe</span>
          <span className="text-sm">{probe.presetName}</span>
          <span className="text-xs text-muted">{rows.length} variant{rows.length === 1 ? "" : "s"} · every run of each variant pooled</span>
        </span>
        <span
          className="text-xs text-muted"
          title={
            modes
              ? "The same schema and prompt. One row had the mask; the other had no mask and a hint appended to the prompt asking for the JSON in words"
              : "The prompts differ in one attribute only, so a gap between rows comes from the model, not from the text"
          }
        >
          {modes ? "same prompt · one row masked, the other asked for the JSON in words" : "same prompt, one attribute swapped"}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px] font-mono">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-1 pr-3 font-normal eyebrow">Variant</th>
              <th className="py-1 pr-3 font-normal eyebrow">Runs</th>
              {kind === "constrained" ? (
                <>
                  <th className="py-1 pr-3 font-normal eyebrow">Valid</th>
                  {fields.map((f) => (
                    <th key={f} className="py-1 pr-3 font-normal eyebrow">
                      {f}
                    </th>
                  ))}
                </>
              ) : (
                <th className="py-1 pr-3 font-normal eyebrow">First token · top 5</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const done = row.runs.filter((r) => r.status === "done");
              const active = row.batches.some((b) => b.id === batch.id);
              return (
                <tr key={row.variant} className={`align-top border-t border-line ${active ? "bg-accent-soft" : ""}`}>
                  <td className="py-1.5 pr-3 whitespace-nowrap">
                    <button type="button" className="hover:underline text-left" onClick={() => select(row.batches[row.batches.length - 1])} title="Open the newest batch of this variant">
                      {row.variant}
                    </button>
                  </td>
                  <td className="py-1.5 pr-3 text-ink-2 whitespace-nowrap">
                    {done.length}
                    {row.runs.length !== done.length ? ` / ${row.runs.length}` : ""}
                  </td>
                  {kind === "constrained" ? (
                    <>
                      <td className="py-1.5 pr-3 whitespace-nowrap">
                        {(() => {
                          const valid = done.filter((r) => (r as ConstrainedRun).summary.valid).length;
                          return done.length ? `${valid} / ${done.length}` : "—";
                        })()}
                      </td>
                      {fields.map((f) => {
                        const values = done
                          .filter((r) => (r as ConstrainedRun).summary.valid)
                          .map((r) => ({ runId: r.id, value: ((r as ConstrainedRun).summary.parsed as Record<string, unknown> | null)?.[f] }))
                          .filter((x) => x.value !== undefined);
                        if (!values.length) return <td key={f} className="py-1.5 pr-3 text-muted">—</td>;
                        const numeric = values.every((x) => typeof x.value === "number") && new Set(values.map((x) => x.value)).size > 2;
                        if (numeric) {
                          const d = distribution(values.map((x) => x.value as number));
                          return (
                            <td key={f} className="py-1.5 pr-3 whitespace-nowrap" title={`min ${d.min} · median ${d.median} · max ${d.max}`}>
                              {d.mean.toFixed(1)}
                              {d.n > 1 ? ` ± ${d.sd.toFixed(1)}` : ""}
                            </td>
                          );
                        }
                        const groups = groupBy(values, canonicalJson);
                        return (
                          <td key={f} className="py-1.5 pr-3 whitespace-nowrap">
                            {groups.slice(0, 3).map((g, i) => (
                              <span key={g.key} className="inline-flex items-center mr-2" title={`${g.count} of ${values.length}`}>
                                <Share share={g.count / values.length} tone={i === 0 ? "accent" : "masked"} />
                                {g.key} {formatPct(g.count / values.length, 0)}
                              </span>
                            ))}
                          </td>
                        );
                      })}
                    </>
                  ) : (
                    <td className="py-1.5 pr-3">
                      {(() => {
                        const latest = [...done].reverse().find((r) => traces[r.id]) as LogprobsRun | undefined;
                        const trace = latest ? traces[latest.id] : null;
                        const step = trace && "steps" in trace ? (trace.steps[0] as { top?: { token_id: number; text: string; token: string; p: number }[] } | undefined) : undefined;
                        if (!step?.top) return <span className="text-muted">no trace kept · re-run to see</span>;
                        return step.top.slice(0, 5).map((e) => (
                          <span key={e.token_id} className="inline-flex items-center mr-3" title={formatPct(e.p, 2)}>
                            <Share share={e.p} tone="accent" />
                            {visibleToken(e.text, e.token)} {formatPct(e.p, 0)}
                          </span>
                        ));
                      })()}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        {modes
          ? "Valid counts the runs whose text parsed as JSON and matched the schema. The mask guarantees that; the prompt only asks for it. The fields show whether the content moved too."
          : "Shares are over the valid runs of each variant. A single run says nothing about bias: compare rates across variants after Repeat ×N, and swap the attribute back to check the gap is stable."}
      </p>
    </section>
  );
}
