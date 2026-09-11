import type { SourceKind } from "./labState";
import type { Done, GenerateRequest, Mode, StreamDone, StreamRequest } from "./types";

export type RunKind = "constrained" | "logprobs";
export type RunStatus = "queued" | "running" | "done" | "error" | "cancelled";
export type SeedPolicy = "same" | "fresh";

/** What the constrained editor showed; restores it for "Duplicate & edit". One per batch. */
export interface EditorSnapshot {
  presetId: string;
  sourceKind: SourceKind;
  pydanticText: string;
  pydanticModel: string | null;
  schemaText: string;
}

/** A run that started from another run's prefix. */
export interface Branch {
  parentRunId: string;
  /** Steps taken from the parent, before the first new token. */
  atStep: number;
  /** A token pressed in the parent's bars, written as the first new token. */
  forcedTokenId: number | null;
  /** A constrained parent continued without the mask, in the logprobs mode. */
  unmasked: boolean;
}

interface RunBase {
  id: string;
  batchId: string;
  /** 0..n-1 in its batch. */
  index: number;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  status: RunStatus;
  error: string | null;
  branch: Branch | null;
}

/** Folded per step so a cancelled run has an exact summary too. Arrays are per step. */
export interface ConstrainedSummary {
  finished: boolean;
  modelId: string | null;
  mode: Mode | null;
  backend: string | null;
  promptTokenCount: number | null;
  tokenIds: number[];
  tokens: string[];
  massRemoved: number[];
  vocabKept: number[];
  overridden: boolean[];
  logPForced: number[];
  maxStackDepth: number;
  text: string | null;
  parsed: unknown;
  valid: boolean | null;
  validationError: string | null;
  stoppedBy: Done["stopped_by"] | null;
  elapsedS: number | null;
}

export interface LogprobsSummary {
  finished: boolean;
  modelId: string | null;
  provider: string | null;
  promptTokenCount: number | null;
  tokenIds: number[];
  tokens: string[];
  entropyRawBits: number[];
  entropyViewBits: number[];
  logP: number[];
  chosenRank: (number | null)[];
  forwardMs: number[];
  text: string | null;
  stopReason: StreamDone["stop_reason"] | null;
  elapsedS: number | null;
  tokensPerS: number | null;
}

export interface ConstrainedRun extends RunBase {
  kind: "constrained";
  /** The exact wire request, seed included. */
  request: GenerateRequest;
  summary: ConstrainedSummary;
}

export interface LogprobsRun extends RunBase {
  kind: "logprobs";
  request: StreamRequest;
  /** Set for a hosted model. The key is never stored. */
  provider: string | null;
  summary: LogprobsSummary;
}

export type Run = ConstrainedRun | LogprobsRun;

export interface Batch {
  id: string;
  kind: RunKind;
  createdAt: number;
  n: number;
  runIds: string[];
  /** "none": greedy or hosted, where no seed applies. */
  seedPolicy: SeedPolicy | "none";
  baseSeed: number | null;
  editor: EditorSnapshot | null;
  /** "Person · Qwen2.5-0.5B", plus "· ×10" for a repeat. */
  label: string;
  backendUrl: string;
  /** Set when the batch is one variant of a counterfactual probe; batches sharing `presetId` are compared. */
  probe?: { presetId: string; presetName: string; variant: string } | null;
}

export type BatchStatus = "queued" | "running" | "done" | "partial" | "cancelled";

/** Derived, never stored. */
export function batchStatus(batch: Batch, runs: Record<string, Run>): BatchStatus {
  const statuses = batch.runIds.map((id) => runs[id]?.status ?? "cancelled");
  if (statuses.some((s) => s === "running")) return "running";
  if (statuses.some((s) => s === "queued")) return statuses.some((s) => s === "done") ? "running" : "queued";
  if (statuses.every((s) => s === "done")) return "done";
  if (statuses.every((s) => s === "cancelled")) return "cancelled";
  return "partial";
}
