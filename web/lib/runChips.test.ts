import { describe, expect, it } from "vitest";
import { runChips } from "./runChips";
import type { Batch, ConstrainedRun, LogprobsRun } from "./runTypes";
import { emptyConstrainedSummary, emptyLogprobsSummary } from "./stats";

const base = { id: "r", batchId: "b", index: 0, createdAt: 0, startedAt: null, finishedAt: null, status: "done" as const, error: null, branch: null };
const batch = (extra: Partial<Batch> = {}): Batch => ({ id: "b", kind: "constrained", createdAt: 0, n: 1, runIds: ["r"], seedPolicy: "none", baseSeed: null, editor: null, label: "Person · Qwen2.5-0.5B-Instruct", backendUrl: "", ...extra });

const constrained: ConstrainedRun = {
  ...base,
  kind: "constrained",
  request: { model: "Qwen/Qwen2.5-0.5B-Instruct", schema: {}, prompt: "p", mode: "fsm", max_new_tokens: 120, temperature: 0, top_k_sampling: 0, top_k_report: 20, seed: null, use_chat_template: true },
  summary: emptyConstrainedSummary(),
};

describe("runChips", () => {
  it("names a constrained run's engine, model and sampling", () => {
    expect(runChips(constrained, batch()).map((c) => c.text)).toEqual(["Person · Qwen2.5-0.5B-Instruct", "outlines_core", "Qwen2.5-0.5B-Instruct", "greedy", "120 tok"]);
  });

  it("adds the batch size, the seed and a branch", () => {
    const run = { ...constrained, request: { ...constrained.request, seed: 7, temperature: 0.7 }, branch: { parentRunId: "p", atStep: 3, forcedTokenId: null, unmasked: false } };
    const texts = runChips(run, batch({ n: 5, label: "Person · Qwen · ×5" })).map((c) => c.text);
    expect(texts[0]).toBe("Person · Qwen");
    expect(texts).toEqual(expect.arrayContaining(["T 0.70", "seed 7", "×5", "branch @3"]));
  });

  it("leads a replay with its trace, call and cut", () => {
    const run: LogprobsRun = {
      ...base,
      kind: "logprobs",
      provider: "openai",
      request: { model: "openai:gpt-4.1-mini", prompt: "", messages: [{ role: "user", content: "x" }], max_new_tokens: 48, temperature: 1, top_k: 0, top_p: 0.9, seed: null, use_chat_template: true, top_k_report: 12, tail_bins: 48 },
      summary: emptyLogprobsSummary(),
    };
    const chips = runChips(run, batch({ kind: "logprobs", replay: { traceName: "LangGraph", callId: "c", callLabel: "#2 ChatOpenAI · gpt-4o-mini", cutAt: 2, edited: true, recorded: null } }));
    expect(chips.map((c) => c.text)).toEqual(["LangGraph", "#2 ChatOpenAI", "cut after #2", "edited", "Logprobs", "gpt-4.1-mini", "T 1.00", "p 0.90", "48 tok"]);
    expect(chips.find((c) => c.text === "edited")?.tone).toBe("warning");
  });
});
