import type { Mode, ModeRequest } from "./types";

/**
 * The engine buttons name the library, not the technique: what runs is
 * outlines_core, llguidance or xgrammar; FSM and CFG describe what they build.
 */
export interface EngineInfo {
  /** The button text: the library, or Auto / Prompt only. */
  label: string;
  /** One short line under the label. */
  technique: string;
  /** The tooltip. */
  hint: string;
}

export const ENGINES: Record<ModeRequest, EngineInfo> = {
  auto: {
    label: "Auto",
    technique: "by schema",
    hint: "outlines_core for a flat schema, llguidance for a recursive one",
  },
  fsm: {
    label: "outlines_core",
    technique: "regex → finite automaton",
    hint: "outlines_core: JSON Schema → regex → a finite automaton over tokens. The lab can draw its states.",
  },
  cfg: {
    label: "llguidance",
    technique: "grammar → pushdown stack",
    hint: "llguidance: JSON Schema → grammar with a real stack, so recursion nests without limit. It exposes no automaton state.",
  },
  xgr: {
    label: "xgrammar",
    technique: "grammar → PDA + mask cache",
    hint: "xgrammar: JSON Schema → grammar, a pushdown automaton and a cache of token masks; it prints the grammar it compiled",
  },
  none: {
    label: "Prompt only",
    technique: "no mask · asked in words",
    hint: "No mask: the schema is appended to the prompt and the JSON is asked for in words; only the final validation checks the shape",
  },
};

/** "outlines_core", "llguidance", "xgrammar", "Prompt only" or "Auto". */
export function engineLabel(mode: ModeRequest | Mode | string | null | undefined): string {
  return mode && mode in ENGINES ? ENGINES[mode as ModeRequest].label : String(mode ?? "");
}

/**
 * What the "Prompt only" mode appends to the prompt instead of a mask. The same
 * text as `SCHEMA_HINT` in `backend/app/engine.py`; `{schema}` is where the
 * schema goes, and a template without it gets the schema appended anyway.
 */
export const DEFAULT_SCHEMA_HINT =
  "Answer directly with one JSON object that matches this JSON Schema. Do not explain, do not think aloud, do not use code fences.\n\n{schema}\n\nReturn just the JSON:";

export const SCHEMA_PLACEHOLDER = "{schema}";

/** The hint with the schema in place; a template without the placeholder gets the schema appended. Mirrors `render_hint`. */
export function renderHint(template: string, schema: unknown): string {
  let text = template.trim() || DEFAULT_SCHEMA_HINT;
  if (!text.includes(SCHEMA_PLACEHOLDER)) text = `${text}\n${SCHEMA_PLACEHOLDER}`;
  return text.split(SCHEMA_PLACEHOLDER).join(JSON.stringify(leanSchema(schema)));
}

/** The user turn of a prompt-only run: the prompt, a blank line, the hint. The chat template wraps this on the server. */
export function composePrompt(prompt: string, template: string | null | undefined, schema: unknown): string {
  return `${prompt}\n\n${renderHint(template ?? DEFAULT_SCHEMA_HINT, schema)}`;
}

/**
 * The schema as the hint sends it: without `title` and `description` at any
 * level. The engines ignore both; in the prompt they cost tokens and leak the
 * lab's commentary. Mirrors `lean_schema` in `backend/app/engine.py`.
 */
export function leanSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(leanSchema);
  if (node && typeof node === "object") {
    return Object.fromEntries(
      Object.entries(node as Record<string, unknown>)
        .filter(([k]) => k !== "title" && k !== "description")
        .map(([k, v]) => [k, leanSchema(v)]),
    );
  }
  return node;
}
