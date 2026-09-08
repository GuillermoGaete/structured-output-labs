/** Plain fetch helpers for the FastAPI backend: JSON in, JSON or Server-Sent Events out. */

export const DEFAULT_BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL ?? "").replace(/\/+$/, "");

export function normalizeUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export class ApiError extends Error {
  status: number;
  detail: string;
  retryAfterS: number | null;

  constructor(status: number, detail: string, retryAfterS: number | null = null) {
    super(detail || `request failed with ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
    this.retryAfterS = retryAfterS;
  }
}

export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
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

async function toApiError(res: Response): Promise<ApiError> {
  let detail = "";
  try {
    const body = await res.json();
    detail = typeof body?.detail === "string" ? body.detail : JSON.stringify(body?.detail ?? body);
  } catch {
    detail = await res.text().catch(() => "");
  }
  const retry = res.headers.get("retry-after");
  return new ApiError(res.status, detail || `${res.status} ${res.statusText}`, retry ? Number(retry) : null);
}

export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export async function getJson<T>(base: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const req = fetch(`${base}${path}`, { cache: "no-store", signal: opts.signal });
  const res = await (opts.timeoutMs ? withTimeout(req, opts.timeoutMs) : req);
  if (!res.ok) throw await toApiError(res);
  return (await res.json()) as T;
}

export async function postJson<Req, Res>(base: string, path: string, body: Req, opts: RequestOptions = {}): Promise<Res> {
  const req = fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  const res = await (opts.timeoutMs ? withTimeout(req, opts.timeoutMs) : req);
  if (!res.ok) throw await toApiError(res);
  return (await res.json()) as Res;
}

/**
 * POST and read a Server-Sent Events stream. EventSource only does GET, so the
 * framing is parsed by hand: blocks separated by a blank line, `event:` and
 * `data:` lines, `:` keep-alive comments, CRLF normalised.
 */
export async function postSse(
  base: string,
  path: string,
  body: unknown,
  onEvent: (event: string, data: unknown) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) throw await toApiError(res);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const dispatch = (block: string) => {
    let event = "message";
    const dataLines: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith(":")) continue;
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    }
    if (!dataLines.length) return;
    try {
      onEvent(event, JSON.parse(dataLines.join("\n")));
    } catch {
      /* malformed block: ignore */
    }
  };
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
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
