import { describe, expect, it } from "vitest";
import { INITIAL, reduce, toPersisted, TRACE_LIMIT, type RunState } from "./runStore";
import type { Batch, ConstrainedRun } from "./runTypes";
import { emptyConstrainedSummary } from "./stats";
import type { Done, GenerateRequest, Meta, Step } from "./types";

const REQUEST: GenerateRequest = {
  model: "m",
  schema: {},
  prompt: "p",
  mode: "auto",
  max_new_tokens: 10,
  temperature: 0,
  top_k_sampling: 0,
  top_k_report: 20,
  seed: null,
  use_chat_template: true,
};

let counter = 0;
function batchOf(n: number, at = 0): { batch: Batch; runs: ConstrainedRun[] } {
  const id = `b${++counter}`;
  const runs: ConstrainedRun[] = Array.from({ length: n }, (_, i) => ({
    id: `${id}r${i}`,
    batchId: id,
    index: i,
    createdAt: at + i,
    startedAt: null,
    finishedAt: null,
    status: "queued",
    error: null,
    branch: null,
    kind: "constrained",
    request: REQUEST,
    summary: emptyConstrainedSummary(),
  }));
  const batch: Batch = { id, kind: "constrained", createdAt: at, n, runIds: runs.map((r) => r.id), seedPolicy: "none", baseSeed: null, editor: null, label: "t", backendUrl: "" };
  return { batch, runs };
}

const META: Meta = { mode: "fsm", backend: "outlines_core", model_id: "m", regex: null, prompt_token_count: 3, vocab_size: 100, max_new_tokens: 10, temperature: 0, recursive: false };
const STEP: Step = {
  i: 0,
  token_id: 7,
  token: "a",
  text: "a",
  partial_text: "a",
  n_allowed: 1,
  vocab_size: 100,
  mass_removed: 0.1,
  top_original: [],
  top_forced: [],
  fsm_state: 0,
  stack_depth: 1,
  was_overridden: true,
  p_original: 0.5,
  p_forced: 1,
};
const DONE: Done = { text: "a", parsed: null, valid: false, validation_error: "x", n_steps: 1, elapsed_s: 0.1, stopped_by: "eos", tokens: [] };

describe("reduce", () => {
  it("queues a batch and selects its first run", () => {
    const { batch, runs } = batchOf(3);
    const s = reduce(INITIAL, { type: "createBatch", batch, runs });
    expect(s.batchOrder).toEqual([batch.id]);
    expect(Object.values(s.runs).every((r) => r.status === "queued")).toBe(true);
    expect(s.selectedRunId).toBe(runs[0].id);
    expect(s.traces[runs[0].id]?.steps).toEqual([]);
  });

  it("folds events into the trace and the summary, and ignores events after finish", () => {
    const { batch, runs } = batchOf(1);
    let s = reduce(INITIAL, { type: "createBatch", batch, runs });
    const id = runs[0].id;
    s = reduce(s, { type: "markRunning", runId: id, at: 1 });
    s = reduce(s, { type: "ingest", runId: id, event: { event: "meta", data: META } });
    s = reduce(s, { type: "ingest", runId: id, event: { event: "step", data: STEP } });
    s = reduce(s, { type: "ingest", runId: id, event: { event: "done", data: DONE } });
    expect(s.traces[id]?.steps.length).toBe(1);
    const run = s.runs[id] as ConstrainedRun;
    expect(run.summary.modelId).toBe("m");
    expect(run.summary.tokenIds).toEqual([7]);
    expect(run.summary.overridden).toEqual([true]);
    expect(run.summary.valid).toBe(false);
    s = reduce(s, { type: "finish", runId: id, status: "done", at: 2 });
    expect(s.runs[id].status).toBe("done");
    const after = reduce(s, { type: "ingest", runId: id, event: { event: "step", data: STEP } });
    expect(after.traces[id]?.steps.length).toBe(1);
    // finishing twice keeps the first verdict
    expect(reduce(s, { type: "finish", runId: id, status: "cancelled", at: 3 }).runs[id].status).toBe("done");
  });

  it("follows the running run only until a tab is picked by hand", () => {
    const { batch, runs } = batchOf(2);
    let s = reduce(INITIAL, { type: "createBatch", batch, runs });
    s = reduce(s, { type: "markRunning", runId: runs[1].id, at: 1 });
    expect(s.selectedRunId).toBe(runs[1].id);
    s = reduce(s, { type: "select", runId: runs[0].id });
    s = reduce(s, { type: "markRunning", runId: runs[1].id, at: 2 });
    expect(s.selectedRunId).toBe(runs[0].id);
  });

  it("evicts the oldest finished traces past the limit, never an in-flight one", () => {
    let s: RunState = INITIAL;
    const all: string[] = [];
    for (let k = 0; k < TRACE_LIMIT; k++) {
      const { batch, runs } = batchOf(1, k * 10);
      s = reduce(s, { type: "createBatch", batch, runs });
      all.push(runs[0].id);
      s = reduce(s, { type: "markRunning", runId: runs[0].id, at: k });
      s = reduce(s, { type: "finish", runId: runs[0].id, status: "done", at: k });
    }
    expect(Object.keys(s.traces).length).toBe(TRACE_LIMIT);
    // a new batch of three: three traces must go, the oldest finished ones
    const { batch, runs } = batchOf(3, 999);
    s = reduce(s, { type: "createBatch", batch, runs });
    expect(Object.keys(s.traces).length).toBe(TRACE_LIMIT);
    expect(runs.every((r) => s.traces[r.id])).toBe(true); // queued, i.e. in flight
    expect(all.slice(0, 3).every((id) => s.traces[id] === undefined)).toBe(true);
    expect(s.traces[all[3]]).toBeDefined();
    // the selected run keeps its trace through a finish-time eviction
    s = reduce(s, { type: "select", runId: all[3] });
    s = reduce(s, { type: "markRunning", runId: runs[0].id, at: 1 });
    s = reduce(s, { type: "finish", runId: runs[0].id, status: "done", at: 2 });
    expect(s.traces[all[3]]).toBeDefined();
  });

  it("hydrates with in-flight runs cancelled and no traces, selecting the newest", () => {
    const { batch, runs } = batchOf(2);
    const running = { ...runs[1], status: "running" as const };
    const s = reduce(INITIAL, {
      type: "hydrate",
      persisted: { version: 1, batches: { [batch.id]: batch }, batchOrder: [batch.id], runs: { [runs[0].id]: runs[0], [running.id]: running } },
    });
    expect(s.hydrated).toBe(true);
    expect(s.runs[running.id].status).toBe("cancelled");
    expect(s.runs[runs[0].id].status).toBe("cancelled"); // queued too
    expect(s.traces).toEqual({});
    expect(s.selectedRunId).toBe(runs[0].id);
  });

  it("removes a batch with its runs and traces and reselects", () => {
    const a = batchOf(1, 0);
    const b = batchOf(1, 10);
    let s = reduce(INITIAL, { type: "createBatch", batch: a.batch, runs: a.runs });
    s = reduce(s, { type: "createBatch", batch: b.batch, runs: b.runs });
    s = reduce(s, { type: "removeBatch", batchId: b.batch.id });
    expect(s.batchOrder).toEqual([a.batch.id]);
    expect(s.runs[b.runs[0].id]).toBeUndefined();
    expect(s.traces[b.runs[0].id]).toBeUndefined();
    expect(s.selectedRunId).toBe(a.runs[0].id);
  });

  it("persists summaries only, newest batches first, within the cap", () => {
    const a = batchOf(3, 0);
    const b = batchOf(3, 10);
    let s = reduce(INITIAL, { type: "createBatch", batch: a.batch, runs: a.runs });
    s = reduce(s, { type: "createBatch", batch: b.batch, runs: b.runs });
    const p = toPersisted(s, 4);
    expect(p.batchOrder).toEqual([b.batch.id]);
    expect(Object.keys(p.runs).length).toBe(3);
    expect("traces" in p).toBe(false);
  });
});

describe("pins", () => {
  it("keeps at most two runs pinned, the newest two, and drops pins with their batch", () => {
    const a = batchOf(1, 0);
    const b = batchOf(1, 10);
    const c = batchOf(1, 20);
    let s = reduce(INITIAL, { type: "createBatch", batch: a.batch, runs: a.runs });
    s = reduce(s, { type: "createBatch", batch: b.batch, runs: b.runs });
    s = reduce(s, { type: "createBatch", batch: c.batch, runs: c.runs });
    s = reduce(s, { type: "togglePin", runId: a.runs[0].id });
    s = reduce(s, { type: "togglePin", runId: b.runs[0].id });
    expect(s.pinned).toEqual([a.runs[0].id, b.runs[0].id]);
    s = reduce(s, { type: "togglePin", runId: c.runs[0].id });
    expect(s.pinned).toEqual([b.runs[0].id, c.runs[0].id]);
    s = reduce(s, { type: "togglePin", runId: c.runs[0].id });
    expect(s.pinned).toEqual([b.runs[0].id]);
    s = reduce(s, { type: "removeBatch", batchId: b.batch.id });
    expect(s.pinned).toEqual([]);
  });
});
