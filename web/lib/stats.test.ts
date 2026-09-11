import { describe, expect, it } from "vitest";
import { emptyConstrainedSummary, emptyLogprobsSummary, finishConstrained, foldConstrainedStep, foldLogprobsStep } from "./stats";
import type { Done, Step, StreamStep } from "./types";

const step = (over: Partial<Step>): Step => ({
  i: 0,
  token_id: 1,
  token: "a",
  text: "a",
  partial_text: "a",
  n_allowed: 10,
  vocab_size: 100,
  mass_removed: 0.2,
  top_original: [],
  top_forced: [],
  fsm_state: 0,
  stack_depth: 1,
  was_overridden: false,
  p_original: 0.5,
  p_forced: 0.5,
  ...over,
});

describe("constrained summary", () => {
  it("folds each step and finishes with the verdict", () => {
    let s = emptyConstrainedSummary();
    s = foldConstrainedStep(s, step({ token_id: 1 }));
    s = foldConstrainedStep(s, step({ token_id: 2, was_overridden: true, p_forced: 0, stack_depth: 3, partial_text: "ab" }));
    expect(s.tokenIds).toEqual([1, 2]);
    expect(s.overridden).toEqual([false, true]);
    expect(s.vocabKept).toEqual([0.1, 0.1]);
    expect(s.logPForced[1]).toBeCloseTo(Math.log(1e-12));
    expect(s.maxStackDepth).toBe(3);
    expect(s.text).toBe("ab");
    expect(s.valid).toBeNull();
    const done: Done = { text: "ab", parsed: { a: 1 }, valid: true, validation_error: null, n_steps: 2, elapsed_s: 1.5, stopped_by: "eos", tokens: [] };
    s = finishConstrained(s, done);
    expect(s.finished).toBe(true);
    expect(s.valid).toBe(true);
    expect(s.stoppedBy).toBe("eos");
  });
});

describe("logprobs summary", () => {
  it("keeps the raw entropy and the entropy the sampler saw", () => {
    const st: StreamStep = {
      i: 0,
      token_id: 3,
      token: "x",
      text: "x",
      partial_text: "x",
      chosen_logit: 2,
      chosen_p: 0.5,
      chosen_rank: 0,
      logsumexp: 0,
      entropy_bits: 1.2,
      top: [
        { rank: 0, token_id: 3, token: "x", text: "x", logit: 2, p: 0.5 },
        { rank: 1, token_id: 4, token: "y", text: "y", logit: 2, p: 0.5 },
      ],
      tail: { n: 0, mass: 0, buckets: 0, edges: [], counts: [], logit_mean: [] },
      dt_ms: 10,
      forward_ms: 8,
    };
    const greedy = foldLogprobsStep(emptyLogprobsSummary(), st, { temperature: 0, top_k: 0, top_p: 1, seed: null });
    expect(greedy.entropyRawBits).toEqual([1.2]);
    expect(greedy.entropyViewBits[0]).toBe(0);
    const flat = foldLogprobsStep(emptyLogprobsSummary(), st, { temperature: 1, top_k: 0, top_p: 1, seed: null });
    expect(flat.entropyViewBits[0]).toBeCloseTo(1, 5);
    expect(flat.tokens).toEqual(["x"]);
    expect(flat.logP[0]).toBeCloseTo(Math.log(0.5));
  });
});
