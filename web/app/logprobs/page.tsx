"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBackend } from "@/components/BackendProvider";
import { DistributionBars, ENTROPY_HINT } from "@/components/logprobs/DistributionBars";
import { ProviderKeys } from "@/components/logprobs/ProviderKeys";
import { TimeMachine } from "@/components/TimeMachine";
import { TokenRenderer } from "@/components/TokenRenderer";
import { streamLogprobs } from "@/lib/api";
import { formatInt, formatPct, visibleToken } from "@/lib/tokens";
import { PROVIDERS, providerOf, readKey } from "@/lib/providers";
import type { StreamTrace } from "@/lib/types";

const EMPTY: StreamTrace = { meta: null, steps: [], done: null, error: null };

const STOP_LABEL: Record<string, string> = {
  eos: "stopped at EOS",
  max_new_tokens: "hit the token limit",
  stopped: "stopped early",
};

const PRESETS = [
  "The capital of France is",
  "Write one sentence about analytical engines:",
  "def fibonacci(n):",
  "Q: Why is the sky blue?\nA:",
];

export default function LogprobsPage() {
  const backend = useBackend();
  // This mode picks its own model: it can reach hosted ones, which the
  // constrained mode cannot, so the header's picker is not the right control.
  const [model, setModel] = useState<string>("");
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [showKeys, setShowKeys] = useState(false);

  // localStorage is not readable while rendering on the server.
  useEffect(() => {
    setKeys(Object.fromEntries(PROVIDERS.map((p) => [p.id, readKey(p.id)])));
  }, []);
  const [prompt, setPrompt] = useState(PRESETS[0]);
  const [maxTokens, setMaxTokens] = useState(32);
  const [seed, setSeed] = useState<number | null>(7);
  const [useTemplate, setUseTemplate] = useState(false);
  const [reportK, setReportK] = useState(12);

  // One set of knobs. They redraw the recorded run instantly; "Run" applies them
  // to a fresh generation, where they change what actually gets sampled.
  const [temperature, setTemperature] = useState(0.8);
  const [topK, setTopK] = useState(0);
  const [topP, setTopP] = useState(1);

  const [trace, setTrace] = useState<StreamTrace>(EMPTY);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [aborted, setAborted] = useState(false);
  const [follow, setFollow] = useState(true);
  const abort = useRef<AbortController | null>(null);

  const chosen = model || backend.model || "";
  const provider = providerOf(chosen);
  const missingKey = !!provider && !keys[provider];

  const run = useCallback(async () => {
    if (!prompt.trim() || missingKey) return;
    if (!provider && !backend.ready) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setTrace(EMPTY);
    setIndex(0);
    setFollow(true);
    setPlaying(false);
    setAborted(false);
    setStreaming(true);
    try {
      await streamLogprobs(
        backend.url,
        {
          model: model || backend.model,
          prompt,
          max_new_tokens: maxTokens,
          temperature,
          top_k: topK,
          top_p: topP,
          seed,
          use_chat_template: useTemplate,
          top_k_report: reportK,
          tail_bins: 48,
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
        provider ? keys[provider] : undefined,
      );
    } catch (e) {
      if (!controller.signal.aborted) setTrace((t) => ({ ...t, error: e instanceof Error ? e.message : String(e) }));
    } finally {
      if (abort.current === controller) setStreaming(false);
    }
  }, [backend.ready, backend.url, backend.model, model, provider, keys, missingKey, prompt, maxTokens, temperature, topK, topP, seed, useTemplate, reportK]);

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
  const view = useMemo(() => ({ temperature, topK, topP }), [temperature, topK, topP]);
  const ran = trace.meta?.sampling;
  // The knobs are live on the recorded run, so they can differ from what generated it.
  const drifted =
    !!ran && (ran.temperature !== temperature || ran.top_k !== topK || ran.top_p !== topP);
  const rows = trace.meta?.top_k_report ?? reportK;
  // A hosted model only needs the backend reachable as a proxy, not a local model loaded.
  const blocked = streaming || !prompt.trim() || missingKey || (provider ? backend.phase !== "online" : !backend.ready);
  const remote = !!trace.meta?.provider;

  return (
    <div className="grid lg:grid-cols-[300px_minmax(0,1fr)] gap-6 items-start">
      <div className="flex flex-col gap-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pr-1">
        <div className="flex items-center gap-2 flex-wrap">
          <button className="btn btn-primary" type="button" onClick={run} disabled={blocked}>
            {streaming ? "Running…" : "Run"}
          </button>
          {streaming && (
            <button className="btn" type="button" onClick={stop}>
              Stop
            </button>
          )}
          {backend.phase === "offline" && <span className="chip chip-critical">backend unreachable</span>}
        </div>

        {trace.error && <p className="font-mono text-xs text-critical break-all">{trace.error}</p>}

        <div className="flex flex-col gap-1.5">
          <span className="eyebrow">Model</span>
          <select
            className="input text-xs"
            value={chosen}
            onChange={(e) => setModel(e.target.value)}
            disabled={streaming}
            aria-label="Model"
          >
            <optgroup label="Local">
              {backend.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id.split("/").pop()}
                  {m.loaded ? "" : " · not loaded"}
                </option>
              ))}
            </optgroup>
            {PROVIDERS.map((p) => (
              <optgroup key={p.id} label={`${p.label}${keys[p.id] ? "" : " · no key"}`}>
                {p.models.map((m) => (
                  <option key={`${p.id}:${m}`} value={`${p.id}:${m}`}>
                    {m}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <div className="flex items-center gap-2 flex-wrap">
            <button className={`btn py-0.5 px-2 text-xs ${showKeys ? "border-accent" : ""}`} type="button" onClick={() => setShowKeys((v) => !v)} aria-expanded={showKeys}>
              API keys
            </button>
            {missingKey && <span className="chip chip-warning">add a key to use this model</span>}
            {provider && !missingKey && <span className="chip">sent from this browser</span>}
          </div>
          {showKeys && (
            <div className="panel p-3">
              <ProviderKeys keys={keys} onChange={(id, key) => setKeys((k) => ({ ...k, [id]: key }))} />
            </div>
          )}
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="eyebrow">Prompt</span>
          <textarea className="input text-sm min-h-[96px]" value={prompt} onChange={(e) => setPrompt(e.target.value)} disabled={streaming} />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button key={p} type="button" className="btn py-0.5 px-2 text-xs" onClick={() => setPrompt(p)} disabled={streaming} title={p}>
              {p.split("\n")[0].slice(0, 18)}…
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="eyebrow">Temperature · {temperature === 0 ? "greedy" : temperature.toFixed(2)}</span>
            <input type="range" min={0} max={2} step={0.05} value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="eyebrow">Top-k · {topK === 0 ? "off" : topK}</span>
            <input type="range" min={0} max={50} step={1} value={topK} onChange={(e) => setTopK(Number(e.target.value))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="eyebrow">Top-p · {topP >= 1 ? "off" : topP.toFixed(2)}</span>
            <input type="range" min={0.01} max={1} step={0.01} value={topP} onChange={(e) => setTopP(Number(e.target.value))} />
          </label>
        </div>

        <div className="flex flex-col gap-2 text-xs">
          <label className="flex items-center gap-2">
            <span className="w-24 text-muted">Max tokens</span>
            <input
              type="number"
              min={1}
              max={256}
              className="input input-num py-0.5 px-1.5 text-xs tabular-nums"
              value={maxTokens}
              onChange={(e) => setMaxTokens(Math.min(Math.max(Number(e.target.value) || 1, 1), 256))}
              disabled={streaming}
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="w-24 text-muted">Seed</span>
            <input
              type="number"
              className="input input-num py-0.5 px-1.5 text-xs tabular-nums"
              value={seed ?? ""}
              placeholder="none"
              onChange={(e) => setSeed(e.target.value === "" ? null : Number(e.target.value))}
              disabled={streaming}
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="w-24 text-muted">Top-k shown</span>
            <input
              type="number"
              min={1}
              max={50}
              className="input input-num py-0.5 px-1.5 text-xs tabular-nums"
              value={reportK}
              onChange={(e) => setReportK(Math.min(Math.max(Number(e.target.value) || 1, 1), 50))}
              disabled={streaming}
              title="Rows per step; applies to the next run"
            />
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={useTemplate} onChange={(e) => setUseTemplate(e.target.checked)} disabled={streaming} />
            <span className="text-muted">Chat template</span>
          </label>
        </div>

        {trace.meta && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-xs text-ink-2">
            <dt className="text-muted">model</dt>
            <dd className="break-all">{trace.meta.model_id}</dd>
            <dt className="text-muted">prompt</dt>
            <dd>{formatInt(trace.meta.prompt_token_count)} tokens</dd>
            <dt className="text-muted">vocab</dt>
            <dd>{formatInt(trace.meta.vocab_size)}</dd>
            {trace.done && (
              <>
                <dt className="text-muted">speed</dt>
                <dd>{trace.done.tokens_per_s} tok/s</dd>
              </>
            )}
          </dl>
        )}
      </div>

      <div className="flex flex-col gap-5 min-w-0">
        <section className="panel p-4">
          <TimeMachine count={trace.steps.length} index={index} playing={playing} streaming={streaming} onIndex={onIndex} onPlay={setPlaying} />
        </section>

        <section className="panel p-4 flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <span className="eyebrow">Output</span>
            {trace.done ? (
              <span className="chip chip-good">
                {STOP_LABEL[trace.done.stop_reason] ?? trace.done.stop_reason} · {trace.done.n_steps} tokens · {trace.done.elapsed_s.toFixed(1)}s
              </span>
            ) : (
              aborted && !streaming && trace.steps.length > 0 && <span className="chip chip-warning">stopped early · {trace.steps.length} tokens</span>
            )}
          </div>
          <TokenRenderer tokens={trace.steps} limit={step ? index + 1 : 0} activeIndex={index} onPick={onIndex} />
        </section>

        {step ? (
          <section className="panel p-4 flex flex-col gap-4">
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              <Metric label="Step" value={`${step.i}`} />
              <Metric label="Token" value={visibleToken(step.text, step.token)} hint={`id ${step.token_id}`} />
              <Metric label="Rank" value={step.chosen_rank === null ? "in the tail" : `#${step.chosen_rank + 1}`} hint="Where the sampled token sat in the model's own ranking" />
              <Metric label="Its probability" value={formatPct(step.chosen_p, 2)} hint="At temperature 1, over the whole vocabulary" />
              <Metric
                label="Entropy"
                value={`${step.entropy_bits.toFixed(2)} bits`}
                hint={`${ENTROPY_HINT} This one is the raw distribution, before any parameter; the bars below react to the sliders.`}
              />
              <Metric label="Forward" value={`${step.forward_ms.toFixed(0)} ms`} />
            </div>

            {drifted && ran && (
              <span className="chip chip-warning self-start" title="The bars show what these settings would give. Press Run to generate with them.">
                showing T {temperature.toFixed(2)} · run used T {ran.temperature.toFixed(2)}
                {ran.top_k ? ` · k ${ran.top_k}` : ""}
                {ran.top_p < 1 ? ` · p ${ran.top_p.toFixed(2)}` : ""}
              </span>
            )}

            {remote && (
              <span className="chip chip-warning self-start" title="A provider reports only its top-k, so everything below it is one estimated bucket. The bars are exact at temperature 1 and approximate elsewhere. Its own sampling parameters are not applied: the request always asks for temperature 1 so these numbers stay raw.">
                hosted · tail estimated · asked at T 1
              </span>
            )}
            <DistributionBars step={step} view={view} rows={rows} />
          </section>
        ) : (
          <section className="panel p-8 text-sm text-muted">{streaming ? "Waiting for the first token…" : "Press Run."}</section>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex min-w-[110px] flex-col gap-0.5" title={hint}>
      <span className="eyebrow">{label}</span>
      <span className="font-mono text-[15px] tabular-nums">{value}</span>
    </div>
  );
}
