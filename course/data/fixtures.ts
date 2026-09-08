import type {
  CompilePayload,
  CompileRequest,
  ForwardRequest,
  ForwardResponse,
  GenerateRequest,
  LogitsRequest,
  LogitsResponse,
  Meta,
  Step,
  Done,
  TokenizeRequest,
  TokenizeResponse,
} from "@/lib/types";

/**
 * Recorded backend responses, committed to the repo so every module works with
 * no backend. One file per request; the same shape whether the recorder script
 * or the "save recording" button produced it.
 */
export type FixtureKind = "tokenize" | "logits" | "forward" | "generate" | "compile" | "loop";
export type Locale = "es" | "en";

export interface RecordedGenerate {
  meta: Meta;
  steps: Step[];
  done: Done;
}

/** A sequence of /forward calls, one per generated token (the Inference Loop). */
export interface RecordedLoop {
  steps: { request: ForwardRequest; response: ForwardResponse; u: number | null }[];
}

export interface FixtureMeta {
  recorded_at?: string;
  model_id?: string;
  transformers_version?: string | null;
  torch_version?: string;
  torch_threads?: number;
  backend_version?: string;
  hardware?: string;
}

interface FixtureBase<K extends FixtureKind, Req, Res> {
  $schema: "sol-fixture/1";
  id: string;
  kind: K;
  module: string;
  title: Record<Locale, string>;
  recordedAt: string;
  model_id: string;
  request: Req;
  response: Res;
  meta?: FixtureMeta;
  compile?: CompilePayload;
}

export type FixtureFile =
  | FixtureBase<"tokenize", TokenizeRequest, TokenizeResponse>
  | FixtureBase<"logits", LogitsRequest, LogitsResponse>
  | FixtureBase<"forward", ForwardRequest, ForwardResponse>
  | FixtureBase<"generate", GenerateRequest, RecordedGenerate>
  | FixtureBase<"compile", CompileRequest, CompilePayload>
  | FixtureBase<"loop", { prompt: string; use_chat_template: boolean; sample: ForwardRequest["sample"] }, RecordedLoop>;

export type FixtureOf<K extends FixtureKind> = Extract<FixtureFile, { kind: K }>;

export interface FixtureManifestEntry {
  id: string;
  kind: FixtureKind;
  title: Record<Locale, string>;
  load: () => Promise<FixtureFile>;
}

export function assertFixture(value: unknown): asserts value is FixtureFile {
  const f = value as Partial<FixtureFile> | null;
  if (!f || typeof f !== "object") throw new Error("not a fixture: not an object");
  if (f.$schema !== "sol-fixture/1") throw new Error(`not a fixture: $schema is ${String(f.$schema)}`);
  if (typeof f.id !== "string" || typeof f.kind !== "string") throw new Error("not a fixture: missing id or kind");
  if (!("request" in f) || !("response" in f)) throw new Error("not a fixture: missing request or response");
}

/** Stable hash of a request so a recording can be matched to the same request later. */
export function requestHash(kind: FixtureKind, request: unknown): string {
  const text = kind + ":" + stableStringify(request);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => k !== "model" && obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}
