"use client";

import { cleanBpeGlyphs, pastelFor } from "@/lib/tokens";
import type { ForwardResponse, ForwardToken } from "@/lib/types";
import type { ModuleUi } from "@/modules/types";
import { headMean } from "./useForwardLoop";

const MAX_CHIPS = 48;

/** Attention of the last position at one block: arcs back to the tokens it reads, thickest first. */
export function BlockView({ response, tokens, layer, onLayer, ui }: { response: ForwardResponse; tokens: ForwardToken[]; layer: number; onLayer: (layer: number) => void; ui: ModuleUi }) {
  const attention = response.attention;
  if (!attention || attention.mode !== "last") return <p className="text-sm text-muted">{ui.noAttention}</p>;
  const li = Math.max(0, attention.layers.indexOf(layer));
  const weights = headMean(attention.weights[li] as number[][]);
  const n = tokens.length;
  const from = Math.max(0, n - MAX_CHIPS);
  const shown = tokens.slice(from);
  const templateMass = tokens.reduce((acc, t, i) => (t.is_template ? acc + (weights[i] ?? 0) : acc), 0);
  const cellW = Math.max(18, Math.min(52, 1100 / shown.length));
  const width = shown.length * cellW;
  const height = 150;
  const baseline = 118;
  const strongest = [...shown.map((t, k) => ({ pos: t.position, w: weights[t.position] ?? 0, k }))].sort((a, b) => b.w - a.w).slice(0, 3);
  const cur = shown.length - 1;
  return (
    <div className="flex flex-col gap-3" data-hotkeys="local">
      <div className="flex flex-wrap items-center gap-3 text-xs text-ink-2">
        <span className="font-semibold uppercase tracking-wide text-muted">{ui.block} {layer + 1} / {response.n_layers}</span>
        <label className="flex min-w-[220px] flex-1 items-center gap-2">
          <span>{ui.layer}</span>
          <input type="range" min={0} max={response.n_layers - 1} value={layer} onChange={(e) => onLayer(Number(e.target.value))} aria-label={ui.layer} />
        </label>
        <span className="mono">{ui.headMean}</span>
        <span className="mono">⟨{ui.template}⟩ Σ {(templateMass * 100).toFixed(0)} %</span>
      </div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={ui.attentionAlt}>
          <rect x={cur * cellW + cellW} y={0} width={Math.max(cellW, 40)} height={height} fill="var(--sf-raised)" opacity={0.6} />
          <text x={cur * cellW + cellW + 6} y={14} fontSize={10} fill="var(--ink-3)" fontFamily="var(--font-sans)">
            {ui.onlyBack}
          </text>
          {shown.map((t, k) => {
            const w = weights[t.position] ?? 0;
            if (k === cur || w < 0.01) return null;
            const x1 = cur * cellW + cellW / 2;
            const x2 = k * cellW + cellW / 2;
            const lift = Math.min(100, 20 + (x1 - x2) * 0.12);
            return <path key={t.position} d={`M ${x1} ${baseline - 10} Q ${(x1 + x2) / 2} ${baseline - 10 - lift} ${x2} ${baseline - 10}`} fill="none" stroke="var(--series-third)" strokeWidth={1 + w * 10} opacity={0.25 + w * 0.75} />;
          })}
          {shown.map((t, k) => {
            const w = weights[t.position] ?? 0;
            const label = t.text === "" ? "⟨eos⟩" : cleanBpeGlyphs(t.text).replace(/\n/g, "⏎").replace(/ /g, "␠");
            const strong = strongest.find((s) => s.pos === t.position && k !== cur);
            return (
              <g key={t.position}>
                <rect x={k * cellW + 1} y={baseline - 6} width={cellW - 2} height={22} rx={4} fill={t.is_template ? "var(--sf-raised)" : pastelFor(t.position)} opacity={t.is_template ? 0.8 : 0.35 + Math.min(w * 3, 0.65)} stroke={k === cur ? "var(--series-chosen)" : "none"} strokeWidth={2} />
                <text x={k * cellW + cellW / 2} y={baseline + 9} textAnchor="middle" fontSize={Math.min(10, cellW / 2.6)} fontFamily="var(--font-mono)" fill={t.is_template ? "var(--ink-3)" : "#000"}>
                  {label.slice(0, Math.max(2, Math.floor(cellW / 6)))}
                </text>
                {strong && (
                  <text x={k * cellW + cellW / 2} y={baseline - 12} textAnchor="middle" fontSize={10} fontFamily="var(--font-mono)" fill="var(--ink-1)">
                    {(w * 100).toFixed(0)} %
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <p className="text-xs text-muted">{ui.attentionCaption}</p>
    </div>
  );
}
