"use client";

import { useCallback, useMemo, useState } from "react";
import { useBackend } from "@/components/BackendProvider";
import { DistributionBars, ENTROPY_HINT } from "@/components/logprobs/DistributionBars";
import { Menu } from "@/components/shell/Menu";
import { OutputStrip } from "@/components/shell/OutputStrip";
import { Stats, type StatProps } from "@/components/shell/Stat";
import { StepInspector } from "@/components/shell/StepInspector";
import { readKey } from "@/lib/providers";
import { branchFrom, rerun } from "@/lib/runner";
import { runStore, useBatch, useBatchOrder, useLocalBusy, useTrace } from "@/lib/runStore";
import type { LogprobsRun } from "@/lib/runTypes";
import { formatInt, formatPct, visibleToken } from "@/lib/tokens";
import type { StreamTrace } from "@/lib/types";
import type { ViewState } from "@/lib/viewState";

const STOP_LABEL: Record<string, string> = { eos: "EOS", max_new_tokens: "token limit", stopped: "early" };

interface Props {
  run: LogprobsRun;
  view: ViewState;
  onView: (patch: Partial<ViewState>) => void;
  /** The sampling knobs as the setup has them now: they redraw the bars live. */
  sampling: { temperature: number; topK: number; topP: number };
}

/** Everything the result column shows for one logprobs run. Mounted with `key={run.id}`. */
export function LogprobsViewer({ run, view, onView, sampling }: Props) {
  const backend = useBackend();
  const batch = useBatch(run.batchId);
  const trace = useTrace(run.id) as StreamTrace | null;
  const order = useBatchOrder();
  const busy = useLocalBusy();

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
  const viewOpts = useMemo(() => ({ temperature: sampling.temperature, topK: sampling.topK, topP: sampling.topP }), [sampling]);
  const ran = trace?.meta?.sampling ?? run.request;
  const ranT = "temperature" in ran ? ran.temperature : 0;
  const ranK = "top_k" in ran ? ran.top_k : 0;
  const ranP = "top_p" in ran ? ran.top_p : 1;
  const drifted = ranT !== sampling.temperature || ranK !== sampling.topK || ranP !== sampling.topP;
  const rows = trace?.meta?.top_k_report ?? run.request.top_k_report;
  const remote = run.provider !== null;

  const s = run.summary;
  const count = s.tokenIds.length;
  const tiles: StatProps[] = [];
  if (s.finished) {
    tiles.push({ label: "Stopped", value: STOP_LABEL[s.stopReason ?? ""] ?? s.stopReason ?? "—" });
    tiles.push({ label: "Tokens", value: formatInt(count) });
    if (s.elapsedS !== null) tiles.push({ label: "Time", value: `${s.elapsedS.toFixed(1)} s` });
    if (s.tokensPerS !== null) tiles.push({ label: "Speed", value: `${s.tokensPerS} tok/s` });
  } else if (count > 0) {
    if (run.status === "cancelled") tiles.push({ label: "Stopped", value: "early" });
    tiles.push({ label: "Tokens", value: formatInt(count) });
  }
  if (count > 0) {
    const meanEntropy = s.entropyRawBits.reduce((a, b) => a + b, 0) / count;
    tiles.push({ label: "Mean entropy", value: `${meanEntropy.toFixed(2)} bits`, hint: "Average of the raw entropy over the run" });
  }
  const meta = s.modelId
    ? `${s.modelId}${s.provider ? ` · hosted (${s.provider})` : ""}${s.promptTokenCount !== null ? ` · prompt ${formatInt(s.promptTokenCount)} tokens` : ""}${trace?.meta ? ` · vocab ${formatInt(trace.meta.vocab_size)}` : ""}${run.request.use_chat_template ? " · chat template" : ""}${run.request.seed !== null ? ` · seed ${run.request.seed}` : ""}`
    : undefined;

  const stepTiles: StatProps[] = step
    ? [
        { label: "Token", value: visibleToken(step.text, step.token), hint: `id ${step.token_id}` },
        { label: "Rank", value: step.chosen_rank === null ? "in the tail" : `#${step.chosen_rank + 1}`, hint: "Where the sampled token sat in the model's own ranking" },
        { label: "Its probability", value: formatPct(step.chosen_p, 2), hint: "At temperature 1, over the whole vocabulary" },
        { label: "Entropy", value: `${step.entropy_bits.toFixed(2)} bits`, hint: `${ENTROPY_HINT} This one is the raw distribution, before any parameter; the bars below react to the sliders.` },
        { label: "Forward", value: `${step.forward_ms.toFixed(0)} ms` },
      ]
    : [];

  const replayed = steps.filter((st) => st.replayed).length;
  const parentOrdinal = run.branch ? order.length - order.indexOf(runStore.getState().runs[run.branch.parentRunId]?.batchId ?? "") : null;
  const canBranch = !remote && !busy && !!batch && count > 0;
  const label = batch?.label.replace(/ · ×\d+$/, "").replace(/^(↳ )+/, "") ?? "run";
  const branchAt = Math.min(index, count);
  const doBranch = (opts: { forcedTokenId?: number; seed?: number | null; temperature?: number }) => {
    if (!batch) return;
    branchFrom(run, batch, branchAt, { ...opts, backendUrl: backend.url, label: `↳ ${label}` });
  };
  const branchMenu = remote ? (
    <Menu
      label="↻ Resample ▾"
      title="A hosted API cannot continue a reply from a token, but it can sample the whole run again"
      disabled={!batch}
      items={[
        {
          label: "Resample · whole run",
          hint: "The same prompt again at temperature 1; hosted APIs take no seed and cannot continue from a token",
          onSelect: () => batch && rerun(run, batch, "new", backend.url, run.provider ? readKey(run.provider) : undefined),
        },
      ]}
    />
  ) : (
    <Menu
      label="↳ Branch from here ▾"
      title={canBranch ? `Start a new run from the first ${branchAt} tokens of this one` : busy ? "A run is in flight" : "Nothing to branch from yet"}
      disabled={!canBranch}
      items={[
        { label: "Resample · new seed", hint: run.request.temperature === 0 ? "Greedy: identical unless a token is forced or the temperature changes" : "Keep the prefix, sample the rest again", onSelect: () => doBranch({}) },
        ...(run.request.seed !== null ? [{ label: "Resample · same seed", hint: "The same seed from here", onSelect: () => doBranch({ seed: run.request.seed }) }] : []),
        ...(sampling.temperature !== run.request.temperature
          ? [{ label: `Resample · T ${sampling.temperature.toFixed(2)}`, hint: "The temperature the setup has now", onSelect: () => doBranch({ temperature: sampling.temperature }) }]
          : []),
      ]}
    />
  );

  if (!trace) {
    return (
      <>
        <OutputStrip tokens={[]} limit={0} activeIndex={-1} onPick={() => undefined} tiles={tiles} meta={meta} chips={<span className="chip">no trace kept</span>} />
        <section className="panel p-4 flex flex-col gap-3">
          <pre className="font-mono text-[13px] whitespace-pre-wrap break-all">{s.text ?? ""}</pre>
          <div className="flex items-center gap-2 flex-wrap">
            <button className="btn py-1 px-2.5 text-[13px]" type="button" disabled={(busy && !remote) || !batch} onClick={() => batch && rerun(run, batch, "same", backend.url)} title="The same seed reproduces a local run token by token">
              Re-run · same seed to inspect
            </button>
            <span className="text-xs text-muted">Only the last 20 runs keep their steps in memory; a reload keeps summaries only.</span>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <OutputStrip
        tokens={steps}
        limit={step ? index + 1 : 0}
        activeIndex={index}
        onPick={onIndex}
        dimUntil={replayed}
        tiles={tiles}
        meta={meta}
        error={run.status === "error" ? (run.error ?? trace.error) : null}
        chips={
          <>
            {run.branch && (
              <span className="chip" title="This run replayed its parent's first tokens, then went its own way">
                ↳ from #{parentOrdinal} at step {run.branch.atStep}
                {run.branch.unmasked ? " · without the mask" : ""}
              </span>
            )}
            {run.status === "cancelled" && <span className="chip chip-warning">stopped early</span>}
          </>
        }
      />

      <StepInspector count={n} index={index} playing={playing} streaming={streaming} onIndex={onIndex} onPlay={setPlaying} view={view} onView={onView} viewFields={["digits"]} actions={branchMenu}>
        {step ? (
          <div className="flex flex-col gap-4">
            <Stats items={stepTiles} />
            {(drifted || remote) && (
              <div className="flex items-center gap-2 flex-wrap">
                {drifted && (
                  <span className="chip chip-warning" title="The bars show what these settings would give. Re-run to generate with them.">
                    showing T {sampling.temperature.toFixed(2)} · run used T {ranT.toFixed(2)}
                    {ranK ? ` · k ${ranK}` : ""}
                    {ranP < 1 ? ` · p ${ranP.toFixed(2)}` : ""}
                  </span>
                )}
                {remote && (
                  <span
                    className="chip chip-warning"
                    title="A provider reports only its top-k, so everything below it is one estimated bucket. The bars are exact at temperature 1 and approximate elsewhere. Its own sampling parameters are not applied: the request always asks for temperature 1 so these numbers stay raw."
                  >
                    hosted · tail estimated · asked at T 1
                  </span>
                )}
              </div>
            )}
            <DistributionBars step={step} view={viewOpts} rows={rows} digits={view.digits} onContinue={canBranch ? (tokenId) => doBranch({ forcedTokenId: tokenId }) : undefined} />
          </div>
        ) : (
          <p className="text-sm text-muted">{streaming ? "Waiting for the first token…" : run.status === "error" ? "The run failed before its first token." : "No steps."}</p>
        )}
      </StepInspector>
    </>
  );
}
