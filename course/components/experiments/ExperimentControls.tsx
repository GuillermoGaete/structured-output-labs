"use client";

import { TemperatureSlider } from "@/components/shared/TemperatureSlider";
import { useLocale } from "@/i18n/client";
import type { ExperimentParams, ExperimentPresetId } from "@/lib/experiments/base";
import type { ModuleUi } from "@/modules/types";

export function ExperimentControls({ params, onChange, ui, children }: { params: ExperimentParams; onChange: (patch: Partial<ExperimentParams>) => void; ui: ModuleUi; children?: React.ReactNode }) {
  const locale = useLocale();
  return (
    <section className="panel flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {(["person", "invoice"] as ExperimentPresetId[]).map((id) => (
          <button key={id} type="button" className={`btn text-xs ${params.preset === id ? "btn-primary" : ""}`} onClick={() => onChange({ preset: id })}>
            {ui[`preset_${id}`]}
          </button>
        ))}
        {children}
      </div>
      <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto_auto]">
        <TemperatureSlider value={params.temperature} onChange={(v) => onChange({ temperature: v })} label={ui.temperature} greedyLabel="greedy" locale={locale} max={1.5} />
        <label className="flex flex-col gap-1 text-sm">
          <span className="flex items-baseline justify-between">
            <span className="font-semibold">{ui.topP}</span>
            <span className="mono text-xs text-ink-2">{params.topP.toFixed(2)}</span>
          </span>
          <input type="range" min={0.1} max={1} step={0.05} value={params.topP} onChange={(e) => onChange({ topP: Number(e.target.value) })} aria-label={ui.topP} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          {ui.maxTokens} <input type="number" className="input w-20 text-xs" min={8} max={200} value={params.maxTokens} onChange={(e) => onChange({ maxTokens: Number(e.target.value) || 120 })} />
        </label>
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={params.schemaInPrompt} onChange={(e) => onChange({ schemaInPrompt: e.target.checked })} /> {ui.schemaInPrompt}
        </label>
      </div>
    </section>
  );
}
