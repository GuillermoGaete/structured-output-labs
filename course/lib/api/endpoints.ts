import type {
  CompilePayload,
  CompileRequest,
  ForwardRequest,
  ForwardResponse,
  GenerateEvent,
  GenerateRequest,
  Health,
  LogitsRequest,
  LogitsResponse,
  ModelsResponse,
  Preset,
  TokenizeRequest,
  TokenizeResponse,
} from "@/lib/types";
import { getJson, postJson, postSse, type RequestOptions } from "./http";

export const fetchHealth = (base: string, timeoutMs = 4000) => getJson<Health>(base, "/health", { timeoutMs });
export const fetchPresets = (base: string) => getJson<Preset[]>(base, "/presets");
export const fetchModels = (base: string) => getJson<ModelsResponse>(base, "/models");
export const loadModel = (base: string, model: string) =>
  postJson<{ model: string }, { model: string; started: boolean }>(base, "/models/load", { model });

export const compileSchema = (base: string, req: CompileRequest, opts?: RequestOptions) =>
  postJson<CompileRequest, CompilePayload>(base, "/compile", req, opts);
export const tokenize = (base: string, req: TokenizeRequest, opts?: RequestOptions) =>
  postJson<TokenizeRequest, TokenizeResponse>(base, "/tokenize", req, opts);
export const forward = (base: string, req: ForwardRequest, opts?: RequestOptions) =>
  postJson<ForwardRequest, ForwardResponse>(base, "/forward", req, opts);
export const logits = (base: string, req: LogitsRequest, opts?: RequestOptions) =>
  postJson<LogitsRequest, LogitsResponse>(base, "/logits", req, opts);

export function generate(base: string, req: GenerateRequest, onEvent: (event: GenerateEvent) => void, signal?: AbortSignal) {
  return postSse(base, "/generate", req, (event, data) => onEvent({ event, data } as GenerateEvent), signal);
}
