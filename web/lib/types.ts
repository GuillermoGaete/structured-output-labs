// Mirrors backend/app/tracing.py and the /compile payload. Keep in sync.

/** "none": no mask; the prompt asks for the shape in words and only the final validation checks it. */
export type Mode = "fsm" | "cfg" | "xgr" | "none";
export type ModeRequest = "auto" | Mode;

/** One row of the MODEL_IDS allowlist. */
export interface ModelStatus {
  id: string;
  default: boolean;
  loaded: boolean;
  loading: boolean;
  warmed_up: boolean;
  error: string | null;
  load_time_s: number | null;
  toy: boolean;
  vocab_size?: number;
  n_params?: number;
  n_layers?: number;
  hidden_size?: number;
  tied_embeddings?: boolean;
}

export interface Health {
  status: "ok" | "loading" | "error";
  loaded: boolean;
  loading: boolean;
  error: string | null;
  model_id: string;
  toy: boolean;
  device: string;
  vocab_size: number | null;
  busy: boolean;
  uptime_s: number;
  load_time_s: number | null;
  max_new_tokens_cap: number;
  /** The constraint engines this build can run; "xgr" only when xgrammar is installed. Absent on older backends. */
  engines?: Mode[];
  /** One row per allowlisted model. Absent on backends without the registry. */
  models?: ModelStatus[];
  max_resident_models?: number | null;
}

export interface Preset {
  id: string;
  name: string;
  description: string;
  schema: Record<string, unknown>;
  prompt: string;
  /** The same model as pasteable Pydantic source. Absent on older backends. */
  model_source?: string;
  /** Catalogue heading: "Structure", "Classification & bias", "Reasoning", "Extraction", "Bias probes". */
  group?: string;
  /** Counterfactual variants: one attribute swapped, everything else the same. The first is `prompt`. */
  variants?: { label: string; prompt: string }[];
}

/** POST /schema/from-pydantic: what pydantic's own model_json_schema() produced. */
export interface PydanticSchema {
  root: string;
  models: string[];
  enums: string[];
  schema: Record<string, unknown>;
  warnings: string[];
}

/** A rejection from the converter: the reason and, when known, the offending line. */
export interface PydanticError {
  message: string;
  line: number | null;
}

export interface GraphNode {
  id: number;
  raw?: number;
  final: boolean;
}

export interface GraphEdge {
  source: number;
  target: number;
  label: string;
  count: number;
  sample_token_ids?: number[];
}

export interface Automaton {
  level: "char" | "token";
  initial: number;
  finals: number[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  total_states: number;
  truncated: boolean;
}

export interface CompilePayload {
  mode: Mode;
  backend: "outlines_core" | "llguidance" | "xgrammar" | "none";
  recursive: boolean;
  regex: string | null;
  regex_error: string | null;
  regex_length: number;
  vocab_size: number;
  model_id: string;
  char_fsm: Automaton | null;
  token_dfa: Automaton | null;
  token_dfa_error?: string;
  /** CFG mode: a BNF reading of the schema, the shape llguidance compiles. Absent on older backends. */
  grammar?: string | null;
  grammar_rules?: number;
  /** "schema": a BNF reading the lab derives; "engine": the text the engine itself compiled (XGrammar). */
  grammar_source?: "schema" | "engine" | null;
  /** FSM mode: numeric bounds outlines_core has no regex for. Small integer ranges are compiled as enums instead. */
  fsm_ignored?: string[];
  /** "none" mode: the sentence appended to the prompt, schema included. */
  schema_hint?: string;
}

export interface TopEntry {
  token_id: number;
  token: string;
  text: string;
  p: number;
  allowed: boolean;
}

export interface Step {
  i: number;
  token_id: number;
  token: string;
  text: string;
  partial_text: string;
  n_allowed: number;
  vocab_size: number;
  mass_removed: number;
  top_original: TopEntry[];
  top_forced: TopEntry[];
  fsm_state: number | null;
  stack_depth: number;
  was_overridden: boolean;
  p_original: number;
  p_forced: number;
  /** The grammar engine only: token ids it forces next, their text, and whether it would accept EOS here. */
  ff_token_ids?: number[];
  ff_text?: string;
  accepting?: boolean | null;
  /** A branch recomputed this step from its parent's prefix. */
  replayed?: boolean;
}

export interface Meta {
  mode: Mode;
  backend: string;
  model_id: string;
  regex: string | null;
  prompt_token_count: number;
  vocab_size: number;
  max_new_tokens: number;
  temperature: number;
  recursive: boolean;
  /** "none" mode: the schema was appended to the prompt instead of compiled into a mask. */
  schema_in_prompt?: boolean;
  /** The exact text that was tokenized: system prompt, chat template and, in "none" mode, the hint. */
  prompt_text?: string;
}

export interface Done {
  text: string;
  parsed: unknown;
  valid: boolean;
  validation_error: string | null;
  n_steps: number;
  elapsed_s: number;
  stopped_by: "eos" | "max_new_tokens" | "stopped";
  tokens: { token_id: number; token: string; text: string }[];
}

export interface GenerateRequest {
  /** One of the allowlisted ids; omitted means the default. */
  model?: string | null;
  schema: Record<string, unknown>;
  prompt: string;
  mode: ModeRequest;
  max_new_tokens: number;
  temperature: number;
  top_k_sampling: number;
  top_k_report: number;
  seed: number | null;
  use_chat_template: boolean;
  /** A branch: replay these tokens through the mask, then continue. */
  prefix_token_ids?: number[];
  /** "none" mode only: the wording that asks for the shape in the prompt; `{schema}` marks where the schema goes. */
  schema_hint?: string | null;
}

export type GenerateEvent =
  | { event: "meta"; data: Meta }
  | { event: "step"; data: Step }
  | { event: "done"; data: Done }
  | { event: "error"; data: { detail: string } };

export interface Trace {
  meta: Meta | null;
  steps: Step[];
  done: Done | null;
  error: string | null;
}


// ---------------------------------------------------------------- logprobs mode
// POST /stream. No schema, no mask: the distribution behind every token.

export interface LogitEntry {
  rank: number;
  token_id: number;
  token: string;
  text: string;
  /** Raw logit, before any temperature. This is what lets the browser redraw the bars. */
  logit: number;
  /** softmax over the whole vocabulary at T = 1, for reference. */
  p: number;
}

/** Histogram, in logit space, of everything below the reported top-k. */
export interface TailHistogram {
  n: number;
  mass: number;
  /** A provider reports only its top-k, so the rest is estimated from the residual mass. */
  approx?: boolean;
  buckets: number;
  edges: number[];
  counts: number[];
  logit_mean: number[];
}

export interface StreamMeta {
  model_id: string;
  /** Set for a hosted model; absent for a local one. */
  provider?: string;
  /** True when the tail is a single mean-field bucket rather than a histogram. */
  tail_approx?: boolean;
  vocab_size: number;
  prompt_token_count: number;
  prompt_rendered: string;
  max_new_tokens: number;
  sampling: { temperature: number; top_k: number; top_p: number; seed: number | null };
  top_k_report: number;
  tail_bins: number;
  use_chat_template: boolean;
}

export interface StreamStep {
  i: number;
  token_id: number;
  token: string;
  text: string;
  partial_text: string;
  chosen_logit: number;
  chosen_p: number;
  chosen_rank: number | null;
  logsumexp: number;
  entropy_bits: number;
  top: LogitEntry[];
  tail: TailHistogram;
  dt_ms: number;
  forward_ms: number;
  replayed?: boolean;
}

export interface StreamDone {
  text: string;
  n_steps: number;
  stop_reason: "eos" | "max_new_tokens" | "stopped";
  elapsed_s: number;
  tokens_per_s: number;
}

export interface StreamRequest {
  model?: string | null;
  prompt: string;
  max_new_tokens: number;
  temperature: number;
  top_k: number;
  top_p: number;
  seed: number | null;
  use_chat_template: boolean;
  top_k_report: number;
  tail_bins: number;
  /** A branch: replay these tokens, then continue. Local models only. */
  prefix_token_ids?: number[];
  /** Render the prompt like the constrained mode, to continue one of its runs without the mask. */
  json_system_prompt?: boolean;
}

export type StreamEvent =
  | { event: "meta"; data: StreamMeta }
  | { event: "step"; data: StreamStep }
  | { event: "done"; data: StreamDone }
  | { event: "error"; data: { detail: string } };

export interface StreamTrace {
  meta: StreamMeta | null;
  steps: StreamStep[];
  done: StreamDone | null;
  error: string | null;
}
