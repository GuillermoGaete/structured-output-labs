import { FALLBACK_PRESETS } from "@/lib/presets";

const person = FALLBACK_PRESETS.find((p) => p.id === "person")!;

export const LOOP_PROMPTS = {
  person: { prompt: person.prompt, useChatTemplate: true },
  capital: { prompt: "The capital of France is", useChatTemplate: false },
  fibonacci: { prompt: "def fibonacci(n):\n    ", useChatTemplate: false },
} as const;

export type LoopPresetId = keyof typeof LOOP_PROMPTS;

/** Which recording answers a preset with these sampler settings. */
export function fixtureFor(preset: LoopPresetId | "custom", temperature: number): string | null {
  if (preset === "person") return temperature > 0 ? "person-chat-t1-seed7" : "person-chat-greedy";
  if (preset === "capital") return "capital-greedy";
  if (preset === "fibonacci") return "fibonacci-greedy";
  return null;
}
