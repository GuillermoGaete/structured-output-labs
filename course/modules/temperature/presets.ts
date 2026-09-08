import { FALLBACK_PRESETS } from "@/lib/presets";
import type { LogitsRequest } from "@/lib/types";

const person = FALLBACK_PRESETS.find((p) => p.id === "person")!;
const tree = FALLBACK_PRESETS.find((p) => p.id === "tree")!;

/** Requests recorded as fixtures (see scripts/recipes.mjs): the keys must match exactly. */
export const PROMPTS = {
  person: { prompt: person.prompt, use_chat_template: true, top_k: 200, tail_buckets: 64, full_logits: false },
  tree: { prompt: tree.prompt, use_chat_template: true, top_k: 200, tail_buckets: 64, full_logits: false },
  capital: { prompt: "The capital of France is", use_chat_template: false, top_k: 200, tail_buckets: 64, full_logits: false },
  fibonacci: { prompt: "def fibonacci(n):\n    ", use_chat_template: false, top_k: 200, tail_buckets: 64, full_logits: false },
} as const satisfies Record<string, LogitsRequest>;

export type PromptId = keyof typeof PROMPTS;
