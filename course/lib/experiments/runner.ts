import type { LabClient } from "@/data/client";
import type { Done, GenerateEvent, GenerateRequest, Meta, Step, Trace } from "@/lib/types";
import { classifyTrace } from "./classify";
import { MODE_TO_CONSTRAINT, type ConstraintMode, type Run, type RunTimings } from "./types";

export interface RunOneOptions {
  seed: number | null;
  includeSteps: boolean;
  onEvent?: (event: GenerateEvent, trace: Trace) => void;
  signal?: AbortSignal;
  source?: Run["source"];
}

/** One /generate call turned into a Run: the trace, arrival timestamps and the outcome. */
export async function runOne(client: LabClient, base: GenerateRequest, mode: ConstraintMode, experimentKey: string, opts: RunOneOptions): Promise<Run> {
  const request: GenerateRequest = { ...base, constraint: MODE_TO_CONSTRAINT[mode], seed: opts.seed, include_steps: opts.includeSteps };
  const trace: Trace = { meta: null, steps: [], done: null, error: null };
  const timings: RunTimings = { requestedAt: performance.now(), metaAt: null, firstStepAt: null, doneAt: null, stepAt: [] };
  await client.generate(
    request,
    (event) => {
      const now = performance.now();
      if (event.event === "meta") {
        trace.meta = event.data as Meta;
        timings.metaAt = now;
      } else if (event.event === "step") {
        trace.steps.push(event.data as Step);
        if (timings.firstStepAt === null) timings.firstStepAt = now;
        timings.stepAt.push(now);
      } else if (event.event === "done") {
        trace.done = event.data as Done;
        timings.doneAt = now;
      } else if (event.event === "error") {
        trace.error = (event.data as { detail: string }).detail;
      }
      opts.onEvent?.(event, trace);
    },
    opts.signal,
  );
  const outcome = classifyTrace(trace);
  const recordedAt = new Date().toISOString();
  return {
    id: `${mode}-${opts.seed ?? "r"}-${recordedAt.replace(/[-:.TZ]/g, "").slice(0, 14)}`,
    experimentKey,
    mode,
    seed: opts.seed,
    request,
    source: opts.source ?? (client.kind === "live" ? "live" : "fixture"),
    detail: opts.includeSteps ? "full" : "compact",
    trace,
    timings,
    outcome,
    model_id: trace.meta?.model_id ?? "",
    recordedAt,
  };
}

/** Strip the per-step top-K lists so a run fits in sessionStorage. */
export function compactRun(run: Run): Run {
  if (run.detail === "compact") return run;
  return { ...run, detail: "compact", trace: { ...run.trace, steps: [] } };
}
