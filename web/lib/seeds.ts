import type { SeedPolicy } from "./runTypes";

export interface SeedNote {
  level: "info" | "warning";
  text: string;
}

export interface SeedPlan {
  seeds: (number | null)[];
  baseSeed: number | null;
  policy: SeedPolicy | "none";
  notes: SeedNote[];
}

/** 31 bits, so it survives JSON and a number input. */
export function randomSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] >>> 1;
}

/**
 * Which seed each repetition gets, and what the UI should say about it.
 *
 * Greedy decoding ignores the seed, so every repetition is identical (a valid
 * demonstration, but worth a warning). A hosted model takes no seed at all.
 */
export function planSeeds(opts: { n: number; seed: number | null; temperature: number; policy: SeedPolicy; hosted: boolean }): SeedPlan {
  const { n, seed, temperature, policy, hosted } = opts;
  if (hosted) {
    return {
      seeds: Array.from({ length: n }, () => null),
      baseSeed: null,
      policy: "none",
      notes: [{ level: "info", text: "hosted: temperature is 1 on the wire and no seed applies; each repetition is a fresh sample" }],
    };
  }
  if (temperature <= 0) {
    return {
      seeds: Array.from({ length: n }, () => seed),
      baseSeed: seed,
      policy: "none",
      notes: n > 1 ? [{ level: "warning", text: "greedy: every repetition will be identical" }] : [],
    };
  }
  const base = seed ?? randomSeed();
  if (policy === "same") {
    return {
      seeds: Array.from({ length: n }, () => base),
      baseSeed: base,
      policy: "same",
      notes: n > 1 ? [{ level: "info", text: `same seed ${base} for all: the repetitions should be identical` }] : [],
    };
  }
  return {
    seeds: Array.from({ length: n }, (_, i) => base + i),
    baseSeed: base,
    policy: "fresh",
    notes: n > 1 ? [{ level: "info", text: `seeds ${base} to ${base + n - 1}` }] : [],
  };
}
