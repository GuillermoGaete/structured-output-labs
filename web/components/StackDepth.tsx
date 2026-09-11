import type { Step } from "@/lib/types";

/** The depth outlines_core unrolls a recursive schema to before it cuts the regex off. */
const FSM_UNROLL_LIMIT = 3;

/** Nesting depth over time: the "stack" a pushdown automaton carries, with the line a regex cannot cross. */
export function StackDepth({ steps, current }: { steps: Step[]; current: number }) {
  const width = 640;
  const height = 96;
  const pad = { l: 28, r: 8, t: 10, b: 20 };
  const n = Math.max(steps.length, 1);
  const maxDepth = Math.max(FSM_UNROLL_LIMIT, ...steps.map((s) => s.stack_depth));
  const x = (i: number) => pad.l + (i / Math.max(n - 1, 1)) * (width - pad.l - pad.r);
  const y = (d: number) => height - pad.b - (d / maxDepth) * (height - pad.t - pad.b);
  const path = steps
    .map((s, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(s.stack_depth).toFixed(1)}`)
    .join(" ");
  const ticks = Array.from({ length: maxDepth + 1 }, (_, d) => d);
  return (
    <figure className="flex flex-col gap-1">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" role="img" aria-label="Nesting depth per generated token">
        {ticks.map((d) => (
          <g key={d}>
            <line x1={pad.l} x2={width - pad.r} y1={y(d)} y2={y(d)} stroke="var(--line)" strokeWidth={1} />
            <text x={pad.l - 6} y={y(d) + 3.5} fontSize={10} textAnchor="end" fill="var(--muted)" fontFamily="var(--font-mono)">
              {d}
            </text>
          </g>
        ))}
        <line x1={pad.l} x2={width - pad.r} y1={y(FSM_UNROLL_LIMIT)} y2={y(FSM_UNROLL_LIMIT)} stroke="var(--warning)" strokeWidth={1.5} strokeDasharray="4 3" />
        <text x={width - pad.r} y={y(FSM_UNROLL_LIMIT) - 4} fontSize={10} textAnchor="end" fill="var(--ink-2)" fontFamily="var(--font-mono)">
          FSM unroll limit
        </text>
        {steps.length > 0 && <path d={path} fill="none" stroke="var(--series-forced)" strokeWidth={2} strokeLinejoin="round" />}
        {steps.length > 0 && current >= 0 && current < steps.length && (
          <circle cx={x(current)} cy={y(steps[current].stack_depth)} r={4.5} fill="var(--series-forced)" stroke="var(--surface)" strokeWidth={2} />
        )}
        <text x={pad.l} y={height - 6} fontSize={10} fill="var(--muted)" fontFamily="var(--font-mono)">
          token 0
        </text>
        <text x={width - pad.r} y={height - 6} fontSize={10} fill="var(--muted)" textAnchor="end" fontFamily="var(--font-mono)">
          token {Math.max(n - 1, 0)}
        </text>
      </svg>
      <figcaption className="text-xs text-muted" title="Unclosed { and [ at each step. A regex cannot count these; a grammar can. The dashed line is where outlines_core stops unrolling a recursive schema.">
        nesting depth
      </figcaption>
    </figure>
  );
}
