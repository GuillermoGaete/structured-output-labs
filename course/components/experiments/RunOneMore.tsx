"use client";

import type { RunnerState } from "@/lib/experiments/store";
import type { ModuleUi } from "@/modules/types";

export function RunOneMore({ runner, onRun, onReveal, canReveal, n = 1, ui }: { runner: Pick<RunnerState, "canRunLive" | "whyNot" | "running" | "progress">; onRun: () => void; onReveal?: () => void; canReveal?: boolean; n?: number; ui: ModuleUi }) {
  const reason = runner.whyNot ? ui[`whyNot_${runner.whyNot}`] : "";
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <button type="button" className="btn btn-primary text-xs" onClick={onRun} disabled={!runner.canRunLive} title={reason}>
        {n === 1 ? ui.runOne : ui.runN.replace("{n}", String(n))}
      </button>
      {!runner.canRunLive && <span className="text-xs text-muted">{reason}</span>}
      {runner.whyNot === "recorded" && onReveal && (
        <button type="button" className="btn text-xs" onClick={onReveal} disabled={!canReveal}>
          {ui.revealNext}
        </button>
      )}
      {runner.progress && (
        <span className="mono text-xs text-ink-2">
          {runner.progress.done} / {runner.progress.total}
        </span>
      )}
    </div>
  );
}
