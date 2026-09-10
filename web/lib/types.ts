// Mirrors backend/app/tracing.py and the /compile payload. Keep in sync.

export type Mode = "fsm" | "cfg";
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
  backend: "outlines_core" | "llguidance";
  recursive: boolean;
  regex: string | null;
  regex_error: string | null;
  regex_length: number;
  vocab_size: number;
  model_id: string;
  char_fsm: Automaton | null;
  token_dfa: Automaton | null;
  token_dfa_error?: string;
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
  buckets: number;
  edges: number[];
  counts: number[];
  logit_mean: number[];
}

export interface StreamMeta {
  model_id: string;
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
