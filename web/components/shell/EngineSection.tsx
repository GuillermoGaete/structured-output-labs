"use client";

import { ENGINES } from "@/lib/engines";
import type { LabState } from "@/lib/labState";
import type { ModeRequest } from "@/lib/types";

const ORDER: ModeRequest[] = ["auto", "fsm", "cfg", "xgr", "none"];

interface Props {
  state: LabState;
  update: (patch: Partial<LabState>) => void;
  disabled?: boolean;
  /** Engines the backend reports; a mode it cannot run is not offered. */
  engines?: string[];
}

/** The constraint engine and the sampling knobs of the next run. */
export function EngineSection({ state, update, disabled = false, engines }: Props) {
  const offered = ORDER.filter((m) => m === "auto" || m === "none" || !engines || engines.includes(m));
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <span className="eyebrow" title="The library that turns the schema into a mask; Auto picks one by schema, Prompt only uses none">
          Engine
        </span>
        <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Engine">
          {offered.map((m) => {
            const info = ENGINES[m];
            const on = state.mode === m;
            return (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={on}
                className={`engine-tile ${m === "none" ? "col-span-2" : ""}`}
                onClick={() => update({ mode: m })}
                title={info.hint}
                disabled={disabled}
              >
                <span className={`text-[13px] leading-tight ${m === "auto" || m === "none" ? "" : "mono"}`}>{info.label}</span>
                <span className="text-[11px] leading-tight text-muted">{info.technique}</span>
              </button>
            );
          })}
        </div>
      </div>
      <label className="flex flex-col gap-1">
        <span className="eyebrow">Max new tokens · {state.maxNewTokens}</span>
        <input type="range" min={8} max={200} step={4} value={state.maxNewTokens} onChange={(e) => update({ maxNewTokens: Number(e.target.value) })} disabled={disabled} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="eyebrow">Temperature · {state.temperature === 0 ? "greedy" : state.temperature.toFixed(2)}</span>
        <input type="range" min={0} max={1.5} step={0.05} value={state.temperature} onChange={(e) => update({ temperature: Number(e.target.value) })} disabled={disabled} />
      </label>
      <div className="flex items-center gap-4 flex-wrap text-xs">
        <label className="flex items-center gap-2">
          <span className="text-muted">Seed</span>
          <input
            type="number"
            className="input py-0.5 px-1.5 text-xs tabular-nums"
            style={{ width: "6rem" }}
            value={state.seed ?? ""}
            placeholder="random"
            onChange={(e) => update({ seed: e.target.value === "" ? null : Number(e.target.value) })}
            disabled={disabled}
            title="Empty: a fresh seed per run. A number makes a sampled run reproducible; greedy ignores it."
          />
        </label>
        <label className="flex items-center gap-2">
          <span className="text-muted">Top-k</span>
          <input
            type="number"
            min={0}
            max={100}
            className="input input-num py-0.5 px-1.5 text-xs tabular-nums"
            value={state.topKSampling}
            onChange={(e) => update({ topKSampling: Math.min(Math.max(Number(e.target.value) || 0, 0), 100) })}
            disabled={disabled}
            title="Sample only among the k most likely allowed tokens; 0 is off"
          />
          {state.topKSampling === 0 && <span className="text-muted">off</span>}
        </label>
      </div>
    </>
  );
}
