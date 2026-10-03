import { engineLabel } from "./engines";
import type { Batch, Run } from "./runTypes";

export interface RunChip {
  text: string;
  tone?: "warning";
  hint?: string;
}

const shortModel = (id: string | null | undefined) => (id ? (id.split("/").pop()?.split(":").pop() ?? id) : "default model");
const temp = (t: number) => (t === 0 ? "greedy" : `T ${t.toFixed(2)}`);

/** What the run on screen was asked for, as chips: the head of the Inference step. Pure. */
export function runChips(run: Run, batch: Batch | null): RunChip[] {
  const chips: RunChip[] = [];
  const replay = batch?.replay;
  if (replay) {
    chips.push({ text: replay.traceName }, { text: replay.callLabel.split(" · ")[0] }, { text: `cut after #${replay.cutAt}` });
    if (replay.edited) chips.push({ text: "edited", tone: "warning", hint: "The conversation sent differs from the trace's" });
  } else if (batch) {
    chips.push({ text: batch.label.replace(/ · ×\d+$/, "") });
  }
  const r = run.request;
  // A request without a model ran on the backend's default; the summary says which one that was.
  const model = shortModel(r.model ?? run.summary.modelId);
  if (run.kind === "constrained") {
    chips.push({ text: engineLabel(run.summary.mode ?? run.request.mode) }, { text: model }, { text: temp(r.temperature) }, { text: `${run.request.max_new_tokens} tok` });
    if (run.request.top_k_sampling) chips.push({ text: `top-k ${run.request.top_k_sampling}` });
  } else {
    chips.push({ text: "Logprobs" }, { text: model }, { text: temp(r.temperature) });
    if (run.request.top_k) chips.push({ text: `k ${run.request.top_k}` });
    if (run.request.top_p < 1) chips.push({ text: `p ${run.request.top_p.toFixed(2)}` });
    chips.push({ text: `${run.request.max_new_tokens} tok` });
  }
  if (r.seed !== null) chips.push({ text: `seed ${r.seed}` });
  if (batch && batch.n > 1) chips.push({ text: `×${batch.n}` });
  if (run.branch) chips.push({ text: `branch @${run.branch.atStep}`, hint: "Continued from another run's first tokens" });
  return chips;
}
