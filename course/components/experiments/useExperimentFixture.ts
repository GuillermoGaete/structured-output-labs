"use client";

import { useEffect } from "react";
import { useDataSource } from "@/data/DataSourceProvider";
import type { FixtureOf } from "@/data/fixtures";
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
      for (const r of fixture.response.runs) {
        runs.push({
          id: `${fixture.response.presetId}-${r.constraint}-${r.seed}`,
          experimentKey: key,
          mode: CONSTRAINT_TO_MODE[r.constraint],
          seed: r.seed,
          request: r.request,
          source: "fixture",
          detail: r.detail,
          trace: r.trace,
          timings: { requestedAt: null, metaAt: null, firstStepAt: null, doneAt: null, stepAt: [] },
          outcome: classifyTrace(r.trace),
          model_id: fixture.model_id,
          recordedAt: fixture.recordedAt,
        });
      }
    }
    if (runs.length) addRuns(runs);
  }, [loaded, addRuns]);
}
