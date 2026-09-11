/**
 * What the store keeps of a run once its steps have scrolled by: per-step
 * scalars folded as the stream arrives. Pure functions, unit-tested.
 */

import { softmaxView } from "./math";
import type { ConstrainedSummary, LogprobsSummary } from "./runTypes";
import type { Done, Meta, Step, StreamDone, StreamMeta, StreamStep } from "./types";

const P_FLOOR = 1e-12;

export function emptyConstrainedSummary(): ConstrainedSummary {
  return {
    finished: false,
    modelId: null,
    mode: null,
    backend: null,
    promptTokenCount: null,
    tokenIds: [],
    tokens: [],
    massRemoved: [],
    vocabKept: [],
    overridden: [],
    logPForced: [],
    maxStackDepth: 0,
    text: null,
    parsed: null,
    valid: null,
    validationError: null,
    stoppedBy: null,
    elapsedS: null,
  };
}

export function foldConstrainedMeta(s: ConstrainedSummary, meta: Meta): ConstrainedSummary {
  return { ...s, modelId: meta.model_id, mode: meta.mode, backend: meta.backend, promptTokenCount: meta.prompt_token_count };
}

export function foldConstrainedStep(s: ConstrainedSummary, step: Step): ConstrainedSummary {
  return {
    ...s,
    tokenIds: [...s.tokenIds, step.token_id],
    tokens: [...s.tokens, step.text],
    massRemoved: [...s.massRemoved, step.mass_removed],
    vocabKept: [...s.vocabKept, step.n_allowed / step.vocab_size],
    overridden: [...s.overridden, step.was_overridden],
    logPForced: [...s.logPForced, Math.log(Math.max(step.p_forced, P_FLOOR))],
    maxStackDepth: Math.max(s.maxStackDepth, step.stack_depth),
    text: step.partial_text,
  };
}

export function finishConstrained(s: ConstrainedSummary, done: Done): ConstrainedSummary {
  return {
    ...s,
    finished: true,
    text: done.text,
    parsed: done.parsed,
    valid: done.valid,
    validationError: done.validation_error,
    stoppedBy: done.stopped_by,
    elapsedS: done.elapsed_s,
  };
}

export function emptyLogprobsSummary(): LogprobsSummary {
  return {
    finished: false,
    modelId: null,
    provider: null,
    promptTokenCount: null,
    tokenIds: [],
    tokens: [],
    entropyRawBits: [],
    entropyViewBits: [],
    logP: [],
    chosenRank: [],
    forwardMs: [],
    text: null,
    stopReason: null,
    elapsedS: null,
    tokensPerS: null,
  };
}

export function foldLogprobsMeta(s: LogprobsSummary, meta: StreamMeta): LogprobsSummary {
  return { ...s, modelId: meta.model_id, provider: meta.provider ?? null, promptTokenCount: meta.prompt_token_count };
}

/** `sampling` is what generated the run; the "view" entropy is the distribution the sampler actually drew from. */
export function foldLogprobsStep(s: LogprobsSummary, step: StreamStep, sampling: StreamMeta["sampling"] | null): LogprobsSummary {
  const view = sampling
    ? softmaxView(step.top, step.tail, { temperature: sampling.temperature, topK: sampling.top_k, topP: sampling.top_p }).entropyBits
    : step.entropy_bits;
  return {
    ...s,
    tokenIds: [...s.tokenIds, step.token_id],
    tokens: [...s.tokens, step.text],
    entropyRawBits: [...s.entropyRawBits, step.entropy_bits],
    entropyViewBits: [...s.entropyViewBits, view],
    logP: [...s.logP, Math.log(Math.max(step.chosen_p, P_FLOOR))],
    chosenRank: [...s.chosenRank, step.chosen_rank],
    forwardMs: [...s.forwardMs, step.forward_ms],
    text: step.partial_text,
  };
}

export function finishLogprobs(s: LogprobsSummary, done: StreamDone): LogprobsSummary {
  return { ...s, finished: true, text: done.text, stopReason: done.stop_reason, elapsedS: done.elapsed_s, tokensPerS: done.tokens_per_s };
}
