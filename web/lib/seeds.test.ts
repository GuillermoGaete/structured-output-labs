import { describe, expect, it } from "vitest";
import { planSeeds } from "./seeds";

describe("planSeeds", () => {
  it("gives a hosted model no seeds", () => {
    const p = planSeeds({ n: 3, seed: 5, temperature: 0.8, policy: "fresh", hosted: true });
    expect(p.seeds).toEqual([null, null, null]);
    expect(p.policy).toBe("none");
  });

  it("warns that greedy repetitions are identical and keeps the seed as is", () => {
    const p = planSeeds({ n: 3, seed: 7, temperature: 0, policy: "fresh", hosted: false });
    expect(p.seeds).toEqual([7, 7, 7]);
    expect(p.notes[0].level).toBe("warning");
    expect(planSeeds({ n: 1, seed: null, temperature: 0, policy: "fresh", hosted: false }).notes).toEqual([]);
  });

  it("counts up from the base seed, or repeats it", () => {
    expect(planSeeds({ n: 3, seed: 42, temperature: 0.8, policy: "fresh", hosted: false }).seeds).toEqual([42, 43, 44]);
    expect(planSeeds({ n: 3, seed: 42, temperature: 0.8, policy: "same", hosted: false }).seeds).toEqual([42, 42, 42]);
  });

  it("draws a base when none is given and records it", () => {
    const p = planSeeds({ n: 2, seed: null, temperature: 0.8, policy: "same", hosted: false });
    expect(p.baseSeed).not.toBeNull();
    expect(p.seeds).toEqual([p.baseSeed, p.baseSeed]);
  });
});
