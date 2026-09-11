"use client";

import { useSyncExternalStore } from "react";
import type { Batch, Run } from "./runTypes";
import {
  finishConstrained,
  finishLogprobs,
  foldConstrainedMeta,
  foldConstrainedStep,
  foldLogprobsMeta,
  foldLogprobsStep,
} from "./stats";
import type { GenerateEvent, StreamEvent, StreamTrace, Trace } from "./types";

/** Full traces kept in memory; older runs keep only their summary. */
export const TRACE_LIMIT = 20;
/** Runs remembered across reloads; whole batches drop off the old end. */
export const MAX_PERSISTED_RUNS = 200;

export type RunTrace = Trace | StreamTrace;

export interface RunState {
  batches: Record<string, Batch>;
  /** Newest first. */
  batchOrder: string[];
  runs: Record<string, Run>;
  /** Bounded, never persisted. */
  traces: Record<string, RunTrace>;
  selectedRunId: string | null;
  /** A repeat batch shown as a whole; the selected run, if any, opens under it. */
  selectedBatchId: string | null;
  /** Selection jumps to the run that starts streaming. A hand-picked tab turns it off. */
  followRunning: boolean;
  /** Up to two runs shown side by side. In memory only. */
  pinned: string[];
  /** Batches waiting behind the one in flight (a probe runs one variant after another). */
  queued: number;
  hydrated: boolean;
}

export interface PersistedRuns {
  version: 1;
  batches: Record<string, Batch>;
  batchOrder: string[];
  runs: Record<string, Run>;
}

export type RunAction =
  | { type: "hydrate"; persisted: PersistedRuns | null }
  | { type: "createBatch"; batch: Batch; runs: Run[] }
  | { type: "markRunning"; runId: string; at: number }
  | { type: "ingest"; runId: string; event: GenerateEvent | StreamEvent }
  | { type: "finish"; runId: string; status: "done" | "error" | "cancelled"; error?: string; at: number }
  | { type: "select"; runId: string | null; batchId?: string | null; follow?: boolean }
  | { type: "removeBatch"; batchId: string }
  | { type: "togglePin"; runId: string }
  | { type: "unpinAll" }
  | { type: "queued"; count: number }
  | { type: "clear" };

export const INITIAL: RunState = { batches: {}, batchOrder: [], runs: {}, traces: {}, selectedRunId: null, selectedBatchId: null, followRunning: true, pinned: [], queued: 0, hydrated: false };

const EMPTY_TRACE: Trace = { meta: null, steps: [], done: null, error: null };

function newestRunId(state: Pick<RunState, "batches" | "batchOrder">): string | null {
  for (const id of state.batchOrder) {
    const b = state.batches[id];
    if (b?.runIds.length) return b.runIds[0];
  }
  return null;
}

/** Drop the oldest finished, unselected traces past the limit. */
function evict(state: RunState): RunState {
  const ids = Object.keys(state.traces);
  if (ids.length <= TRACE_LIMIT) return state;
  const candidates = ids
    .filter((id) => id !== state.selectedRunId && state.runs[id]?.status !== "running" && state.runs[id]?.status !== "queued")
    .sort((a, b) => (state.runs[a]?.createdAt ?? 0) - (state.runs[b]?.createdAt ?? 0));
  const traces = { ...state.traces };
  for (const id of candidates) {
    if (Object.keys(traces).length <= TRACE_LIMIT) break;
    delete traces[id];
  }
  return { ...state, traces };
}

function ingest(state: RunState, runId: string, event: GenerateEvent | StreamEvent): RunState {
  const run = state.runs[runId];
  if (!run || run.status !== "running") return state; // late events after a cancel
  const trace = state.traces[runId] ?? EMPTY_TRACE;
  if (run.kind === "constrained") {
    const ev = event as GenerateEvent;
    const t = trace as Trace;
    let next: Trace = t;
    let summary = run.summary;
    if (ev.event === "meta") {
      next = { ...t, meta: ev.data };
      summary = foldConstrainedMeta(summary, ev.data);
    } else if (ev.event === "step") {
      next = { ...t, steps: [...t.steps, ev.data] };
      summary = foldConstrainedStep(summary, ev.data);
    } else if (ev.event === "done") {
      next = { ...t, done: ev.data };
      summary = finishConstrained(summary, ev.data);
    } else if (ev.event === "error") {
      next = { ...t, error: ev.data.detail };
    }
    return { ...state, traces: { ...state.traces, [runId]: next }, runs: { ...state.runs, [runId]: { ...run, summary } } };
  }
  const ev = event as StreamEvent;
  const t = trace as StreamTrace;
  let next: StreamTrace = t;
  let summary = run.summary;
  if (ev.event === "meta") {
    next = { ...t, meta: ev.data };
    summary = foldLogprobsMeta(summary, ev.data);
  } else if (ev.event === "step") {
    next = { ...t, steps: [...t.steps, ev.data] };
    summary = foldLogprobsStep(summary, ev.data, t.meta?.sampling ?? null);
  } else if (ev.event === "done") {
    next = { ...t, done: ev.data };
    summary = finishLogprobs(summary, ev.data);
  } else if (ev.event === "error") {
    next = { ...t, error: ev.data.detail };
  }
  return { ...state, traces: { ...state.traces, [runId]: next }, runs: { ...state.runs, [runId]: { ...run, summary } } };
}

export function reduce(state: RunState, action: RunAction): RunState {
  switch (action.type) {
    case "hydrate": {
      const p = action.persisted;
      if (!p) return { ...state, hydrated: true };
      const runs: Record<string, Run> = {};
      for (const [id, run] of Object.entries(p.runs)) {
        // A reload interrupted whatever was in flight.
        runs[id] = run.status === "queued" || run.status === "running" ? { ...run, status: "cancelled", error: "interrupted by a reload" } : run;
      }
      const next = { ...state, batches: p.batches, batchOrder: p.batchOrder, runs, traces: {}, hydrated: true };
      const newest = next.batches[next.batchOrder[0] ?? ""];
      return { ...next, selectedRunId: newestRunId(next), selectedBatchId: newest && newest.n > 1 ? newest.id : null };
    }
    case "createBatch": {
      const runs = { ...state.runs };
      const traces = { ...state.traces };
      for (const run of action.runs) {
        runs[run.id] = run;
        traces[run.id] = EMPTY_TRACE;
      }
      return evict({
        ...state,
        batches: { ...state.batches, [action.batch.id]: action.batch },
        batchOrder: [action.batch.id, ...state.batchOrder],
        runs,
        traces,
        selectedRunId: action.runs[0]?.id ?? state.selectedRunId,
        selectedBatchId: action.batch.n > 1 ? action.batch.id : null,
        followRunning: true,
      });
    }
    case "markRunning": {
      const run = state.runs[action.runId];
      if (!run) return state;
      return {
        ...state,
        runs: { ...state.runs, [action.runId]: { ...run, status: "running", startedAt: action.at } },
        selectedRunId: state.followRunning ? action.runId : state.selectedRunId,
      };
    }
    case "ingest":
      return ingest(state, action.runId, action.event);
    case "finish": {
      const run = state.runs[action.runId];
      if (!run || run.status === "done" || run.status === "error" || run.status === "cancelled") return state;
      return evict({
        ...state,
        runs: { ...state.runs, [action.runId]: { ...run, status: action.status, error: action.error ?? run.error, finishedAt: action.at } },
      });
    }
    case "select":
      return { ...state, selectedRunId: action.runId, selectedBatchId: action.batchId ?? null, followRunning: action.follow ?? false };
    case "removeBatch": {
      const batch = state.batches[action.batchId];
      if (!batch) return state;
      const batches = { ...state.batches };
      delete batches[action.batchId];
      const runs = { ...state.runs };
      const traces = { ...state.traces };
      for (const id of batch.runIds) {
        delete runs[id];
        delete traces[id];
      }
      const next = {
        ...state,
        batches,
        batchOrder: state.batchOrder.filter((id) => id !== action.batchId),
        runs,
        traces,
        selectedBatchId: state.selectedBatchId === action.batchId ? null : state.selectedBatchId,
        pinned: state.pinned.filter((id) => !batch.runIds.includes(id)),
      };
      const selectedGone = state.selectedRunId !== null && batch.runIds.includes(state.selectedRunId);
      return selectedGone ? { ...next, selectedRunId: newestRunId(next) } : next;
    }
    case "togglePin": {
      if (state.pinned.includes(action.runId)) return { ...state, pinned: state.pinned.filter((id) => id !== action.runId) };
      // Two at most: the older pin makes room.
      return { ...state, pinned: [...state.pinned.slice(-1), action.runId] };
    }
    case "unpinAll":
      return { ...state, pinned: [] };
    case "queued":
      return { ...state, queued: action.count };
    case "clear":
      return { ...INITIAL, hydrated: state.hydrated };
  }
}

// ------------------------------------------------------------- persistence

const KEY = "sol.runs";
const STRUCTURAL = new Set<RunAction["type"]>(["createBatch", "finish", "removeBatch", "clear"]);

export function readPersisted(): PersistedRuns | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedRuns;
    return parsed.version === 1 ? parsed : null;
  } catch {
    return null;
  }
}

/** Summaries only, newest batches first, capped. Traces never leave memory. */
export function toPersisted(state: RunState, maxRuns = MAX_PERSISTED_RUNS): PersistedRuns {
  const batchOrder: string[] = [];
  const batches: Record<string, Batch> = {};
  const runs: Record<string, Run> = {};
  let count = 0;
  for (const id of state.batchOrder) {
    const b = state.batches[id];
    if (!b) continue;
    if (count + b.runIds.length > maxRuns && count > 0) break;
    batchOrder.push(id);
    batches[id] = b;
    for (const rid of b.runIds) {
      const r = state.runs[rid];
      if (r) runs[rid] = r;
    }
    count += b.runIds.length;
  }
  return { version: 1, batches, batchOrder, runs };
}

function writePersisted(state: RunState): void {
  if (!state.hydrated) return;
  let maxRuns = MAX_PERSISTED_RUNS;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(toPersisted(state, maxRuns)));
      return;
    } catch {
      maxRuns = Math.floor(maxRuns / 2); // quota: keep the newer half, then give up
    }
  }
}

// ------------------------------------------------------------- the store

let state: RunState = INITIAL;
const listeners = new Set<() => void>();

export const runStore = {
  getState: () => state,
  dispatch(action: RunAction) {
    state = reduce(state, action);
    if (STRUCTURAL.has(action.type) || action.type === "hydrate") writePersisted(state);
    listeners.forEach((l) => l());
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

/** Selectors must return stored references (or primitives): `useSyncExternalStore` compares snapshots by identity. */
export function useRunState<T>(selector: (s: RunState) => T): T {
  return useSyncExternalStore(
    runStore.subscribe,
    () => selector(runStore.getState()),
    () => selector(INITIAL),
  );
}

export const useRun = (id: string | null) => useRunState((s) => (id ? (s.runs[id] ?? null) : null));
export const useBatch = (id: string | null) => useRunState((s) => (id ? (s.batches[id] ?? null) : null));
export const useTrace = (id: string | null) => useRunState((s) => (id ? (s.traces[id] ?? null) : null));
export const useSelectedRun = () => useRunState((s) => (s.selectedRunId ? (s.runs[s.selectedRunId] ?? null) : null));
export const useSelectedBatch = () => useRunState((s) => (s.selectedBatchId ? (s.batches[s.selectedBatchId] ?? null) : null));
/** The batch with a run in flight, if any. */
export const useActiveBatch = () =>
  useRunState((s) => {
    const run = Object.values(s.runs).find((r) => r.status === "running" || r.status === "queued");
    return run ? (s.batches[run.batchId] ?? null) : null;
  });
export const useRunsRecord = () => useRunState((s) => s.runs);
export const useTracesRecord = () => useRunState((s) => s.traces);
export const useBatchesRecord = () => useRunState((s) => s.batches);
export const useBatchOrder = () => useRunState((s) => s.batchOrder);
export const useHydrated = () => useRunState((s) => s.hydrated);
export const usePinned = () => useRunState((s) => s.pinned);
export const useQueued = () => useRunState((s) => s.queued);

/** A local model serves one run at a time; a hosted one is only network. */
export function localBusy(s: RunState): boolean {
  return Object.values(s.runs).some((r) => (r.status === "running" || r.status === "queued") && (r.kind === "constrained" || r.provider === null));
}
export const useLocalBusy = () => useRunState(localBusy);
