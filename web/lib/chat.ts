// A conversation instead of a single prompt: the replay mode's input. Mirrors backend/app/chat.py.

import { composePrompt, DEFAULT_SCHEMA_HINT, renderHint } from "./engines";
import type { ChatMessage, GenerateRequest } from "./types";

const ROLE_LABEL: Record<ChatMessage["role"], string> = { system: "System", user: "User", assistant: "Assistant" };

/** The conversation as plain text, ending where the assistant writes. One user message is its own text. Mirrors `plain_transcript`. */
export function transcript(messages: ChatMessage[]): string {
  if (messages.length === 1 && messages[0].role === "user") return messages[0].content;
  return [...messages.map((m) => `${ROLE_LABEL[m.role]}: ${m.content}`), "Assistant:"].join("\n\n");
}

/** The "none" mode's hint on the last user message, or as a new one after a trailing system message. Mirrors `with_hint`. */
export function withHint(messages: ChatMessage[], hint: string): ChatMessage[] {
  const out = messages.map((m) => ({ ...m }));
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i].role === "system") break;
    if (out[i].role === "user") {
      out[i] = { ...out[i], content: `${out[i].content}\n\n${hint}` };
      return out;
    }
  }
  return [...out, { role: "user", content: hint }];
}

/** What a request asks the model to read, as one string: its prompt, or its conversation as a transcript. */
export function promptText(request: { prompt: string; messages?: ChatMessage[] }): string {
  return request.messages?.length ? transcript(request.messages) : request.prompt;
}

/** A prompt-only request's text before the chat template: the prompt (or the conversation) with the hint. */
export function composeRequest(request: Pick<GenerateRequest, "prompt" | "messages" | "schema_hint" | "schema">): string {
  if (!request.messages?.length) return composePrompt(request.prompt, request.schema_hint, request.schema);
  return transcript(withHint(request.messages, renderHint(request.schema_hint ?? DEFAULT_SCHEMA_HINT, request.schema)));
}

export function conversationChars(messages: { content: string }[]): number {
  return messages.reduce((n, m) => n + m.content.length, 0);
}
