/** Small deterministic PRNG so a visible die roll is reproducible (and shareable by seed). */

function splitmix32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x9e3779b9) >>> 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t = t ^ (t >>> 15);
    t = Math.imul(t, 0x735a2d97);
    t = t ^ (t >>> 15);
    return (t >>> 0) / 4294967296;
  };
}

/** A generator of numbers in [0, 1) for `seed`. */
export function rng(seed: number): () => number {
  return splitmix32(seed);
}

/** One number in [0, 1) that depends only on (seed, step): scrubbing back and re-rolling gives the same draw. */
export function uFor(seed: number, step: number): number {
  return splitmix32((seed * 1000003 + step * 7919) >>> 0)();
}
