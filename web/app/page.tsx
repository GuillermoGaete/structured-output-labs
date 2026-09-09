"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBackend } from "@/components/BackendProvider";
import { FsmGraph } from "@/components/FsmGraph";
import { PathStrip } from "@/components/PathStrip";
import { SchemaEditor } from "@/components/SchemaEditor";
import { StackDepth } from "@/components/StackDepth";
import { StackView } from "@/components/StackView";
import { StepPanel } from "@/components/StepPanel";
import { TimeMachine } from "@/components/TimeMachine";
import { TokenRenderer } from "@/components/TokenRenderer";
import { compileSchema, generate } from "@/lib/api";
import { parseSchema, useLabState } from "@/lib/labState";
import { formatInt, formatPct } from "@/lib/tokens";
import type { CompilePayload, Trace } from "@/lib/types";
import { usePydanticSchema } from "@/lib/usePydanticSchema";

const EMPTY: Trace = { meta: null, steps: [], done: null, error: null };
const GRAPH_HEIGHT = 520;

const STOP_LABEL: Record<string, string> = {
  eos: "stopped at EOS",
  max_new_tokens: "hit the token limit",
  stopped: "stopped early",
};

// The regex outlines_core emits for a recursive schema keeps a trailing comma
// where the recursion was cut off, so the automaton accepts invalid JSON.
const REGEX_BUG = /,\[ \]\?\\\}/;

export default function LabPage() {
  const backend = useBackend();
  const [state, update] = useLabState();
  const pydantic = usePydanticSchema(state.pydanticText, state.pydanticModel, state.sourceKind === "pydantic", backend.url, backend.ready);
  const typed = useMemo(() => parseSchema(state.schemaText), [state.schemaText]);
  const schema = state.sourceKind === "pydantic" ? pydantic.schema : typed.schema;

  const [trace, setTrace] = useState<Trace>(EMPTY);
  const [compiled, setCompiled] = useState<CompilePayload | null>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [aborted, setAborted] = useState(false);
  const [follow, setFollow] = useState(true);
  const [showGraph, setShowGraph] = useState(true);
  const [followCurrent, setFollowCurrent] = useState(true);
  const abort = useRef<AbortController | null>(null);

  const run = useCallback(async () => {
    if (!schema || !backend.ready) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setTrace(EMPTY);
    setCompiled(null);
    setIndex(0);
    setFollow(true);
    setPlaying(false);
    setAborted(false);
    setStreaming(true);
    try {
      compileSchema(backend.url, schema, state.mode)
        .then(setCompiled)
        .catch(() => setCompiled(null));
      await generate(
        backend.url,
        {
          schema,
          prompt: state.prompt,
          mode: state.mode,
          max_new_tokens: state.maxNewTokens,
          temperature: state.temperature,
          top_k_sampling: 0,
          top_k_report: Math.min(Math.max(state.topK, 1), 20),
          seed: null,
          use_chat_template: true,
        },
        (ev) => {
          setTrace((t) => {
            if (ev.event === "meta") return { ...t, meta: ev.data };
            if (ev.event === "step") return { ...t, steps: [...t.steps, ev.data] };
            if (ev.event === "done") return { ...t, done: ev.data };
            if (ev.event === "error") return { ...t, error: ev.data.detail };
            return t;
          });
        },
        controller.signal,
      );
    } catch (e) {
      if (!controller.signal.aborted) setTrace((t) => ({ ...t, error: e instanceof Error ? e.message : String(e) }));
    } finally {
      if (abort.current === controller) setStreaming(false);
    }
  }, [schema, backend.ready, backend.url, state]);

  const stop = useCallback(() => {
    setAborted(true);
    abort.current?.abort();
  }, []);

  useEffect(() => {
    if (follow && trace.steps.length) setIndex(trace.steps.length - 1);
  }, [trace.steps.length, follow]);

  const onIndex = useCallback(
    (i: number) => {
      setIndex(i);
      setFollow(streaming && i >= trace.steps.length - 1);
    },
    [streaming, trace.steps.length],
  );

  const step = trace.steps[index];
  // `compiled.mode` resolves `auto` before the first token arrives; without it a
  // recursive schema on Auto shows the FSM section for a second and then swaps.
  const mode = trace.meta?.mode ?? compiled?.mode ?? (state.mode === "cfg" ? "cfg" : "fsm");
  const automaton = compiled?.token_dfa ?? null;
  const regexBug = !!trace.meta?.recursive && trace.meta.mode === "fsm" && REGEX_BUG.test(trace.meta.regex ?? "");
  // Guide.get_state() reports outlines_core's own state ids; the graph renumbers them in BFS order.
  const rawToGraphId = useMemo(() => {
    const map = new Map<number, number>();
    automaton?.nodes.forEach((n) => {
      if (n.raw !== undefined) map.set(n.raw, n.id);
    });
    return map;
  }, [automaton]);
  const graphIdOf = useCallback((raw: number | null) => (raw === null ? null : (rawToGraphId.get(raw) ?? null)), [rawToGraphId]);
  const currentGraphState = step ? graphIdOf(step.fsm_state) : null;
  // States visited up to the current step, in order, restricted to the ones the graph draws.
  const visitedGraphStates = useMemo(() => {
    const ids: number[] = [];
    for (const s of trace.steps.slice(0, index + 1)) {
      const id = graphIdOf(s.fsm_state);
      if (id !== null) ids.push(id);
    }
    return ids;
  }, [trace.steps, index, graphIdOf]);

  const overridden = trace.steps.filter((s) => s.was_overridden).length;
  // A flat schema never nests, so the depth chart would be a straight line at 1.
  const nests = trace.steps.some((s) => s.stack_depth > 1);
  const blocked = !backend.ready || !schema || streaming;
  const started = streaming || !!trace.meta;

  return (
    <div className="grid lg:grid-cols-[320px_minmax(0,1fr)] gap-6 items-start">
      <div className="flex flex-col gap-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pr-1">
        <div className="flex items-center gap-2 flex-wrap">
          <button className="btn btn-primary" type="button" onClick={run} disabled={blocked}>
            {streaming ? "Generating…" : "Generate"}
          </button>
          {streaming && (
            <button className="btn" type="button" onClick={stop}>
              Stop
            </button>
          )}
          {backend.health?.busy && !streaming && <span className="chip chip-warning">backend busy · queued</span>}
          {pydantic.pending && !streaming && <span className="chip">converting…</span>}
        </div>

        {trace.error && <p className="font-mono text-xs text-critical break-all">{trace.error}</p>}

        <SchemaEditor state={state} update={update} pydantic={pydantic} disabled={streaming} />

        {trace.meta && (
          <dl className="text-xs text-ink-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono">
            <dt className="text-muted">model</dt>
            <dd className="break-all">{trace.meta.model_id}</dd>
            <dt className="text-muted">engine</dt>
            <dd>
              {trace.meta.backend} ({trace.meta.mode.toUpperCase()})
            </dd>
            <dt className="text-muted">prompt</dt>
            <dd>{formatInt(trace.meta.prompt_token_count)} tokens</dd>
            <dt className="text-muted">vocab</dt>
            <dd>{formatInt(trace.meta.vocab_size)}</dd>
            <dt className="text-muted">regex</dt>
            <dd>{trace.meta.regex ? `${formatInt(trace.meta.regex.length)} chars` : "—"}</dd>
          </dl>
        )}
      </div>

      <div className="flex flex-col gap-5 min-w-0">
        <section className="panel p-4 flex flex-col gap-3">
          <TimeMachine count={trace.steps.length} index={index} playing={playing} streaming={streaming} onIndex={onIndex} onPlay={setPlaying} />
          {trace.steps.length > 0 && (
            <>
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <span className="eyebrow">Across the run</span>
                <span className="text-xs text-muted">
                  {overridden} / {trace.steps.length} overridden · vocabulary kept{" "}
                  {formatPct(trace.steps.reduce((a, s) => a + s.n_allowed / s.vocab_size, 0) / trace.steps.length, Math.max(state.pctDigits, 2))}
                </span>
              </div>
              {nests && <StackDepth steps={trace.steps} current={index} />}
            </>
          )}
        </section>

        <section className="panel p-4 flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <span className="eyebrow">Text so far</span>
            <span className="flex items-center gap-2 flex-wrap">
              {regexBug && (
                <span
                  className="chip chip-warning"
                  title="outlines_core unrolls a recursive schema three levels and leaves a trailing comma where the recursion was cut off. The mask followed the regex; the regex was wrong."
                >
                  FSM regex bug at depth 3 · use CFG
                </span>
              )}
              {trace.done ? (
                <span className={`chip ${trace.done.valid ? "chip-good" : "chip-critical"}`} title={trace.done.validation_error ?? undefined}>
                  {trace.done.valid ? "valid" : "invalid"} · {STOP_LABEL[trace.done.stopped_by] ?? trace.done.stopped_by} · {trace.done.n_steps} steps ·{" "}
                  {trace.done.elapsed_s.toFixed(1)}s
                </span>
              ) : (
                aborted && !streaming && trace.steps.length > 0 && <span className="chip chip-warning">stopped early · {trace.steps.length} steps</span>
              )}
            </span>
          </div>
          <TokenRenderer tokens={trace.steps} limit={step ? index + 1 : 0} activeIndex={index} onPick={onIndex} />
          {trace.done && !trace.done.valid && trace.done.validation_error && (
            <p className="font-mono text-xs text-critical">{trace.done.validation_error}</p>
          )}
        </section>

        {step ? (
          <section className="panel p-4">
            <StepPanel step={step} mode={mode} digits={state.pctDigits} logBars={state.logBars} />
          </section>
        ) : (
          <section className="panel p-8 text-sm text-muted">{streaming ? "Waiting for the first token…" : "Press Generate."}</section>
        )}

        {started &&
          (mode === "cfg" ? (
          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="eyebrow">Parser stack</span>
              <span className="chip">llguidance · stack, no automaton</span>
            </div>
            <div className="panel p-4">{step ? <StackView step={step} /> : <p className="text-sm text-muted">waiting…</p>}</div>
          </section>
          ) : (
          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="eyebrow">Token automaton</span>
              <span className="chip">outlines_core</span>
              <button className="btn py-0.5 px-2 text-xs" type="button" onClick={() => setShowGraph((v) => !v)}>
                {showGraph ? "Hide" : "Show"}
              </button>
              <button
                className={`btn py-0.5 px-2 text-xs ${followCurrent ? "border-accent" : ""}`}
                type="button"
                onClick={() => setFollowCurrent((v) => !v)}
                title="Keep the current state centred as you scrub"
              >
                Follow
              </button>
              {step && <span className="chip">state {currentGraphState === null ? `${step.fsm_state ?? "—"} (not drawn)` : currentGraphState}</span>}
            </div>
            {trace.steps.length > 0 && <PathStrip steps={trace.steps} index={index} graphIdOf={graphIdOf} onPick={onIndex} />}
            {showGraph &&
              (automaton ? (
                <FsmGraph automaton={automaton} currentState={currentGraphState} visited={visitedGraphStates} followCurrent={followCurrent} height={GRAPH_HEIGHT} />
              ) : (
                <div className="panel flex items-center justify-center text-sm text-muted" style={{ height: GRAPH_HEIGHT }}>
                  {compiled?.token_dfa_error ?? "compiling…"}
                </div>
              ))}
          </section>
          ))}
      </div>
    </div>
  );
}
