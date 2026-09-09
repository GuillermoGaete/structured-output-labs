import type { CompilePayload, GenerateEvent, GenerateRequest, Health, ModeRequest, Preset, PydanticError, PydanticSchema } from "./types";

const STORAGE_KEY = "sol.backendUrl";
export const DEFAULT_BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL ?? "").replace(/\/+$/, "");

export function readStoredBackendUrl(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeBackendUrl(url: string | null): void {
  try {
    if (url) window.localStorage.setItem(STORAGE_KEY, url);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode etc. */
  }
}

export function normalizeUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function fetchHealth(base: string, timeoutMs = 4000): Promise<Health> {
  const res = await withTimeout(fetch(`${base}/health`, { cache: "no-store" }), timeoutMs);
  if (!res.ok) throw new Error(`/health returned ${res.status}`);
  return (await res.json()) as Health;
}

export async function fetchPresets(base: string): Promise<Preset[]> {
  const res = await fetch(`${base}/presets`, { cache: "no-store" });
  if (!res.ok) throw new Error(`/presets returned ${res.status}`);
  return (await res.json()) as Preset[];
}

export async function compileSchema(base: string, schema: Record<string, unknown>, mode: ModeRequest): Promise<CompilePayload> {
  const res = await fetch(`${base}/compile`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ schema, mode }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || `/compile returned ${res.status}`);
  }
  return (await res.json()) as CompilePayload;
}

/** Raised by `schemaFromPydantic` when the converter rejects the source. */
export class PydanticSourceError extends Error {
  line: number | null;

  constructor(detail: PydanticError) {
    super(detail.message);
    this.name = "PydanticSourceError";
    this.line = detail.line;
  }
}

/** Pydantic source -> the JSON Schema pydantic derives from it. The server parses it, never runs it. */
export async function schemaFromPydantic(base: string, source: string, model?: string | null): Promise<PydanticSchema> {
  const res = await fetch(`${base}/schema/from-pydantic`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ source, model: model ?? null }),
  });
  if (res.status === 400) {
    const body = (await res.json().catch(() => null)) as { detail?: PydanticError } | null;
    throw new PydanticSourceError(body?.detail ?? { message: "the source was rejected", line: null });
  }
  if (!res.ok) throw new Error(`/schema/from-pydantic returned ${res.status}`);
  return (await res.json()) as PydanticSchema;
}

/**
 * POST /generate and read the Server-Sent Events stream.
 * EventSource only does GET, so the SSE framing is parsed by hand here.
 */
export async function generate(
  base: string,
  req: GenerateRequest,
  onEvent: (event: GenerateEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${base}/generate`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream" },
    body: JSON.stringify(req),
    signal,
  });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(detail || `/generate returned ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const dispatch = (block: string) => {
    let event = "message";
    const dataLines: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith(":")) continue; // keep-alive comment
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    }
    if (!dataLines.length) return;
    try {
      onEvent({ event, data: JSON.parse(dataLines.join("\n")) } as GenerateEvent);
    } catch {
      /* ignore malformed block */
    }
  };
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    // sse-starlette frames with CRLF; normalise so the block separator is "\n\n".
    buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n?/g, "\n");
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      if (block.trim()) dispatch(block);
    }
  }
  if (buffer.trim()) dispatch(buffer);
}
