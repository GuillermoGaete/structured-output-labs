"use client";

import type { SoftmaxView } from "@/lib/math";
import { pastelFor, visibleToken } from "@/lib/tokens";
import type { FinalStage, SampledToken } from "@/lib/types";
import type { ModuleUi } from "@/modules/types";

/** The last third of figure 01 as a thumbnail: h → the same table → z → softmax(T) → p → sample. */
export function OutputStageMini({ final, view, sampled, temperature, position, ui, dimmed }: { final: FinalStage; view: SoftmaxView; sampled: SampledToken | null; temperature: number; position: number; ui: ModuleUi; dimmed?: boolean }) {
  const top = final.top.slice(0, 5);
  const maxZ = Math.max(...top.map((e) => e.logit));
  const minZ = Math.min(...top.map((e) => e.logit));
  const maxP = Math.max(...view.p.slice(0, 5), 1e-9);
  const chip = sampled ? visibleToken(sampled.text) : "…";
  return (
    <div className={`flex h-full flex-col gap-2 ${dimmed ? "opacity-50" : ""}`} style={{ transition: "opacity 0.2s" }}>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">4 · {ui.outputTitle}</div>
      <div className="flex flex-1 items-center gap-2 text-[10px] text-ink-2">
        <div className="flex flex-col items-center gap-1">
          <span className="mono">h</span>
          <div className="flex flex-col gap-px">
            {final.h_preview.slice(0, 8).map((v, i) => (
              <span key={i} className="block h-1.5 rounded-sm" style={{ width: 8 + Math.min(Math.abs(v), 3) * 6, background: "var(--series-third)" }} />
            ))}
          </div>
        </div>
        <span>→</span>
        <div className="flex flex-col items-center gap-1 rounded-md border border-rule px-2 py-1 text-center">
          <span className="mono">W_U = E</span>
          <span className="rounded-full bg-accent-soft px-1.5 text-[9px] font-semibold text-accent-strong">{ui.sameTable}</span>
        </div>
        <span>→</span>
        <div className="flex flex-col gap-px">
          <span className="mono">z</span>
          {top.map((e) => (
            <span key={e.token_id} className="block h-1.5 rounded-sm" style={{ width: 10 + ((e.logit - minZ) / Math.max(maxZ - minZ, 1e-6)) * 40, background: "var(--series-model)" }} />
          ))}
        </div>
        <div className="flex flex-col items-center">
          <span>→</span>
          <span className="mono whitespace-nowrap">softmax(T={temperature.toFixed(1)})</span>
        </div>
        <div className="flex flex-col gap-px">
          <span className="mono">p</span>
          {top.map((e, i) => (
            <span key={e.token_id} className="block h-1.5 rounded-sm" style={{ width: 4 + (view.p[i] / maxP) * 46, background: view.allowed[i] ? "var(--series-chosen)" : "var(--series-masked)" }} />
          ))}
        </div>
        <span>→</span>
        <div className="flex flex-col items-center gap-1">
          <span>{view.greedy ? ui.argmax : ui.sample}</span>
          <span className="mono rounded-md px-2 py-0.5 text-[13px]" style={{ background: sampled ? pastelFor(position) : "var(--sf-raised)", color: "#000", outline: "3px solid var(--series-chosen)", outlineOffset: 1 }}>
            {chip}
          </span>
        </div>
      </div>
    </div>
  );
}
