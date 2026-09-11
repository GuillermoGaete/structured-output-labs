import { describe, expect, it } from "vitest";
import { alignTokens } from "./diff";

describe("alignTokens", () => {
  it("marks the common subsequence on both sides", () => {
    const r = alignTokens(["{", "a", ":", "1", "}"], ["{", "a", ":", "2", "}"]);
    expect(r.common).toBe(4);
    expect(r.a).toEqual([true, true, true, false, true]);
    expect(r.b).toEqual([true, true, true, false, true]);
  });

  it("handles insertions and empty sides", () => {
    const r = alignTokens(["a", "b"], ["a", "x", "b"]);
    expect(r.a).toEqual([true, true]);
    expect(r.b).toEqual([true, false, true]);
    expect(alignTokens([], ["a"]).b).toEqual([false]);
  });
});
