import { describe, expect, it } from "vitest";
import { batchVsRecorded, compareToRecorded, MAX_COMPARED_WORDS } from "./replayCompare";

describe("compareToRecorded", () => {
  it("calls equal text exact, whatever the whitespace", () => {
    const c = compareToRecorded("It is  sunny.\n", "It is sunny.");
    expect(c.exact).toBe(true);
    expect(c.wordOverlap).toBe(1);
    expect(c.fields).toBeNull();
  });

  it("marks the words that differ", () => {
    const c = compareToRecorded("It is sunny in Paris", "It is rainy in Paris");
    expect(c.exact).toBe(false);
    expect(c.wordOverlap).toBeCloseTo(0.8);
    expect(c.recorded.filter((p) => !p.same).map((p) => p.text)).toEqual(["sunny"]);
    expect(c.replay.filter((p) => !p.same).map((p) => p.text)).toEqual(["rainy"]);
    expect(c.replay.map((p) => p.text).join("")).toBe("It is rainy in Paris");
  });

  it("reads compact JSON as its words, not as one blob", () => {
    const c = compareToRecorded('{"name":"Ada Lovelace","age":36}', '{"name":"Ada Byron","age":36}');
    expect(c.recorded.filter((p) => !p.same).map((p) => p.text)).toEqual(["Lovelace"]);
    expect(c.wordOverlap).toBeCloseTo(0.8);
  });

  it("compares JSON field by field", () => {
    const c = compareToRecorded('{"name":"Ada","age":36}', '{"age": 36, "name": "Grace"}');
    expect(c.jsonEqual).toBe(false);
    expect(c.fields).toEqual([
      { path: "name", recorded: '"Ada"', replay: '"Grace"', equal: false },
      { path: "age", recorded: "36", replay: "36", equal: true },
    ]);
    expect(c.fieldsEqual).toBe(0.5);
    expect(compareToRecorded("", '{"a":1}', { a: 1 }).jsonEqual).toBe(true);
  });

  it("caps the alignment on long texts", () => {
    const long = Array.from({ length: MAX_COMPARED_WORDS + 5 }, (_, i) => `w${i}`).join(" ");
    const c = compareToRecorded(long, long);
    expect(c.capped).toBe(true);
    expect(c.exact).toBe(true);
    expect(c.wordOverlap).toBeLessThan(1);
  });
});

describe("batchVsRecorded", () => {
  it("summarises a batch", () => {
    const b = batchVsRecorded([{ text: '{"a":1}' }, { text: '{"a":2}' }, { text: "nope" }], '{"a":1}');
    expect(b).toMatchObject({ finished: 3, exact: 1, jsonEqual: 1, parsed: 2, meanFieldsEqual: 0.5 });
    expect(batchVsRecorded([], "x").meanWordOverlap).toBeNull();
  });
});
