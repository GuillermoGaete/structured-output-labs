import { describe, expect, it } from "vitest";
import { argmaxIndex, pickWithU, softmaxView, type LogitLike, type TailLike } from "./math";
import { rng, uFor } from "./prng";

/**
 * A distribution small enough to check by hand.
 *
 * softmax([4, 3, 1, 0]) over the top, with a tail of 6 entries whose mean logit
 * is −2, gives, at T = 1:
 *   e^4 = 54.598, e^3 = 20.086, e^1 = 2.718, e^0 = 1, tail = 6·e^−2 = 0.812
 *   total = 79.214  →  0.6893, 0.2536, 0.0343, 0.0126, tail 0.0103
 */
const entry = (token_id: number, logit: number, text: string): LogitLike => ({ token_id, logit, p: 0, text, token: text });
const TOP: LogitLike[] = [entry(1, 4, "the"), entry(2, 3, " a"), entry(3, 1, " one"), entry(4, 0, " some")];
const TAIL: TailLike = { n: 6, counts: [6], logit_mean: [-2] };

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("softmaxView", () => {
  it("is the softmax of the logits, with the tail counted in", () => {
    const view = softmaxView(TOP, TAIL, { temperature: 1 });
    expect(view.p[0]).toBeCloseTo(0.6893, 3);
    expect(view.p[1]).toBeCloseTo(0.2536, 3);
    expect(view.p[3]).toBeCloseTo(0.0126, 3);
    expect(view.tailMass).toBeCloseTo(0.0103, 3);
    expect(sum(view.p) + view.tailMass).toBeCloseTo(1, 9);
    expect(view.cutoff).toBeNull();
    expect(view.tailAllowed).toBe(true);
  });

  it("ignoring the tail would inflate every bar", () => {
    const withTail = softmaxView(TOP, TAIL, { temperature: 1 });
    const without = softmaxView(TOP, null, { temperature: 1 });
    expect(without.p[0]).toBeGreaterThan(withTail.p[0]);
    expect(sum(without.p)).toBeCloseTo(1, 9);
  });

  it("is one-hot on the argmax when greedy", () => {
    const view = softmaxView(TOP, TAIL, { temperature: 0 });
    expect(view.greedy).toBe(true);
    expect(view.p).toEqual([1, 0, 0, 0]);
    expect(view.allowed.filter(Boolean)).toHaveLength(1);
    expect(view.entropyBits).toBe(0);
  });

  it("flattens with a higher temperature and sharpens with a lower one", () => {
    const base = softmaxView(TOP, TAIL, { temperature: 1 });
    const flat = softmaxView(TOP, TAIL, { temperature: 2 });
    const sharp = softmaxView(TOP, TAIL, { temperature: 0.3 });
    expect(flat.p[0]).toBeLessThan(base.p[0]);
    expect(sharp.p[0]).toBeGreaterThan(base.p[0]);
    expect(flat.entropyBits).toBeGreaterThan(sharp.entropyBits);
    // The logits never move; only their projection does.
    expect(TOP.map((e) => e.logit)).toEqual([4, 3, 1, 0]);
  });

  it("top-k keeps exactly k entries and cuts the tail", () => {
    const view = softmaxView(TOP, TAIL, { temperature: 1, topK: 2 });
    expect(view.allowed).toEqual([true, true, false, false]);
    expect(view.cutoff).toBe(2);
    expect(view.tailAllowed).toBe(false);
    expect(sum(view.p)).toBeCloseTo(1, 9);
    // Renormalised over the survivors: 0.6893 / (0.6893 + 0.2536).
    expect(view.p[0]).toBeCloseTo(0.7311, 3);
  });

  it("top-p keeps the first entry and cuts once the mass before an entry reaches p", () => {
    const view = softmaxView(TOP, TAIL, { temperature: 1, topP: 0.8 });
    expect(view.allowed[0]).toBe(true);
    expect(view.allowed[1]).toBe(true); // 0.689 of mass sits before it, under 0.8
    expect(view.allowed[2]).toBe(false); // 0.943 by then, over 0.8
    expect(view.cutoff).toBe(2);
    const tiny = softmaxView(TOP, TAIL, { temperature: 1, topP: 1e-6 });
    expect(tiny.allowed.filter(Boolean)).toHaveLength(1);
  });

  it("survives an empty top", () => {
    const view = softmaxView([], null, { temperature: 1 });
    expect(view.p).toEqual([]);
    expect(view.entropyBits).toBe(0);
  });
});

describe("pickWithU", () => {
  it("walks the cumulative distribution", () => {
    const view = softmaxView(TOP, TAIL, { temperature: 1 });
    expect(pickWithU(view, 0)).toBe(0);
    expect(pickWithU(view, view.p[0] + 0.01)).toBe(1);
    expect(pickWithU(view, 0.999999)).toBe("tail");
  });

  it("never lands on a cut entry", () => {
    const view = softmaxView(TOP, TAIL, { temperature: 1, topK: 2 });
    for (let u = 0; u < 1; u += 0.01) expect([0, 1]).toContain(pickWithU(view, u));
  });
});

describe("argmaxIndex", () => {
  it("finds the largest logit, not the first entry", () => {
    expect(argmaxIndex(TOP)).toBe(0);
    expect(argmaxIndex([entry(1, 0, "a"), entry(2, 9, "b")])).toBe(1);
  });
});

describe("prng", () => {
  it("is deterministic and in [0, 1)", () => {
    expect(uFor(7, 3)).toBe(uFor(7, 3));
    expect(uFor(7, 3)).not.toBe(uFor(7, 4));
    const r = rng(42);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
