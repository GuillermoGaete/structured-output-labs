import { describe, expect, it } from "vitest";
import agentRun from "./fixtures/langsmith-agent-run.json";
import completion from "./fixtures/langsmith-completion.json";
import runsArray from "./fixtures/langsmith-runs-array.json";
import structured from "./fixtures/langsmith-structured-output.json";
import dumpd from "./fixtures/lc-dumpd-messages.json";
import toDict from "./fixtures/lc-messages-to-dict.json";
import openaiRequest from "./fixtures/openai-request.json";
import { callLabel, cutPoints, defaultCut, parseJson, parseTrace, parseTraceText, TraceError } from "./langchainTrace";

describe("LangSmith runs", () => {
  it("walks an agent's run tree in dotted order and flattens tool traffic", () => {
    const t = parseTrace(agentRun);
    expect(t.format).toBe("langsmith-run");
    expect(t.name).toBe("LangGraph");
    expect(t.nRuns).toBe(7);
    expect(t.calls.map((c) => c.id)).toEqual(["0b1f6a54-0000-4000-8000-000000000003", "0b1f6a54-0000-4000-8000-000000000006"]);
    const [first, second] = t.calls;
    expect(first.path).toEqual(["LangGraph", "agent"]);
    expect(first.model).toBe("gpt-4o-mini");
    expect(first.provider).toBe("openai");
    expect(first.params.temperature).toBe(0.2);
    expect(first.schema).toBeNull(); // tools offered, none forced
    // the recorded reply is a tool call, written into the text
    const reply = first.messages[first.messages.length - 1];
    expect(reply).toMatchObject({ role: "assistant", origin: "output", toolCalls: 1 });
    expect(reply.content).toBe('[tool call · get_weather] {"city":"Paris"}');
    // the second call read the tool result as a user turn
    expect(second.messages.map((m) => m.role)).toEqual(["system", "user", "assistant", "user", "assistant"]);
    expect(second.messages[3]).toMatchObject({ origin: "tool", content: '[tool result · get_weather]\n{"temp_c": 18, "sky": "sunny"}' });
    expect(second.messages[4].content).toBe("It is 18 °C and sunny in Paris right now.");
    expect(second.warnings.some((w) => w.includes("tool"))).toBe(true);
    expect(callLabel(second)).toBe("#2 ChatOpenAI · gpt-4o-mini");
  });

  it("reads with_structured_output: the schema, and the tool call as the recorded value", () => {
    const t = parseTrace(structured);
    expect(t.calls).toHaveLength(1);
    const call = t.calls[0];
    expect(call.schema?.source).toBe("tool · Person");
    expect(call.schema?.schema).toMatchObject({ type: "object", required: ["name", "age", "city"] });
    expect(call.params).toEqual({ temperature: 0, maxTokens: 120 });
    const reply = call.messages[2];
    expect(reply.origin).toBe("output");
    expect(reply.structured).toEqual({ name: "Ada Lovelace", age: 36, city: "London" });
    expect(JSON.parse(reply.content)).toEqual(reply.structured);
    expect(reply.toolCalls).toBeUndefined();
  });

  it("rebuilds a flat, shuffled list of runs and keeps an errored call without a reply", () => {
    const t = parseTrace(runsArray);
    expect(t.format).toBe("langsmith-runs");
    expect(t.name).toBe("classify_reviews");
    expect(t.calls.map((c) => c.id)).toEqual(["r-llm-a", "r-llm-b"]);
    const [ok, failed] = t.calls;
    expect(ok.schema?.source).toBe("response_format · Sentiment");
    expect(ok.model).toBe("gpt-4.1-mini");
    expect(ok.messages[1].content).toBe("Classify: 'best purchase this year'"); // content blocks
    expect(ok.messages[2]).toMatchObject({ role: "assistant", origin: "output", structured: { sentiment: "positive" } });
    expect(failed.error).toContain("RateLimitError");
    expect(failed.messages.some((m) => m.origin === "output")).toBe(false);
  });

  it("reads JSON Lines the same as an array", () => {
    const text = runsArray.map((r) => JSON.stringify(r)).join("\n");
    expect(parseTraceText(text, "export.jsonl").calls.map((c) => c.id)).toEqual(["r-llm-a", "r-llm-b"]);
  });

  it("reads a completion model's prompt string", () => {
    const t = parseTrace(completion);
    const call = t.calls[0];
    expect(call.completion).toBe(true);
    expect(call.model).toBe("gpt-3.5-turbo-instruct");
    expect(call.params).toEqual({ temperature: 0.7, maxTokens: 16 });
    expect(call.messages).toEqual([
      { role: "user", content: "Q: What is six times seven?\nA:" },
      { role: "assistant", content: " 42", origin: "output" },
    ]);
  });

  it("says why when a trace has no LLM call", () => {
    expect(() => parseTrace({ id: "x", name: "chain", run_type: "chain", inputs: {}, child_runs: [{ id: "y", run_type: "tool", inputs: {} }] })).toThrow(/2 runs, none of them an LLM call/);
  });
});

describe("message lists", () => {
  it("reads dumpd messages, with images as placeholders", () => {
    const t = parseTrace(dumpd, "chat.json");
    expect(t.format).toBe("messages");
    expect(t.name).toBe("chat");
    const call = t.calls[0];
    expect(call.messages[1]).toMatchObject({ role: "user", content: "What is in this picture?\n[image]", placeholders: 1 });
    expect(call.messages[2]).toMatchObject({ role: "assistant", origin: "output", content: "A cat asleep on a keyboard." });
    expect(call.warnings.some((w) => w.includes("placeholder"))).toBe(true);
  });

  it("reads messages_to_dict, chunks and chat roles included", () => {
    const call = parseTrace(toDict).calls[0];
    expect(call.messages.map((m) => [m.role, m.content])).toEqual([
      ["system", "You are terse."],
      ["user", "Name a prime number."],
      ["assistant", "7"],
      ["user", "Another one?"],
    ]);
    // it ends with the user, so there is nothing recorded at the end
    expect(call.messages.some((m) => m.origin === "output")).toBe(false);
  });

  it("reads an OpenAI request with a developer message and its schema", () => {
    const t = parseTrace(openaiRequest);
    expect(t.format).toBe("openai-request");
    const call = t.calls[0];
    expect(call.model).toBe("gpt-4o-mini");
    expect(call.messages[0]).toEqual({ role: "system", content: "Turn the customer's message into a support ticket." });
    expect(call.schema?.source).toBe("response_format · Ticket");
    expect(call.params).toEqual({ temperature: 0, maxTokens: 200 });
  });

  it("reads tuples, type/content dicts, a batch and a LangGraph state", () => {
    expect(parseTrace([["system", "S"], ["human", "H"]]).calls[0].messages.map((m) => m.role)).toEqual(["system", "user"]);
    expect(parseTrace({ messages: [{ type: "human", content: "hi" }, { type: "ai", content: "yo" }] }).calls[0].messages[1]).toMatchObject({ role: "assistant", origin: "output" });
    expect(parseTrace([[{ role: "user", content: "a" }], [{ role: "user", content: "b" }]]).calls[0].messages[0].content).toBe("a");
  });

  it("reads Anthropic content blocks: tool_use, tool_result and thinking", () => {
    const call = parseTrace([
      { role: "user", content: "weather?" },
      { role: "assistant", content: [{ type: "thinking", thinking: "hmm" }, { type: "text", text: "Checking." }, { type: "tool_use", id: "t1", name: "get_weather", input: { city: "Oslo" } }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: [{ type: "text", text: "-2C" }] }] },
    ]).calls[0];
    expect(call.messages[1].content).toBe('Checking.\n[tool call · get_weather] {"city":"Oslo"}');
    expect(call.messages[2].content).toBe("[tool result · t1]\n-2C");
  });
});

describe("errors", () => {
  it.each([
    [{}, /unrecognised trace/],
    [[], /unrecognised trace/],
    [{ foo: 1 }, /top-level foo/],
    [[{ foo: 1 }], /message 1: unrecognised \(keys: foo\)/],
    [[{ role: "wizard", content: "x" }], /unknown role or type "wizard"/],
  ])("%j", (value, message) => {
    expect(() => parseTrace(value)).toThrow(TraceError);
    expect(() => parseTrace(value)).toThrow(message);
  });

  it("rejects text that is not JSON", () => {
    expect(() => parseTraceText("not json")).toThrow(/not JSON/);
    expect(() => parseTraceText("  ")).toThrow(/empty/);
  });
});

describe("cut points", () => {
  const roles = (s: string) => s.split("").map((c) => ({ role: ({ s: "system", u: "user", a: "assistant" } as const)[c as "s" | "u" | "a"] }));

  it("sit before an assistant message, or at the end after a user turn", () => {
    expect(cutPoints(roles("suaua"))).toEqual([2, 4]);
    expect(cutPoints(roles("suau"))).toEqual([2, 4]);
    expect(cutPoints(roles("aa"))).toEqual([]);
    expect(cutPoints(roles("uu"))).toEqual([2]);
  });

  it("default to just before the recorded reply", () => {
    expect(defaultCut([...roles("sua"), { role: "user" as const }, { role: "assistant" as const, origin: "output" as const }])).toBe(4);
    expect(defaultCut(roles("suau"))).toBe(4);
  });
});

describe("parseJson", () => {
  it("reads fenced JSON and refuses prose", () => {
    expect(parseJson('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(parseJson("[1, 2]")).toEqual([1, 2]);
    expect(parseJson("It is sunny")).toBeUndefined();
    expect(parseJson("{broken")).toBeUndefined();
  });
});
