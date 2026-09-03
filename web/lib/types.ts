// Mirrors backend/app/tracing.py and the /compile payload. Keep in sync.

export type Mode = "fsm" | "cfg";
export type ModeRequest = "auto" | Mode;

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
  stopped_by: "eos" | "max_new_tokens";
  tokens: { token_id: number; token: string; text: string }[];
}

export interface GenerateRequest {
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
