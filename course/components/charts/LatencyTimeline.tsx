"use client";

/** Milliseconds per step over the step index: the slow first token and the mask's cost, per mode. */
export function LatencyTimeline({ series, title, note, locale = "en" }: { series: { label: string; color: string; values: number[] }[]; title: string; note?: string; locale?: string }) {
  const width = 480;
  const height = 150;
  const left = 44;
  const bottom = 22;
  const n = Math.max(...series.map((s) => s.values.length), 2);
  const max = Math.max(...series.flatMap((s) => s.values), 1);
  const x = (i: number) => left + (i / (n - 1)) * (width - left - 10);
  const y = (v: number) => height - bottom - (v / max) * (height - bottom - 12);
  const ticks = [0, max / 2, max];
  return (
    <figure className="flex min-w-0 flex-col gap-1">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">{title}</span>
        {note && <span className="text-xs text-muted">{note}</span>}
      </figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={title}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={width - 10} y1={y(t)} y2={y(t)} stroke="var(--rule-1)" strokeWidth={1} />
            <text x={left - 6} y={y(t) + 4} textAnchor="end" fontSize={10} fontFamily="var(--font-mono)" fill="var(--ink-3)">
              {Math.round(t).toLocaleString(locale)}
            </text>
          </g>
        ))}
        {series.map((s) => (
          <g key={s.label}>
            <path d={s.values.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(v)}`).join(" ")} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {s.values.length > 0 && <circle cx={x(s.values.length - 1)} cy={y(s.values[s.values.length - 1])} r={4} fill={s.color} stroke="var(--sf-panel)" strokeWidth={2} />}
          </g>
        ))}
        <text x={width - 10} y={height - 6} textAnchor="end" fontSize={10} fontFamily="var(--font-mono)" fill="var(--ink-3)">
          step →
        </text>
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
        {series.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </figure>
  );
}
