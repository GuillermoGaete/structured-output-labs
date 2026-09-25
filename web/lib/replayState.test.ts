import { describe, expect, it } from "vitest";
import structured from "./fixtures/langsmith-structured-output.json";
import completion from "./fixtures/langsmith-completion.json";
import { parseTrace } from "./langchainTrace";
import {
  buildReplayGenerateRequest,
  buildReplayStreamRequest,
  callDefaults,
  contextMessages,
  draftFromCall,
  editMessages,
  INITIAL_REPLAY,
  isEdited,
  patchFromReplayRun,
  recordedAt,
  RECORDED_LIMIT,
  replayInfo,
  replayProblems,
  type ReplayState,
} from "./replayState";
import type { Batch, ConstrainedRun, LogprobsRun } from "./runTypes";
import { emptyConstrainedSummary, emptyLogprobsSummary } from "./stats";

const LIMITS = { maxMessages: 64, maxChars: 24000 };

function loaded(): ReplayState {
  const trace = parseTrace(structured);
  const call = trace.calls[0];
  return { ...INITIAL_REPLAY, ...draftFromCall(trace, call), ...callDefaults(call, { maxNewTokens: 200 }) };
}

describe("loading a call", () => {
  it("cuts just before the recorded reply and takes the call's knobs", () => {
    const s = loaded();
    expect(s.cutAt).toBe(2);
    expect(s.engine).toBe("constrained");
    expect(s.temperature).toBe(0);
    expect(s.maxNewTokens).toBe(120);
    expect(s.schemaSource).toBe("tool · Person");
    expect(JSON.parse(s.schemaText).required).toEqual(["name", "age", "city"]);
    expect(s.source).toMatchObject({ traceName: "RunnableSequence", callLabel: "#1 ChatOpenAI · gpt-4o-mini" });
    expect(recordedAt(s)?.structured).toEqual({ name: "Ada Lovelace", age: 36, city: "London" });
    expect(isEdited(s)).toBe(false);
    expect(replayProblems(s, LIMITS, true)).toEqual([]);
  });

  it("sends a completion prompt raw", () => {
    const call = parseTrace(completion).calls[0];
    const d = callDefaults(call, { maxNewTokens: 200 });
    expect(d.useTemplate).toBe(false);
    expect(d.engine).toBe("logprobs");
    expect(d.lpTemperature).toBe(0.7);
    expect(d.lpMaxTokens).toBe(16);
    expect(d.maxNewTokens).toBe(16);
  });
});

describe("editing", () => {
  it("moves the cut with inserts and deletes before it", () => {
    let s = loaded();
    s = { ...s, ...editMessages(s, { type: "insert", index: 2, role: "user" }) };
    expect(s.cutAt).toBe(3);
    expect(s.messages[2]).toMatchObject({ role: "user", content: "" });
    expect(s.messages[2].original).toBeUndefined();
    expect(isEdited(s)).toBe(true);
    // a blank message is skipped
    expect(contextMessages(s).map((m) => m.role)).toEqual(["system", "user"]);
    s = { ...s, ...editMessages(s, { type: "set", index: 2, content: "Also: she is a mathematician." }) };
    expect(contextMessages(s)).toHaveLength(3);
    s = { ...s, ...editMessages(s, { type: "delete", index: 0 }) };
    expect(s.cutAt).toBe(2);
    expect(s.deleted).toBe(1);
    // deleting after the cut leaves it
    s = { ...s, ...editMessages(s, { type: "delete", index: 2 }) };
    expect(s.cutAt).toBe(2);
    expect(recordedAt(s)).toBeNull();
  });

  it("reverts to the trace's text", () => {
    let s = loaded();
    s = { ...s, ...editMessages(s, { type: "set", index: 1, content: "Grace Hopper, 85, Arlington." }) };
    expect(isEdited(s)).toBe(true);
    s = { ...s, ...editMessages(s, { type: "revert", index: 1 }) };
    expect(s.messages[1].content).toBe("Ada Lovelace, 36, lives in London.");
    expect(isEdited(s)).toBe(false);
  });

  it("names what blocks a replay", () => {
    const s = loaded();
    expect(replayProblems({ ...s, cutAt: 3 }, LIMITS, true)).toContain("the last message sent is the assistant's: cut before it");
    expect(replayProblems({ ...s, cutAt: 0 }, LIMITS, true)).toContain("nothing to send before the cut");
    expect(replayProblems(s, { maxMessages: 1, maxChars: 24000 }, true)[0]).toMatch(/2 messages sent/);
    expect(replayProblems(s, { maxMessages: 64, maxChars: 10 }, true)[0]).toMatch(/characters sent/);
    expect(replayProblems(s, LIMITS, false)).toEqual(["Constrained needs a valid JSON Schema"]);
    expect(replayProblems({ ...s, engine: "logprobs" }, LIMITS, false)).toEqual([]);
    expect(replayProblems({ ...INITIAL_REPLAY }, LIMITS, true)).toEqual(["import a trace, or add a message"]);
  });
});

describe("requests", () => {
  it("send the conversation instead of a prompt", () => {
    const s = loaded();
    const g = buildReplayGenerateRequest(s, { type: "object" }, "m");
    expect(g.prompt).toBe("");
    expect(g.messages).toEqual([
      { role: "system", content: "Extract the person described by the user." },
      { role: "user", content: "Ada Lovelace, 36, lives in London." },
    ]);
    expect(g.schema_hint).toBeNull();
    expect(buildReplayGenerateRequest({ ...s, mode: "none" }, {}, null).schema_hint).toBe(s.schemaHint);
    const st = buildReplayStreamRequest(s, "openai:gpt-4.1-mini");
    expect(st).toMatchObject({ prompt: "", model: "openai:gpt-4.1-mini", max_new_tokens: s.lpMaxTokens, tail_bins: 48 });
    expect(st.messages).toHaveLength(2);
  });

  it("keep the recorded reply with the batch, truncated", () => {
    const s = loaded();
    const info = replayInfo(s);
    expect(info).toMatchObject({ traceName: "RunnableSequence", cutAt: 2, edited: false, recordedStructured: { name: "Ada Lovelace", age: 36, city: "London" } });
    const long = { ...s, messages: s.messages.map((m, i) => (i === 2 ? { ...m, content: "x".repeat(RECORDED_LIMIT + 10), structured: undefined } : m)) };
    expect(replayInfo(long).recorded).toHaveLength(RECORDED_LIMIT);
    expect("recordedStructured" in replayInfo(long)).toBe(false);
  });
});

describe("Duplicate & edit", () => {
  const base = { id: "r", batchId: "b", index: 0, createdAt: 0, startedAt: null, finishedAt: null, status: "done" as const, error: null, branch: null };

  it("puts a replayed run's conversation back, with its recorded reply after the cut", () => {
    const s = loaded();
    const request = buildReplayGenerateRequest(s, { type: "object" }, "m");
    const run: ConstrainedRun = { ...base, kind: "constrained", request, summary: emptyConstrainedSummary() };
    const batch = { replay: replayInfo(s) } as Batch;
    const patch = patchFromReplayRun(run, batch);
    expect(patch.engine).toBe("constrained");
    expect(patch.cutAt).toBe(2);
    expect(patch.messages?.map((m) => m.role)).toEqual(["system", "user", "assistant"]);
    expect(patch.messages?.[2]).toMatchObject({ origin: "output", structured: { name: "Ada Lovelace", age: 36, city: "London" } });
    expect(patch.source?.callLabel).toBe("#1 ChatOpenAI · gpt-4o-mini");
    expect(JSON.parse(patch.schemaText ?? "")).toEqual({ type: "object" });
  });

  it("turns a plain prompt run into a one-message conversation", () => {
    const run: LogprobsRun = {
      ...base,
      kind: "logprobs",
      provider: null,
      request: { model: null, prompt: "Hello", max_new_tokens: 9, temperature: 1, top_k: 3, top_p: 0.9, seed: 4, use_chat_template: true, top_k_report: 12, tail_bins: 48 },
      summary: emptyLogprobsSummary(),
    };
    const patch = patchFromReplayRun(run, undefined);
    expect(patch.messages?.map((m) => [m.role, m.content])).toEqual([["user", "Hello"]]);
    expect(patch).toMatchObject({ engine: "logprobs", cutAt: 1, lpMaxTokens: 9, lpTopK: 3, lpTopP: 0.9, lpSeed: 4, source: null });
  });
});
