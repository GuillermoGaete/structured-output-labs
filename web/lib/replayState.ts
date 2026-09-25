"use client";

import { useCallback, useEffect, useState } from "react";
import { conversationChars } from "./chat";
import { DEFAULT_SCHEMA_HINT } from "./engines";
import { TOP_K_REPORT } from "./labState";
import { callLabel, defaultCut, type ImportedTrace, type LlmCall, type TraceFormat, type TraceMessage } from "./langchainTrace";
import { usePersistedState } from "./persisted";
import type { Batch, ReplayInfo, Run, SeedPolicy } from "./runTypes";
import type { ChatMessage, ChatRole, GenerateRequest, ModeRequest, StreamRequest } from "./types";

export type ReplayEngine = "logprobs" | "constrained";

/** One message of the editable conversation. */
export interface DraftMessage extends TraceMessage {
  id: string;
  /** The trace's version, for Revert and the "edited" badge; absent on an inserted message. */
  original?: { role: ChatRole; content: string };
}

export interface ReplaySource {
  traceName: string;
  format: TraceFormat;
  callId: string;
  callLabel: string;
  callModel: string | null;
}

/**
 * The replay mode's setup, remembered per browser. Flat on purpose: the stored
 * value is merged over the defaults one level deep. The constrained knobs keep
 * `LabState`'s names so the Engine section edits them as it is; the logprobs
 * ones are prefixed.
 */
export interface ReplayState {
  engine: ReplayEngine;
  /** A local id, `provider:model` (Logprobs only), or "" for the backend's default. */
  model: string;
  source: ReplaySource | null;
  messages: DraftMessage[];
  /** Messages sent: `messages.slice(0, cutAt)`. The model writes the next one. */
  cutAt: number;
  /** Messages of the trace deleted from the draft; any makes it a counterfactual. */
  deleted: number;
  useTemplate: boolean;
  // Constrained
  mode: ModeRequest;
  maxNewTokens: number;
  temperature: number;
  seed: number | null;
  topKSampling: number;
  schemaText: string;
  /** Where the schema came from in the trace; null once it is typed by hand. */
  schemaSource: string | null;
  schemaHint: string;
  // Logprobs
  lpMaxTokens: number;
  lpTemperature: number;
  lpTopK: number;
  lpTopP: number;
  lpSeed: number | null;
  lpReportK: number;
  repeatN: number;
  seedPolicy: SeedPolicy;
}

const KEY = "sol.replay";

export const INITIAL_REPLAY: ReplayState = {
  engine: "logprobs",
  model: "",
  source: null,
  messages: [],
  cutAt: 0,
  deleted: 0,
  useTemplate: true,
  mode: "auto",
  maxNewTokens: 120,
  temperature: 0,
  seed: null,
  topKSampling: 0,
  schemaText: "",
  schemaSource: null,
  schemaHint: DEFAULT_SCHEMA_HINT,
  lpMaxTokens: 64,
  lpTemperature: 0.8,
  lpTopK: 0,
  lpTopP: 1,
  lpSeed: null,
  lpReportK: 12,
  repeatN: 5,
  seedPolicy: "fresh",
};

export function useReplayState(): [ReplayState, (patch: Partial<ReplayState>) => void] {
  return usePersistedState(KEY, INITIAL_REPLAY);
}

/** What the backend accepts when `/health` does not say. */
export const DEFAULT_MAX_MESSAGES = 64;
export const DEFAULT_MAX_MESSAGES_CHARS = 24000;
/** A recorded reply kept with a batch, for the comparison after a reload. */
export const RECORDED_LIMIT = 8000;

let counter = 0;
function draftId(): string {
  return `m${Date.now().toString(36)}${(counter++).toString(36)}`;
}

function toDraft(m: TraceMessage): DraftMessage {
  return { ...m, id: draftId(), original: { role: m.role, content: m.content } };
}

const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);

// ------------------------------------------------------------------ loading a call

/** The draft for one call of a trace: its messages, cut just before its recorded reply. */
export function draftFromCall(trace: Pick<ImportedTrace, "name" | "format">, call: LlmCall): Partial<ReplayState> {
  return {
    source: { traceName: trace.name, format: trace.format, callId: call.id, callLabel: callLabel(call), callModel: call.model },
    messages: call.messages.map(toDraft),
    cutAt: defaultCut(call.messages),
    deleted: 0,
  };
}

/** The knobs a call recorded, clamped to what this lab runs. Absent values leave the setup as it is. */
export function callDefaults(call: LlmCall, caps: { maxNewTokens: number }): Partial<ReplayState> {
  const patch: Partial<ReplayState> = { engine: call.schema ? "constrained" : "logprobs", useTemplate: !call.completion };
  const t = call.params.temperature;
  if (t !== null) {
    patch.temperature = clamp(t, 0, 1.5);
    patch.lpTemperature = clamp(t, 0, 2);
  }
  const max = call.params.maxTokens;
  if (max !== null) {
    patch.maxNewTokens = clamp(Math.round(max / 4) * 4, 8, caps.maxNewTokens);
    patch.lpMaxTokens = clamp(max, 1, 256);
  }
  if (call.schema) {
    patch.schemaText = JSON.stringify(call.schema.schema, null, 2);
    patch.schemaSource = call.schema.source;
  }
  return patch;
}

// ------------------------------------------------------------------ editing

export type EditAction =
  | { type: "set"; index: number; role?: ChatRole; content?: string }
  | { type: "delete"; index: number }
  /** A new message at `index`; one inserted at or before the cut is sent. */
  | { type: "insert"; index: number; role: ChatRole }
  | { type: "revert"; index: number }
  | { type: "cut"; at: number };

/** The patch one edit makes; the cut moves with the messages before it. */
export function editMessages(state: Pick<ReplayState, "messages" | "cutAt" | "deleted">, action: EditAction): Pick<ReplayState, "messages" | "cutAt" | "deleted"> {
  const messages = [...state.messages];
  let { cutAt, deleted } = state;
  switch (action.type) {
    case "set": {
      const m = messages[action.index];
      if (!m) break;
      messages[action.index] = { ...m, ...(action.role ? { role: action.role } : {}), ...(action.content !== undefined ? { content: action.content } : {}) };
      break;
    }
    case "delete": {
      const [gone] = messages.splice(action.index, 1);
      if (!gone) break;
      if (action.index < cutAt) cutAt--;
      if (gone.original) deleted++;
      break;
    }
    case "insert": {
      const index = clamp(action.index, 0, messages.length);
      messages.splice(index, 0, { id: draftId(), role: action.role, content: "" });
      if (index <= cutAt) cutAt++;
      break;
    }
    case "revert": {
      const m = messages[action.index];
      if (m?.original) messages[action.index] = { ...m, ...m.original };
      break;
    }
    case "cut":
      cutAt = action.at;
      break;
  }
  return { messages, cutAt: clamp(cutAt, 0, messages.length), deleted };
}

export function isEdited(state: Pick<ReplayState, "messages" | "deleted">): boolean {
  return state.deleted > 0 || state.messages.some((m) => !m.original || m.original.role !== m.role || m.original.content !== m.content);
}

/** What is sent: the messages before the cut, blanks skipped. */
export function contextMessages(state: Pick<ReplayState, "messages" | "cutAt">): ChatMessage[] {
  return state.messages
    .slice(0, state.cutAt)
    .filter((m) => m.content.trim())
    .map((m) => ({ role: m.role, content: m.content }));
}

/** The assistant message right after the cut: what the trace answered there. */
export function recordedAt(state: Pick<ReplayState, "messages" | "cutAt">): DraftMessage | null {
  const m = state.messages[state.cutAt];
  return m && m.role === "assistant" ? m : null;
}

/** Why Replay cannot run, one reason per chip. */
export function replayProblems(
  state: Pick<ReplayState, "messages" | "cutAt" | "engine">,
  limits: { maxMessages: number; maxChars: number },
  schemaOk: boolean,
): string[] {
  const sent = contextMessages(state);
  const problems: string[] = [];
  if (!state.messages.length) return ["import a trace, or add a message"];
  if (!sent.length) problems.push("nothing to send before the cut");
  else if (sent[sent.length - 1].role === "assistant") problems.push("the last message sent is the assistant's: cut before it");
  const chars = conversationChars(sent);
  if (chars > limits.maxChars) problems.push(`${chars.toLocaleString("en-US")} characters sent; the backend takes ${limits.maxChars.toLocaleString("en-US")}`);
  if (sent.length > limits.maxMessages) problems.push(`${sent.length} messages sent; the backend takes ${limits.maxMessages}`);
  if (state.engine === "constrained" && !schemaOk) problems.push("Constrained needs a valid JSON Schema");
  return problems;
}

// ------------------------------------------------------------------ requests

export function buildReplayGenerateRequest(state: ReplayState, schema: Record<string, unknown>, model: string | null): GenerateRequest {
  return {
    model,
    schema,
    prompt: "",
    messages: contextMessages(state),
    mode: state.mode,
    max_new_tokens: state.maxNewTokens,
    temperature: state.temperature,
    top_k_sampling: state.topKSampling,
    top_k_report: TOP_K_REPORT,
    seed: state.seed,
    use_chat_template: state.useTemplate,
    schema_hint: state.mode === "none" ? state.schemaHint : null,
  };
}

export function buildReplayStreamRequest(state: ReplayState, model: string | null): StreamRequest {
  return {
    model,
    prompt: "",
    messages: contextMessages(state),
    max_new_tokens: state.lpMaxTokens,
    temperature: state.lpTemperature,
    top_k: state.lpTopK,
    top_p: state.lpTopP,
    seed: state.lpSeed,
    use_chat_template: state.useTemplate,
    top_k_report: state.lpReportK,
    tail_bins: 48,
  };
}

/** Kept with the batch: what was replayed, and the recorded reply to compare with. */
export function replayInfo(state: ReplayState): ReplayInfo {
  const recorded = recordedAt(state);
  const structured = recorded?.structured;
  const structuredText = structured === undefined ? "" : JSON.stringify(structured);
  return {
    traceName: state.source?.traceName ?? "conversation",
    callId: state.source?.callId ?? "",
    callLabel: state.source?.callLabel ?? "conversation",
    cutAt: state.cutAt,
    edited: isEdited(state),
    recorded: recorded ? recorded.content.slice(0, RECORDED_LIMIT) : null,
    ...(structured !== undefined && structuredText.length <= RECORDED_LIMIT ? { recordedStructured: structured } : {}),
    recordedModel: state.source?.callModel ?? null,
  };
}

/** "Duplicate & edit": a run's conversation and knobs back in the setup, its recorded reply after the cut. */
export function patchFromReplayRun(run: Run, batch: Batch | undefined): Partial<ReplayState> {
  const r = run.request;
  const sent: ChatMessage[] = r.messages?.length ? r.messages : [{ role: "user", content: r.prompt }];
  const messages: DraftMessage[] = sent.map((m) => ({ id: draftId(), role: m.role, content: m.content, original: { ...m } }));
  const info = batch?.replay;
  if (info?.recorded !== null && info?.recorded !== undefined) {
    messages.push({ id: draftId(), role: "assistant", content: info.recorded, origin: "output", structured: info.recordedStructured, original: { role: "assistant", content: info.recorded } });
  }
  const common: Partial<ReplayState> = {
    source: info ? { traceName: info.traceName, format: "messages", callId: info.callId, callLabel: info.callLabel, callModel: info.recordedModel ?? null } : null,
    messages,
    cutAt: sent.length,
    deleted: 0,
    useTemplate: r.use_chat_template,
    model: r.model ?? "",
  };
  if (run.kind === "constrained") {
    const q = run.request;
    return {
      ...common,
      engine: "constrained",
      mode: q.mode,
      maxNewTokens: q.max_new_tokens,
      temperature: q.temperature,
      seed: q.seed,
      topKSampling: q.top_k_sampling,
      schemaText: JSON.stringify(q.schema, null, 2),
      schemaHint: q.schema_hint ?? DEFAULT_SCHEMA_HINT,
    };
  }
  const q = run.request;
  return { ...common, engine: "logprobs", lpMaxTokens: q.max_new_tokens, lpTemperature: q.temperature, lpTopK: q.top_k, lpTopP: q.top_p, lpSeed: q.seed, lpReportK: q.top_k_report };
}

// ------------------------------------------------------------------ the imported trace

const TRACE_KEY = "sol.replay.trace";
/** A parsed trace larger than this stays in memory only. */
export const MAX_STORED_TRACE_CHARS = 4_000_000;

/**
 * The imported trace, parsed. It lives in sessionStorage, apart from the setup:
 * it can be large, and the setup is rewritten on every keystroke. The draft
 * holds everything a replay needs, so losing the trace only loses the other calls.
 */
export function useImportedTrace(): { trace: ImportedTrace | null; stored: boolean; setTrace: (trace: ImportedTrace | null) => void } {
  const [trace, setState] = useState<ImportedTrace | null>(null);
  const [stored, setStored] = useState(true);

  useEffect(() => {
    let restored: ImportedTrace | null = null;
    try {
      const raw = window.sessionStorage.getItem(TRACE_KEY);
      if (raw) restored = JSON.parse(raw) as ImportedTrace;
    } catch {
      /* private mode etc. */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (restored?.calls?.length) setState(restored);
  }, []);

  const setTrace = useCallback((next: ImportedTrace | null) => {
    setState(next);
    try {
      if (!next) {
        window.sessionStorage.removeItem(TRACE_KEY);
        setStored(true);
        return;
      }
      const text = JSON.stringify(next);
      if (text.length > MAX_STORED_TRACE_CHARS) {
        window.sessionStorage.removeItem(TRACE_KEY);
        setStored(false);
        return;
      }
      window.sessionStorage.setItem(TRACE_KEY, text);
      setStored(true);
    } catch {
      setStored(false);
    }
  }, []);

  return { trace, stored, setTrace };
}
