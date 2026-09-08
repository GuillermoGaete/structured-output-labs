"use client";

import { useT } from "@/i18n/client";
import { formatMs } from "@/lib/tokens";
import type { ModuleUi } from "@/modules/types";
import type { LoopPhase, LoopSpeed } from "./useForwardLoop";

export function LoopTransport({ index, count, positions, phase, playing, canStep, lastMs, speed, onStep, onPlay, onReset, onSpeed, onEdit, effective, ui, compact = false }: { index: number; count: number; positions: number; phase: LoopPhase; playing: boolean; canStep: boolean; lastMs: number | null; speed: LoopSpeed; onStep: () => void; onPlay: () => void; onReset: () => void; onSpeed: (s: LoopSpeed) => void; onEdit?: () => void; effective: "live" | "recorded"; ui: ModuleUi; compact?: boolean }) {
  const t = useT();
  const locale = "en";
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm" data-hotkeys="local">
      <span className="mono text-xs text-ink-2">
        {ui.step} {index} · {positions} {ui.positions}
      </span>
      <button type="button" className="btn btn-primary text-xs" onClick={onStep} disabled={!canStep || playing}>
        {ui.stepButton} ⏎
      </button>
      <button type="button" className="btn text-xs" onClick={onPlay} disabled={phase === "error" || (!canStep && !playing)}>
        {playing ? ui.pause : ui.auto} ␣
      </button>
      {!compact && (
        <span className="inline-flex overflow-hidden rounded-full border border-rule-2 text-xs" role="group" aria-label={ui.speed}>
          {(["slow", "real", "fast"] as LoopSpeed[]).map((s) => (
            <button key={s} type="button" className={`px-2.5 py-1 font-semibold ${s === speed ? "bg-accent text-accent-ink" : "hover:bg-raised"}`} aria-pressed={s === speed} onClick={() => onSpeed(s)}>
              {ui[`speed_${s}`]}
            </button>
          ))}
        </span>
      )}
      <button type="button" className="btn text-xs" onClick={onReset} disabled={count <= 1 && index === 0}>
        {ui.reset}
      </button>
      {onEdit && !compact && (
        <button type="button" className="btn text-xs" onClick={onEdit}>
          {ui.editPrompt}
        </button>
      )}
      <span className="mono ml-auto text-xs text-ink-2">
        <span className={`mr-1 inline-block h-2 w-2 rounded-full ${effective === "live" ? "bg-good" : "bg-chosen"}`} aria-hidden="true" />
        {effective === "live" ? t.dataSource.effectiveLive : t.dataSource.effectiveRecorded}
        {phase === "forward" ? ` · ${ui.running}` : lastMs !== null ? ` · ${ui.onePass} ${formatMs(lastMs, locale)}` : ""}
        {phase === "done" ? ` · ${ui.stopped}` : ""}
      </span>
    </div>
  );
}
