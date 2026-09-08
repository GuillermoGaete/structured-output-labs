"use client";

import type { Stat } from "@/lib/experiments/metrics";

/** Per group: every value as a dot, the median as a bar, min→max as a thin line, p90 as a tick. */
export function BoxPlot({ rows, format, title, note, locale = "en" }: { rows: { label: string; stat: Stat; color?: string }[]; format: (v: number, locale: string) => string; title: string; note?: string; locale?: string }) {
  const rowH = 34;
  const labelW = 120;
  const width = 480;
  const plotW = width - labelW - 80;
  const max = Math.max(...rows.map((r) => r.stat.max), 1e-9);
  const x = (v: number) => labelW + (v / max) * plotW;
  const height = rows.length * rowH + 8;
  return (
    <figure className="flex min-w-0 flex-col gap-1">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">{title}</span>
        {note && <span className="text-xs text-muted">{note}</span>}
      </figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={title}>
        {rows.map((r, i) => {
          const cy = i * rowH + rowH / 2 + 2;
          const color = r.color ?? "var(--series-model)";
          if (!r.stat.n) {
            return (
              <text key={r.label} x={labelW - 8} y={cy + 4} textAnchor="end" fontSize={12} fill="var(--ink-3)">
                {r.label}
              </text>
            );
          }
          return (
            <g key={r.label}>
              <text x={labelW - 8} y={cy + 4} textAnchor="end" fontSize={12} fontFamily="var(--font-sans)" fill="var(--ink-1)">
                {r.label}
              </text>
              <line x1={x(r.stat.min)} x2={x(r.stat.max)} y1={cy} y2={cy} stroke="var(--rule-2)" strokeWidth={1.5} />
              {r.stat.values.map((v, k) => (
                <circle key={k} cx={x(v)} cy={cy} r={3.5} fill={color} opacity={0.45} stroke="var(--sf-panel)" strokeWidth={1} />
              ))}
              <rect x={x(r.stat.median) - 2} y={cy - 9} width={4} height={18} rx={1} fill={color} />
              <line x1={x(r.stat.p90)} x2={x(r.stat.p90)} y1={cy - 6} y2={cy + 6} stroke="var(--ink-2)" strokeWidth={1.5} />
              <text x={x(r.stat.max) + 8} y={cy + 4} fontSize={11} fontFamily="var(--font-mono)" fill="var(--ink-2)">
                {format(r.stat.median, locale)}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
