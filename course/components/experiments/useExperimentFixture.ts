"use client";

import { useEffect } from "react";
import { useDataSource } from "@/data/DataSourceProvider";
import type { FixtureOf } from "@/data/fixtures";
import type { GenerateRequest, Meta, Step } from "@/lib/types";
import { classifyTrace } from "@/lib/experiments/classify";
import { useExperimentStore } from "@/lib/experiments/store";
import { CONSTRAINT_TO_MODE, experimentKey, type Run } from "@/lib/experiments/types";

/** Feed the module's recorded experiments into the store (idempotent by run id). */
export function useExperimentFixtures(): void {
  const { loaded } = useDataSource();
  const { addRuns } = useExperimentStore();
  useEffect(() => {
    const runs: Run[] = [];
    for (const f of loaded) {
      if (f.kind !== "experiment") continue;
      const fixture = f as FixtureOf<"experiment">;
      const key = experimentKey(fixture.request, fixture.response.presetId);
      const firstMeta = new Map<string, Meta>();
      for (const r of fixture.response.runs) if (r.trace.meta && r.seed === 0) firstMeta.set(r.constraint, r.trace.meta);
      for (const r of fixture.response.runs) {
        // Restore what the compaction dropped: the shared request, the rendered prompt / regex, the running text.
        const request: GenerateRequest = { ...fixture.request, ...r.request };
        const reference = firstMeta.get(r.constraint);
        const meta = r.trace.meta && reference ? { ...r.trace.meta, prompt_rendered: r.trace.meta.prompt_rendered || reference.prompt_rendered, regex: r.trace.meta.regex ?? reference.regex } : r.trace.meta;
        let partial = "";
        const steps: Step[] = r.trace.steps.map((s) => {
          partial += s.text;
          return { ...s, partial_text: s.partial_text ?? partial };
        });
        const trace = { ...r.trace, meta, steps };
        runs.push({
          id: `${fixture.response.presetId}-${fixture.request.schema_in_prompt ? "sp" : "nosp"}-${r.constraint}-${r.seed}`,
          experimentKey: key,
          mode: CONSTRAINT_TO_MODE[r.constraint],
          seed: r.seed,
          request,
          source: "fixture",
          detail: r.detail,
          trace,
          timings: { requestedAt: null, metaAt: null, firstStepAt: null, doneAt: null, stepAt: [] },
          outcome: classifyTrace(trace),
          model_id: fixture.model_id,
          recordedAt: fixture.recordedAt,
        });
      }
    }
    if (runs.length) addRuns(runs);
  }, [loaded, addRuns]);
}
