import { FALLBACK_PRESETS } from "@/lib/presets";
import type { GenerateRequest, Preset } from "@/lib/types";

export type ExperimentPresetId = "person" | "invoice";

export interface ExperimentParams {
  preset: ExperimentPresetId;
  temperature: number;
  topP: number;
  maxTokens: number;
  schemaInPrompt: boolean;
}

/** The request every mode shares; the recorded fixtures were made with the defaults below. */
export const DEFAULT_PARAMS: ExperimentParams = { preset: "person", temperature: 0.7, topP: 0.8, maxTokens: 120, schemaInPrompt: true };

export function baseRequest(params: ExperimentParams, presets: Preset[]): GenerateRequest {
  const preset = presets.find((p) => p.id === params.preset) ?? FALLBACK_PRESETS.find((p) => p.id === params.preset)!;
  return {
    schema: preset.schema,
    prompt: preset.prompt,
    mode: "auto",
    constraint: "schema",
    max_new_tokens: params.maxTokens,
    temperature: params.temperature,
    top_k_sampling: 20,
    top_p: params.topP,
    top_k_report: 8,
    seed: null,
    use_chat_template: true,
    schema_in_prompt: params.schemaInPrompt,
    include_steps: true,
  };
}
