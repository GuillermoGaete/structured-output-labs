"use client";

import type { TopEntry } from "@/lib/types";
import { formatPct, visibleToken } from "@/lib/tokens";

const LOG_FLOOR = 1e-8;

/** The Time Machine's twin chart: a top-K list with the masked entries struck through. */
export function ProbabilityBars({ entries, color, chosen, title, note, digits = 1, log = false, locale = "en", maxEntries }: { entries: TopEntry[]; color: string; chosen: number | null; title: string; note?: string; digits?: number; log?: boolean; locale?: string; maxEntries?: number }) {
  const shown = maxEntries ? entries.slice(0, maxEntries) : entries;
  const rowH = 22;
  const labelW = 112;
  const width = 360;
  const barMax = width - labelW - 60;
  const height = Math.max(shown.length, 1) * rowH + 6;
  const max = Math.max(...shown.map((e) => e.p), 1e-9);
  const widthFor = (p: number) => {
    if (p <= 0) return 0;
    if (!log) return Math.max((p / max) * barMax, 2);
    const lo = Math.log10(LOG_FLOOR);
    const hi = Math.log10(max);
    return Math.max(((Math.log10(Math.max(p, LOG_FLOOR)) - lo) / (hi - lo)) * barMax, 2);
  };
  return (
    <figure className="flex min-w-0 flex-col gap-1">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-sm font-semibold">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
          {title}
        </span>
        {note && <span className="text-xs text-muted">{note}</span>}
      </figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={title}>
        {shown.map((e, i) => {
          const y = i * rowH + 3;
          const w = widthFor(e.p);
          const masked = !e.allowed;
          const isChosen = e.token_id === chosen;
          return (
            <g key={`${e.token_id}-${i}`}>
              <text x={labelW - 8} y={y + 14} textAnchor="end" fontSize={11.5} fontFamily="var(--font-mono)" fill={masked ? "var(--ink-3)" : "var(--ink-1)"} fontWeight={isChosen ? 600 : 400} style={masked ? { textDecoration: "line-through" } : undefined}>
                {visibleToken(e.text).slice(0, 12)}
              </text>
              <rect x={labelW} y={y + 4} width={w} height={rowH - 10} rx={3} fill={masked ? "var(--series-masked)" : color} opacity={masked ? 0.8 : 1} />
              {masked && <line x1={labelW} x2={labelW + w} y1={y + 4 + (rowH - 10) / 2} y2={y + 4 + (rowH - 10) / 2} stroke="var(--sf-panel)" strokeWidth={1.5} strokeDasharray="3 3" />}
              <text x={labelW + w + 6} y={y + 14} fontSize={11} fontFamily="var(--font-mono)" fill="var(--ink-2)">
                {formatPct(e.p, digits, locale)}
                {masked ? " ✕" : ""}
                {isChosen ? " ←" : ""}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
