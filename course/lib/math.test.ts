import { describe, expect, it } from "vitest";
import fixture from "@/modules/temperature/fixtures/person-chat.json";
import { pickWithU, softmaxView, type LogitLike, type TailLike } from "./math";
import { rng, uFor } from "./prng";

const response = (fixture as { response: { top: LogitLike[]; tail: TailLike } }).response;
const top = response.top;
const tail = response.tail;

describe("softmaxView", () => {
  it("reproduces the backend probabilities at T = 1 (top-k exact, tail approximated)", () => {
    const view = softmaxView(top, tail, { temperature: 1 });
    for (let i = 0; i < 20; i++) expect(Math.abs(view.p[i] - top[i].p)).toBeLessThan(1e-3);
    expect(view.cutoff).toBeNull();
    expect(view.tailAllowed).toBe(true);
    expect(view.p.reduce((a, b) => a + b, 0) + view.tailMass).toBeCloseTo(1, 6);
  });
  it("is one-hot on the argmax when greedy", () => {
    const view = softmaxView(top, tail, { temperature: 0 });
    expect(view.greedy).toBe(true);
    expect(view.p[0]).toBe(1);
    expect(view.allowed.filter(Boolean)).toHaveLength(1);
    expect(view.entropyBits).toBe(0);
  });
  it("flattens with a higher temperature and sharpens with a lower one", () => {
    const flat = softmaxView(top, tail, { temperature: 2 });
    const sharp = softmaxView(top, tail, { temperature: 0.3 });
    expect(flat.p[0]).toBeLessThan(top[0].p);
    expect(sharp.p[0]).toBeGreaterThan(top[0].p);
    expect(flat.entropyBits).toBeGreaterThan(sharp.entropyBits);
  });
  it("top-k keeps exactly k entries and cuts the tail", () => {
    const view = softmaxView(top, tail, { temperature: 1, topK: 3 });
    expect(view.allowed.filter(Boolean)).toHaveLength(3);
    expect(view.cutoff).toBe(3);
    expect(view.tailAllowed).toBe(false);
    expect(view.p.slice(0, 3).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });
  it("top-p always keeps the first entry and cuts once the mass before an entry reaches p", () => {
    const view = softmaxView(top, tail, { temperature: 1, topP: 0.8 });
    expect(view.allowed[0]).toBe(true);
    expect(view.allowed[1]).toBe(true); // 0.685 < 0.8 before the second entry
    expect(view.allowed[2]).toBe(false); // 0.914 ≥ 0.8
    expect(view.cutoff).toBe(2);
    const tiny = softmaxView(top, tail, { temperature: 1, topP: 1e-6 });
    expect(tiny.allowed.filter(Boolean)).toHaveLength(1);
  });
});

describe("pickWithU", () => {
  it("walks the cumulative distribution", () => {
    const view = softmaxView(top, tail, { temperature: 1 });
    expect(pickWithU(view, 0)).toBe(0);
    expect(pickWithU(view, view.p[0] + 0.01)).toBe(1);
    expect(pickWithU(view, 0.999999)).toBe("tail");
  });
  it("never lands on a cut entry", () => {
    const view = softmaxView(top, tail, { temperature: 1, topK: 2 });
    for (let u = 0; u < 1; u += 0.01) expect([0, 1]).toContain(pickWithU(view, u));
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
