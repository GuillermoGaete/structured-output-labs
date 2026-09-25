"use client";

import type { ReplayState } from "@/lib/replayState";

type Knobs = Pick<ReplayState, "lpTemperature" | "lpTopK" | "lpTopP" | "lpMaxTokens" | "lpSeed" | "lpReportK">;

/** The logprobs engine's knobs, as the Logprobs page has them. The three sliders also redraw a recorded run's bars. */
export function ReplayKnobs({ state: s, update, disabled = false }: { state: Knobs; update: (patch: Partial<Knobs>) => void; disabled?: boolean }) {
  return (
    <>
      <label className="flex flex-col gap-1">
        <span className="eyebrow">Temperature · {s.lpTemperature === 0 ? "greedy" : s.lpTemperature.toFixed(2)}</span>
        <input type="range" min={0} max={2} step={0.05} value={s.lpTemperature} onChange={(e) => update({ lpTemperature: Number(e.target.value) })} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="eyebrow">Top-k · {s.lpTopK === 0 ? "off" : s.lpTopK}</span>
        <input type="range" min={0} max={50} step={1} value={s.lpTopK} onChange={(e) => update({ lpTopK: Number(e.target.value) })} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="eyebrow">Top-p · {s.lpTopP >= 1 ? "off" : s.lpTopP.toFixed(2)}</span>
        <input type="range" min={0.01} max={1} step={0.01} value={s.lpTopP} onChange={(e) => update({ lpTopP: Number(e.target.value) })} />
      </label>
      <div className="flex flex-col gap-2 text-xs">
        <label className="flex items-center gap-2">
          <span className="w-28 text-muted">Max tokens</span>
          <input
            type="number"
            min={1}
            max={256}
            className="input input-num py-0.5 px-1.5 text-xs tabular-nums"
            value={s.lpMaxTokens}
            onChange={(e) => update({ lpMaxTokens: Math.min(Math.max(Number(e.target.value) || 1, 1), 256) })}
            disabled={disabled}
          />
        </label>
        <label className="flex items-center gap-2">
          <span className="w-28 text-muted">Seed</span>
          <input
            type="number"
            className="input py-0.5 px-1.5 text-xs tabular-nums"
            style={{ width: "6rem" }}
            value={s.lpSeed ?? ""}
            placeholder="random"
            onChange={(e) => update({ lpSeed: e.target.value === "" ? null : Number(e.target.value) })}
            disabled={disabled}
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
            value={s.lpReportK}
            onChange={(e) => update({ lpReportK: Math.min(Math.max(Number(e.target.value) || 1, 1), 50) })}
            disabled={disabled}
            title="Rows the backend reports per step; the tail histogram covers the rest"
          />
        </label>
      </div>
    </>
  );
}
