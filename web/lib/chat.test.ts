import { describe, expect, it } from "vitest";
import { composeRequest, conversationChars, promptText, transcript, withHint } from "./chat";

const CONVERSATION = [
  { role: "system" as const, content: "Be brief." },
  { role: "user" as const, content: "Hi" },
  { role: "assistant" as const, content: "Hello." },
  { role: "user" as const, content: "Bye" },
];

describe("transcript", () => {
  it("sends one user message as its own text, like the backend", () => {
    expect(transcript([{ role: "user", content: "Tell me a joke" }])).toBe("Tell me a joke");
  });

  it("labels each turn and ends where the assistant writes", () => {
    expect(transcript(CONVERSATION)).toBe("System: Be brief.\n\nUser: Hi\n\nAssistant: Hello.\n\nUser: Bye\n\nAssistant:");
  });
});

describe("withHint", () => {
  it("goes on the last user message, or after a trailing system one", () => {
    expect(withHint(CONVERSATION, "JSON")[3].content).toBe("Bye\n\nJSON");
    expect(CONVERSATION[3].content).toBe("Bye");
    expect(withHint([{ role: "user", content: "A" }, { role: "system", content: "S" }], "JSON").slice(-1)[0]).toEqual({ role: "user", content: "JSON" });
  });
});

describe("requests", () => {
  it("show a prompt or a conversation as one text", () => {
    expect(promptText({ prompt: "p" })).toBe("p");
    expect(promptText({ prompt: "", messages: CONVERSATION })).toContain("User: Bye");
    expect(conversationChars(CONVERSATION)).toBe(9 + 2 + 6 + 3);
  });

  it("compose a prompt-only request with the hint where the backend puts it", () => {
    const schema = { type: "object", title: "T", properties: { a: { type: "string" } } };
    const plain = composeRequest({ prompt: "hello", schema, schema_hint: "JSON: {schema}" });
    expect(plain).toBe('hello\n\nJSON: {"type":"object","properties":{"a":{"type":"string"}}}');
    const replay = composeRequest({ prompt: "", messages: CONVERSATION, schema, schema_hint: "JSON: {schema}" });
    expect(replay).toContain('User: Bye\n\nJSON: {"type"');
    expect(replay.endsWith("Assistant:")).toBe(true);
  });
});
