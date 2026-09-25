/**
 * An exported LangChain / LangSmith trace, reduced to what the replay mode needs:
 * every LLM call in it, with the messages it read, the reply it recorded, and the
 * JSON Schema it asked for when it used structured output. Pure, unit-tested.
 *
 * Accepted shapes, detected in this order:
 * - a LangSmith run (`run_type`, `inputs`, `outputs`, `extra`, `child_runs`), alone,
 *   as `{ run }`, as `{ runs: [...] }`, or as a flat list / JSON Lines of runs
 *   linked by `parent_run_id`;
 * - a message list: `dumpd` (`{lc: 1, type: "constructor", id: [..., "HumanMessage"]}`),
 *   `messages_to_dict` (`{type: "human", data: {...}}`), `{role, content}`,
 *   `{type, content}` or `[role, content]`, bare or as `{ messages: [...] }` (an
 *   OpenAI request or a LangGraph state); a `ChatPromptValue` too;
 * - a dataset example (`{inputs, outputs}` without `run_type`).
 *
 * The backend only takes system / user / assistant turns, so tool calls are
 * written into the assistant's text (`[tool call · name] {...}`) and tool results
 * become user turns (`[tool result · name]`). Images and files become placeholders.
 */

import type { ChatRole } from "./types";

export type TraceFormat = "langsmith-run" | "langsmith-runs" | "langsmith-example" | "openai-request" | "messages";

export const FORMAT_LABEL: Record<TraceFormat, string> = {
  "langsmith-run": "LangSmith run tree",
  "langsmith-runs": "LangSmith runs",
  "langsmith-example": "LangSmith example",
  "openai-request": "chat request",
  messages: "message list",
};

export interface TraceMessage {
  role: ChatRole;
  content: string;
  /** A tool or function result flattened into a user turn, or the call's recorded reply. */
  origin?: "tool" | "output";
  /** Tool calls written into an assistant message's text. */
  toolCalls?: number;
  /** Images, files or audio replaced by a placeholder. */
  placeholders?: number;
  /** The recorded reply as a value: its JSON content, or the arguments of the structured-output tool call. */
  structured?: unknown;
}

export interface LlmCall {
  id: string;
  name: string;
  /** Names of the runs above it, outermost first. */
  path: string[];
  /** 1-based, in trace order. */
  index: number;
  model: string | null;
  provider: string | null;
  /** A completion model: one prompt string rather than messages. */
  completion: boolean;
  /** What the call read, followed by its recorded reply (`origin: "output"`) when there is one. */
  messages: TraceMessage[];
  schema: { schema: Record<string, unknown>; source: string } | null;
  params: { temperature: number | null; maxTokens: number | null };
  error: string | null;
  warnings: string[];
}

export interface ImportedTrace {
  name: string;
  format: TraceFormat;
  calls: LlmCall[];
  /** Runs in the trace, of any type; 0 for a message list. */
  nRuns: number;
  warnings: string[];
}

export class TraceError extends Error {}

export const MAX_CALLS = 500;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const keysOf = (v: unknown): string => (isObj(v) ? Object.keys(v).slice(0, 8).join(", ") || "none" : Array.isArray(v) ? `an array of ${v.length}` : typeof v);

// ------------------------------------------------------------------ entry points

/** JSON, or JSON Lines (one run or message per line). */
export function parseTraceText(text: string, fileName?: string): ImportedTrace {
  const trimmed = text.trim();
  if (!trimmed) throw new TraceError("the file is empty");
  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch (e) {
    const lines = trimmed.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) throw new TraceError(`not JSON: ${e instanceof Error ? e.message : String(e)}`);
    try {
      value = lines.map((l) => JSON.parse(l));
    } catch {
      throw new TraceError(`neither JSON nor JSON Lines: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return parseTrace(value, fileName);
}

export function parseTrace(value: unknown, fileName?: string): ImportedTrace {
  const fallbackName = fileName ? fileName.replace(/\.(jsonl?|ndjson|txt)$/i, "") : "trace";
  if (isRun(value)) return fromRuns([value], "langsmith-run", fallbackName);
  if (isObj(value) && isRun(value.run)) return fromRuns([value.run], "langsmith-run", fallbackName);
  if (isObj(value) && Array.isArray(value.runs) && value.runs.length && value.runs.every(isRun)) return fromRuns(value.runs, "langsmith-runs", fallbackName);
  if (Array.isArray(value) && value.length && value.every(isRun)) return fromRuns(value, value.length === 1 ? "langsmith-run" : "langsmith-runs", fallbackName);
  if (isObj(value) && value.lc === 1 && value.type === "constructor") return fromMessages(messageList(value), {}, "messages", fallbackName);
  if (isObj(value) && Array.isArray(value.messages)) {
    const request = ["model", "response_format", "tools", "tool_choice", "temperature", "max_tokens"].some((k) => k in value);
    return fromMessages(messageList(value.messages), value, request ? "openai-request" : "messages", fallbackName);
  }
  if (isObj(value) && isObj(value.inputs)) {
    const calls = collectCalls([{ run: { ...value, run_type: "llm", name: str(value.name) ?? "example" }, path: [] }]);
    if (!calls.calls.length) throw new TraceError(`an example whose inputs have no messages (keys: ${keysOf(value.inputs)})`);
    return { name: fallbackName, format: "langsmith-example", calls: calls.calls, nRuns: 1, warnings: calls.warnings };
  }
  if (Array.isArray(value) && value.length) return fromMessages(messageList(value), {}, "messages", fallbackName);
  throw new TraceError(
    `unrecognised trace (top-level ${keysOf(value)}): expected a LangSmith run or a list of runs, a list of LangChain messages, or { "messages": [...] }`,
  );
}

// ------------------------------------------------------------------ runs

function isRun(v: unknown): v is Obj {
  return isObj(v) && typeof v.run_type === "string" && ("inputs" in v || "id" in v);
}

interface Node {
  run: Obj;
  path: string[];
}

/** The runs as a tree, walked depth first; siblings in `dotted_order`, else `start_time`, else file order. */
function fromRuns(runs: Obj[], format: TraceFormat, fallbackName: string): ImportedTrace {
  const flat: Obj[] = [];
  const seen = new Set<string>();
  const collect = (run: Obj) => {
    if (typeof run.id === "string") {
      if (seen.has(run.id)) return; // listed both at the top and in a parent's child_runs
      seen.add(run.id);
    }
    flat.push(run);
    if (Array.isArray(run.child_runs)) run.child_runs.filter(isObj).forEach(collect);
  };
  runs.forEach(collect);

  const order = new Map(flat.map((r, i) => [r, i]));
  const byId = new Map<string, Obj>();
  for (const r of flat) if (typeof r.id === "string") byId.set(r.id, r);
  const children = new Map<Obj, Obj[]>();
  const roots: Obj[] = [];
  for (const r of flat) {
    const parent = typeof r.parent_run_id === "string" ? byId.get(r.parent_run_id) : undefined;
    if (parent && parent !== r) {
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent)!.push(r);
    } else roots.push(r);
  }
  // A child listed in `child_runs` but without a `parent_run_id` still belongs to that parent.
  for (const r of flat) {
    if (!Array.isArray(r.child_runs)) continue;
    for (const c of r.child_runs.filter(isObj)) {
      if (roots.includes(c)) {
        roots.splice(roots.indexOf(c), 1);
        if (!children.has(r)) children.set(r, []);
        if (!children.get(r)!.includes(c)) children.get(r)!.push(c);
      }
    }
  }
  const sortKey = (r: Obj) => str(r.dotted_order) ?? str(r.start_time) ?? "";
  const sorted = (list: Obj[]) =>
    [...new Set(list)].sort((a, b) => {
      const ka = sortKey(a);
      const kb = sortKey(b);
      if (ka && kb && ka !== kb) return ka < kb ? -1 : 1;
      return (order.get(a) ?? 0) - (order.get(b) ?? 0);
    });

  const nodes: Node[] = [];
  const walk = (r: Obj, path: string[]) => {
    nodes.push({ run: r, path });
    for (const c of sorted(children.get(r) ?? [])) walk(c, [...path, str(r.name) ?? str(r.run_type) ?? "run"]);
  };
  sorted(roots).forEach((r) => walk(r, []));

  const { calls, warnings } = collectCalls(nodes.filter((n) => n.run.run_type === "llm" || n.run.run_type === "chat_model"));
  if (!calls.length) {
    throw new TraceError(
      `${flat.length} run${flat.length === 1 ? "" : "s"}, none of them an LLM call with messages (run_type "llm"): export the run that contains the model call, or a chain above it`,
    );
  }
  const name = roots.length === 1 ? (str(roots[0].name) ?? fallbackName) : fallbackName;
  return { name, format, calls, nRuns: flat.length, warnings };
}

function collectCalls(nodes: Node[]): { calls: LlmCall[]; warnings: string[] } {
  const calls: LlmCall[] = [];
  const warnings: string[] = [];
  for (const node of nodes) {
    if (calls.length >= MAX_CALLS) {
      warnings.push(`only the first ${MAX_CALLS} LLM calls are kept`);
      break;
    }
    const call = callFromRun(node, calls.length + 1);
    if (call) calls.push(call);
    else warnings.push(`${str(node.run.name) ?? "an LLM run"} has no messages or prompt in its inputs; skipped`);
  }
  return { calls, warnings };
}

const PARAM_KEYS = ["model", "temperature", "max_tokens", "max_completion_tokens", "response_format", "tools", "tool_choice", "text"];

function callFromRun({ run, path }: Node, index: number): LlmCall | null {
  const inputs = isObj(run.inputs) ? run.inputs : {};
  const extra = isObj(run.extra) ? run.extra : {};
  const invocation = isObj(extra.invocation_params) ? extra.invocation_params : {};
  const metadata: Obj = { ...(isObj(run.metadata) ? run.metadata : {}), ...(isObj(extra.metadata) ? extra.metadata : {}) };
  const params: Obj = { ...Object.fromEntries(PARAM_KEYS.filter((k) => k in inputs).map((k) => [k, inputs[k]])), ...invocation };
  const warnings: string[] = [];

  let read: Read[];
  let completion = false;
  if (inputs.messages !== undefined) {
    read = readMessages(unbatch(inputs.messages, warnings));
  } else if (Array.isArray(inputs.prompts) && typeof inputs.prompts[0] === "string") {
    if (inputs.prompts.length > 1) warnings.push(`${inputs.prompts.length} prompts in one call; the first is used`);
    read = [{ message: { role: "user", content: inputs.prompts[0] }, toolCalls: [] }];
    completion = true;
  } else if (typeof inputs.prompt === "string") {
    read = [{ message: { role: "user", content: inputs.prompt }, toolCalls: [] }];
    completion = true;
  } else if (typeof inputs.input === "string" && run.run_type === "llm") {
    read = [{ message: { role: "user", content: inputs.input }, toolCalls: [] }];
  } else {
    return null;
  }

  const error = str(run.error);
  const reply = error ? null : readReply(run.outputs, warnings);
  const schema = findSchema(params, metadata, extra, warnings);
  const messages = read.map((r) => r.message);
  if (reply) messages.push(asOutput(reply, schema));
  collectWarnings(messages, warnings);

  return {
    id: str(run.id) ?? `call-${index}`,
    name: str(run.name) ?? "LLM",
    path,
    index,
    model: str(params.model) ?? str(params.model_name) ?? str(params.model_id) ?? str(metadata.ls_model_name),
    provider: str(metadata.ls_provider) ?? str(params._type),
    completion,
    messages,
    schema,
    params: {
      temperature: num(params.temperature) ?? num(metadata.ls_temperature),
      maxTokens: num(params.max_tokens) ?? num(params.max_completion_tokens) ?? num(params.max_output_tokens) ?? num(metadata.ls_max_tokens),
    },
    error,
    warnings,
  };
}

function collectWarnings(messages: TraceMessage[], warnings: string[]) {
  const placeholders = messages.reduce((n, m) => n + (m.placeholders ?? 0), 0);
  if (placeholders) warnings.push(`${placeholders} image, file or audio part${placeholders === 1 ? "" : "s"} replaced by a placeholder: the replay reads text only`);
  const tools = messages.filter((m) => m.origin === "tool").length + messages.reduce((n, m) => n + (m.toolCalls ?? 0), 0);
  if (tools) warnings.push("tool calls and results are written into the text: the replay cannot call tools");
}

/** A batched `[[...], [...]]` input keeps its first prompt. */
function unbatch(value: unknown, warnings: string[]): unknown[] {
  if (Array.isArray(value) && value.length && Array.isArray(value[0]) && !isTuple(value[0])) {
    if (value.length > 1) warnings.push(`${value.length} prompts batched in one call; the first is used`);
    return value[0] as unknown[];
  }
  return messageList(value);
}

/** The reply a run recorded: a chat generation, an OpenAI choice, or an `output`. */
function readReply(outputs: unknown, warnings: string[]): Read | null {
  if (!isObj(outputs)) return null;
  const gens = outputs.generations;
  if (Array.isArray(gens) && gens.length) {
    const first = Array.isArray(gens[0]) ? gens[0] : gens;
    const total = gens.reduce((n: number, g) => n + (Array.isArray(g) ? g.length : 1), 0);
    if (total > 1) warnings.push(`${total} generations recorded; the first is compared`);
    const g = first[0];
    if (isObj(g) && g.message !== undefined) return assistant(readMessage(g.message, 0));
    if (isObj(g) && typeof g.text === "string") return { message: { role: "assistant", content: g.text }, toolCalls: [] };
  }
  if (Array.isArray(outputs.choices) && isObj(outputs.choices[0])) {
    const choice = outputs.choices[0];
    if (choice.message !== undefined) return assistant(readMessage(choice.message, 0));
    if (typeof choice.text === "string") return { message: { role: "assistant", content: choice.text }, toolCalls: [] };
  }
  if (outputs.output !== undefined) {
    if (typeof outputs.output === "string") return { message: { role: "assistant", content: outputs.output }, toolCalls: [] };
    if (looksLikeMessage(outputs.output)) return assistant(readMessage(outputs.output, 0));
  }
  if (looksLikeMessage(outputs)) return assistant(readMessage(outputs, 0));
  return null;
}

function assistant(read: Read | null): Read | null {
  return read ? { ...read, message: { ...read.message, role: "assistant" } } : null;
}

/** The recorded reply, with its value when it is structured. A lone call to the schema's tool reads as its arguments. */
function asOutput(reply: Read, schema: LlmCall["schema"]): TraceMessage {
  const message: TraceMessage = { ...reply.message, origin: "output" };
  const tool = schema?.source.startsWith("tool · ") ? schema.source.slice("tool · ".length) : null;
  if (tool !== null && reply.toolCalls.length === 1 && reply.toolCalls[0].name === tool) {
    const args = reply.toolCalls[0].args;
    return { ...message, content: typeof args === "string" ? args : JSON.stringify(args), toolCalls: undefined, structured: typeof args === "string" ? parseJson(args) : args };
  }
  if (schema) {
    const parsed = parseJson(message.content);
    if (parsed !== undefined) return { ...message, structured: parsed };
  }
  return message;
}

/** JSON, allowing a ```json fence around it; `undefined` when it is not. */
export function parseJson(text: string): unknown {
  const body = text.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i, "$1").trim();
  if (!body || !"{[".includes(body[0])) return undefined;
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

// ------------------------------------------------------------------ schema

function objectSchema(v: unknown): Record<string, unknown> | null {
  return isObj(v) ? v : null;
}

function toolName(t: unknown): string | null {
  if (!isObj(t)) return null;
  return str(isObj(t.function) ? t.function.name : null) ?? str(t.name);
}

function toolSchema(t: unknown): Record<string, unknown> | null {
  if (!isObj(t)) return null;
  if (isObj(t.function)) return objectSchema(t.function.parameters);
  return objectSchema(t.parameters) ?? objectSchema(t.input_schema);
}

/** The JSON Schema the call asked its reply to follow, from the first place that has one. */
function findSchema(params: Obj, metadata: Obj, extra: Obj, warnings: string[]): LlmCall["schema"] {
  const rf = params.response_format;
  if (isObj(rf)) {
    if (rf.type === "json_schema" && isObj(rf.json_schema) && isObj(rf.json_schema.schema)) {
      return { schema: rf.json_schema.schema, source: `response_format · ${str(rf.json_schema.name) ?? "json_schema"}` };
    }
    if (rf.type !== "json_object" && (isObj(rf.properties) || rf.type === "object")) return { schema: rf, source: "response_format" };
  }
  if (isObj(params.text) && isObj(params.text.format) && isObj(params.text.format.schema)) {
    return { schema: params.text.format.schema, source: `text.format · ${str(params.text.format.name) ?? "json_schema"}` };
  }

  const structured = [extra.ls_structured_output_format, metadata.ls_structured_output_format, params.ls_structured_output_format, extra.structured_output_format].find(isObj);
  if (isObj(structured) && isObj(structured.schema)) {
    const s = structured.schema;
    const method = isObj(structured.kwargs) ? str(structured.kwargs.method) : null;
    const inner = toolSchema(s) ?? (isObj(s.json_schema) ? objectSchema(s.json_schema.schema) : null) ?? s;
    // Tool calling: the reply is a call to that tool (named after the schema's title), so name it for `asOutput`.
    const name = toolName(s) ?? (method === "function_calling" ? str(s.title) : null);
    if (name && method !== "json_schema" && method !== "json_mode") return { schema: inner, source: `tool · ${name}` };
    return { schema: inner, source: `with_structured_output${method ? ` · ${method}` : ""}` };
  }

  const tools = Array.isArray(params.tools) ? params.tools : [];
  const choice = params.tool_choice;
  let forced: string | null = null;
  if (isObj(choice)) forced = str(isObj(choice.function) ? choice.function.name : null) ?? str(choice.name);
  else if (typeof choice === "string" && !["auto", "none", "required", "any"].includes(choice)) forced = choice;
  else if ((choice === "required" || choice === "any") && tools.length === 1) forced = toolName(tools[0]);
  if (forced) {
    const tool = tools.find((t) => toolName(t) === forced);
    const schema = toolSchema(tool);
    if (schema) return { schema, source: `tool · ${forced}` };
  }

  const gemini = objectSchema(params.response_schema) ?? (isObj(params.generation_config) ? objectSchema(params.generation_config.response_schema) : null);
  if (gemini) return { schema: gemini, source: "response_schema" };

  if (isObj(rf) && rf.type === "json_object") warnings.push("JSON mode without a schema: paste one to replay it under a mask");
  return null;
}

// ------------------------------------------------------------------ messages

interface ToolCall {
  name: string;
  args: unknown;
}

interface Read {
  message: TraceMessage;
  toolCalls: ToolCall[];
}

function isTuple(v: unknown): v is [string, unknown] {
  return Array.isArray(v) && v.length === 2 && typeof v[0] === "string";
}

function looksLikeMessage(v: unknown): boolean {
  if (isObj(v)) {
    if (v.lc === 1 && v.type === "constructor") return true;
    if (typeof v.role === "string") return true;
    if (typeof v.type === "string" && ("content" in v || isObj(v.data))) return true;
  }
  return isTuple(v);
}

/** A list of messages from whatever holds one: a list, a batch, a prompt value, `{ messages }`. */
function messageList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (isObj(value)) {
    if (value.lc === 1 && value.type === "constructor" && Array.isArray(value.id) && isObj(value.kwargs)) {
      const cls = String(value.id[value.id.length - 1]);
      if (cls === "ChatPromptValue" || cls === "ChatPromptValueConcrete") return messageList(value.kwargs.messages);
      if (cls === "StringPromptValue") return [["user", str(value.kwargs.text) ?? ""]];
      return [value];
    }
    if (Array.isArray(value.messages)) return value.messages;
    if (looksLikeMessage(value)) return [value];
  }
  if (typeof value === "string") return [["user", value]];
  throw new TraceError(`expected a list of messages, got ${keysOf(value)}`);
}

function readMessages(list: unknown[]): Read[] {
  const out: Read[] = [];
  list.forEach((m, i) => {
    const read = readMessage(m, i);
    if (read) out.push(read);
  });
  return out;
}

const KIND_ROLE: Record<string, ChatRole | "tool" | "function"> = {
  human: "user",
  user: "user",
  humanmessage: "user",
  ai: "assistant",
  assistant: "assistant",
  model: "assistant",
  aimessage: "assistant",
  system: "system",
  developer: "system",
  systemmessage: "system",
  tool: "tool",
  toolmessage: "tool",
  function: "function",
  functionmessage: "function",
};

/** One message in any of the accepted shapes; null for a `RemoveMessage`. */
function readMessage(value: unknown, i: number): Read | null {
  let kind: string | null = null;
  let body: Obj = {};
  if (typeof value === "string") {
    kind = "user";
    body = { content: value };
  } else if (isTuple(value)) {
    kind = value[0];
    body = { content: value[1] };
  } else if (isObj(value) && value.lc === 1 && value.type === "constructor" && Array.isArray(value.id)) {
    kind = String(value.id[value.id.length - 1]).replace(/Chunk$/, "");
    body = isObj(value.kwargs) ? value.kwargs : {};
  } else if (isObj(value) && typeof value.type === "string" && isObj(value.data)) {
    kind = value.type.replace(/Chunk$/, "");
    body = value.data;
  } else if (isObj(value) && typeof value.role === "string") {
    kind = value.role;
    body = value;
  } else if (isObj(value) && typeof value.type === "string" && ("content" in value || "tool_calls" in value)) {
    kind = value.type.replace(/Chunk$/, "");
    body = value;
  }
  if (kind === null) throw new TraceError(`message ${i + 1}: unrecognised (keys: ${keysOf(value)})`);
  const lower = kind.toLowerCase();
  if (lower === "remove" || lower === "removemessage") return null;
  let role = KIND_ROLE[lower];
  if (!role && (lower === "chat" || lower === "chatmessage")) role = KIND_ROLE[String(body.role ?? "").toLowerCase()] ?? "user";
  if (!role) throw new TraceError(`message ${i + 1}: unknown role or type "${kind}"`);

  const parts: Parts = { placeholders: 0, toolUses: [] };
  let content = contentText(body.content ?? body.parts ?? body.text ?? "", parts);
  const toolCalls = [...readToolCalls(body), ...parts.toolUses];

  if (role === "tool" || role === "function") {
    const name = str(body.name) ?? str(body.tool_call_id) ?? role;
    return { message: { role: "user", content: `[tool result · ${name}]\n${content}`, origin: "tool", placeholders: parts.placeholders || undefined }, toolCalls: [] };
  }
  if (toolCalls.length) {
    const lines = toolCalls.map((c) => `[tool call · ${c.name}] ${typeof c.args === "string" ? c.args : JSON.stringify(c.args)}`);
    content = [content, ...lines].filter((s) => s).join("\n");
  }
  return {
    message: { role, content, toolCalls: toolCalls.length || undefined, placeholders: parts.placeholders || undefined },
    toolCalls,
  };
}

/** LangChain's `tool_calls`, else OpenAI's in `additional_kwargs` or at the top level, else a legacy `function_call`. */
function readToolCalls(body: Obj): ToolCall[] {
  const openai = (list: unknown[]): ToolCall[] =>
    list.filter(isObj).map((c) => {
      if (isObj(c.function)) {
        const raw = c.function.arguments;
        return { name: str(c.function.name) ?? "tool", args: typeof raw === "string" ? (parseJson(raw) ?? raw) : raw };
      }
      return { name: str(c.name) ?? "tool", args: c.args ?? c.arguments ?? c.input ?? {} };
    });
  if (Array.isArray(body.tool_calls) && body.tool_calls.length) return openai(body.tool_calls);
  const extra = isObj(body.additional_kwargs) ? body.additional_kwargs : {};
  if (Array.isArray(extra.tool_calls) && extra.tool_calls.length) return openai(extra.tool_calls);
  const fc = isObj(body.function_call) ? body.function_call : isObj(extra.function_call) ? extra.function_call : null;
  if (fc) return openai([{ function: fc }]);
  return [];
}

interface Parts {
  placeholders: number;
  toolUses: ToolCall[];
}

const PLACEHOLDER: Record<string, string> = {
  image_url: "[image]",
  image: "[image]",
  input_image: "[image]",
  file: "[file]",
  input_file: "[file]",
  document: "[file]",
  audio: "[audio]",
  input_audio: "[audio]",
  media: "[media]",
};

/** A message's content as text: strings as they are, content blocks joined by newlines. */
function contentText(value: unknown, parts: Parts): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    return value
      .map((block): string | null => {
        if (typeof block === "string") return block;
        if (!isObj(block)) return String(block);
        const type = str(block.type) ?? "";
        if (typeof block.text === "string" && (type === "" || type.endsWith("text"))) return block.text;
        if (type in PLACEHOLDER) {
          parts.placeholders++;
          return PLACEHOLDER[type];
        }
        if (type === "tool_use" || type === "function_call") {
          const raw = block.input ?? block.arguments;
          parts.toolUses.push({ name: str(block.name) ?? "tool", args: typeof raw === "string" ? (parseJson(raw) ?? raw) : (raw ?? {}) });
          return null;
        }
        if (type === "tool_result") return `[tool result · ${str(block.tool_use_id) ?? "tool"}]\n${contentText(block.content, parts)}`;
        if (type === "thinking" || type === "reasoning" || type === "redacted_thinking") return null;
        if (typeof block.text === "string") return block.text;
        return `[${type || "block"}]`;
      })
      .filter((s): s is string => s !== null)
      .join("\n");
  }
  if (isObj(value)) return JSON.stringify(value);
  return String(value);
}

// ------------------------------------------------------------------ a bare conversation

function fromMessages(list: unknown[], request: Obj, format: TraceFormat, name: string): ImportedTrace {
  const warnings: string[] = [];
  const input = unbatch(list, warnings);
  const read = readMessages(input);
  if (!read.length) throw new TraceError("the message list is empty");
  const schema = findSchema(request, {}, {}, warnings);
  // A conversation that ends with the assistant recorded that reply.
  const last = read[read.length - 1];
  const messages = read.map((r) => r.message);
  if (last.message.role === "assistant") messages[messages.length - 1] = asOutput(last, schema);
  collectWarnings(messages, warnings);
  const call: LlmCall = {
    id: "messages",
    name: format === "openai-request" ? (str(request.model) ?? "request") : "conversation",
    path: [],
    index: 1,
    model: str(request.model),
    provider: null,
    completion: false,
    messages,
    schema,
    params: { temperature: num(request.temperature), maxTokens: num(request.max_tokens) ?? num(request.max_completion_tokens) },
    error: null,
    warnings,
  };
  return { name, format, calls: [call], nRuns: 0, warnings: [] };
}

// ------------------------------------------------------------------ cut points

/** Where a replay can stop reading: before an assistant message, or at the end when the last message is not the assistant's. */
export function cutPoints(messages: { role: ChatRole }[]): number[] {
  const out: number[] = [];
  for (let k = 1; k <= messages.length; k++) {
    if (messages[k - 1].role === "assistant") continue;
    if (k === messages.length || messages[k].role === "assistant") out.push(k);
  }
  return out;
}

/** Just before the recorded reply when there is one, else the last cut point. */
export function defaultCut(messages: { role: ChatRole; origin?: TraceMessage["origin"] }[]): number {
  const points = cutPoints(messages);
  const output = messages.findIndex((m) => m.origin === "output");
  if (output >= 0 && points.includes(output)) return output;
  return points[points.length - 1] ?? messages.length;
}

/** "#2 ChatOpenAI · gpt-4o-mini" */
export function callLabel(call: Pick<LlmCall, "index" | "name" | "model">): string {
  return `#${call.index} ${call.name}${call.model && call.model !== call.name ? ` · ${call.model}` : ""}`;
}
