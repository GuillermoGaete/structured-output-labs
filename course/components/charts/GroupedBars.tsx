"use client";

/** One horizontal bar per group (a mode), value at the tip, all on one scale. Single series: no legend. */
export function GroupedBars({ rows, format, title, note, color = "var(--series-model)", locale = "en" }: { rows: { label: string; value: number; color?: string; hint?: string }[]; format: (v: number, locale: string) => string; title: string; note?: string; color?: string; locale?: string }) {
  const rowH = 26;
  const labelW = 120;
  const width = 420;
  const barMax = width - labelW - 90;
  const max = Math.max(...rows.map((r) => r.value), 1e-9);
  const height = rows.length * rowH + 6;
  return (
    <figure className="flex min-w-0 flex-col gap-1">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">{title}</span>
        {note && <span className="text-xs text-muted">{note}</span>}
      </figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={title}>
        {rows.map((r, i) => {
          const y = i * rowH + 3;
          const w = Math.max((r.value / max) * barMax, r.value > 0 ? 2 : 0);
          return (
            <g key={r.label}>
              <title>{r.hint ?? `${r.label}: ${format(r.value, locale)}`}</title>
              <text x={labelW - 8} y={y + 15} textAnchor="end" fontSize={12} fontFamily="var(--font-sans)" fill="var(--ink-1)">
                {r.label}
              </text>
              <rect x={labelW} y={y + 5} width={w} height={rowH - 11} rx={3} fill={r.color ?? color} />
              <text x={labelW + w + 6} y={y + 15} fontSize={11.5} fontFamily="var(--font-mono)" fill="var(--ink-2)">
                {format(r.value, locale)}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
