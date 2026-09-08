import { compileSchema, forward, generate, logits, tokenize } from "@/lib/api/endpoints";
import type {
  CompilePayload,
  CompileRequest,
  ForwardRequest,
  ForwardResponse,
  GenerateEvent,
  GenerateRequest,
  LogitsRequest,
  LogitsResponse,
  TokenizeRequest,
  TokenizeResponse,
} from "@/lib/types";
import { requestHash, type FixtureFile, type FixtureKind, type FixtureOf } from "./fixtures";

/** What a lab talks to. The live client hits the backend; the recorded one replays fixtures through the same calls. */
export interface LabClient {
  readonly kind: "live" | "recorded";
  compile(req: CompileRequest, signal?: AbortSignal): Promise<CompilePayload>;
  generate(req: GenerateRequest, onEvent: (e: GenerateEvent) => void, signal?: AbortSignal): Promise<void>;
  tokenize(req: TokenizeRequest, signal?: AbortSignal): Promise<TokenizeResponse>;
  forward(req: ForwardRequest, signal?: AbortSignal): Promise<ForwardResponse>;
  logits(req: LogitsRequest, signal?: AbortSignal): Promise<LogitsResponse>;
}

export class FixtureMissError extends Error {
  kind: FixtureKind;
  constructor(kind: FixtureKind) {
    super(`no recording for this ${kind} request`);
    this.name = "FixtureMissError";
    this.kind = kind;
  }
}

export function createLiveClient(base: string, model: string | null): LabClient {
  const withModel = <T extends { model?: string | null }>(req: T): T => (model ? { ...req, model } : req);
  return {
    kind: "live",
    compile: (req, signal) => compileSchema(base, withModel(req), { signal }),
    generate: (req, onEvent, signal) => generate(base, withModel(req), onEvent, signal),
    tokenize: (req, signal) => tokenize(base, withModel(req), { signal }),
    forward: (req, signal) => forward(base, withModel(req), { signal }),
    logits: (req, signal) => logits(base, withModel(req), { signal }),
  };
}

export interface RecordedOptions {
  /** Which fixture to prefer when several could answer. */
  activeId?: string | null;
  /** Milliseconds between replayed SSE events, so a replay "looks alive" on stage. */
  replayDelayMs?: number;
}

function pick<K extends FixtureKind>(fixtures: FixtureFile[], kind: K, request: unknown, opts: RecordedOptions): FixtureOf<K> {
  const candidates = fixtures.filter((f): f is FixtureOf<K> => f.kind === kind);
  if (opts.activeId) {
    const active = candidates.find((f) => f.id === opts.activeId);
    if (active) return active;
  }
  const hash = requestHash(kind, request);
  const exact = candidates.find((f) => requestHash(kind, f.request) === hash);
  if (exact) return exact;
  if (candidates.length === 1) return candidates[0];
  throw new FixtureMissError(kind);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createRecordedClient(fixtures: FixtureFile[], opts: RecordedOptions = {}): LabClient {
  return {
    kind: "recorded",
    compile: async (req) => {
      const generateWithCompile = fixtures.find((f) => f.kind === "generate" && f.compile && requestHash("compile", { schema: req.schema, mode: req.mode }) === requestHash("compile", { schema: f.request.schema, mode: f.request.mode }));
      if (generateWithCompile?.compile) return generateWithCompile.compile;
      return pick(fixtures, "compile", req, opts).response;
    },
    generate: async (req, onEvent, signal) => {
      const fixture = pick(fixtures, "generate", req, opts);
      const delay = opts.replayDelayMs ?? 0;
      const { meta, steps, done } = fixture.response;
      onEvent({ event: "meta", data: meta });
      for (const step of steps) {
        if (signal?.aborted) return;
        if (delay) await sleep(delay);
        onEvent({ event: "step", data: step });
      }
      onEvent({ event: "done", data: done });
    },
    tokenize: async (req) => pick(fixtures, "tokenize", req, opts).response,
    forward: async (req) => {
      // A loop fixture answers step by step: the request's token list selects the step.
      const loops = fixtures.filter((f): f is FixtureOf<"loop"> => f.kind === "loop");
      for (const loop of loops) {
        const hit = loop.response.steps.find((s) => sameIds(s.request.token_ids, req.token_ids) || (req.prompt !== undefined && s.request.prompt === req.prompt));
        if (hit) return hit.response;
      }
      return pick(fixtures, "forward", req, opts).response;
    },
    logits: async (req) => pick(fixtures, "logits", req, opts).response,
  };
}

function sameIds(a: number[] | undefined, b: number[] | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
