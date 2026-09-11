"use client";

import { DEFAULT_SCHEMA_HINT, engineLabel } from "./engines";
import { usePersistedState } from "./persisted";
import { FALLBACK_PRESETS } from "./presets";
import type { Batch, ConstrainedRun, EditorSnapshot, SeedPolicy } from "./runTypes";
import type { GenerateRequest, ModeRequest, Preset } from "./types";

/** Where the schema comes from: a pasted Pydantic model, or JSON Schema typed directly. */
export type SourceKind = "pydantic" | "schema";

/** One prompt of a counterfactual probe: the same text with one attribute swapped. */
export interface Variant {
  label: string;
  prompt: string;
}

export interface LabState {
  presetId: string;
  sourceKind: SourceKind;
  /** Pydantic source; the backend derives the schema from it. */
  pydanticText: string;
  /** Which class in that source to compile, when it defines several. */
  pydanticModel: string | null;
  schemaText: string;
  prompt: string;
  mode: ModeRequest;
  maxNewTokens: number;
  temperature: number;
  /** null draws a fresh seed per run; a number makes a sampled run reproducible. */
  seed: number | null;
  /** 0 = off. */
  topKSampling: number;
  /** Runs per Repeat. */
  repeatN: number;
  seedPolicy: SeedPolicy;
  /** The variants of a probe, editable; empty when the setup is not a probe. */
  variants: Variant[];
  /** The preset the variants came from, for the probe table's name. */
  probeId: string | null;
  probeName: string | null;
  /** "Prompt only": the wording appended to the prompt instead of a mask; `{schema}` is where the schema goes. */
  schemaHint: string;
}

/** The backend's cap. Always asked for; how many rows are drawn is a view setting. */
export const TOP_K_REPORT = 20;

const KEY = "sol.lab";

const initial: LabState = {
  presetId: "person",
  sourceKind: "pydantic",
  pydanticText: FALLBACK_PRESETS[0].model_source ?? "",
  pydanticModel: null,
  schemaText: JSON.stringify(FALLBACK_PRESETS[0].schema, null, 2),
  prompt: FALLBACK_PRESETS[0].prompt,
  mode: "auto",
  maxNewTokens: 120,
  temperature: 0,
  seed: null,
  topKSampling: 0,
  repeatN: 5,
  seedPolicy: "fresh",
  variants: [],
  probeId: null,
  probeName: null,
  schemaHint: DEFAULT_SCHEMA_HINT,
};

/** Schema, prompt and knobs, remembered per browser. */
export function useLabState(): [LabState, (patch: Partial<LabState>) => void] {
  return usePersistedState(KEY, initial);
}

/** What choosing a preset writes into the editors. */
export function presetPatch(preset: Preset, state: LabState): Partial<LabState> {
  return {
    presetId: preset.id,
    schemaText: JSON.stringify(preset.schema, null, 2),
    pydanticText: preset.model_source ?? state.pydanticText,
    pydanticModel: null,
    prompt: preset.prompt,
    variants: preset.variants ? preset.variants.map((v) => ({ ...v })) : [],
    probeId: preset.variants ? preset.id : null,
    probeName: preset.variants ? preset.name : null,
  };
}

/** Batches of one probe launch are pooled under this key; editing a prompt or the schema starts a new table. */
export function probeKey(probeId: string, schema: unknown, variants: Variant[]): string {
  const text = JSON.stringify({ schema, variants: variants.map((v) => [v.label, v.prompt]) });
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `${probeId}#${(h >>> 0).toString(36)}`;
}

/** Variants worth running: a prompt, and a label that is unique in the list. */
export function runnableVariants(variants: Variant[]): Variant[] {
  const seen = new Map<string, number>();
  return variants
    .filter((v) => v.prompt.trim())
    .map((v) => {
      const base = v.label.trim() || "variant";
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      return { label: n > 1 ? `${base} ${n}` : base, prompt: v.prompt };
    });
}

/** The wire request for one constrained run. */
export function buildGenerateRequest(state: LabState, schema: Record<string, unknown>, model: string | null, prompt = state.prompt): GenerateRequest {
  return {
    model,
    schema,
    prompt,
    mode: state.mode,
    max_new_tokens: state.maxNewTokens,
    temperature: state.temperature,
    top_k_sampling: state.topKSampling,
    top_k_report: TOP_K_REPORT,
    seed: state.seed,
    use_chat_template: true,
    // Only the "none" mode reads it; sending it makes the run say what it asked for.
    schema_hint: state.mode === "none" ? state.schemaHint : null,
  };
}

/** What the editors showed, kept with the batch so a run can be put back in them. */
export function editorSnapshot(state: LabState): EditorSnapshot {
  return { presetId: state.presetId, sourceKind: state.sourceKind, pydanticText: state.pydanticText, pydanticModel: state.pydanticModel, schemaText: state.schemaText };
}

/** "Duplicate & edit": the run's inputs back in the setup. */
export function patchFromRun(run: ConstrainedRun, batch: Batch): Partial<LabState> {
  const editor = batch.editor ?? { presetId: "", sourceKind: "schema" as const, pydanticText: "", pydanticModel: null, schemaText: JSON.stringify(run.request.schema, null, 2) };
  return {
    ...editor,
    prompt: run.request.prompt,
    mode: run.request.mode,
    maxNewTokens: run.request.max_new_tokens,
    temperature: run.request.temperature,
    seed: run.request.seed,
    topKSampling: run.request.top_k_sampling,
    schemaHint: run.request.schema_hint ?? DEFAULT_SCHEMA_HINT,
  };
}

/** One line for the folded Engine & sampling section. */
export function engineSummary(state: Pick<LabState, "mode" | "temperature" | "maxNewTokens" | "seed">): string {
  const mode = engineLabel(state.mode);
  const t = state.temperature === 0 ? "T 0 (greedy)" : `T ${state.temperature.toFixed(2)}`;
  return `${mode} · ${t} · ${state.maxNewTokens} tok · seed ${state.seed ?? "—"}`;
}

export function parseSchema(text: string): { schema: Record<string, unknown> | null; error: string | null } {
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { schema: null, error: "The schema must be a JSON object." };
    }
    return { schema: value as Record<string, unknown>, error: null };
  } catch (e) {
    return { schema: null, error: e instanceof Error ? e.message : "Invalid JSON" };
  }
}
