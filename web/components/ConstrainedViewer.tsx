"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useBackend } from "@/components/BackendProvider";
import { AutomatonSection } from "@/components/shell/AutomatonSection";
import { Menu } from "@/components/shell/Menu";
import { OutputStrip } from "@/components/shell/OutputStrip";
import { ParserSection } from "@/components/shell/ParserSection";
import type { StatProps } from "@/components/shell/Stat";
import { StepInspector } from "@/components/shell/StepInspector";
import { StepPanel } from "@/components/StepPanel";
import { compileSchema } from "@/lib/api";
import { composePrompt } from "@/lib/engines";
import { branchFrom, rerun } from "@/lib/runner";
import { runStore, useBatch, useBatchOrder, useLocalBusy, useTrace } from "@/lib/runStore";
import type { ConstrainedRun } from "@/lib/runTypes";
import { formatInt, formatPct, visibleToken } from "@/lib/tokens";
import type { CompilePayload, Trace } from "@/lib/types";
import type { ViewState } from "@/lib/viewState";

const STOP_LABEL: Record<string, string> = { eos: "EOS", max_new_tokens: "token limit", stopped: "early" };

// The regex outlines_core emits for a recursive schema keeps a trailing comma
// where the recursion was cut off, so the automaton accepts invalid JSON.
const REGEX_BUG = /,\[ \]\?\\\}/;

// One compile per (schema, mode, model): drilling into an old run draws its own automaton.
const compiled = new Map<string, Promise<CompilePayload | null>>();
function useCompiled(base: string, run: ConstrainedRun): CompilePayload | null {
  const key = `${base}|${JSON.stringify({ schema: run.request.schema, mode: run.request.mode, model: run.request.model })}`;
  const [payload, setPayload] = useState<CompilePayload | null>(null);
  useEffect(() => {
    let live = true;
    if (!compiled.has(key)) compiled.set(key, compileSchema(base, run.request.schema, run.request.mode, run.request.model).catch(() => null));
    compiled.get(key)!.then((p) => {
      if (live) setPayload(p);
    });
    return () => {
      live = false;
    };
  }, [key, base, run.request.schema, run.request.mode, run.request.model]);
  return payload;
}

interface Props {
  run: ConstrainedRun;
  view: ViewState;
  onView: (patch: Partial<ViewState>) => void;
  /** The setup's temperature, offered for a resample. */
  setupTemperature: number;
}

/** Everything the result column shows for one constrained run. Mounted with `key={run.id}` so the scrub position is per run. */
export function ConstrainedViewer({ run, view, onView, setupTemperature }: Props) {
  const backend = useBackend();
  const batch = useBatch(run.batchId);
  const trace = useTrace(run.id) as Trace | null;
  const order = useBatchOrder();
  const busy = useLocalBusy();
  const compiledPayload = useCompiled(backend.url, run);

  // While following, the index is the newest step; a hand-picked step ends that until the last step is picked again.
  const [picked, setPicked] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [follow, setFollow] = useState(true);
  const streaming = run.status === "running";
  const steps = useMemo(() => trace?.steps ?? [], [trace]);
  const n = steps.length;
  const index = follow ? Math.max(n - 1, 0) : Math.min(picked, Math.max(n - 1, 0));

  const onIndex = useCallback(
    (i: number) => {
      setPicked(i);
      setFollow(streaming && i >= n - 1);
    },
    [streaming, n],
  );

  const step = steps[index];
  const mode = trace?.meta?.mode ?? compiledPayload?.mode ?? (run.request.mode === "cfg" ? "cfg" : run.request.mode === "none" ? "none" : "fsm");
  const unmasked = mode === "none";
  const automaton = compiledPayload?.token_dfa ?? null;
  const regexBug = !!trace?.meta?.recursive && trace.meta.mode === "fsm" && REGEX_BUG.test(trace.meta.regex ?? "");
  const rawToGraphId = useMemo(() => {
    const map = new Map<number, number>();
    automaton?.nodes.forEach((node) => {
      if (node.raw !== undefined) map.set(node.raw, node.id);
    });
    return map;
  }, [automaton]);
  const graphIdOf = useCallback((raw: number | null) => (raw === null ? null : (rawToGraphId.get(raw) ?? null)), [rawToGraphId]);
  const currentGraphState = step ? graphIdOf(step.fsm_state) : null;
  const visitedGraphStates = useMemo(() => {
    const ids: number[] = [];
    for (const s of steps.slice(0, index + 1)) {
      const id = graphIdOf(s.fsm_state);
      if (id !== null) ids.push(id);
    }
    return ids;
  }, [steps, index, graphIdOf]);
  const stateLabel = !step ? "—" : currentGraphState !== null ? `${currentGraphState}` : step.fsm_state === null ? "—" : `${step.fsm_state}*`;
  const stateHint =
    step && step.fsm_state !== null
      ? `outlines_core Guide.get_state() = ${step.fsm_state}, read before this token${currentGraphState === null ? " · not among the drawn states" : ""}`
      : undefined;

  // The summary is folded per step, so these hold with or without the trace.
  const s = run.summary;
  const count = s.tokenIds.length;
  const overridden = s.overridden.filter(Boolean).length;
  const kept = count ? s.vocabKept.reduce((a, b) => a + b, 0) / count : 0;
  const removed = count ? s.massRemoved.reduce((a, b) => a + b, 0) / count : 0;
  const tiles: StatProps[] = [];
  if (s.finished) {
    tiles.push({ label: "Result", value: s.valid ? "valid" : "invalid", tone: s.valid ? "good" : "critical", hint: s.validationError ?? "Parsed as JSON and validated against the schema" });
    tiles.push({ label: "Stopped", value: STOP_LABEL[s.stoppedBy ?? ""] ?? s.stoppedBy ?? "—" });
    if (s.elapsedS !== null) tiles.push({ label: "Time", value: `${s.elapsedS.toFixed(1)} s` });
  } else if (run.status === "cancelled" && count > 0) {
    tiles.push({ label: "Stopped", value: "early" });
  }
  if (count > 0) {
    tiles.push({ label: "Steps", value: formatInt(count) });
    if (!unmasked) {
      tiles.push({ label: "Overridden", value: `${overridden} / ${count}`, hint: "Steps where the mask forbade the model's own argmax" });
      tiles.push({ label: "Vocabulary kept", value: formatPct(kept, Math.max(view.digits, 2)), hint: "Mean share of the vocabulary the mask allowed, over the run" });
      tiles.push({ label: "Probability removed", value: formatPct(removed, view.digits), hint: "Mean probability mass the mask removed per step" });
    }
  }
  const meta = trace?.meta
    ? `${trace.meta.model_id} · ${unmasked ? "no mask · schema in the prompt" : `${trace.meta.backend} (${trace.meta.mode.toUpperCase()})`} · prompt ${formatInt(trace.meta.prompt_token_count)} tokens · vocab ${formatInt(trace.meta.vocab_size)}${trace.meta.regex ? ` · regex ${formatInt(trace.meta.regex.length)} chars` : ""}${run.request.seed !== null ? ` · seed ${run.request.seed}` : ""}${run.request.temperature > 0 && run.request.top_k_sampling > 0 ? ` · top-k ${run.request.top_k_sampling}` : ""}`
    : s.modelId
      ? `${s.modelId} · ${s.backend ?? ""} (${(s.mode ?? "").toUpperCase()})${run.request.seed !== null ? ` · seed ${run.request.seed}` : ""}`
      : undefined;

  const replayed = steps.filter((st) => st.replayed).length;
  const parentOrdinal = run.branch ? order.length - order.indexOf(runStore.getState().runs[run.branch.parentRunId]?.batchId ?? "") : null;
  const forcedText = run.branch?.forcedTokenId !== null && run.branch && steps[run.branch.atStep] ? visibleToken(steps[run.branch.atStep].text, steps[run.branch.atStep].token) : null;

  const local = true; // constrained runs are always local
  const canBranch = local && !busy && !!batch && count > 0;
  const label = batch?.label.replace(/ · ×\d+$/, "").replace(/^(↳ )+/, "") ?? "run";
  const branchAt = Math.min(index, count);
  const doBranch = (opts: { forcedTokenId?: number; unmasked?: boolean; seed?: number | null; temperature?: number; n?: number }) => {
    if (!batch) return;
    branchFrom(run, batch, branchAt, { ...opts, backendUrl: backend.url, label: `↳ ${label}` });
  };
  const branchMenu = (
    <Menu
      label="↳ Branch from here ▾"
      title={canBranch ? `Start a new run from the first ${branchAt} tokens of this one` : busy ? "A run is in flight" : "Nothing to branch from yet"}
      disabled={!canBranch}
      items={[
        {
          label: "Resample · new seed",
          hint: run.request.temperature === 0 && setupTemperature === 0 ? "Greedy: this will repeat the same tokens unless a token is forced" : "Keep the prefix, sample the rest again",
          onSelect: () => doBranch({}),
        },
        ...[5, 10, 20].map((n) => ({
          label: `Resample ×${n} from here`,
          hint:
            run.request.temperature === 0
              ? "Greedy: the branches would all be identical; run at a temperature above 0 first"
              : `${n} branches from this prefix, a fresh seed each; the batch shows which token came next and how often`,
          onSelect: () => doBranch({ n }),
        })),
        ...(run.request.seed !== null ? [{ label: "Resample · same seed", hint: "The same seed from here: identical unless the temperature changes", onSelect: () => doBranch({ seed: run.request.seed }) }] : []),
        ...(setupTemperature !== run.request.temperature
          ? [{ label: `Resample · T ${setupTemperature.toFixed(2)}`, hint: "The temperature the setup has now", onSelect: () => doBranch({ temperature: setupTemperature }) }]
          : []),
        ...(unmasked ? [] : [{ label: "Continue without the mask", hint: "Go on in the logprobs mode: what the model would write from here on its own", onSelect: () => doBranch({ unmasked: true }) }]),
      ]}
    />
  );

  // The prompt the model read. Exact when the trace is in memory; composed from the request otherwise
  // (the chat template only exists on the server). Open for prompt only, where the prompt is the mechanism.
  const exactPrompt = trace?.meta?.prompt_text;
  const sentPrompt = exactPrompt ?? (unmasked ? composePrompt(run.request.prompt, run.request.schema_hint, run.request.schema) : null);
  const promptBlock = sentPrompt ? (
    <details className="panel px-4 py-2" open={unmasked}>
      <summary
        className="cursor-pointer eyebrow select-none"
        title={exactPrompt ? "The exact text that was tokenized: system prompt, chat template and, in prompt only, the instructions with the schema" : "Composed from the request; the chat template is added on the server"}
      >
        {exactPrompt ? `Prompt as sent · ${formatInt(trace?.meta?.prompt_token_count ?? 0)} tokens` : "Prompt · composed from the request"}
        {unmasked ? " · no mask: the instructions and the schema are in the text" : ""}
      </summary>
      <pre className="mono text-[12px] leading-snug whitespace-pre-wrap break-words max-h-72 overflow-auto mt-2">{sentPrompt}</pre>
    </details>
  ) : null;

  if (!trace) {
    return (
      <>
        {promptBlock}
        <OutputStrip
          tokens={[]}
          limit={0}
          activeIndex={-1}
          onPick={() => undefined}
          tiles={tiles}
          meta={meta}
          chips={<span className="chip">no trace kept</span>}
        />
        <section className="panel p-4 flex flex-col gap-3">
          <pre className="font-mono text-[13px] whitespace-pre-wrap break-all">{s.text ?? ""}</pre>
          <div className="flex items-center gap-2 flex-wrap">
            <button className="btn py-1 px-2.5 text-[13px]" type="button" disabled={busy || !batch} onClick={() => batch && rerun(run, batch, "same", backend.url)} title="The same seed reproduces this run token by token">
              Re-run · same seed to inspect
            </button>
            <span className="text-xs text-muted">Only the last {20} runs keep their steps in memory; a reload keeps summaries only.</span>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      {promptBlock}
      <OutputStrip
        tokens={steps}
        limit={step ? index + 1 : 0}
        activeIndex={index}
        onPick={onIndex}
        dimUntil={replayed}
        tiles={tiles}
        meta={meta}
        error={run.status === "error" ? (run.error ?? trace.error) : s.finished && !s.valid ? s.validationError : null}
        chips={
          <>
            {run.branch && (
              <span className="chip" title="This run replayed its parent's first tokens through the same mask, then went its own way">
                ↳ from #{parentOrdinal} at step {run.branch.atStep}
                {forcedText ? ` · forced ${forcedText}` : ""}
              </span>
            )}
            {unmasked && (
              <span className="chip chip-warning" title="No mask touched the logits; the instructions and the schema were appended to the prompt. “Prompt as sent”, above, is the text the model read.">
                prompt only · no mask
              </span>
            )}
            {mode === "fsm" && compiledPayload?.fsm_ignored?.length ? (
              <span
                className="chip chip-warning"
                title={`outlines_core has no regex for these bounds, so the mask lets any number through and only the final validation catches it: ${compiledPayload.fsm_ignored.join(", ")}. Small integer ranges are compiled as enums; for the rest, use llguidance.`}
              >
                outlines_core cannot enforce {compiledPayload.fsm_ignored.length} bound{compiledPayload.fsm_ignored.length > 1 ? "s" : ""} · use llguidance
              </span>
            ) : null}
            {regexBug && (
              <span
                className="chip chip-warning"
                title="outlines_core unrolls a recursive schema three levels and leaves a trailing comma where the recursion was cut off. The mask followed the regex; the regex was wrong."
              >
                outlines_core regex bug at depth 3 · use llguidance
              </span>
            )}
            {run.status === "cancelled" && <span className="chip chip-warning">stopped early</span>}
          </>
        }
      />

      <StepInspector count={n} index={index} playing={playing} streaming={streaming} onIndex={onIndex} onPlay={setPlaying} view={view} onView={onView} actions={branchMenu}>
        {step ? (
          <StepPanel
            step={step}
            mode={mode}
            stateLabel={stateLabel}
            stateHint={stateHint}
            digits={view.digits}
            logBars={view.logBars}
            rows={view.rows}
            onContinue={canBranch ? (tokenId) => doBranch({ forcedTokenId: tokenId }) : undefined}
            sampling={{ temperature: run.request.temperature, topK: run.request.top_k_sampling }}
          />
        ) : (
          <p className="text-sm text-muted">{streaming ? "Waiting for the first token…" : run.status === "error" ? "The run failed before its first token." : "No steps."}</p>
        )}
      </StepInspector>

      {unmasked ? null : mode !== "fsm" ? (
        <ParserSection step={step} steps={steps} index={index} onIndex={onIndex} compiled={compiledPayload} schema={run.request.schema} backend={trace?.meta?.backend ?? compiledPayload?.backend ?? (mode === "xgr" ? "xgrammar" : "llguidance")} />
      ) : (
        <AutomatonSection
          compiled={compiledPayload}
          steps={steps}
          index={index}
          graphIdOf={graphIdOf}
          currentGraphState={currentGraphState}
          visited={visitedGraphStates}
          onIndex={onIndex}
          stateLabel={stateLabel}
          stateHint={stateHint}
        />
      )}
    </>
  );
}
