"use client";

import { useCallback, useEffect, useState } from "react";
import { useBackend } from "@/components/BackendProvider";
import { ConstrainedViewer } from "@/components/ConstrainedViewer";
import { LogprobsViewer } from "@/components/LogprobsViewer";
import { BatchPanel } from "@/components/shell/BatchPanel";
import { BatchProgress } from "@/components/shell/BatchProgress";
import { ComparePanel } from "@/components/shell/ComparePanel";
import { SetupColumn } from "@/components/shell/SetupColumn";
import { EmptyState } from "@/components/shell/EmptyState";
import { Menu } from "@/components/shell/Menu";
import { ProbePanel } from "@/components/shell/ProbePanel";
import { ModelSection } from "@/components/shell/ModelSection";
import { RunActions } from "@/components/shell/RunActions";
import { RunTabs } from "@/components/shell/RunTabs";
import { Section } from "@/components/shell/Section";
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
import { useViewState } from "@/lib/viewState";

export default function LogprobsPage() {
  const backend = useBackend();
  const [s, update] = useLogprobsState();
  const [view, updateView] = useViewState();
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
  const modelShort = chosen.split("/").pop()?.split(":").pop() ?? "model";

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

  const pickVariant = (id: string, variant: number) => {
    const loaded = loadPrompt(id);
    if (!loaded || blocked) return;
    const { preset, next } = loaded;
    const v = preset.variants?.[variant] ?? null;
    if (v) update({ prompt: v.prompt });
    const started = startBatch(planFor({ ...next, prompt: v?.prompt ?? next.prompt }, v, 1));
    setNotes(started ? started.notes : [{ level: "warning", text: "a run is already in flight" }]);
  };

  const editPrompt = (id: string) => {
    if (!loadPrompt(id)) return;
    setNotes([{ level: "info", text: "edit the variants, then Run all variants" }]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const runAllFromSetup = () => {
    const list = runnableVariants(s.variants);
    if (!list.length || blocked) return;
    queueBatches(list.map((v) => planFor(s, v, s.repeatN)));
    setNotes([{ level: "info", text: `${list.length} variants × ${s.repeatN} queued` }]);
  };

  const runAllVariants = (id: string) => {
    const loaded = loadPrompt(id);
    if (!loaded || blocked) return;
    const list = runnableVariants(loaded.next.variants);
    queueBatches(list.map((v) => planFor(loaded.next, v, loaded.next.repeatN)));
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

  const pickPrompt = (id: string) => {
    const loaded = loadPrompt(id);
    if (!loaded) return;
    start(loaded.preset.prompt);
  };

  const duplicate = (run: Run, batch: Batch) => {
    void batch;
    if (run.kind !== "logprobs") return false;
    update(patchFromLogprobsRun(run));
    window.scrollTo({ top: 0, behavior: "smooth" });
    return true;
  };

  // The knobs are live on the selected run, so they can differ from what generated it.
  const drifted =
    selected?.kind === "logprobs" && (selected.request.temperature !== s.temperature || selected.request.top_k !== s.topK || selected.request.top_p !== s.topP);
  // A hosted model only needs the backend reachable as a proxy, not a local model loaded.
  const blocked = !s.prompt.trim() || missingKey || (provider ? backend.phase !== "online" : !backend.ready || busy);
  const promptSummary = s.prompt.length > 56 ? `${s.prompt.slice(0, 56)}…` : s.prompt;

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

  return (
    <div className="grid lg:grid-cols-[360px_minmax(0,1fr)] gap-6 items-start">
      <SetupColumn summary={`${modelShort} · ${samplingSummary(s)}`}>
        <ModelSection hosted value={chosen} onChange={onModel} disabled={!!running} keys={keys} onKey={(id, key) => setKeys((k) => ({ ...k, [id]: key }))} />

        <Section id="lp-prompt" title={s.variants.length ? "Prompt · probe" : "Prompt"} summary={s.variants.length ? `${s.probeName ?? "probe"} · ${s.variants.length} variants` : promptSummary}>
          {s.variants.length ? (
            <VariantsEditor variants={s.variants} onChange={(variants) => update({ variants })} onRunOne={runVariantFromSetup} onRunAll={runAllFromSetup} repeatN={s.repeatN} disabled={!!running} action="Run" />
          ) : (
            <textarea className="input text-sm min-h-[96px]" value={s.prompt} onChange={(e) => update({ prompt: e.target.value })} disabled={!!running} aria-label="Prompt" />
          )}
          <label className="flex items-center gap-2 text-xs">
            <span className="text-muted shrink-0">Example</span>
            <select
              className="input text-xs"
              value={PROMPT_CATALOGUE.find((p) => p.prompt === s.prompt)?.id ?? ""}
              onChange={(e) => {
                loadPrompt(e.target.value);
              }}
              disabled={!!running}
              aria-label="Example prompt"
            >
              <option value="">custom</option>
              {[...new Set(PROMPT_CATALOGUE.map((p) => p.group))].map((group) => (
                <optgroup key={group} label={group}>
                  {PROMPT_CATALOGUE.filter((p) => p.group === group).map((p) => (
                    <option key={p.id} value={p.id} title={p.description}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        </Section>

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
          {drifted && selected?.kind === "logprobs" && (
            <button
              className="btn py-1 px-2.5 text-[13px] self-start"
              type="button"
              onClick={() => start()}
              disabled={blocked}
              title={`The selected run used T ${selected.request.temperature.toFixed(2)}${selected.request.top_k ? ` · k ${selected.request.top_k}` : ""}${selected.request.top_p < 1 ? ` · p ${selected.request.top_p.toFixed(2)}` : ""}; the bars only project these`}
            >
              Re-run with these
            </button>
          )}
        </Section>

        <Section id="lp-limits" title="Limits" defaultOpen={false} summary={limitsSummary(s)}>
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
      </SetupColumn>

      <div className="flex flex-col gap-5 min-w-0">
        <RunTabs backendUrl={backend.url} onDuplicate={duplicate} />
        {pinned.length === 2 && <ComparePanel runIds={pinned} />}
        {(() => {
          const probeBatch = selectedBatch ?? (selected ? (batches[selected.batchId] ?? null) : null);
          return probeBatch?.probe ? <ProbePanel key={`probe-${probeBatch.probe.presetId}`} batch={probeBatch} /> : null;
        })()}
        {selectedBatch && <BatchPanel key={selectedBatch.id} batch={selectedBatch} />}
        {selected && (!selectedBatch || selected.batchId === selectedBatch.id) ? (
          selected.kind === "logprobs" ? (
            <LogprobsViewer key={selected.id} run={selected} view={view} onView={updateView} sampling={{ temperature: s.temperature, topK: s.topK, topP: s.topP }} />
          ) : (
            <ConstrainedViewer key={selected.id} run={selected} view={view} onView={updateView} setupTemperature={selected.request.temperature} />
          )
        ) : selectedBatch ? null : (
          <EmptyState
            eyebrow="Start from a prompt"
            items={PROMPT_CATALOGUE.map((p) => ({ id: p.id, name: p.name, description: p.description, group: p.group, variants: p.variants?.map((v) => v.label) }))}
            activeId={PROMPT_CATALOGUE.find((p) => p.prompt === s.prompt || p.variants?.some((v) => v.prompt === s.prompt))?.id}
            onPick={pickPrompt}
            onPickVariant={pickVariant}
            onRunAll={runAllVariants}
            onEdit={editPrompt}
            repeatN={s.repeatN}
            ready={!blocked}
            action="Run"
            hint={<span className="text-xs text-muted">or write your own and press Run</span>}
          />
        )}
      </div>
    </div>
  );
}
