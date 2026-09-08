/**
 * The sampler's arithmetic, in the browser: softmax with a temperature over the
 * top-k the backend returned plus a histogram of the tail, top-k / top-p cutoffs,
 * entropy, and the inverse-CDF draw. Pure functions, unit-tested.
 */
export interface LogitLike {
  token_id: number;
  logit: number;
  p: number;
  text: string;
  token: string;
}

export interface TailLike {
  n: number;
  counts: number[];
  logit_mean: number[];
}

export interface SoftmaxOptions {
  temperature: number;
  /** 0 or undefined = off */
  topK?: number;
  /** 1 or undefined = off */
  topP?: number;
}

export interface SoftmaxView {
  /** Probability of every top entry under the options, renormalised over what is allowed. */
  p: number[];
  allowed: boolean[];
  /** Index of the first cut entry; "tail" when the cut falls beyond the reported top-k; null when nothing is cut. */
  cutoff: number | "tail" | null;
  tailMass: number;
  tailAllowed: boolean;
  entropyBits: number;
  effectiveChoices: number;
  greedy: boolean;
}

const LN2 = Math.log(2);

export function softmaxView(top: LogitLike[], tail: TailLike | null, opts: SoftmaxOptions): SoftmaxView {
  const n = top.length;
  if (n === 0) return { p: [], allowed: [], cutoff: null, tailMass: 0, tailAllowed: false, entropyBits: 0, effectiveChoices: 1, greedy: opts.temperature <= 0 };
  const T = opts.temperature;
  if (T <= 0) {
    // Greedy is a mask: −∞ on everything but the argmax.
    let best = 0;
    for (let i = 1; i < n; i++) if (top[i].logit > top[best].logit) best = i;
    return {
      p: top.map((_, i) => (i === best ? 1 : 0)),
      allowed: top.map((_, i) => i === best),
      cutoff: n > 1 ? (best === 0 ? 1 : 0) : "tail",
      tailMass: 0,
      tailAllowed: false,
      entropyBits: 0,
      effectiveChoices: 1,
      greedy: true,
    };
  }
  const z = top.map((e) => e.logit / T);
  const tailZ = tail ? tail.logit_mean.map((m) => m / T) : [];
  let max = -Infinity;
  for (const v of z) if (v > max) max = v;
  for (let b = 0; b < tailZ.length; b++) if (tail && tail.counts[b] > 0 && tailZ[b] > max) max = tailZ[b];
  const w = z.map((v) => Math.exp(v - max));
  const tailW = tail ? tailZ.map((v, b) => tail.counts[b] * Math.exp(v - max)) : [];
  const tailTotal = tailW.reduce((a, b) => a + b, 0);
  const total = w.reduce((a, b) => a + b, 0) + tailTotal;
  const pAll = w.map((v) => v / total);
  const tailMassAll = tailTotal / total;

  // Cutoffs are applied on the distribution sorted by probability; `top` is sorted by logit, so by p too.
  const order = pAll.map((_, i) => i).sort((a, b) => pAll[b] - pAll[a]);
  const allowed = new Array<boolean>(n).fill(true);
  let cutoff: number | "tail" | null = null;
  let tailAllowed = true;
  const k = opts.topK && opts.topK > 0 ? opts.topK : Infinity;
  const topP = opts.topP !== undefined && opts.topP < 1 ? opts.topP : Infinity;
  let cumulative = 0;
  let cutRank: number | null = null;
  for (let rank = 0; rank < order.length; rank++) {
    const i = order[rank];
    const cutByK = rank >= k;
    const cutByP = cumulative >= topP; // mass before this entry already reached top-p
    if (cutByK || cutByP) {
      allowed[i] = false;
      if (cutRank === null) cutRank = rank;
    }
    cumulative += pAll[i];
  }
  if (cutRank !== null) {
    cutoff = order[cutRank];
    tailAllowed = false;
  } else if (k <= n + (tail?.n ?? 0) && k !== Infinity) {
    cutoff = "tail"; // the k-th token is somewhere in the tail: we keep the tail as an approximation
  } else if (topP !== Infinity && cumulative < topP) {
    cutoff = "tail";
  }
  if (cutRank !== null) tailAllowed = false;

  const keptTotal = pAll.reduce((acc, v, i) => (allowed[i] ? acc + v : acc), 0) + (tailAllowed ? tailMassAll : 0);
  const p = pAll.map((v, i) => (allowed[i] ? v / keptTotal : 0));
  const tailMass = tailAllowed ? tailMassAll / keptTotal : 0;

  let entropy = 0;
  for (let i = 0; i < n; i++) if (p[i] > 0) entropy -= p[i] * Math.log(p[i]);
  if (tail && tailAllowed && tailMass > 0) {
    for (let b = 0; b < tailW.length; b++) {
      const mb = (tailW[b] / total) / keptTotal;
      if (mb > 0 && tail.counts[b] > 0) {
        const each = mb / tail.counts[b];
        entropy -= mb * Math.log(each);
      }
    }
  }
  const entropyBits = entropy / LN2;
  return { p, allowed, cutoff, tailMass, tailAllowed, entropyBits, effectiveChoices: Math.pow(2, entropyBits), greedy: false };
}

/** Inverse-CDF walk over the allowed entries (in order) and then the tail. */
export function pickWithU(view: SoftmaxView, u: number): number | "tail" {
  let cumulative = 0;
  for (let i = 0; i < view.p.length; i++) {
    if (!view.allowed[i]) continue;
    cumulative += view.p[i];
    if (u < cumulative) return i;
  }
  if (view.tailAllowed && view.tailMass > 0) return "tail";
  // floating point leftovers: the last allowed entry
  for (let i = view.p.length - 1; i >= 0; i--) if (view.allowed[i]) return i;
  return 0;
}

export function argmaxIndex(top: LogitLike[]): number {
  let best = 0;
  for (let i = 1; i < top.length; i++) if (top[i].logit > top[best].logit) best = i;
  return best;
}
