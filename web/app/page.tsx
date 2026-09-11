"use client";

import { useCallback, useMemo, useState } from "react";
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
import { EngineSection } from "@/components/shell/EngineSection";
import { ModelSection } from "@/components/shell/ModelSection";
import { PromptHint } from "@/components/shell/PromptHint";
import { RunActions } from "@/components/shell/RunActions";
import { RunTabs } from "@/components/shell/RunTabs";
import { SchemaSection } from "@/components/shell/SchemaSection";
import { Section } from "@/components/shell/Section";
import { VariantsEditor } from "@/components/shell/VariantsEditor";
import { DEFAULT_SCHEMA_HINT, engineLabel } from "@/lib/engines";
import { buildGenerateRequest, editorSnapshot, engineSummary, parseSchema, patchFromRun, presetPatch, probeKey, runnableVariants, useLabState } from "@/lib/labState";
import { cancelBatch, cancelQueue, MAX_BATCH_N, queueBatches, startBatch, type BatchPlan } from "@/lib/runner";
import { useBatchesRecord, useLocalBusy, usePinned, useRunState, useSelectedBatch, useSelectedRun } from "@/lib/runStore";
import type { Batch, Run } from "@/lib/runTypes";
import type { SeedNote } from "@/lib/seeds";
import { formatInt } from "@/lib/tokens";
import { usePydanticSchema } from "@/lib/usePydanticSchema";
import { useViewState } from "@/lib/viewState";

export default function LabPage() {
  const backend = useBackend();
  const [state, update] = useLabState();
  const [view, updateView] = useViewState();
  // The conversion only needs the backend to answer; it does not touch the model,
  // so an evicted or still-loading model must not hide the derived schema.
  const pydantic = usePydanticSchema(state.pydanticText, state.pydanticModel, state.sourceKind === "pydantic", backend.url, backend.phase === "online");
  const typed = useMemo(() => parseSchema(state.schemaText), [state.schemaText]);
  const schema = state.sourceKind === "pydantic" ? pydantic.schema : typed.schema;

  const selected = useSelectedRun();
  const selectedBatch = useSelectedBatch();
  const batches = useBatchesRecord();
  const pinned = usePinned();
  const busy = useLocalBusy();
  const running = useRunState((s) => Object.values(s.runs).find((r) => r.status === "running") ?? null);
  const [notes, setNotes] = useState<SeedNote[]>([]);
  const blocked = !backend.ready || !schema || busy;
  const blockedNow = blocked;

  const presetName = backend.presets.find((p) => p.id === state.presetId)?.name ?? "custom";
  const modelShort = (backend.model ?? backend.selected?.id ?? "model").split("/").pop() ?? "model";

  // A preset card runs before the editors have re-derived their schema, so it passes its own.
  const start = useCallback(
    (override?: { schema?: Record<string, unknown>; prompt?: string; name?: string; n?: number }) => {
      const useSchema = override?.schema ?? schema;
      if (!useSchema || !backend.ready) return;
      const started = startBatch({
        kind: "constrained",
        backendUrl: backend.url,
        n: override?.n ?? 1,
        seedPolicy: state.seedPolicy,
        request: buildGenerateRequest(state, useSchema, backend.model, override?.prompt),
        editor: editorSnapshot(state),
        label: `${override?.name ?? presetName} · ${modelShort}`,
      });
      setNotes(started ? started.notes : [{ level: "warning", text: "a run is already in flight" }]);
    },
    [schema, backend.ready, backend.url, backend.model, state, presetName, modelShort],
  );


  const stop = useCallback(() => {
    cancelQueue();
    if (running) cancelBatch(running.batchId);
  }, [running]);

  /**
   * A plan for one variant, from whatever the setup holds now (schema and prompts included), so a
   * probe can be edited before it runs. The probe key pools the batches of one edit into one table.
   */
  const planFor = (setup: typeof state, schemaNow: Record<string, unknown>, variant: { label: string; prompt: string } | null, n: number): BatchPlan => {
    // From `setup`, not from the rendered state: a card launches before its preset has reached the editors.
    const name = setup.probeName ?? backend.presets.find((p) => p.id === setup.presetId)?.name ?? "custom";
    const list = runnableVariants(setup.variants);
    return {
      kind: "constrained",
      backendUrl: backend.url,
      n,
      seedPolicy: setup.seedPolicy,
      request: buildGenerateRequest(setup, schemaNow, backend.model, variant?.prompt ?? setup.prompt),
      editor: editorSnapshot(setup),
      label: `${name}${variant ? ` · ${variant.label}` : ""} · ${modelShort}`,
      probe: variant && setup.probeId ? { presetId: probeKey(setup.probeId, schemaNow, list), presetName: name, variant: variant.label } : null,
    };
  };

  /** Load a preset into the setup: schema, prompt and, for a probe, its variants. */
  const loadPreset = (id: string) => {
    const preset = backend.presets.find((p) => p.id === id);
    if (!preset) return null;
    const next = { ...state, ...presetPatch(preset, state) };
    update(presetPatch(preset, state));
    return { preset, next };
  };

  const pickPreset = (id: string, variant = 0) => {
    const loaded = loadPreset(id);
    if (!loaded || !backend.ready) return;
    const { preset, next } = loaded;
    const v = preset.variants?.[variant] ?? null;
    if (v) update({ prompt: v.prompt });
    const started = startBatch(planFor({ ...next, prompt: v?.prompt ?? next.prompt }, preset.schema, v, 1));
    setNotes(started ? started.notes : [{ level: "warning", text: "a run is already in flight" }]);
  };

  const editPreset = (id: string) => {
    if (!loadPreset(id)) return;
    setNotes([{ level: "info", text: "edit the variants and the schema, then Run all variants" }]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /** Every variant the setup holds now, with the schema as edited. */
  const runAllFromSetup = () => {
    const list = runnableVariants(state.variants);
    if (!list.length || !schema || !backend.ready) return;
    queueBatches(list.map((v) => planFor(state, schema, v, state.repeatN)));
    setNotes(state.temperature <= 0 ? [{ level: "warning", text: "greedy: every repetition will be identical; raise the temperature to sample" }] : [{ level: "info", text: `${list.length} variants × ${state.repeatN} queued` }]);
  };

  /** From a card: the preset as it comes, loaded and launched at once. */
  const runAllVariants = (id: string) => {
    const loaded = loadPreset(id);
    if (!loaded || !backend.ready) return;
    const { preset, next } = loaded;
    const list = runnableVariants(next.variants);
    queueBatches(list.map((v) => planFor(next, preset.schema, v, next.repeatN)));
    setNotes(next.temperature <= 0 ? [{ level: "warning", text: "greedy: every repetition will be identical; raise the temperature to sample" }] : []);
  };

  /** The same request twice, N runs each: the mask on, and the shape asked for in the prompt only. */
  const compareModes = (setup: typeof state, schemaNow: Record<string, unknown>, name: string) => {
    // The hint is part of the key: rewording it starts a new table instead of pooling into the old one.
    const key = probeKey(`${setup.presetId || "custom"}·modes`, schemaNow, [
      { label: "mode", prompt: setup.prompt },
      { label: "hint", prompt: setup.schemaHint },
    ]);
    const masked = setup.mode === "none" ? "auto" : setup.mode;
    const plans: BatchPlan[] = [
      { ...planFor({ ...setup, mode: masked }, schemaNow, null, setup.repeatN), label: `${name} · with mask · ${modelShort}`, probe: { presetId: key, presetName: `${name} · mask vs prompt`, variant: `with mask (${masked === "auto" ? "auto" : engineLabel(masked)})` } },
      { ...planFor({ ...setup, mode: "none" }, schemaNow, null, setup.repeatN), label: `${name} · prompt only · ${modelShort}`, probe: { presetId: key, presetName: `${name} · mask vs prompt`, variant: "prompt only" } },
    ];
    queueBatches(plans);
    setNotes(setup.temperature <= 0 ? [{ level: "warning", text: "greedy: every repetition will be identical; raise the temperature to sample" }] : [{ level: "info", text: `2 × ${setup.repeatN} queued: with mask, then prompt only` }]);
  };

  const compareModesFromSetup = () => {
    if (!schema || !backend.ready) return;
    compareModes(state, schema, presetName);
  };

  const compareModesForPreset = (id: string) => {
    const loaded = loadPreset(id);
    if (!loaded || !backend.ready) return;
    compareModes(loaded.next, loaded.preset.schema, loaded.preset.name);
  };

  const runVariantFromSetup = (i: number) => {
    const list = runnableVariants(state.variants);
    const v = state.variants[i];
    if (!v || !schema || !backend.ready) return;
    const label = list.find((x) => x.prompt === v.prompt)?.label ?? v.label;
    update({ prompt: v.prompt });
    const started = startBatch(planFor({ ...state, prompt: v.prompt }, schema, { label, prompt: v.prompt }, 1));
    setNotes(started ? started.notes : [{ level: "warning", text: "a run is already in flight" }]);
  };

  const repeatMenu = (
    <Menu
      label="▾"
      className="btn btn-primary btn-icon rounded-l-none border-l-0"
      ariaLabel="Repeat"
      title="Run the same request several times"
      disabled={blockedNow}
      items={[
        ...(state.variants.length
          ? [{ label: `Run all variants ×${state.repeatN}`, hint: "Every variant in the setup, as edited, one batch after another", onSelect: runAllFromSetup }]
          : []),
        { label: `Mask vs prompt ×${state.repeatN}`, hint: "Two batches: the schema as a mask, then the schema asked for in the prompt only; compare the valid rates", onSelect: compareModesFromSetup },
        ...[3, 5, 10, 20].map((n) => ({ label: `Repeat ×${n}`, hint: `${n} runs, one after the other`, onSelect: () => start({ n }) })),
        {
          label: `Repeat ×${state.repeatN}…`,
          hint: `Ask for a number up to ${MAX_BATCH_N}`,
          onSelect: () => {
            const raw = window.prompt("How many runs?", String(state.repeatN));
            const n = Math.min(Math.max(Number(raw) || 0, 1), MAX_BATCH_N);
            if (raw !== null && n > 1) {
              update({ repeatN: n });
              start({ n });
            }
          },
        },
        {
          label: `${state.seedPolicy === "fresh" ? "✓ " : ""}Seed · new per run`,
          hint: "Each repetition samples differently (needs T > 0)",
          onSelect: () => update({ seedPolicy: "fresh" }),
        },
        {
          label: `${state.seedPolicy === "same" ? "✓ " : ""}Seed · same for all`,
          hint: "Every repetition uses one seed: identical runs, a check on reproducibility",
          onSelect: () => update({ seedPolicy: "same" }),
        },
      ]}
    />
  );

  const duplicate = (run: Run, batch: Batch) => {
    if (run.kind !== "constrained") return false;
    update(patchFromRun(run, batch));
    window.scrollTo({ top: 0, behavior: "smooth" });
    return true;
  };

  // The same count the Derived schema chip shows: the pretty-printed text.
  const schemaSummary = `${presetName} · ${state.sourceKind === "pydantic" ? "Pydantic" : "JSON Schema"}${schema ? ` · ${formatInt(JSON.stringify(schema, null, 2).length)} chars` : ""}`;
  const promptSummary = `${state.prompt.length > 56 ? `${state.prompt.slice(0, 56)}…` : state.prompt}${state.mode === "none" ? " · + JSON hint" : ""}`;

  return (
    <div className="grid lg:grid-cols-[360px_minmax(0,1fr)] gap-6 items-start">
      <SetupColumn summary={`${presetName} · ${modelShort} · ${engineSummary(state)}`}>
        <ModelSection value={backend.model ?? backend.selected?.id ?? ""} onChange={(id) => backend.setModel(id)} disabled={busy} />

        <Section id="schema" title="Schema" summary={schemaSummary}>
          <SchemaSection state={state} update={update} pydantic={pydantic} disabled={busy} />
        </Section>

        <Section id="prompt" title={state.variants.length ? "Prompt · probe" : "Prompt"} summary={state.variants.length ? `${state.probeName ?? "probe"} · ${state.variants.length} variants` : promptSummary}>
          {state.variants.length ? (
            <VariantsEditor
              variants={state.variants}
              onChange={(variants) => update({ variants })}
              onRunOne={runVariantFromSetup}
              onRunAll={runAllFromSetup}
              repeatN={state.repeatN}
              disabled={busy}
              action="Generate"
            />
          ) : (
            <textarea className="input text-sm min-h-[84px]" value={state.prompt} onChange={(e) => update({ prompt: e.target.value })} disabled={busy} aria-label="Prompt" />
          )}
          {state.mode === "none" ? (
            <PromptHint template={state.schemaHint} schema={schema} onChange={(schemaHint) => update({ schemaHint })} disabled={busy} />
          ) : selected?.kind === "constrained" && selected.request.mode === "none" ? (
            // The setup is on another engine, but the run on screen was prompt only: show what it really sent.
            <PromptHint
              template={selected.request.schema_hint ?? DEFAULT_SCHEMA_HINT}
              schema={selected.request.schema}
              eyebrow="Prompt only · what the selected run appended after its prompt"
              action={{
                label: "Use prompt only here",
                hint: "Switch the setup to Prompt only with this wording",
                onSelect: () => update({ mode: "none", schemaHint: selected.request.schema_hint ?? DEFAULT_SCHEMA_HINT }),
              }}
            />
          ) : null}
        </Section>

        <Section id="engine" title="Engine & sampling" defaultOpen={false} summary={engineSummary(state)}>
          <EngineSection state={state} update={update} disabled={busy} engines={backend.health?.engines} />
        </Section>

        <RunActions label="Generate" runningLabel="Generating…" running={!!running} disabled={blocked} onRun={() => start()} onStop={stop} menu={repeatMenu}>
          <BatchProgress />
          {backend.phase === "offline" && <span className="chip chip-critical">backend unreachable</span>}
          {backend.health?.busy && !busy && <span className="chip chip-warning">backend busy · queued</span>}
          {pydantic.pending && !busy && <span className="chip">converting…</span>}
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
          selected.kind === "constrained" ? (
            <ConstrainedViewer key={selected.id} run={selected} view={view} onView={updateView} setupTemperature={state.temperature} />
          ) : (
            <LogprobsViewer
              key={selected.id}
              run={selected}
              view={view}
              onView={updateView}
              sampling={{ temperature: selected.request.temperature, topK: selected.request.top_k, topP: selected.request.top_p }}
            />
          )
        ) : selectedBatch ? null : (
          <EmptyState
            eyebrow="Start from a preset"
            items={backend.presets.map((p) => ({ id: p.id, name: p.name, description: p.description, group: p.group, variants: p.variants?.map((v) => v.label) }))}
            activeId={state.presetId}
            onPick={(id) => pickPreset(id)}
            onPickVariant={pickPreset}
            onRunAll={runAllVariants}
            onEdit={editPreset}
            onCompareModes={compareModesForPreset}
            repeatN={state.repeatN}
            ready={backend.ready && !busy}
            action="Generate"
            hint={<span className="text-xs text-muted">or edit the schema and press Generate</span>}
          />
        )}
      </div>
    </div>
  );
}
