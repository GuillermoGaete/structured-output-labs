"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBackend } from "@/components/BackendProvider";
import { BackendSettings } from "@/components/BackendSettings";
import { FsmGraph } from "@/components/FsmGraph";
import { PathStrip } from "@/components/PathStrip";
import { SchemaEditor } from "@/components/SchemaEditor";
import { StackDepth } from "@/components/StackDepth";
import { StepPanel } from "@/components/StepPanel";
import { TimeMachine } from "@/components/TimeMachine";
import { TokenRenderer } from "@/components/TokenRenderer";
import { compileSchema, generate } from "@/lib/api";
import { parseSchema, useLabState } from "@/lib/labState";
import { formatPct } from "@/lib/tokens";
import type { CompilePayload, Trace } from "@/lib/types";

const EMPTY: Trace = { meta: null, steps: [], done: null, error: null };

export default function TimeMachinePage() {
  const backend = useBackend();
  const [state, update] = useLabState();
  const parsed = useMemo(() => parseSchema(state.schemaText), [state.schemaText]);
  const [trace, setTrace] = useState<Trace>(EMPTY);
  const [compiled, setCompiled] = useState<CompilePayload | null>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [follow, setFollow] = useState(true);
  const [showGraph, setShowGraph] = useState(true);
  const [followCurrent, setFollowCurrent] = useState(true);
  const abort = useRef<AbortController | null>(null);

  const run = useCallback(async () => {
    if (!parsed.schema || !backend.ready) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setTrace(EMPTY);
    setCompiled(null);
    setIndex(0);
    setFollow(true);
    setPlaying(false);
    setStreaming(true);
    try {
      compileSchema(backend.url, parsed.schema, state.mode)
        .then(setCompiled)
        .catch(() => setCompiled(null));
      await generate(
        backend.url,
        {
          schema: parsed.schema,
          prompt: state.prompt,
          mode: state.mode,
          max_new_tokens: state.maxNewTokens,
          temperature: state.temperature,
          top_k_sampling: 0,
          top_k_report: 8,
          seed: state.seed,
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
  }, [parsed.schema, backend.ready, backend.url, state]);

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
  const mode = trace.meta?.mode ?? (state.mode === "cfg" ? "cfg" : "fsm");
  const automaton = compiled?.token_dfa ?? null;
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

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2 max-w-3xl">
        <span className="eyebrow">Lab 2</span>
        <h1 className="text-3xl font-semibold tracking-tight">Token-by-token time machine</h1>
        <p className="text-ink-2">
          Two observers sit around the outlines mask in the processor chain: one copies the raw logits, the other measures
          what is left after −∞ was written over the forbidden tokens. Scrub through the run to compare them at every step.
        </p>
      </header>

      {!backend.ready && <BackendSettings />}

      <div className="grid lg:grid-cols-[380px_1fr] gap-8 items-start">
        <div className="flex flex-col gap-4">
          <SchemaEditor state={state} update={update} showKnobs disabled={streaming} />
          <div className="flex gap-2 items-center">
            <button className="btn btn-primary" type="button" onClick={run} disabled={!backend.ready || !parsed.schema || streaming}>
              {streaming ? "Generating…" : "Generate"}
            </button>
            {streaming && (
              <button className="btn" type="button" onClick={() => abort.current?.abort()}>
                Stop
              </button>
            )}
            {backend.health?.busy && !streaming && <span className="text-xs text-muted">The backend is serving someone else; requests queue.</span>}
          </div>
          {trace.error && <p className="text-sm text-critical">{trace.error}</p>}
          {trace.meta && (
            <dl className="text-xs text-ink-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono">
              <dt className="text-muted">model</dt>
              <dd className="break-all">{trace.meta.model_id}</dd>
              <dt className="text-muted">engine</dt>
              <dd>
                {trace.meta.backend} ({trace.meta.mode.toUpperCase()})
              </dd>
              <dt className="text-muted">prompt</dt>
              <dd>{trace.meta.prompt_token_count} tokens</dd>
              <dt className="text-muted">vocab</dt>
              <dd>{trace.meta.vocab_size.toLocaleString("en-US")}</dd>
            </dl>
          )}
        </div>

        <div className="flex flex-col gap-6 min-w-0">
          <section className="flex flex-col gap-3">
            <TimeMachine count={trace.steps.length} index={index} playing={playing} streaming={streaming} onIndex={onIndex} onPlay={setPlaying} />
          </section>

          <section className="panel p-4 flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <span className="eyebrow">Text so far</span>
              {trace.done && (
                <span className={`text-xs ${trace.done.valid ? "text-good" : "text-critical"}`}>
                  {trace.done.valid ? "valid JSON, matches the schema" : trace.done.validation_error}
                  {" · "}
                  {trace.done.stopped_by === "eos" ? "stopped at EOS" : "hit the token limit"} · {trace.done.n_steps} steps in {trace.done.elapsed_s.toFixed(1)}s
                </span>
              )}
            </div>
            <TokenRenderer tokens={trace.steps} limit={step ? index + 1 : 0} activeIndex={index} onPick={onIndex} />
          </section>

          {step ? (
            <section className="panel p-4">
              <StepPanel step={step} mode={mode} />
            </section>
          ) : (
            <section className="panel p-8 text-sm text-ink-2">
              {streaming ? "Waiting for the first token…" : "Generate to record a run, then scrub through it. The greedy setting (temperature 0) makes runs reproducible."}
            </section>
          )}

          {trace.steps.length > 0 && (
            <section className="panel p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <span className="eyebrow">Across the run</span>
                <span className="text-xs text-muted">
                  {trace.steps.filter((s) => s.was_overridden).length} of {trace.steps.length} tokens overridden · mean vocabulary kept{" "}
                  {formatPct(trace.steps.reduce((a, s) => a + s.n_allowed / s.vocab_size, 0) / trace.steps.length, 2)}
                </span>
              </div>
              <StackDepth steps={trace.steps} current={index} />
            </section>
          )}

          {automaton && mode === "fsm" && (
            <section className="flex flex-col gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="eyebrow">Token-level automaton</span>
                <button className="btn" type="button" onClick={() => setShowGraph((v) => !v)}>
                  {showGraph ? "Hide" : "Show"}
                </button>
                <button className={`btn ${followCurrent ? "border-accent" : ""}`} type="button" onClick={() => setFollowCurrent((v) => !v)} title="Keep the current state centred as you scrub">
                  {followCurrent ? "Following current state" : "Follow current state"}
                </button>
                <span className="text-xs text-muted">
                  {currentGraphState === null ? "current state not among the drawn nodes" : `current state ${currentGraphState}`}
                </span>
              </div>
              {trace.steps.length > 0 && <PathStrip steps={trace.steps} index={index} graphIdOf={graphIdOf} onPick={onIndex} />}
              {showGraph && (
                <FsmGraph automaton={automaton} currentState={currentGraphState} visited={visitedGraphStates} followCurrent={followCurrent} height={420} />
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
