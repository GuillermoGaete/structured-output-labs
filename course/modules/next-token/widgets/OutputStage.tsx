"use client";

import Link from "next/link";
import { CutoffInputs } from "@/components/shared/CutoffInputs";
import { SoftmaxBars } from "@/components/shared/SoftmaxBars";
import { TemperatureSlider } from "@/components/shared/TemperatureSlider";
import { useHref, useLocale } from "@/i18n/client";
import { pastelFor, visibleToken } from "@/lib/tokens";
import type { FinalStage, SampledToken } from "@/lib/types";
import type { ModuleUi } from "@/modules/types";

export interface SamplerControls {
  temperature: number;
  topK: number;
  topP: number;
  onChange: (patch: { temperature?: number; topK?: number; topP?: number }) => void;
}

/** The magnifier on the last centimetre: h → the same table → logits → softmax(T) → the sampled token. */
export function OutputStage({ final, sampled, position, controls, rows, ui, recordedPath, dimmed, compact = false }: { final: FinalStage; sampled: SampledToken | null; position: number; controls: SamplerControls; rows: number; ui: ModuleUi; recordedPath?: boolean; dimmed?: boolean; compact?: boolean }) {
  const locale = useLocale();
  const href = useHref();
  return (
    <div className={`grid gap-4 md:grid-cols-[72px_1fr_180px] ${dimmed ? "opacity-50" : ""}`} style={{ transition: "opacity 0.2s" }}>
      <div className="flex flex-col gap-1 text-[11px] text-ink-2">
        <span className="mono font-semibold text-ink">h</span>
        <div className="mono flex flex-col gap-px text-[10px]">
          {final.h_preview.slice(0, compact ? 6 : 12).map((v, i) => (
            <span key={i} className="rounded-sm px-1" style={{ background: "var(--sf-raised)" }}>
              {v.toFixed(2)}
            </span>
          ))}
          <span className="text-muted">⋮</span>
        </div>
        <span className="mono">‖h‖ {final.h_norm.toFixed(0)}</span>
        {!compact && <span className="text-muted">{ui.hCaption}</span>}
      </div>
      <SoftmaxBars
        top={final.top}
        tail={final.tail}
        temperature={controls.temperature}
        topK={controls.topK}
        topP={controls.topP}
        chosen={sampled?.token_id ?? null}
        rows={rows}
        labels={{ logits: ui.logitsPanel, probabilities: ui.probsPanel, everythingElse: ui.everythingElse, tokens: ui.tokens, entropy: ui.entropy, choices: ui.choices, greedyNote: ui.greedyNote, cutNote: ui.cutNote }}
        locale={locale}
        arrowSlot={
          <div className="flex w-52 flex-col gap-2">
            <span className="mono text-sm text-ink-2">softmax(z / T) →</span>
            <TemperatureSlider value={controls.temperature} onChange={(v) => controls.onChange({ temperature: v })} label={ui.temperature} greedyLabel={ui.greedy} locale={locale} />
            {!compact && <CutoffInputs topK={controls.topK} topP={controls.topP} onChange={(p) => controls.onChange(p)} labels={{ topK: ui.topK, topP: ui.topP, off: ui.off }} locale={locale} />}
          </div>
        }
      />
      <div className="flex flex-col items-center gap-2 text-center text-xs text-ink-2">
        <span className="font-semibold uppercase tracking-wide text-muted">{ui.sampledTitle}</span>
        <span className="mono rounded-lg px-3 py-1.5 text-[22px]" style={{ background: sampled ? pastelFor(position) : "var(--sf-raised)", color: "#000", outline: "3px solid var(--series-chosen)", outlineOffset: 2 }}>
          {sampled ? visibleToken(sampled.text) : "…"}
        </span>
        {sampled && (
          <span className="mono">
            {sampled.method === "greedy" ? `greedy · argmax` : `sampled · u = ${sampled.u?.toFixed(3) ?? "?"} · T = ${controls.temperature.toFixed(2)}`}
          </span>
        )}
        {sampled && <span>{ui.pOfSampled} {(sampled.p * 100).toFixed(1)} %{sampled.method === "sampled" ? ` → ${(sampled.p_after * 100).toFixed(1)} %` : ""}</span>}
        {recordedPath && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent-strong">{ui.recordedPath}</span>}
        <Link href={href("/temperature/lab")} className="text-accent-strong underline">
          {ui.howTheDie}
        </Link>
      </div>
    </div>
  );
}
