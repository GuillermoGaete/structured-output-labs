// Mirrors backend/app/tracing.py, main.py and introspect.py. Keep in sync.

export type Mode = "fsm" | "cfg" | "none" | "json";
export type ModeRequest = "auto" | "fsm" | "cfg";
export type Constraint = "schema" | "none" | "json";
export type EngineBackend = "outlines_core" | "llguidance" | "none";
export type StopReason = "eos" | "max_new_tokens" | "stopped";
export type FailureClass =
  | "ok"
  | "fence"
  | "preamble"
  | "invalid_json"
  | "truncated"
  | "schema_type"
  | "schema_missing_key"
  | "schema_extra_key";

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
  warmed_up: boolean;
  uptime_s: number;
  load_time_s: number | null;
  max_new_tokens_cap: number;
  forward_max_tokens: number;
  attention_all_max_tokens: number;
  logits_top_k_cap: number;
  constraints: Constraint[];
  modes: ModeRequest[];
  backend_version: string;
  transformers_version: string | null;
  torch_version: string;
  torch_threads: number;
  models: ModelStatus[];
  max_resident_models: number | null;
  // present once the default model is loaded
  n_layers?: number;
  n_heads?: number;
  n_kv_heads?: number;
  hidden_size?: number;
  intermediate_size?: number;
  n_params?: number;
  n_params_embedding?: number;
  tied_embeddings?: boolean;
  rope_theta?: number | null;
  tokenizer_entries?: number;
  padding_rows?: number;
  eos_token_id?: number | null;
  default_sampling?: Record<string, number | boolean | null>;
  attn_implementation?: string | null;
  features?: { compare_tokenizer: string | null; merges_replay: boolean };
}

export interface ModelsResponse {
  default: string;
  max_resident: number;
  models: ModelStatus[];
}

export interface Preset {
  id: string;
  name: string;
  description: string;
  schema: Record<string, unknown>;
  prompt: string;
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

export interface CompileRequest {
  schema: Record<string, unknown>;
  mode: ModeRequest;
  constraint?: Constraint;
  model?: string | null;
}

export interface CompilePayload {
  mode: Mode;
  constraint: Constraint;
  backend: EngineBackend;
  engine_backend: EngineBackend;
  recursive: boolean;
  regex: string | null;
  regex_error: string | null;
  regex_length: number;
  vocab_size: number;
  model_id: string;
  char_fsm: Automaton | null;
  token_dfa: Automaton | null;
  token_dfa_error?: string;
  note?: string;
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
  /** The model's argmax was forbidden by the mask. */
  was_overridden: boolean;
  p_original: number;
  p_forced: number;
  /** The chosen token is the model's own argmax. */
  argmax_taken: boolean;
  dt_ms: number;
  forward_ms: number;
  mask_ms: number;
  observer_ms: number;
  sample_ms: number;
}

export interface Sampling {
  temperature: number;
  top_k: number;
  top_p: number;
  seed: number | null;
}

export interface Meta {
  mode: Mode;
  backend: EngineBackend;
  model_id: string;
  regex: string | null;
  prompt_token_count: number;
  vocab_size: number;
  max_new_tokens: number;
  temperature: number;
  recursive: boolean;
  constraint: Constraint;
  engine_backend: EngineBackend;
  sampling: Sampling;
  schema_in_prompt: boolean;
  use_chat_template: boolean;
  prompt_rendered: string;
  compile_ms: number;
  compile_cached: boolean | null;
  include_steps: boolean;
}

export interface ParseError {
  message: string;
  pos: number;
  lineno: number;
  colno: number;
}

export interface SchemaError {
  message: string;
  validator: string;
  path: string[];
  json_path: string;
  schema_path: string[];
  validator_value: unknown;
}

export interface Validation {
  raw_text: string;
  stripped_text: string;
  strip_applied: ("fence" | "preamble" | "trailing")[];
  raw_parse_ok: boolean;
  raw_schema_ok: boolean;
  parse_ok: boolean;
  parse_error: ParseError | null;
  schema_ok: boolean;
  schema_error: SchemaError | null;
  schema_error_counts: Record<string, number>;
  stop_reason: StopReason;
  failure_class: FailureClass;
  failure_class_stripped: FailureClass;
  parsed: unknown;
}

export interface Timing {
  compile_ms: number;
  compile_cached: boolean | null;
  prefill_ms: number;
  decode_ms: number;
  forward_ms: number;
  processor_ms: number;
  observer_ms: number;
  sample_ms: number;
  total_ms: number;
  n_prompt_tokens: number;
  n_new_tokens: number;
  tokens_per_s: number;
  decode_tokens_per_s: number;
  first_token_ms: number;
  torch_threads: number;
}

export interface Summary {
  n_overridden: number;
  n_argmax_taken: number;
  mean_vocab_kept: number;
  mean_mass_removed: number;
  min_n_allowed: number;
  max_stack_depth: number;
}

export interface GeneratedToken {
  token_id: number;
  token: string;
  text: string;
}

export interface Done {
  text: string;
  parsed: unknown;
  valid: boolean;
  validation_error: string | null;
  n_steps: number;
  elapsed_s: number;
  stopped_by: StopReason;
  tokens: GeneratedToken[];
  mode: Mode;
  engine_backend: EngineBackend;
  stop_reason: StopReason;
  validation: Validation;
  timing: Timing;
  summary: Summary;
}

export interface GenerateRequest {
  schema: Record<string, unknown>;
  prompt: string;
  mode: ModeRequest;
  constraint: Constraint;
  max_new_tokens: number;
  temperature: number;
  top_k_sampling: number;
  top_p: number;
  top_k_report: number;
  seed: number | null;
  use_chat_template: boolean;
  schema_in_prompt: boolean;
  include_steps: boolean;
  model?: string | null;
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

// ---------------------------------------------------------------- /tokenize
export interface TokenizeRequest {
  text: string;
  use_chat_template?: boolean;
  tokenizer?: "model" | "gpt2";
  merges?: boolean;
  model?: string | null;
}

export type SegmentRole = "template" | "system" | "user";

export interface TokenSegment {
  role: SegmentRole;
  start: number;
  end: number;
}

export interface TokenRow {
  i: number;
  id: number;
  token: string;
  text: string;
  start: number;
  end: number;
  byte_start: number;
  byte_end: number;
  utf16_start: number;
  utf16_end: number;
  is_special: boolean;
  is_template: boolean;
  segment: SegmentRole;
  partial_utf8: boolean;
}

export interface MergeStep {
  rank: number;
  pair: [string, string];
  result: string[];
}

export interface MergePiece {
  piece: string;
  start: number;
  end: number;
  symbols: string[];
  steps: MergeStep[];
  final: string[];
  final_ids: (number | null)[];
}

export interface TokenizeResponse {
  tokenizer: "model" | "gpt2";
  tokenizer_id: string;
  text: string;
  rendered: string;
  use_chat_template: boolean;
  n_chars: number;
  n_bytes: number;
  n_utf16: number;
  n_tokens: number;
  vocab_entries: number;
  vocab_size: number;
  segments: TokenSegment[] | null;
  tokens: TokenRow[];
  merges: { n_merges_total: number; pieces: MergePiece[] } | { unsupported: string } | null;
}

// ---------------------------------------------------------------- /forward
export interface SampleSpec {
  temperature: number;
  top_k?: number;
  top_p?: number;
  seed?: number | null;
  u?: number | null;
}

export interface ForwardRequest {
  prompt?: string;
  token_ids?: number[];
  use_chat_template?: boolean;
  top_k?: number;
  attention?: "last" | "all" | "none";
  layers?: number[];
  logit_lens?: boolean;
  lens_top_k?: number;
  sample?: SampleSpec | null;
  benchmark_cache?: boolean;
  decimals?: number;
  tail_bins?: number;
  model?: string | null;
}

export interface ForwardToken {
  position: number;
  id: number;
  token: string;
  text: string;
  is_special: boolean;
  is_template: boolean;
  segment: SegmentRole;
}

export interface LogitEntry {
  rank?: number;
  token_id: number;
  token: string;
  text: string;
  logit: number;
  p: number;
}

export interface TailHistogram {
  n: number;
  mass: number;
  space: "logit";
  buckets: number;
  edges: number[];
  counts: number[];
  mass_per_bucket: number[];
  logit_mean: number[];
}

export interface FinalStage {
  argmax: LogitEntry;
  top: LogitEntry[];
  top_mass: number;
  tail: TailHistogram;
  entropy_nats: number;
  entropy_bits: number;
  logsumexp: number;
  max_logit: number;
  h_norm: number;
  h_preview: number[];
}

export interface LensEntry {
  after_block: number;
  label: string;
  residual_norm: number;
  top: LogitEntry[];
  p_final_top: number;
  rank_final_top: number;
}

export interface AttentionLast {
  mode: "last";
  query_position: number;
  layers: number[];
  /** weights[layerIndex][head][position] */
  weights: number[][][];
}

export interface AttentionAll {
  mode: "all";
  query_position: number;
  layers: number[];
  /** weights[layerIndex][head][query][key] */
  weights: number[][][][];
}

export interface SampledToken {
  token_id: number;
  token: string;
  text: string;
  p: number;
  p_after: number;
  n_candidates: number;
  method: "greedy" | "sampled";
  is_eos: boolean;
  u: number | null;
  cum_lo: number | null;
  cum_hi: number | null;
  in_top: boolean;
}

export interface ForwardResponse {
  model_id: string;
  n_tokens: number;
  n_layers: number;
  n_heads: number;
  n_kv_heads: number;
  hidden_size: number;
  vocab_size: number;
  tied_embeddings: boolean;
  eos_token_id: number | null;
  attn_implementation_used: string | null;
  decimals: number;
  rendered: string | null;
  tokens: ForwardToken[];
  attention: AttentionLast | AttentionAll | null;
  logit_lens: { entries: LensEntry[]; method: string; caveat: string } | null;
  final: FinalStage;
  sampled: SampledToken | null;
  next_token_ids: number[] | null;
  timing_ms: {
    forward: number;
    attention_extract: number;
    logit_lens: number;
    total: number;
    n_tokens_computed: number;
    cached: {
      forward_prefix_ms: number;
      forward_last_token_with_cache_ms: number;
      n_tokens_computed: number;
      argmax_matches: boolean;
    } | null;
  };
}

// ---------------------------------------------------------------- /logits
export interface LogitsRequest {
  prompt?: string;
  token_ids?: number[];
  use_chat_template?: boolean;
  top_k?: number;
  tail_buckets?: number;
  full_logits?: boolean;
  decimals?: number;
  model?: string | null;
}

export interface LogitsResponse {
  model_id: string;
  rendered: string | null;
  n_tokens: number;
  vocab_size: number;
  vocab_entries: number;
  padding_rows_start: number;
  logsumexp: number;
  max_logit: number;
  min_logit: number;
  entropy_nats: number;
  entropy_bits: number;
  top: LogitEntry[];
  top_mass: number;
  tail: TailHistogram;
  cumulative: { ranks: number[]; mass: number[] };
  full_logits: { dtype: "float16"; encoding: "base64"; n: number; data: string } | null;
  timing_ms: number;
}
