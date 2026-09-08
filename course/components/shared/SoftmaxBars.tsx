"use client";

import { useId, type ReactNode } from "react";
import { softmaxView, type LogitLike, type SoftmaxOptions, type TailLike } from "@/lib/math";
import { formatInt, formatPct, visibleToken } from "@/lib/tokens";

export interface SoftmaxBarsLabels {
  logits: string;
  probabilities: string;
  everythingElse: string;
  tokens: string;
  entropy: string;
  choices: string;
  greedyNote: string;
  cutNote: string;
}

export interface SoftmaxBarsProps extends SoftmaxOptions {
  top: LogitLike[];
  tail: TailLike | null;
  /** token_id marked with an arrow */
  chosen?: number | null;
  rows?: number;
  digits?: number;
  log?: boolean;
  layout?: "twin" | "probabilities";
  labels: SoftmaxBarsLabels;
  locale?: string;
  /** What sits between the two panels: the softmax arrow with its controls. */
  arrowSlot?: ReactNode;
  onHoverRow?: (tokenId: number | null) => void;
}

const LOG_FLOOR = 1e-8;
const PANEL_W = 400;
const ROW_H = 24;
const LABEL_W = 118;
const VALUE_W = 82;
const BAR_MAX = PANEL_W - LABEL_W - VALUE_W;

/**
 * Logits on the left (never move: the model did not change), probabilities on the
 * right (what sampling sees, recomputed in the browser from T and the cutoffs).
 * Cut entries are hatched with −∞ on the left and ✕ on the right; the tail is
 * always present as "everything else" with its count.
 */
export function SoftmaxBars({ top, tail, temperature, topK, topP, chosen, rows = 10, digits = 1, log = false, layout = "twin", labels, locale = "en", arrowSlot, onHoverRow }: SoftmaxBarsProps) {
  const hatchId = useId().replace(/:/g, "");
  const view = softmaxView(top, tail, { temperature, topK, topP });
  const shown = Math.min(rows, top.length);
  const height = (shown + 1) * ROW_H + 8;
  const logitsShown = top.slice(0, shown).map((e) => e.logit);
  const minL = Math.min(...logitsShown, tail ? Math.min(...tail.logit_mean.filter((_, b) => tail.counts[b] > 0)) : Infinity);
  const maxL = Math.max(...logitsShown);
  const logitW = (l: number) => Math.max(((l - minL) / Math.max(maxL - minL, 1e-9)) * BAR_MAX, 2);
  const maxP = Math.max(...view.p.slice(0, shown), view.tailMass, 1e-9);
  const probW = (p: number) => {
    if (p <= 0) return 0;
    if (!log) return Math.max((p / maxP) * BAR_MAX, 2);
    const lo = Math.log10(LOG_FLOOR);
    const hi = Math.log10(maxP);
    return Math.max(((Math.log10(Math.max(p, LOG_FLOOR)) - lo) / (hi - lo)) * BAR_MAX, 2);
  };
  const cutRows = view.allowed.slice(0, shown).some((a) => !a);

  const rowLabel = (e: LogitLike) => visibleToken(e.text).slice(0, 12);
  const y = (i: number) => i * ROW_H + 3;

  const logitsPanel = (
    <figure className="flex min-w-0 flex-col gap-1">
      <figcaption className="flex items-baseline justify-between gap-2 text-sm font-semibold">
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "var(--series-model)" }} />
          {labels.logits}
        </span>
        <span className="mono text-xs font-normal text-muted">z</span>
      </figcaption>
      <svg viewBox={`0 0 ${PANEL_W} ${height}`} className="h-auto w-full" role="img" aria-label={labels.logits}>
        <defs>
          <pattern id={`hatch-${hatchId}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--series-masked)" strokeWidth="2" />
          </pattern>
        </defs>
        {top.slice(0, shown).map((e, i) => {
          const cut = !view.allowed[i];
          const isChosen = chosen !== null && chosen !== undefined && e.token_id === chosen;
          const w = logitW(e.logit);
          return (
            <g key={e.token_id} onMouseEnter={onHoverRow ? () => onHoverRow(e.token_id) : undefined} onMouseLeave={onHoverRow ? () => onHoverRow(null) : undefined}>
              <text x={LABEL_W - 8} y={y(i) + 15} textAnchor="end" fontSize={11.5} fontFamily="var(--font-mono)" fill={cut ? "var(--ink-3)" : "var(--ink-1)"} fontWeight={isChosen ? 600 : 400}>
                {rowLabel(e)}
              </text>
              <rect x={LABEL_W} y={y(i) + 5} width={cut ? Math.min(w, 60) : w} height={ROW_H - 12} rx={3} fill={cut ? `url(#hatch-${hatchId})` : "var(--series-model)"} opacity={cut ? 0.9 : 1} />
              <text x={LABEL_W + (cut ? Math.min(w, 60) : w) + 6} y={y(i) + 15} fontSize={11} fontFamily="var(--font-mono)" fill={cut ? "var(--status-critical)" : "var(--ink-2)"}>
                {cut ? "−∞" : e.logit.toLocaleString(locale, { maximumFractionDigits: 1 })}
              </text>
            </g>
          );
        })}
        {tail && (
          <text x={LABEL_W - 8} y={y(shown) + 15} textAnchor="end" fontSize={11} fontFamily="var(--font-mono)" fill="var(--ink-3)">
            {labels.everythingElse}
          </text>
        )}
        {tail && (
          <text x={LABEL_W} y={y(shown) + 15} fontSize={11} fontFamily="var(--font-mono)" fill="var(--ink-3)">
            {formatInt(tail.n, locale)} {labels.tokens}
          </text>
        )}
      </svg>
    </figure>
  );

  const probsPanel = (
    <figure className="flex min-w-0 flex-col gap-1">
      <figcaption className="flex items-baseline justify-between gap-2 text-sm font-semibold">
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "var(--series-chosen)" }} />
          {labels.probabilities}
        </span>
        <span className="mono text-xs font-normal text-muted">
          {labels.entropy} {view.entropyBits.toLocaleString(locale, { maximumFractionDigits: 2 })} bits ≈ {view.effectiveChoices.toLocaleString(locale, { maximumFractionDigits: 1 })} {labels.choices}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${PANEL_W} ${height}`} className="h-auto w-full" role="img" aria-label={labels.probabilities}>
        {top.slice(0, shown).map((e, i) => {
          const cut = !view.allowed[i];
          const p = view.p[i];
          const isChosen = chosen !== null && chosen !== undefined && e.token_id === chosen;
          const w = probW(p);
          return (
            <g key={e.token_id} onMouseEnter={onHoverRow ? () => onHoverRow(e.token_id) : undefined} onMouseLeave={onHoverRow ? () => onHoverRow(null) : undefined}>
              <text x={LABEL_W - 8} y={y(i) + 15} textAnchor="end" fontSize={11.5} fontFamily="var(--font-mono)" fill={cut ? "var(--ink-3)" : "var(--ink-1)"} fontWeight={isChosen ? 600 : 400} style={cut ? { textDecoration: "line-through" } : undefined}>
                {rowLabel(e)}
              </text>
              {!cut && <rect x={LABEL_W} y={y(i) + 5} width={w} height={ROW_H - 12} rx={3} fill="var(--series-chosen)" />}
              <text x={LABEL_W + (cut ? 0 : w) + 6} y={y(i) + 15} fontSize={11} fontFamily="var(--font-mono)" fill="var(--ink-2)">
                {cut ? "✕" : formatPct(p, digits, locale)}
                {isChosen ? " ←" : ""}
              </text>
            </g>
          );
        })}
        {tail && (
          <g>
            <text x={LABEL_W - 8} y={y(shown) + 15} textAnchor="end" fontSize={11} fontFamily="var(--font-mono)" fill="var(--ink-3)">
              {labels.everythingElse}
            </text>
            {view.tailAllowed && <rect x={LABEL_W} y={y(shown) + 5} width={probW(view.tailMass)} height={ROW_H - 12} rx={3} fill="var(--series-masked)" opacity={0.7} />}
            <text x={LABEL_W + (view.tailAllowed ? probW(view.tailMass) : 0) + 6} y={y(shown) + 15} fontSize={11} fontFamily="var(--font-mono)" fill="var(--ink-3)">
              {view.tailAllowed ? formatPct(view.tailMass, Math.max(digits, 2), locale) : "✕"} · {formatInt(tail.n, locale)} {labels.tokens}
            </text>
          </g>
        )}
      </svg>
      {view.greedy ? <p className="text-xs text-ink-2">{labels.greedyNote}</p> : cutRows ? <p className="text-xs text-ink-2">{labels.cutNote}</p> : null}
    </figure>
  );

  if (layout === "probabilities") return probsPanel;
  return (
    <div className="grid items-start gap-4 md:grid-cols-[1fr_auto_1fr]">
      {logitsPanel}
      <div className="flex flex-col items-center gap-2 self-center px-2 text-center">{arrowSlot ?? <span className="mono text-sm text-ink-2">softmax(z / T) →</span>}</div>
      {probsPanel}
    </div>
  );
}
