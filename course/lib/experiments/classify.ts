import type { Done, Meta, Trace } from "@/lib/types";
import type { FailureHint, RunOutcome } from "./types";

/**
 * Turn the backend's validation report into the outcome the runs table shows.
 * The backend already parsed and validated (raw and stripped); this only adds
 * the hints the UI highlights and the "rescuable" verdict.
 */
export function classifyDone(done: Done | null, error: string | null): RunOutcome {
  if (error || !done) {
    return { ok: false, failureClass: "invalid_json", failureClassStripped: "invalid_json", hints: [], rescuable: false, detail: error ?? "no answer" };
  }
  const v = done.validation;
  const hints: FailureHint[] = [];
  if (v.strip_applied.includes("fence")) hints.push("markdown_fence");
  if (v.strip_applied.includes("preamble")) hints.push("preamble");
  if (v.strip_applied.includes("trailing")) hints.push("trailing_text");
  if (!v.parse_ok && v.stop_reason !== "eos") hints.push("unterminated");
  const validator = v.schema_error?.validator ?? (v.raw_schema_ok ? null : null);
  if (v.parse_ok && !v.schema_ok) {
    if (validator === "required") hints.push("missing_key");
    else if (validator === "additionalProperties") hints.push("extra_key");
    else hints.push("wrong_type");
  }
  const ok = v.raw_parse_ok && v.raw_schema_ok;
  const rescuable = !ok && v.parse_ok && v.schema_ok;
  const detail = ok ? null : v.parse_error ? `${v.parse_error.message} (pos ${v.parse_error.pos})` : v.schema_error ? v.schema_error.message : v.failure_class;
  return { ok, failureClass: v.failure_class, failureClassStripped: v.failure_class_stripped, hints, rescuable, detail };
}

export function classifyTrace(trace: Trace): RunOutcome {
  return classifyDone(trace.done, trace.error);
}

export function modeOfMeta(meta: Meta | null): "plain" | "json_mode" | "strict" {
  if (!meta) return "strict";
  return meta.constraint === "none" ? "plain" : meta.constraint === "json" ? "json_mode" : "strict";
}
