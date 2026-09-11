/**
 * What N runs of one request say together: validity, distinct outputs, agreement
 * per JSON field, where the token sequences part ways, and the spread of the
 * per-run numbers. Pure functions over run summaries, unit-tested.
 */

import type { ConstrainedRun, LogprobsRun } from "./runTypes";

export interface Dist {
  n: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  /** Sample standard deviation; 0 below two values. */
  sd: number;
}

export function distribution(xs: number[]): Dist {
  const n = xs.length;
  if (!n) return { n: 0, min: 0, max: 0, mean: 0, median: 0, sd: 0 };
  const sorted = [...xs].sort((a, b) => a - b);
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const sd = n < 2 ? 0 : Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / (n - 1));
  return { n, min: sorted[0], max: sorted[n - 1], mean, median, sd };
}

export function entropyBits(counts: number[]): number {
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total) return 0;
  const h = -counts.reduce((a, c) => (c > 0 ? a + (c / total) * Math.log2(c / total) : a), 0);
  return h || 0; // never -0
}

/** Keys sorted, no whitespace: key order never splits a group. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export interface Group<T> {
  key: string;
  sample: T;
  count: number;
  runIds: string[];
}

/** Groups by `keyOf`, most frequent first, ties in order of first appearance. */
export function groupBy<T>(items: { runId: string; value: T }[], keyOf: (v: T) => string): Group<T>[] {
  const groups = new Map<string, Group<T>>();
  for (const it of items) {
    const key = keyOf(it.value);
    const g = groups.get(key);
    if (g) {
      g.count++;
      g.runIds.push(it.runId);
    } else groups.set(key, { key, sample: it.value, count: 1, runIds: [it.runId] });
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

export interface Divergence {
  /** First position where the sequences differ; null when they are all the same. */
  firstDivergence: number | null;
  /** Distinct values at each position; a sequence that ended counts as its own value. */
  perPosition: number[];
  identical: boolean;
}

export function divergence(seqs: (string | number)[][]): Divergence {
  if (seqs.length < 2) return { firstDivergence: null, perPosition: [], identical: true };
  const len = Math.max(...seqs.map((s) => s.length));
  const perPosition: number[] = [];
  let first: number | null = null;
  for (let i = 0; i < len; i++) {
    const distinct = new Set(seqs.map((s) => (i < s.length ? String(s[i]) : " end"))).size;
    perPosition.push(distinct);
    if (first === null && distinct > 1) first = i;
  }
  return { firstDivergence: first, perPosition, identical: first === null };
}

/** The same divergence with its first position counted from the start of the run, not of the slice. */
function shift(d: Divergence, by: number): Divergence {
  return by && d.firstDivergence !== null ? { ...d, firstDivergence: d.firstDivergence + by } : d;
}

export interface PrefixNode {
  token: string;
  count: number;
  children: PrefixNode[];
}

/** Shared prefixes folded into one tree; each branch carries how many runs took it. */
export function prefixTree(seqs: string[][], depth = 12): PrefixNode {
  const root: PrefixNode = { token: "", count: seqs.length, children: [] };
  for (const seq of seqs) {
    let node = root;
    for (const tok of seq.slice(0, depth)) {
      let child = node.children.find((c) => c.token === tok);
      if (!child) {
        child = { token: tok, count: 0, children: [] };
        node.children.push(child);
      }
      child.count++;
      node = child;
    }
  }
  const sortRec = (n: PrefixNode) => {
    n.children.sort((a, b) => b.count - a.count);
    n.children.forEach(sortRec);
  };
  sortRec(root);
  return root;
}

/** `a.b`, `a[0].c`, plus `a.length` for every array. Empty objects and arrays are leaves. */
export function flattenLeaves(value: unknown, limit = 200): [string, unknown][] {
  const out: [string, unknown][] = [];
  const walk = (v: unknown, path: string) => {
    if (out.length >= limit) return;
    if (Array.isArray(v)) {
      out.push([path ? `${path}.length` : "length", v.length]);
      v.forEach((item, i) => walk(item, `${path}[${i}]`));
      return;
    }
    if (v && typeof v === "object") {
      const entries = Object.entries(v as Record<string, unknown>);
      if (!entries.length) {
        out.push([path || "$", v]);
        return;
      }
      for (const [k, item] of entries) walk(item, path ? `${path}.${k}` : k);
      return;
    }
    out.push([path || "$", v]);
  };
  walk(value, "");
  return out;
}

export interface FieldStat {
  path: string;
  /** Runs that have this path. */
  n: number;
  values: Group<unknown>[];
  /** Share of runs on the most common value. */
  agreement: number;
  entropyBits: number;
}

/** Per JSON path, how the valid runs agree. Paths in order of first appearance. */
export function fieldStats(rows: { runId: string; parsed: unknown }[]): FieldStat[] {
  const byPath = new Map<string, { runId: string; value: unknown }[]>();
  for (const row of rows) {
    for (const [path, leaf] of flattenLeaves(row.parsed)) {
      if (!byPath.has(path)) byPath.set(path, []);
      byPath.get(path)!.push({ runId: row.runId, value: leaf });
    }
  }
  return [...byPath.entries()].map(([path, items]) => {
    const values = groupBy(items, canonicalJson);
    return { path, n: items.length, values, agreement: values[0] ? values[0].count / items.length : 0, entropyBits: entropyBits(values.map((g) => g.count)) };
  });
}

/** Chance that at least one of k tries passes, and that all k do, at pass rate p. */
export function passAtK(p: number, k: number): number {
  return 1 - (1 - p) ** k;
}
export function passPowK(p: number, k: number): number {
  return p ** k;
}

function meanByPosition(rows: number[][]): number[] {
  const len = Math.max(0, ...rows.map((r) => r.length));
  const out: number[] = [];
  for (let i = 0; i < len; i++) {
    const at = rows.filter((r) => i < r.length).map((r) => r[i]);
    out.push(at.reduce((a, b) => a + b, 0) / at.length);
  }
  return out;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export interface ConstrainedBatchStats {
  n: number;
  nDone: number;
  nValid: number;
  validPct: number;
  passAtK: number;
  passPowK: number;
  outputs: Group<string>[];
  outputEntropyBits: number;
  fields: FieldStat[];
  divergence: Divergence;
  nSteps: Dist;
  elapsedS: Dist;
  overridden: Dist;
  meanMassRemoved: Dist;
  meanVocabKept: Dist;
  sumLogPForced: Dist;
  massRemovedByPosition: number[];
  overriddenRateByPosition: number[];
  stoppedBy: Record<string, number>;
}

export interface BatchStatsOptions {
  /** Skip the first `from` tokens of every run when comparing sequences: the shared prefix of a branch. */
  from?: number;
}

/**
 * Only finished runs enter the averages; cancelled and failed ones are listed, not counted.
 * With `from`, divergence is measured after the shared prefix and `firstDivergence` stays an absolute position.
 */
export function constrainedBatchStats(runs: ConstrainedRun[], opts: BatchStatsOptions = {}): ConstrainedBatchStats {
  const from = Math.max(0, opts.from ?? 0);
  const done = runs.filter((r) => r.status === "done");
  const nValid = done.filter((r) => r.summary.valid).length;
  const validPct = done.length ? nValid / done.length : 0;
  const outputs = groupBy(
    done.map((r) => ({ runId: r.id, value: r.summary.valid ? canonicalJson(r.summary.parsed) : ` invalid:${r.summary.text ?? ""}` })),
    (v) => v,
  ).map((g) => ({ ...g, sample: done.find((r) => r.id === g.runIds[0])?.summary.text ?? g.sample }));
  const stoppedBy: Record<string, number> = {};
  for (const r of done) {
    const k = r.summary.stoppedBy ?? "?";
    stoppedBy[k] = (stoppedBy[k] ?? 0) + 1;
  }
  return {
    n: runs.length,
    nDone: done.length,
    nValid,
    validPct,
    passAtK: passAtK(validPct, runs.length),
    passPowK: passPowK(validPct, runs.length),
    outputs,
    outputEntropyBits: entropyBits(outputs.map((g) => g.count)),
    fields: fieldStats(done.filter((r) => r.summary.valid).map((r) => ({ runId: r.id, parsed: r.summary.parsed }))),
    divergence: shift(divergence(done.map((r) => r.summary.tokenIds.slice(from))), from),
    nSteps: distribution(done.map((r) => r.summary.tokenIds.length)),
    elapsedS: distribution(done.map((r) => r.summary.elapsedS ?? 0)),
    overridden: distribution(done.map((r) => r.summary.overridden.filter(Boolean).length)),
    meanMassRemoved: distribution(done.map((r) => mean(r.summary.massRemoved))),
    meanVocabKept: distribution(done.map((r) => mean(r.summary.vocabKept))),
    sumLogPForced: distribution(done.map((r) => sum(r.summary.logPForced))),
    massRemovedByPosition: meanByPosition(done.map((r) => r.summary.massRemoved)),
    overriddenRateByPosition: meanByPosition(done.map((r) => r.summary.overridden.map((b) => (b ? 1 : 0)))),
    stoppedBy,
  };
}

export interface LogprobsBatchStats {
  n: number;
  nDone: number;
  completions: Group<string>[];
  outputEntropyBits: number;
  divergence: Divergence;
  entropyByPosition: number[];
  meanEntropyRawBits: Dist;
  meanEntropyViewBits: Dist;
  sumLogP: Dist;
  tailPicks: Dist;
  nSteps: Dist;
  elapsedS: Dist;
  tokensPerS: Dist;
  meanForwardMs: Dist;
}

export function logprobsBatchStats(runs: LogprobsRun[]): LogprobsBatchStats {
  const done = runs.filter((r) => r.status === "done");
  const completions = groupBy(
    done.map((r) => ({ runId: r.id, value: r.summary.text ?? "" })),
    (v) => v,
  );
  return {
    n: runs.length,
    nDone: done.length,
    completions,
    outputEntropyBits: entropyBits(completions.map((g) => g.count)),
    divergence: divergence(done.map((r) => r.summary.tokens)),
    entropyByPosition: meanByPosition(done.map((r) => r.summary.entropyRawBits)),
    meanEntropyRawBits: distribution(done.map((r) => mean(r.summary.entropyRawBits))),
    meanEntropyViewBits: distribution(done.map((r) => mean(r.summary.entropyViewBits))),
    sumLogP: distribution(done.map((r) => sum(r.summary.logP))),
    tailPicks: distribution(done.map((r) => r.summary.chosenRank.filter((x) => x === null).length)),
    nSteps: distribution(done.map((r) => r.summary.tokens.length)),
    elapsedS: distribution(done.map((r) => r.summary.elapsedS ?? 0)),
    tokensPerS: distribution(done.map((r) => r.summary.tokensPerS ?? 0)),
    meanForwardMs: distribution(done.map((r) => mean(r.summary.forwardMs))),
  };
}
