"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useBackend } from "@/components/BackendProvider";
import { ConstrainedViewer } from "@/components/ConstrainedViewer";
import { LogprobsViewer } from "@/components/LogprobsViewer";
import { MessagesEditor } from "@/components/replay/MessagesEditor";
import { RecordedPanel } from "@/components/replay/RecordedPanel";
import { ReplayKnobs } from "@/components/replay/ReplayKnobs";
import { CallPicker, TraceSection } from "@/components/replay/TraceSection";
import { BatchPanel } from "@/components/shell/BatchPanel";
import { BatchProgress } from "@/components/shell/BatchProgress";
import { ComparePanel } from "@/components/shell/ComparePanel";
import { EmptyState } from "@/components/shell/EmptyState";
import { EngineSection } from "@/components/shell/EngineSection";
import { Menu } from "@/components/shell/Menu";
import { ModelSection } from "@/components/shell/ModelSection";
import { PromptHint } from "@/components/shell/PromptHint";
import { RunActions } from "@/components/shell/RunActions";
import { RunTabs } from "@/components/shell/RunTabs";
import { Section } from "@/components/shell/Section";
import { SetupColumn } from "@/components/shell/SetupColumn";
import { loadModel } from "@/lib/api";
import { conversationChars } from "@/lib/chat";
import { engineSummary, parseSchema } from "@/lib/labState";
import { parseTrace, TraceError, type ImportedTrace, type LlmCall } from "@/lib/langchainTrace";
import { samplingSummary } from "@/lib/logprobsState";
import { PROVIDERS, providerOf, readKey } from "@/lib/providers";
import {
  buildReplayGenerateRequest,
  buildReplayStreamRequest,
  callDefaults,
  contextMessages,
  DEFAULT_MAX_MESSAGES,
  DEFAULT_MAX_MESSAGES_CHARS,
  draftFromCall,
  editMessages,
  isEdited,
  patchFromReplayRun,
  replayInfo,
  replayProblems,
  useImportedTrace,
  useReplayState,
  type EditAction,
} from "@/lib/replayState";
import { REPLAY_SAMPLES } from "@/lib/replaySamples";
import { cancelBatch, cancelQueue, MAX_BATCH_N, startBatch, type BatchPlan } from "@/lib/runner";
import { useBatchesRecord, useLocalBusy, usePinned, useRunState, useSelectedBatch, useSelectedRun } from "@/lib/runStore";
import type { Batch, Run } from "@/lib/runTypes";
import type { SeedNote } from "@/lib/seeds";
import { useViewState } from "@/lib/viewState";

export default function ReplayPage() {
  const backend = useBackend();
  const [s, update] = useReplayState();
  const [view, updateView] = useViewState();
  const { trace, stored, setTrace } = useImportedTrace();
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
  const running = useRunState((st) => Object.values(st.runs).find((r) => r.status === "running" || r.status === "queued") ?? null);

  // Hosted models only exist for Logprobs; Constrained needs the logits, so it runs on the local model.
  const chosen = s.model || backend.model || "";
  const hostedChoice = providerOf(chosen);
  const localOnly = s.engine === "constrained" && !!hostedChoice;
  const model = localOnly ? (backend.model ?? "") : chosen;
  const provider = s.engine === "logprobs" ? hostedChoice : "";
  const missingKey = !!provider && !keys[provider];
  const modelShort = model.split("/").pop()?.split(":").pop() || "model";

  const parsedSchema = useMemo(() => parseSchema(s.schemaText), [s.schemaText]);
  const limits = { maxMessages: backend.health?.max_messages ?? DEFAULT_MAX_MESSAGES, maxChars: backend.health?.max_messages_chars ?? DEFAULT_MAX_MESSAGES_CHARS };
  const problems = replayProblems(s, limits, !!parsedSchema.schema);
  const sent = contextMessages(s);
  const edited = isEdited(s);
  const blocked = problems.length > 0 || missingKey || (provider ? backend.phase !== "online" : !backend.ready || busy);
  const currentCall = trace?.calls.find((c) => c.id === s.source?.callId) ?? null;

  const loadCall = (t: ImportedTrace, call: LlmCall) => {
    update({ ...draftFromCall(t, call), ...callDefaults(call, { maxNewTokens: backend.health?.max_new_tokens_cap ?? 200 }) });
    setNotes([]);
  };

  const importTrace = (t: ImportedTrace) => {
    if (edited && !window.confirm("Replace the edited conversation with the imported trace?")) return;
    setTrace(t);
    loadCall(t, t.calls[0]);
  };

  const pickCall = (id: string) => {
    const call = trace?.calls.find((c) => c.id === id);
    if (!trace || !call) return;
    if (edited && !window.confirm("Discard the edits to this conversation?")) return;
    loadCall(trace, call);
  };

  // Back to the trace's messages; without the trace in memory, undo the edits that can be undone.
  const resetToTrace = () => {
    if (trace && currentCall) {
      update(draftFromCall(trace, currentCall));
      return;
    }
    update({ messages: s.messages.filter((m) => m.original).map((m) => ({ ...m, ...m.original })), deleted: 0, cutAt: Math.min(s.cutAt, s.messages.filter((m) => m.original).length) });
  };

  const onEdit = (action: EditAction) => update(editMessages(s, action));

  const label = `Replay · ${s.source?.callLabel.split(" · ")[0] ?? "conversation"} @${s.cutAt}${edited ? " · edited" : ""} · ${modelShort}`;
  const planFor = (n: number): BatchPlan | null => {
    const common = { backendUrl: backend.url, n, seedPolicy: s.seedPolicy, label, replay: replayInfo(s) };
    if (s.engine === "constrained") {
      if (!parsedSchema.schema) return null;
      return { ...common, kind: "constrained", request: buildReplayGenerateRequest(s, parsedSchema.schema, model || null) };
    }
    return { ...common, kind: "logprobs", request: buildReplayStreamRequest(s, model || null), providerKey: provider ? keys[provider] : undefined };
  };

  const start = (n = 1) => {
    if (blocked) return;
    const plan = planFor(n);
    if (!plan) return;
    const started = startBatch(plan);
    setNotes(started ? started.notes : [{ level: "warning", text: "a run is already in flight" }]);
  };

  const stop = useCallback(() => {
    cancelQueue();
    if (running) cancelBatch(running.batchId);
  }, [running]);

  const onModel = (id: string) => {
    update({ model: id });
    if (!providerOf(id) && backend.url) loadModel(backend.url, id).catch(() => undefined);
  };

  const duplicate = (run: Run, batch: Batch) => {
    update(patchFromReplayRun(run, batch));
    setNotes(run.request.messages?.length ? [] : [{ level: "info", text: "a prompt run: its prompt is now a one-message conversation" }]);
    window.scrollTo({ top: 0, behavior: "smooth" });
    return true;
  };

  const loadSample = (id: string) => {
    const sample = REPLAY_SAMPLES.find((x) => x.id === id);
    if (!sample) return;
    try {
      importTrace(parseTrace(sample.value, sample.name));
    } catch (e) {
      setNotes([{ level: "warning", text: e instanceof TraceError ? e.message : String(e) }]);
    }
  };

  const repeatMenu = (
    <Menu
      label="▾"
      className="btn btn-primary btn-icon rounded-l-none border-l-0"
      ariaLabel="Repeat"
      title="Replay the same cut several times"
      disabled={blocked}
      items={[
        ...[3, 5, 10, 20].map((n) => ({ label: `Repeat ×${n}`, hint: provider ? `${n} runs, three at a time` : `${n} runs, one after the other`, onSelect: () => start(n) })),
        {
          label: `Repeat ×${s.repeatN}…`,
          hint: `Ask for a number up to ${MAX_BATCH_N}`,
          onSelect: () => {
            const raw = window.prompt("How many runs?", String(s.repeatN));
            const n = Math.min(Math.max(Number(raw) || 0, 1), MAX_BATCH_N);
            if (raw !== null && n > 1) {
              update({ repeatN: n });
              start(n);
            }
          },
        },
        { label: `${s.seedPolicy === "fresh" ? "✓ " : ""}Seed · new per run`, hint: "Each repetition samples differently (needs T > 0)", onSelect: () => update({ seedPolicy: "fresh" }) },
        { label: `${s.seedPolicy === "same" ? "✓ " : ""}Seed · same for all`, hint: "Every repetition uses one seed: identical runs", onSelect: () => update({ seedPolicy: "same" }) },
      ]}
    />
  );

  const engineLine = s.engine === "constrained" ? `Constrained · ${engineSummary(s)}` : `Logprobs · ${samplingSummary({ temperature: s.lpTemperature, topK: s.lpTopK, topP: s.lpTopP })}`;
  const replayBatch = selectedBatch ?? (selected ? (batches[selected.batchId] ?? null) : null);

  return (
    <div className="grid lg:grid-cols-[360px_minmax(0,1fr)] gap-6 items-start">
      <SetupColumn summary={`${s.source?.callLabel ?? "no trace"} · cut @${s.cutAt} · ${modelShort}`}>
        <ModelSection hosted={s.engine === "logprobs"} value={localOnly ? model : chosen} onChange={onModel} disabled={!!running} keys={keys} onKey={(id, key) => setKeys((k) => ({ ...k, [id]: key }))} />
        {localOnly && <span className="chip chip-warning self-start">hosted models replay in Logprobs only; this runs on {modelShort}</span>}

        <Section id="rp-trace" title="Trace" summary={trace ? `${trace.name} · ${trace.calls.length} calls` : (s.source?.traceName ?? "none")}>
          <TraceSection trace={trace} stored={stored} onImport={importTrace} onClear={() => setTrace(null)} disabled={!!running} />
        </Section>

        {trace && trace.calls.length > 1 && (
          <Section id="rp-call" title="LLM call" summary={currentCall ? `#${currentCall.index} ${currentCall.name}` : "—"}>
            <CallPicker calls={trace.calls} value={s.source?.callId ?? null} onChange={pickCall} disabled={!!running} />
          </Section>
        )}

        <Section id="rp-messages" title="Conversation" summary={`${s.messages.length} messages · cut @${s.cutAt}${edited ? " · edited" : ""}`}>
          <MessagesEditor
            messages={s.messages}
            cutAt={s.cutAt}
            onEdit={onEdit}
            disabled={!!running}
            sentChars={conversationChars(sent)}
            maxChars={limits.maxChars}
            sentCount={sent.length}
            edited={edited}
            onReset={s.messages.some((m) => m.original) ? resetToTrace : undefined}
          />
        </Section>

        <Section id="rp-engine" title="Engine" summary={engineLine}>
          <div className="segmented self-start" role="group" aria-label="Replay with">
            <button type="button" aria-pressed={s.engine === "logprobs"} onClick={() => update({ engine: "logprobs" })} disabled={!!running} title="No mask: the distribution behind every token; local or hosted models">
              Logprobs
            </button>
            <button type="button" aria-pressed={s.engine === "constrained"} onClick={() => update({ engine: "constrained" })} disabled={!!running} title="The schema compiled to a mask; local models only">
              Constrained
            </button>
          </div>
          {s.engine === "constrained" ? (
            <>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                  <span className="eyebrow">JSON Schema</span>
                  {s.schemaSource && <span className="chip chip-good">from the trace · {s.schemaSource}</span>}
                </div>
                <textarea
                  className="input mono text-[12px] min-h-[140px]"
                  value={s.schemaText}
                  onChange={(e) => update({ schemaText: e.target.value, schemaSource: null })}
                  spellCheck={false}
                  disabled={!!running}
                  placeholder={'{"type": "object", "properties": {...}}'}
                  aria-label="JSON Schema"
                />
                {s.schemaText.trim() && parsedSchema.error && <span className="mono text-[12px] text-critical">{parsedSchema.error}</span>}
                {currentCall?.schema && !s.schemaSource && (
                  <button
                    type="button"
                    className="btn py-0.5 px-2 text-xs self-start"
                    onClick={() => currentCall.schema && update({ schemaText: JSON.stringify(currentCall.schema.schema, null, 2), schemaSource: currentCall.schema.source })}
                    disabled={!!running}
                  >
                    Reset to the trace&apos;s schema
                  </button>
                )}
              </div>
              <EngineSection state={s} update={update} disabled={!!running} engines={backend.health?.engines} />
              {s.mode === "none" && (
                <PromptHint template={s.schemaHint} schema={parsedSchema.schema} onChange={(schemaHint) => update({ schemaHint })} disabled={!!running} eyebrow="Prompt only · appended to the last user message" />
              )}
            </>
          ) : (
            <ReplayKnobs state={s} update={update} disabled={!!running} />
          )}
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={s.useTemplate} onChange={(e) => update({ useTemplate: e.target.checked })} disabled={!!running} />
            <span className="text-muted" title="Off: the conversation is sent as a plain transcript (a single user message as its own text)">
              Chat template
            </span>
          </label>
        </Section>

        <RunActions label="Replay" runningLabel="Replaying…" running={!!running} disabled={blocked} onRun={() => start()} onStop={stop} menu={repeatMenu}>
          <BatchProgress />
          {backend.phase === "offline" && <span className="chip chip-critical">backend unreachable</span>}
          {missingKey && <span className="chip chip-warning">add a key to use this model</span>}
          {problems.map((p) => (
            <span key={p} className="chip chip-warning">
              {p}
            </span>
          ))}
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
        {replayBatch?.replay && <RecordedPanel batch={replayBatch} run={selected && selected.batchId === replayBatch.id ? selected : null} />}
        {selectedBatch && <BatchPanel key={selectedBatch.id} batch={selectedBatch} />}
        {selected && (!selectedBatch || selected.batchId === selectedBatch.id) ? (
          selected.kind === "logprobs" ? (
            <LogprobsViewer key={selected.id} run={selected} view={view} onView={updateView} sampling={{ temperature: s.lpTemperature, topK: s.lpTopK, topP: s.lpTopP }} />
          ) : (
            <ConstrainedViewer key={selected.id} run={selected} view={view} onView={updateView} setupTemperature={s.temperature} />
          )
        ) : selectedBatch ? null : (
          <EmptyState
            eyebrow="Start from a trace"
            items={REPLAY_SAMPLES.map((x) => ({ id: x.id, name: x.name, description: x.description, group: x.group }))}
            onPick={loadSample}
            ready={!running}
            action="Load"
            hint={<span className="text-xs text-muted">or import your own LangSmith export in the setup</span>}
          />
        )}
      </div>
    </div>
  );
}
