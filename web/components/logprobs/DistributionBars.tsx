"use client";

import { useState } from "react";
import { softmaxView, type SoftmaxOptions } from "@/lib/math";
import { formatInt, formatPct, visibleToken } from "@/lib/tokens";
import type { StreamStep } from "@/lib/types";

/** Hover help. The lab shows no explanatory prose, so the reasoning lives in tooltips. */
export const ENTROPY_HINT =
  "Entropy: how undecided the model is at this step. 0 bits means one option and no doubt. Every extra bit doubles the number of equally likely options, so 1 bit is a coin flip, 3 bits is about 8 options, 10 bits is about 1000.";
export const CHOICES_HINT =
  "2 to the power of the entropy: the number of equally likely options this distribution is worth. A sharp distribution with one clear favourite lands near 1; a flat one lands near the size of the vocabulary.";

const ROW = 26;
const LABEL_W = 132;
const WIDTH = 620;
const BAR_MAX = WIDTH - LABEL_W - 96;

/**
 * The distribution behind one token, drawn under the current view parameters.
 *
 * The bars are recomputed in the browser from the raw logits the backend sent,
 * so moving a slider redraws them at once without generating anything again.
 * Entries the cutoffs remove are struck through and drop to zero width, which is
 * what top-k and top-p actually do to the sampler's options.
 */
export function DistributionBars({
  step,
  view,
  digits = 1,
  rows,
}: {
  step: StreamStep;
  view: SoftmaxOptions;
  digits?: number;
  /** Rows to reserve so the panel keeps one height across steps. */
  rows: number;
}) {
  const [help, setHelp] = useState(false);
  const projected = softmaxView(step.top, step.tail, view);
  const height = (rows + 1) * ROW + 8;
  const max = Math.max(...projected.p, projected.tailMass, 1e-9);
  const widthFor = (p: number) => (p <= 0 ? 0 : Math.max((p / max) * BAR_MAX, 2));

  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-sm font-medium">What the sampler sees</span>
        <span className="flex flex-wrap items-center gap-2">
          <span className="chip" title={ENTROPY_HINT}>
            {projected.entropyBits.toFixed(2)} bits
          </span>
          <span className="chip" title={CHOICES_HINT}>
            ≈ {projected.effectiveChoices.toFixed(1)} choices
          </span>
          {projected.greedy && <span className="chip chip-warning">greedy · one option</span>}
          <button
            type="button"
            className={`chip ${help ? "border-accent" : ""}`}
            onClick={() => setHelp((v) => !v)}
            aria-expanded={help}
            aria-label="What entropy means"
            title="What these two numbers mean"
          >
            ?
          </button>
        </span>
      </figcaption>

      {help && (
        <p className="panel p-3 text-xs leading-relaxed text-ink-2">
          <b>Entropy</b> measures how undecided the model is here. Zero bits is one option and no doubt. Every extra bit
          doubles the number of equally likely options, so 1 bit is a coin flip, 3 bits about 8 options, 10 bits about a
          thousand. <b>Choices</b> is that same number read out directly: two raised to the entropy. Raising the
          temperature flattens the bars and pushes both numbers up; top-k and top-p cut options away and pull them down.
        </p>
      )}

      <svg viewBox={`0 0 ${WIDTH} ${height}`} className="h-auto w-full" role="img" aria-label="Next-token distribution">
        {step.top.map((entry, i) => {
          const p = projected.p[i];
          const cut = !projected.allowed[i];
          const chosen = entry.token_id === step.token_id;
          const y = i * ROW + 4;
          return (
            <g key={i}>
              <text
                x={LABEL_W - 8}
                y={y + 16}
                textAnchor="end"
                fontSize={13}
                fontFamily="var(--font-mono)"
                fill={cut ? "var(--muted)" : "var(--ink)"}
                fontWeight={chosen ? 600 : 400}
                style={cut ? { textDecoration: "line-through" } : undefined}
              >
                {visibleToken(entry.text, entry.token).slice(0, 14)}
              </text>
              <rect
                x={LABEL_W}
                y={y + 5}
                width={widthFor(p)}
                height={ROW - 12}
                rx={2}
                fill={cut ? "var(--series-masked)" : chosen ? "var(--series-forced)" : "var(--series-original)"}
                style={{ transition: "width 160ms ease-out" }}
              />
              <text x={LABEL_W + widthFor(p) + 8} y={y + 16} fontSize={12} fontFamily="var(--font-mono)" fill="var(--ink-2)">
                {cut ? "✕" : formatPct(p, digits)}
                {chosen ? " ←" : ""}
              </text>
            </g>
          );
        })}

        {/* The rest of the vocabulary, from the tail histogram. Without this row
            the bars would silently claim the top-k is the whole distribution. */}
        <line x1={LABEL_W} x2={WIDTH - 10} y1={rows * ROW + 4} y2={rows * ROW + 4} stroke="var(--line)" strokeWidth={1} />
        <g>
          <text
            x={LABEL_W - 8}
            y={rows * ROW + 22}
            textAnchor="end"
            fontSize={12}
            fontFamily="var(--font-mono)"
            fill="var(--muted)"
            style={projected.tailAllowed ? undefined : { textDecoration: "line-through" }}
          >
            {formatInt(step.tail.n)} more
          </text>
          <rect
            x={LABEL_W}
            y={rows * ROW + 11}
            width={widthFor(projected.tailMass)}
            height={ROW - 12}
            rx={2}
            fill="var(--series-masked)"
            style={{ transition: "width 160ms ease-out" }}
          />
          <text x={LABEL_W + widthFor(projected.tailMass) + 8} y={rows * ROW + 22} fontSize={12} fontFamily="var(--font-mono)" fill="var(--muted)">
            {projected.tailAllowed ? formatPct(projected.tailMass, digits) : "✕"}
          </text>
        </g>
      </svg>
    </figure>
  );
}
