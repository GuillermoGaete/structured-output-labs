import type { Constraint, FailureClass, GenerateRequest, Trace } from "@/lib/types";

/** What the user chooses; maps to the backend's `constraint`. */
export type ConstraintMode = "plain" | "json_mode" | "strict";
export const MODE_TO_CONSTRAINT: Record<ConstraintMode, Constraint> = { plain: "none", json_mode: "json", strict: "schema" };
export const CONSTRAINT_TO_MODE: Record<Constraint, ConstraintMode> = { none: "plain", json: "json_mode", schema: "strict" };
export const MODES: ConstraintMode[] = ["plain", "json_mode", "strict"];

export type FailureHint = "markdown_fence" | "preamble" | "trailing_text" | "unterminated" | "missing_key" | "extra_key" | "wrong_type";

export interface RunOutcome {
  ok: boolean;
  failureClass: FailureClass;
  failureClassStripped: FailureClass;
  hints: FailureHint[];
  /** A lenient extraction (strip the fence / preamble) would have produced valid, schema-conforming JSON. */
  rescuable: boolean;
  detail: string | null;
}

export interface RunTimings {
  /** performance.now() values in the browser that made the request; null for fixtures. */
  requestedAt: number | null;
  metaAt: number | null;
  firstStepAt: number | null;
  doneAt: number | null;
  stepAt: number[];
}

export type RunSource = "fixture" | "live" | "imported";

export interface Run {
  id: string;
  experimentKey: string;
  mode: ConstraintMode;
  seed: number | null;
  request: GenerateRequest;
  source: RunSource;
  /** full = steps carry the top-K lists (scrubber-capable); compact = summary only. */
  detail: "full" | "compact";
  trace: Trace;
  timings: RunTimings;
  outcome: RunOutcome;
  model_id: string;
  recordedAt: string;
}

/** Stable key so runs made in M3 show up in M5: preset + what changes the distribution. */
export function experimentKey(request: Pick<GenerateRequest, "schema" | "prompt" | "max_new_tokens" | "temperature" | "top_p" | "top_k_sampling" | "schema_in_prompt" | "use_chat_template">, presetId: string): string {
  return [presetId, request.max_new_tokens, request.temperature, request.top_p, request.top_k_sampling, request.schema_in_prompt ? "sp" : "np", request.use_chat_template ? "tpl" : "raw"].join("|");
}
