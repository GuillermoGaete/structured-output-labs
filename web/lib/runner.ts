"use client";

import { generate, streamLogprobs } from "./api";
import { providerOf } from "./providers";
import { runStore } from "./runStore";
import type { Batch, Branch, EditorSnapshot, Run, RunKind, SeedPolicy } from "./runTypes";
import { planSeeds, randomSeed, type SeedNote } from "./seeds";
import { emptyConstrainedSummary, emptyLogprobsSummary } from "./stats";
import type { GenerateEvent, GenerateRequest, StreamEvent, StreamRequest } from "./types";

export const MAX_BATCH_N = 50;
/** Hosted runs are only network, so a few can go at once. */
export const HOSTED_CONCURRENCY = 3;

export interface BatchPlan {
  kind: RunKind;
  backendUrl: string;
  n: number;
  seedPolicy: SeedPolicy;
  /** The base request; the seed is overwritten per run. */
  request: GenerateRequest | StreamRequest;
  editor?: EditorSnapshot | null;
  /** Lives in this closure only; never stored. */
  providerKey?: string;
  branch?: Branch | null;
  label: string;
  probe?: Batch["probe"];
}

const controllers = new Map<string, AbortController>();
const cancelledBatches = new Set<string>();

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isHosted(kind: RunKind, request: GenerateRequest | StreamRequest): boolean {
  return kind === "logprobs" && !!providerOf(request.model ?? "");
}

async function runOne(run: Run, backendUrl: string, providerKey?: string): Promise<"done" | "error" | "cancelled"> {
  const controller = new AbortController();
  controllers.set(run.id, controller);
  runStore.dispatch({ type: "markRunning", runId: run.id, at: Date.now() });
  let status: "done" | "error" | "cancelled" = "done";
  let error: string | undefined;
  try {
    const onEvent = (event: GenerateEvent | StreamEvent) => runStore.dispatch({ type: "ingest", runId: run.id, event });
    if (run.kind === "constrained") await generate(backendUrl, run.request, onEvent, controller.signal);
    else await streamLogprobs(backendUrl, run.request, onEvent, controller.signal, providerKey);
    const trace = runStore.getState().traces[run.id];
    if (trace?.error) {
      status = "error";
      error = trace.error;
    } else if (!trace?.done) {
      status = controller.signal.aborted ? "cancelled" : "error";
      error = controller.signal.aborted ? undefined : "the stream ended before done";
    }
  } catch (e) {
    if (controller.signal.aborted) status = "cancelled";
    else {
      status = "error";
      error = e instanceof Error ? e.message : String(e);
    }
  } finally {
    controllers.delete(run.id);
    runStore.dispatch({ type: "finish", runId: run.id, status, error, at: Date.now() });
  }
  return status;
}

export interface Started {
  batchId: string;
  runIds: string[];
  notes: SeedNote[];
  done: Promise<void>;
}

/** Queue n runs of one request. Returns null when a local batch is already in flight in this tab. */
export function startBatch(plan: BatchPlan): Started | null {
  const hosted = isHosted(plan.kind, plan.request);
  const state = runStore.getState();
  if (!hosted && Object.values(state.runs).some((r) => (r.status === "running" || r.status === "queued") && (r.kind === "constrained" || r.provider === null))) {
    return null;
  }
  const n = Math.max(1, Math.min(plan.n, MAX_BATCH_N));
  const seeds = planSeeds({ n, seed: plan.request.seed ?? null, temperature: plan.request.temperature, policy: plan.seedPolicy, hosted });
  const batchId = newId();
  const now = Date.now();
  const runs: Run[] = seeds.seeds.map((seed, index) => {
    const base = { id: newId(), batchId, index, createdAt: now + index, startedAt: null, finishedAt: null, status: "queued" as const, error: null, branch: plan.branch ?? null };
    if (plan.kind === "constrained") {
      return { ...base, kind: "constrained", request: { ...(plan.request as GenerateRequest), seed }, summary: emptyConstrainedSummary() };
    }
    const request = { ...(plan.request as StreamRequest), seed };
    return { ...base, kind: "logprobs", request, provider: providerOf(request.model ?? "") || null, summary: emptyLogprobsSummary() };
  });
  const batch: Batch = {
    id: batchId,
    kind: plan.kind,
    createdAt: now,
    n,
    runIds: runs.map((r) => r.id),
    seedPolicy: seeds.policy,
    baseSeed: seeds.baseSeed,
    editor: plan.editor ?? null,
    label: n > 1 ? `${plan.label} · ×${n}` : plan.label,
    backendUrl: plan.backendUrl,
    probe: plan.probe ?? null,
  };
  runStore.dispatch({ type: "createBatch", batch, runs });

  const queue = [...runs];
  let consecutiveErrors = 0;
  const worker = async () => {
    while (queue.length && !cancelledBatches.has(batchId)) {
      const run = queue.shift()!;
      if (runStore.getState().runs[run.id]?.status !== "queued") continue; // cancelled while waiting
      const status = await runOne(run, plan.backendUrl, plan.providerKey);
      if (status === "error") {
        if (++consecutiveErrors >= 2) cancelBatch(batchId);
      } else {
        consecutiveErrors = 0;
      }
    }
  };
  const workers = Array.from({ length: Math.min(hosted ? HOSTED_CONCURRENCY : 1, n) }, worker);
  const done = Promise.all(workers).then(() => {
    cancelledBatches.delete(batchId);
  });
  return { batchId, runIds: batch.runIds, notes: seeds.notes, done };
}

export function cancelRun(runId: string): void {
  const run = runStore.getState().runs[runId];
  if (!run) return;
  if (run.status === "queued") runStore.dispatch({ type: "finish", runId, status: "cancelled", at: Date.now() });
  else if (run.status === "running") controllers.get(runId)?.abort();
}

export function cancelBatch(batchId: string): void {
  const state = runStore.getState();
  const batch = state.batches[batchId];
  if (!batch) return;
  cancelledBatches.add(batchId);
  for (const id of batch.runIds) cancelRun(id);
}

/** The same request again, with its own seed or a fresh one. */
export function rerun(run: Run, batch: Batch, seed: "same" | "new", backendUrl: string, providerKey?: string): Started | null {
  const request = { ...run.request, seed: seed === "same" ? run.request.seed : randomSeed() };
  return startBatch({
    kind: run.kind,
    backendUrl,
    n: 1,
    seedPolicy: "same",
    request,
    editor: batch.editor,
    providerKey,
    branch: run.branch,
    label: batch.label.replace(/ · ×\d+$/, ""),
  });
}

export interface BranchOptions {
  /** More than one branch from the same prefix, each with its own seed: a batch, not a run. */
  n?: number;
  /** Written as the first new token; must be allowed by the constraint at that step. */
  forcedTokenId?: number | null;
  /** Continue a constrained run in the logprobs mode, without its mask. */
  unmasked?: boolean;
  seed?: number | null;
  temperature?: number;
  backendUrl: string;
  providerKey?: string;
  label: string;
}

/** A new run that starts from `parent`'s first `atStep` tokens. */
export function branchFrom(parent: Run, parentBatch: Batch, atStep: number, opts: BranchOptions): Started | null {
  const prefix = parent.summary.tokenIds.slice(0, atStep);
  const forced = opts.forcedTokenId ?? null;
  if (forced !== null) prefix.push(forced);
  const branch: Branch = { parentRunId: parent.id, atStep, forcedTokenId: forced, unmasked: !!opts.unmasked };
  const n = Math.max(1, Math.min(opts.n ?? 1, MAX_BATCH_N));
  // One branch keeps an explicit seed; N branches let `planSeeds` draw a base and step it, one seed each.
  const seed = n > 1 ? (opts.seed ?? null) : opts.seed === undefined ? randomSeed() : opts.seed;
  const seedPolicy = n > 1 ? "fresh" : "same";
  const label = n > 1 ? `${opts.label} · ×${n}` : opts.label;
  if (parent.kind === "constrained" && opts.unmasked) {
    const request: StreamRequest = {
      model: parent.request.model,
      prompt: parent.request.prompt,
      max_new_tokens: Math.max(parent.request.max_new_tokens, prefix.length + 8),
      temperature: opts.temperature ?? parent.request.temperature,
      top_k: parent.request.top_k_sampling,
      top_p: 1,
      seed,
      use_chat_template: parent.request.use_chat_template,
      top_k_report: 12,
      tail_bins: 48,
      prefix_token_ids: prefix,
      json_system_prompt: true,
    };
    return startBatch({ kind: "logprobs", backendUrl: opts.backendUrl, n, seedPolicy, request, editor: parentBatch.editor, branch, label });
  }
  const request = {
    ...parent.request,
    seed,
    temperature: opts.temperature ?? parent.request.temperature,
    max_new_tokens: Math.max(parent.request.max_new_tokens, prefix.length + 8),
    prefix_token_ids: prefix,
  };
  return startBatch({
    kind: parent.kind,
    backendUrl: opts.backendUrl,
    n,
    seedPolicy,
    request,
    editor: parentBatch.editor,
    providerKey: opts.providerKey,
    branch,
    label,
  });
}

// ------------------------------------------------------------- a queue of batches

let pending: BatchPlan[] = [];
let draining = false;

/** Run several batches one after another: a probe, one variant at a time. Hosted plans still start at once. */
export function queueBatches(plans: BatchPlan[]): void {
  pending.push(...plans);
  runStore.dispatch({ type: "queued", count: pending.length });
  if (!draining) void drain();
}

async function drain(): Promise<void> {
  draining = true;
  try {
    while (pending.length) {
      const plan = pending.shift()!;
      runStore.dispatch({ type: "queued", count: pending.length });
      const started = startBatch(plan);
      if (!started) {
        // A local run is already in flight: wait for it, then try this plan again.
        await new Promise<void>((resolve) => {
          const unsubscribe = runStore.subscribe(() => {
            if (!Object.values(runStore.getState().runs).some((r) => r.status === "running" || r.status === "queued")) {
              unsubscribe();
              resolve();
            }
          });
        });
        pending.unshift(plan);
        continue;
      }
      await started.done;
    }
  } finally {
    draining = false;
    runStore.dispatch({ type: "queued", count: 0 });
  }
}

/** Drop what has not started yet and stop what has. */
export function cancelQueue(): void {
  pending = [];
  runStore.dispatch({ type: "queued", count: 0 });
  const state = runStore.getState();
  for (const run of Object.values(state.runs)) {
    if (run.status === "running" || run.status === "queued") cancelBatch(run.batchId);
  }
}
