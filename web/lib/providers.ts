"use client";

/**
 * Hosted models in the logprobs mode.
 *
 * API keys live in this browser and nowhere else. They are read from
 * localStorage, sent on the request that needs them, and forwarded by the
 * backend without ever being stored, logged or written to its environment. So a
 * deployed copy of this app spends each visitor's own credit, not the owner's.
 */

const PREFIX = "sol.key.";

export interface ProviderInfo {
  id: string;
  label: string;
  models: string[];
  note: string;
  /** Where to get a key, shown next to the field. */
  console: string;
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: "openai",
    label: "OpenAI",
    models: ["gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini", "gpt-4o"],
    note: "Log probabilities are reliable on the 4.x line. The 5.x models gate or reject them.",
    console: "platform.openai.com/api-keys",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    models: ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-2.5-pro"],
    note: "Only the 2.5 line returns log probabilities; 3.x dropped them. The free tier covers this.",
    console: "aistudio.google.com/apikey",
  },
];

/** Anthropic is absent on purpose, and the UI says why rather than staying silent. */
export const EXCLUDED = { label: "Anthropic", why: "its API returns no log probabilities in any form" };

export function readKey(provider: string): string {
  try {
    return window.localStorage.getItem(PREFIX + provider) ?? "";
  } catch {
    return "";
  }
}

export function writeKey(provider: string, key: string): void {
  try {
    if (key) window.localStorage.setItem(PREFIX + provider, key);
    else window.localStorage.removeItem(PREFIX + provider);
  } catch {
    /* private mode etc. */
  }
}

/** `openai:gpt-4.1-mini` -> "openai". Empty for a local model id. */
export function providerOf(modelId: string): string {
  const head = modelId.split(":", 1)[0];
  return PROVIDERS.some((p) => p.id === head) ? head : "";
}

/** Never render a key in full: enough to recognise it, not enough to leak it. */
export function maskKey(key: string): string {
  if (key.length <= 8) return key ? "•".repeat(key.length) : "";
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}
