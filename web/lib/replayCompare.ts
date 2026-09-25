/** The recorded reply of a trace against a replay: word by word, and field by field when both are JSON. Pure, unit-tested. */

import { canonicalJson, flattenLeaves } from "./batchStats";
import { alignTokens } from "./diff";
import { parseJson } from "./langchainTrace";

/** Words aligned per side; past this the rest counts as different (the alignment is n·m). */
export const MAX_COMPARED_WORDS = 1500;

/** A piece of text: a word, or what separates words (spaces, punctuation, JSON syntax), which is always `same`. */
export interface Piece {
  text: string;
  same: boolean;
}

export interface FieldRow {
  path: string;
  recorded: string | null;
  replay: string | null;
  equal: boolean;
}

export interface Comparison {
  exact: boolean;
  recorded: Piece[];
  replay: Piece[];
  /** 2 · common / (words in both): 1 when the words are the same, in the same order. */
  wordOverlap: number;
  capped: boolean;
  /** Both sides parse as JSON. */
  fields: FieldRow[] | null;
  fieldsEqual: number | null;
  jsonEqual: boolean | null;
}

const normalise = (s: string) => s.trim().replace(/\s+/g, " ");
/** Runs of letters and digits: `{"name":"Ada"}` compares as the words name and Ada. */
const SEPARATOR = /([^\p{L}\p{N}_]+)/u;
const isSeparator = (p: string) => !/[\p{L}\p{N}_]/u.test(p);

function pieces(text: string): string[] {
  return text.split(SEPARATOR).filter((p) => p !== "");
}

function mark(parts: string[], sameWords: boolean[]): Piece[] {
  let w = 0;
  return parts.map((text) => (isSeparator(text) ? { text, same: true } : { text, same: sameWords[w++] ?? false }));
}

/** `recordedValue` / `replayValue`: the parsed JSON when known; otherwise the texts are parsed here. */
export function compareToRecorded(recorded: string, replay: string, recordedValue?: unknown, replayValue?: unknown): Comparison {
  const a = pieces(recorded);
  const b = pieces(replay);
  const wa = a.filter((p) => !isSeparator(p));
  const wb = b.filter((p) => !isSeparator(p));
  const capped = wa.length > MAX_COMPARED_WORDS || wb.length > MAX_COMPARED_WORDS;
  const align = alignTokens(wa.slice(0, MAX_COMPARED_WORDS), wb.slice(0, MAX_COMPARED_WORDS));
  const total = wa.length + wb.length;

  const va = recordedValue !== undefined ? recordedValue : parseJson(recorded);
  const vb = replayValue !== undefined && replayValue !== null ? replayValue : parseJson(replay);
  let fields: FieldRow[] | null = null;
  let fieldsEqual: number | null = null;
  let jsonEqual: boolean | null = null;
  if (va !== undefined && vb !== undefined) {
    const la = flattenLeaves(va);
    const lb = flattenLeaves(vb);
    const ma = new Map(la);
    const mb = new Map(lb);
    const paths = [...new Set([...la.map(([p]) => p), ...lb.map(([p]) => p)])];
    fields = paths.map((path) => {
      const r = ma.has(path) ? canonicalJson(ma.get(path)) : null;
      const p = mb.has(path) ? canonicalJson(mb.get(path)) : null;
      return { path, recorded: r, replay: p, equal: r !== null && r === p };
    });
    fieldsEqual = fields.length ? fields.filter((f) => f.equal).length / fields.length : 1;
    jsonEqual = canonicalJson(va) === canonicalJson(vb);
  }

  return {
    exact: normalise(recorded) === normalise(replay),
    recorded: mark(a, align.a),
    replay: mark(b, align.b),
    wordOverlap: total ? (2 * align.common) / total : 1,
    capped,
    fields,
    fieldsEqual,
    jsonEqual,
  };
}

export interface BatchComparison {
  finished: number;
  exact: number;
  meanWordOverlap: number | null;
  /** Among the runs whose output parsed. */
  jsonEqual: number;
  parsed: number;
  meanFieldsEqual: number | null;
}

/** Every finished run of a batch against the one recorded reply. */
export function batchVsRecorded(replies: { text: string; value?: unknown }[], recorded: string, recordedValue?: unknown): BatchComparison {
  const rows = replies.map((r) => compareToRecorded(recorded, r.text, recordedValue, r.value));
  const withFields = rows.filter((r) => r.fieldsEqual !== null);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
  return {
    finished: rows.length,
    exact: rows.filter((r) => r.exact).length,
    meanWordOverlap: mean(rows.map((r) => r.wordOverlap)),
    jsonEqual: rows.filter((r) => r.jsonEqual).length,
    parsed: withFields.length,
    meanFieldsEqual: mean(withFields.map((r) => r.fieldsEqual as number)),
  };
}
