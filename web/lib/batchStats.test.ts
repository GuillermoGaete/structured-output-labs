import { describe, expect, it } from "vitest";
import { canonicalJson, constrainedBatchStats, distribution, divergence, entropyBits, fieldStats, groupBy, passAtK, passPowK, prefixTree } from "./batchStats";
import type { ConstrainedRun } from "./runTypes";
import type { GenerateRequest } from "./types";

describe("primitives", () => {
  it("distribution", () => {
    const d = distribution([1, 2, 3, 4]);
    expect(d.mean).toBe(2.5);
    expect(d.median).toBe(2.5);
    expect(d.sd).toBeCloseTo(1.291, 3);
    expect(distribution([]).n).toBe(0);
    expect(distribution([5]).sd).toBe(0);
  });

  it("entropy in bits", () => {
    expect(entropyBits([2, 1])).toBeCloseTo(0.918, 3);
    expect(entropyBits([3])).toBe(0);
    expect(entropyBits([])).toBe(0);
  });

  it("canonical JSON ignores key order", () => {
    expect(canonicalJson({ b: 2, a: 1 })).toBe(canonicalJson({ a: 1, b: 2 }));
    expect(canonicalJson([1, { z: null }])).toBe('[1,{"z":null}]');
  });

  it("groups most frequent first", () => {
    const g = groupBy(
      [
        { runId: "1", value: "x" },
        { runId: "2", value: "y" },
        { runId: "3", value: "y" },
      ],
      (v) => v,
    );
    expect(g.map((x) => [x.key, x.count])).toEqual([
      ["y", 2],
      ["x", 1],
    ]);
    expect(g[0].runIds).toEqual(["2", "3"]);
  });

  it("finds where sequences diverge", () => {
    expect(divergence([[1, 2, 3], [1, 2, 3]])).toEqual({ firstDivergence: null, perPosition: [1, 1, 1], identical: true });
    expect(divergence([[1, 2, 3], [1, 2, 4]]).firstDivergence).toBe(2);
    expect(divergence([[1, 2], [1, 2, 3]]).firstDivergence).toBe(2); // the shorter one ended
    expect(divergence([[1]]).identical).toBe(true);
  });

  it("folds shared prefixes into a tree with counts", () => {
    const t = prefixTree([
      ["a", "b"],
      ["a", "c"],
      ["a", "b"],
    ]);
    expect(t.count).toBe(3);
    expect(t.children[0].token).toBe("a");
    expect(t.children[0].children.map((c) => [c.token, c.count])).toEqual([
      ["b", 2],
      ["c", 1],
    ]);
  });

  it("agreement per field, nested paths and array lengths", () => {
    const f = fieldStats([
      { runId: "1", parsed: { name: "Ada", items: [{ sku: "A" }] } },
      { runId: "2", parsed: { name: "Ada", items: [{ sku: "B" }] } },
      { runId: "3", parsed: { name: "Bob", items: [] } },
    ]);
    const byPath = Object.fromEntries(f.map((x) => [x.path, x]));
    expect(byPath.name.agreement).toBeCloseTo(2 / 3);
    expect(byPath.name.entropyBits).toBeCloseTo(0.918, 3);
    expect(byPath["items.length"].values.map((g) => [g.key, g.count])).toEqual([
      ["1", 2],
      ["0", 1],
    ]);
    expect(byPath["items[0].sku"].n).toBe(2);
  });

  it("pass@k and pass^k", () => {
    expect(passAtK(0.75, 3)).toBeCloseTo(0.984, 3);
    expect(passPowK(0.75, 3)).toBeCloseTo(0.422, 3);
  });
});

describe("constrainedBatchStats", () => {
  const REQ: GenerateRequest = {
    model: "m",
    schema: {},
    prompt: "p",
    mode: "auto",
    max_new_tokens: 10,
    temperature: 0.8,
    top_k_sampling: 0,
    top_k_report: 20,
    seed: 1,
    use_chat_template: true,
  };
  const mk = (id: string, status: ConstrainedRun["status"], valid: boolean, parsed: unknown, ids: number[], stop = "eos"): ConstrainedRun => ({
    id,
    batchId: "b",
    index: 0,
    createdAt: 0,
    startedAt: 0,
    finishedAt: 1,
    status,
    error: null,
    branch: null,
    kind: "constrained",
    request: REQ,
    summary: {
      finished: status === "done",
      modelId: "m",
      mode: "fsm",
      backend: "outlines_core",
      promptTokenCount: 3,
      tokenIds: ids,
      tokens: ids.map(String),
      massRemoved: ids.map(() => 0.1),
      vocabKept: ids.map(() => 0.5),
      overridden: ids.map((_, i) => i === 0),
      logPForced: ids.map(() => -0.1),
      maxStackDepth: 1,
      text: JSON.stringify(parsed),
      parsed,
      valid,
      validationError: valid ? null : "bad",
      stoppedBy: stop as "eos",
      elapsedS: 1,
    },
  });

  it("counts validity, groups outputs and leaves cancelled runs out of the averages", () => {
    const runs = [
      mk("1", "done", true, { a: 1 }, [1, 2, 3]),
      mk("2", "done", true, { a: 1 }, [1, 2, 3]),
      mk("3", "done", false, null, [1, 2, 9], "max_new_tokens"),
      mk("4", "cancelled", false, null, [1]),
    ];
    const st = constrainedBatchStats(runs);
    expect(st.n).toBe(4);
    expect(st.nDone).toBe(3);
    expect(st.nValid).toBe(2);
    expect(st.validPct).toBeCloseTo(2 / 3);
    expect(st.outputs[0].count).toBe(2);
    expect(st.outputs.length).toBe(2);
    expect(st.divergence.firstDivergence).toBe(2);
    expect(st.nSteps.mean).toBe(3);
    expect(st.stoppedBy).toEqual({ eos: 2, max_new_tokens: 1 });
    expect(st.fields.find((f) => f.path === "a")?.agreement).toBe(1);
    expect(st.massRemovedByPosition.length).toBe(3);
    expect(st.overriddenRateByPosition[0]).toBe(1);
  });

  it("measures divergence after a shared prefix, at absolute positions", () => {
    const runs = [mk("1", "done", true, { a: 1 }, [7, 8, 1, 2]), mk("2", "done", true, { a: 1 }, [7, 8, 1, 3]), mk("3", "done", true, { a: 1 }, [7, 8, 4])];
    const whole = constrainedBatchStats(runs);
    expect(whole.divergence.firstDivergence).toBe(2);
    const after = constrainedBatchStats(runs, { from: 2 });
    expect(after.divergence.firstDivergence).toBe(2);
    expect(after.divergence.perPosition).toEqual([2, 3]);
    expect(constrainedBatchStats([runs[0], runs[0]], { from: 2 }).divergence.identical).toBe(true);
  });
});
