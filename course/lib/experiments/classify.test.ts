import { describe, expect, it } from "vitest";
import type { Done, Validation } from "@/lib/types";
import { classifyDone } from "./classify";

function done(v: Partial<Validation>): Done {
  const validation: Validation = {
    raw_text: "",
    stripped_text: "",
    strip_applied: [],
    raw_parse_ok: true,
    raw_schema_ok: true,
    parse_ok: true,
    parse_error: null,
    schema_ok: true,
    schema_error: null,
    schema_error_counts: {},
    stop_reason: "eos",
    failure_class: "ok",
    failure_class_stripped: "ok",
    parsed: null,
    ...v,
  };
  return { validation, stop_reason: validation.stop_reason } as unknown as Done;
}

describe("classifyDone", () => {
  it("ok", () => {
    const o = classifyDone(done({}), null);
    expect(o.ok).toBe(true);
    expect(o.hints).toEqual([]);
  });
  it("fence: rescuable when the inner JSON is fine", () => {
    const o = classifyDone(done({ raw_parse_ok: false, raw_schema_ok: false, strip_applied: ["fence"], failure_class: "fence", failure_class_stripped: "ok" }), null);
    expect(o.ok).toBe(false);
    expect(o.failureClass).toBe("fence");
    expect(o.hints).toContain("markdown_fence");
    expect(o.rescuable).toBe(true);
  });
  it("preamble that hides a schema error is not rescuable", () => {
    const o = classifyDone(done({ raw_parse_ok: false, raw_schema_ok: false, strip_applied: ["preamble"], schema_ok: false, schema_error: { message: "'city' is a required property", validator: "required", path: [], json_path: "$", schema_path: [], validator_value: null }, failure_class: "preamble", failure_class_stripped: "schema_missing_key" }), null);
    expect(o.hints).toEqual(["preamble", "missing_key"]);
    expect(o.rescuable).toBe(false);
    expect(o.detail).toContain("city");
  });
  it("truncated", () => {
    const o = classifyDone(done({ raw_parse_ok: false, raw_schema_ok: false, parse_ok: false, parse_error: { message: "Unterminated string", pos: 12, lineno: 1, colno: 13 }, schema_ok: false, stop_reason: "max_new_tokens", failure_class: "truncated", failure_class_stripped: "truncated" }), null);
    expect(o.hints).toContain("unterminated");
    expect(o.detail).toContain("pos 12");
  });
  it("extra key and wrong type", () => {
    const extra = classifyDone(done({ raw_schema_ok: false, schema_ok: false, schema_error: { message: "Additional properties are not allowed", validator: "additionalProperties", path: [], json_path: "$", schema_path: [], validator_value: false }, failure_class: "schema_extra_key", failure_class_stripped: "schema_extra_key" }), null);
    expect(extra.hints).toEqual(["extra_key"]);
    const type = classifyDone(done({ raw_schema_ok: false, schema_ok: false, schema_error: { message: "'36' is not of type 'integer'", validator: "type", path: ["age"], json_path: "$.age", schema_path: [], validator_value: "integer" }, failure_class: "schema_type", failure_class_stripped: "schema_type" }), null);
    expect(type.hints).toEqual(["wrong_type"]);
  });
  it("backend error", () => {
    const o = classifyDone(null, "RuntimeError: boom");
    expect(o.ok).toBe(false);
    expect(o.detail).toBe("RuntimeError: boom");
  });
});
