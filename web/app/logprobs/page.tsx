"use client";

import { useCallback, useEffect, useState } from "react";
import { useBackend } from "@/components/BackendProvider";
import { ConstrainedViewer } from "@/components/ConstrainedViewer";
import { LogprobsViewer } from "@/components/LogprobsViewer";
import { BatchPanel } from "@/components/shell/BatchPanel";
import { BatchProgress } from "@/components/shell/BatchProgress";
import { ComparePanel } from "@/components/shell/ComparePanel";
import { Menu } from "@/components/shell/Menu";
import { ProbePanel } from "@/components/shell/ProbePanel";
import { ModelSection } from "@/components/shell/ModelSection";
import { RunActions } from "@/components/shell/RunActions";
import { RunTabs } from "@/components/shell/RunTabs";
import { Section } from "@/components/shell/Section";
import { ActionBar, Block, InferenceHead, SetupStep, StartCards } from "@/components/shell/TwoStep";
import { loadModel } from "@/lib/api";
import { VariantsEditor } from "@/components/shell/VariantsEditor";
import { probeKey, runnableVariants } from "@/lib/labState";
import { limitsSummary, patchFromLogprobsRun, PROMPT_CATALOGUE, samplingSummary, useLogprobsState } from "@/lib/logprobsState";
import { PROVIDERS, providerOf, readKey } from "@/lib/providers";
import { cancelBatch, cancelQueue, MAX_BATCH_N, queueBatches, startBatch, type BatchPlan } from "@/lib/runner";
import { useBatchesRecord, useLocalBusy, usePinned, useRunState, useSelectedBatch, useSelectedRun } from "@/lib/runStore";
import type { Batch, Run } from "@/lib/runTypes";
import type { SeedNote } from "@/lib/seeds";
import type { StreamRequest } from "@/lib/types";
import { setStep, useStep, useStepFlow } from "@/lib/stepState";
import { useViewState } from "@/lib/viewState";

export default function LogprobsPage() {
  const backend = useBackend();
  const [s, update] = useLogprobsState();
  const [view, updateView] = useViewState();
  const step = useStep();
  useStepFlow();
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<SeedNote[]>([]);

  // localStorage is not readable while rendering on the server.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setKeys(Object.fromEntries(PROVIDERS.map((p) => [p.id, readKey(p.id)])));
  }, []);

  const selected = useSelectedRun();
  const selectedBatch = useSelectedBatch();
  const batches = useBatchesRecord();
  const pinned = usePinned();
  const busy = useLocalBusy();
  const running = useRunState((st) => Object.values(st.runs).find((r) => r.status === "running") ?? null);

  // This mode picks its own model: it can reach hosted ones, which the constrained mode cannot.
  const chosen = s.model || backend.model || "";
  const provider = providerOf(chosen);
  const missingKey = !!provider && !keys[provider];
  const modelShort = (chosen || backend.selected?.id || "model").split("/").pop()?.split(":").pop() || "model";

  const requestFor = useCallback(
    (prompt: string): StreamRequest => ({
      model: s.model || backend.model,
      prompt,
      max_new_tokens: s.maxTokens,
      temperature: s.temperature,
      top_k: s.topK,
      top_p: s.topP,
      seed: s.seed,
      use_chat_template: s.useTemplate,
      top_k_report: s.reportK,
      tail_bins: 48,
    }),
    [s, backend.model],
  );

  const start = useCallback(
    (promptOverride?: string, n = 1) => {
      const prompt = promptOverride ?? s.prompt;
      if (!prompt.trim() || missingKey) return;
      if (!provider && !backend.ready) return;
      const request: StreamRequest = {
        model: s.model || backend.model,
        prompt,
        max_new_tokens: s.maxTokens,
        temperature: s.temperature,
        top_k: s.topK,
        top_p: s.topP,
        seed: s.seed,
        use_chat_template: s.useTemplate,
        top_k_report: s.reportK,
        tail_bins: 48,
      };
      const started = startBatch({
        kind: "logprobs",
        backendUrl: backend.url,
        n,
        seedPolicy: s.seedPolicy,
        request,
        providerKey: provider ? keys[provider] : undefined,
        label: `${prompt.split("\n")[0].slice(0, 24)} · ${modelShort}`,
      });
      setNotes(started ? started.notes : [{ level: "warning", text: "a run is already in flight" }]);
    },
    [backend.ready, backend.url, backend.model, s, provider, keys, missingKey, modelShort],
  );

  const stop = useCallback(() => {
    cancelQueue();
    if (running) cancelBatch(running.batchId);
  }, [running]);

  /** A plan for one variant of the probe the setup holds; the key pools one edit's batches into one table. */
  const planFor = (setup: typeof s, variant: { label: string; prompt: string } | null, n: number): BatchPlan => {
    const name = setup.probeName ?? "probe";
    const list = runnableVariants(setup.variants);
    return {
      kind: "logprobs",
      backendUrl: backend.url,
      n,
      seedPolicy: setup.seedPolicy,
      request: requestFor(variant?.prompt ?? setup.prompt),
      providerKey: provider ? keys[provider] : undefined,
      label: `${name}${variant ? ` · ${variant.label}` : ""} · ${modelShort}`,
      probe: variant && setup.probeId ? { presetId: probeKey(setup.probeId, null, list), presetName: name, variant: variant.label } : null,
    };
  };

  const loadPrompt = (id: string) => {
    const preset = PROMPT_CATALOGUE.find((p) => p.id === id);
    if (!preset) return null;
    const patch = { prompt: preset.prompt, variants: preset.variants ? preset.variants.map((v) => ({ ...v })) : [], probeId: preset.variants ? preset.id : null, probeName: preset.variants ? preset.name : null };
    update(patch);
    return { preset, next: { ...s, ...patch } };
  };

  const runAllFromSetup = () => {
    const list = runnableVariants(s.variants);
    if (!list.length || blocked) return;
    queueBatches(list.map((v) => planFor(s, v, s.repeatN)));
    setNotes([{ level: "info", text: `${list.length} variants × ${s.repeatN} queued` }]);
  };

  const runVariantFromSetup = (i: number) => {
    const v = s.variants[i];
    if (!v || blocked) return;
    const label = runnableVariants(s.variants).find((x) => x.prompt === v.prompt)?.label ?? v.label;
    update({ prompt: v.prompt });
    const started = startBatch(planFor({ ...s, prompt: v.prompt }, { label, prompt: v.prompt }, 1));
    setNotes(started ? started.notes : [{ level: "warning", text: "a run is already in flight" }]);
  };

  // A local model picked here may not be resident yet; ask for it like the constrained picker does.
  const onModel = (id: string) => {
    update({ model: id });
    if (!providerOf(id) && backend.url) loadModel(backend.url, id).catch(() => undefined);
  };

  const duplicate = (run: Run, batch: Batch) => {
    void batch;
    if (run.kind !== "logprobs") return false;
    if (run.request.messages?.length) {
      setNotes([{ level: "info", text: "a replayed conversation: Duplicate & edit it on the Replay page" }]);
      return false;
    }
    update(patchFromLogprobsRun(run));
    setStep(1);
    window.scrollTo({ top: 0, behavior: "smooth" });
    return true;
  };

  // The knobs are live on the selected run, so they can differ from what generated it.
  const drifted =
    selected?.kind === "logprobs" && (selected.request.temperature !== s.temperature || selected.request.top_k !== s.topK || selected.request.top_p !== s.topP);
  // A hosted model only needs the backend reachable as a proxy, not a local model loaded.
  const blocked = !s.prompt.trim() || missingKey || (provider ? backend.phase !== "online" : !backend.ready || busy);

  const repeatMenu = (
    <Menu
      label="▾"
      className="btn btn-primary btn-icon rounded-l-none border-l-0"
      ariaLabel="Repeat"
      title="Run the same prompt several times"
      disabled={blocked}
      items={[
        ...(s.variants.length ? [{ label: `Run all variants ×${s.repeatN}`, hint: "Every variant in the setup, as edited, one batch after another", onSelect: runAllFromSetup }] : []),
        ...[3, 5, 10, 20].map((n) => ({ label: `Repeat ×${n}`, hint: provider ? `${n} runs, three at a time` : `${n} runs, one after the other`, onSelect: () => start(undefined, n) })),
        {
          label: `Repeat ×${s.repeatN}…`,
          hint: `Ask for a number up to ${MAX_BATCH_N}`,
          onSelect: () => {
            const raw = window.prompt("How many runs?", String(s.repeatN));
            const n = Math.min(Math.max(Number(raw) || 0, 1), MAX_BATCH_N);
            if (raw !== null && n > 1) {
              update({ repeatN: n });
              start(undefined, n);
            }
          },
        },
        { label: `${s.seedPolicy === "fresh" ? "✓ " : ""}Seed · new per run`, hint: "Each repetition samples differently (needs T > 0)", onSelect: () => update({ seedPolicy: "fresh" }) },
        { label: `${s.seedPolicy === "same" ? "✓ " : ""}Seed · same for all`, hint: "Every repetition uses one seed: identical runs", onSelect: () => update({ seedPolicy: "same" }) },
      ]}
    />
  );

  const sentence = (
    <>
      Sample {s.variants.length ? <b>{runnableVariants(s.variants).length} variants</b> : <b>up to {s.maxTokens} tokens</b>} from <b>{modelShort}</b> at{" "}
      {s.temperature === 0 ? "greedy" : `T ${s.temperature.toFixed(2)}`}, with the top {s.reportK} tokens of every step
      {s.variants.length ? <> (the button runs the first; the menu runs them all)</> : null}.
    </>
  );

  return (
    <>
      {step === 1 ? (
        <SetupStep
          main={
            <>
              <Block title="Start from" hint="Prompts whose next-token distribution says something">
                <StartCards
                  items={PROMPT_CATALOGUE.map((p) => ({ id: p.id, name: p.name, description: p.description, group: p.group, note: p.variants?.length ? `${p.variants.length} variants, one word swapped` : undefined }))}
                  activeId={PROMPT_CATALOGUE.find((p) => p.prompt === s.prompt || p.variants?.some((v) => v.prompt === s.prompt))?.id}
                  onPick={(id) => {
                    const loaded = loadPrompt(id);
                    setNotes(loaded?.preset.variants ? [{ level: "info", text: "a probe: edit the variants, then Run all variants" }] : []);
                  }}
                  disabled={!!running}
                />
              </Block>
              <Block title={s.variants.length ? "Probe" : "Prompt"} hint={s.variants.length ? `${s.probeName ?? "probe"} · each variant runs as its own batch; the probe table compares them` : "No schema, no mask: the model continues this text"}>
                {s.variants.length ? (
                  <VariantsEditor variants={s.variants} onChange={(variants) => update({ variants })} onRunOne={runVariantFromSetup} onRunAll={runAllFromSetup} repeatN={s.repeatN} disabled={!!running} action="Run" />
                ) : (
                  <textarea className="input mono text-[13.5px] min-h-[120px]" value={s.prompt} onChange={(e) => update({ prompt: e.target.value })} disabled={!!running} aria-label="Prompt" />
                )}
              </Block>
            </>
          }
          aside={
            <>
              <ModelSection hosted value={chosen} onChange={onModel} disabled={!!running} keys={keys} onKey={(id, key) => setKeys((k) => ({ ...k, [id]: key }))} />

              <Section
                id="lp-sampling"
                title="Sampling"
                summary={samplingSummary(s)}
                actions={
                  <span className="chip" title="The bars redraw the selected run with these at once; the next run samples with them">
                    live on the recorded run
                  </span>
                }
              >
                <label className="flex flex-col gap-1">
                  <span className="eyebrow">Temperature · {s.temperature === 0 ? "greedy" : s.temperature.toFixed(2)}</span>
                  <input type="range" min={0} max={2} step={0.05} value={s.temperature} onChange={(e) => update({ temperature: Number(e.target.value) })} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="eyebrow">Top-k · {s.topK === 0 ? "off" : s.topK}</span>
                  <input type="range" min={0} max={50} step={1} value={s.topK} onChange={(e) => update({ topK: Number(e.target.value) })} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="eyebrow">Top-p · {s.topP >= 1 ? "off" : s.topP.toFixed(2)}</span>
                  <input type="range" min={0.01} max={1} step={0.01} value={s.topP} onChange={(e) => update({ topP: Number(e.target.value) })} />
                </label>
              </Section>

              <Section id="lp-limits" title="Limits" summary={limitsSummary(s)}>
                <div className="flex flex-col gap-2 text-xs">
                  <label className="flex items-center gap-2">
                    <span className="w-28 text-muted">Max tokens</span>
                    <input
                      type="number"
                      min={1}
                      max={256}
                      className="input input-num py-0.5 px-1.5 text-xs tabular-nums"
                      value={s.maxTokens}
                      onChange={(e) => update({ maxTokens: Math.min(Math.max(Number(e.target.value) || 1, 1), 256) })}
                      disabled={!!running}
                    />
                  </label>
                  <label className="flex items-center gap-2">
                    <span className="w-28 text-muted">Seed</span>
                    <input
                      type="number"
                      className="input py-0.5 px-1.5 text-xs tabular-nums"
                      style={{ width: "6rem" }}
                      value={s.seed ?? ""}
                      placeholder="random"
                      onChange={(e) => update({ seed: e.target.value === "" ? null : Number(e.target.value) })}
                      disabled={!!running}
                      title="Empty: a fresh seed per run. A number makes a sampled run reproducible; greedy ignores it."
                    />
                  </label>
                  <label className="flex items-center gap-2">
                    <span className="w-28 text-muted">Top-k reported</span>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      className="input input-num py-0.5 px-1.5 text-xs tabular-nums"
                      value={s.reportK}
                      onChange={(e) => update({ reportK: Math.min(Math.max(Number(e.target.value) || 1, 1), 50) })}
                      disabled={!!running}
                      title="Rows the backend reports per step; the tail histogram covers the rest"
                    />
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={s.useTemplate} onChange={(e) => update({ useTemplate: e.target.checked })} disabled={!!running} />
                    <span className="text-muted">Chat template</span>
                  </label>
                </div>
              </Section>
            </>
          }
        />
      ) : (
        <div className="inference-step">
          <InferenceHead run={selected} />
          <RunTabs backendUrl={backend.url} onDuplicate={duplicate} />
          {pinned.length === 2 && <ComparePanel runIds={pinned} />}
          {(() => {
            const probeBatch = selectedBatch ?? (selected ? (batches[selected.batchId] ?? null) : null);
            return probeBatch?.probe ? <ProbePanel key={`probe-${probeBatch.probe.presetId}`} batch={probeBatch} /> : null;
          })()}
          {selectedBatch && <BatchPanel key={selectedBatch.id} batch={selectedBatch} />}
          {drifted && selected?.kind === "logprobs" && (
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="chip chip-warning">the bars show T {s.temperature.toFixed(2)} · k {s.topK || "off"} · p {s.topP >= 1 ? "off" : s.topP.toFixed(2)}, not what this run sampled with</span>
              <button className="btn py-1 px-2.5 text-[13px]" type="button" onClick={() => start()} disabled={blocked}>
                Re-run with these
              </button>
            </div>
          )}
          {selected && (!selectedBatch || selected.batchId === selectedBatch.id) ? (
            selected.kind === "logprobs" ? (
              <LogprobsViewer key={selected.id} run={selected} view={view} onView={updateView} sampling={{ temperature: s.temperature, topK: s.topK, topP: s.topP }} />
            ) : (
              <ConstrainedViewer key={selected.id} run={selected} view={view} onView={updateView} setupTemperature={selected.request.temperature} />
            )
          ) : selectedBatch ? null : (
            <p className="text-sm text-muted">Pick a run in the tabs above.</p>
          )}
        </div>
      )}

      <ActionBar sentence={sentence}>
        <RunActions label="Run" runningLabel="Running…" running={!!running} disabled={blocked} onRun={() => start()} onStop={stop} menu={repeatMenu}>
          <BatchProgress />
          {backend.phase === "offline" && <span className="chip chip-critical">backend unreachable</span>}
          {missingKey && <span className="chip chip-warning">add a key to use this model</span>}
          {notes.map((n) => (
            <span key={n.text} className={`chip ${n.level === "warning" ? "chip-warning" : ""}`}>
              {n.text}
            </span>
          ))}
        </RunActions>
      </ActionBar>
    </>
  );
}
