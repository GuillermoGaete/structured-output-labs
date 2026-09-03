import type { Step, TopEntry } from "@/lib/types";
import { formatInt, formatPct, visibleToken } from "@/lib/tokens";

function Bars({ entries, color, chosen, title, note }: { entries: TopEntry[]; color: string; chosen: number; title: string; note: string }) {
  const rowH = 22;
  const labelW = 112;
  const width = 360;
  const barMax = width - labelW - 56;
  const height = Math.max(entries.length, 1) * rowH + 6;
  const max = Math.max(...entries.map((e) => e.p), 1e-9);
  return (
    <figure className="flex flex-col gap-1 min-w-0">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium inline-flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
          {title}
        </span>
        <span className="text-xs text-muted">{note}</span>
      </figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" role="img" aria-label={title}>
        {entries.map((e, i) => {
          const y = i * rowH + 3;
          const w = Math.max((e.p / max) * barMax, e.p > 0 ? 2 : 0);
          const masked = !e.allowed;
          const isChosen = e.token_id === chosen;
          return (
            <g key={`${e.token_id}-${i}`}>
              <text
                x={labelW - 8}
                y={y + 14}
                textAnchor="end"
                fontSize={11.5}
                fontFamily="var(--font-mono)"
                fill={masked ? "var(--muted)" : "var(--ink)"}
                fontWeight={isChosen ? 600 : 400}
                style={masked ? { textDecoration: "line-through" } : undefined}
              >
                {visibleToken(e.text).slice(0, 12)}
              </text>
              <rect x={labelW} y={y + 4} width={w} height={rowH - 10} rx={2} fill={masked ? "var(--series-masked)" : color} opacity={masked ? 0.8 : 1} />
              {masked && (
                <line x1={labelW} x2={labelW + w} y1={y + 4 + (rowH - 10) / 2} y2={y + 4 + (rowH - 10) / 2} stroke="var(--surface)" strokeWidth={1.5} strokeDasharray="3 3" />
              )}
              <text x={labelW + w + 6} y={y + 14} fontSize={11} fontFamily="var(--font-mono)" fill="var(--ink-2)">
                {formatPct(e.p)}
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

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-[120px]" title={hint}>
      <span className="eyebrow">{label}</span>
      <span className="font-mono text-[15px] tabular-nums">{value}</span>
    </div>
  );
}

export function StepPanel({ step, mode }: { step: Step; mode: "fsm" | "cfg" }) {
  const original = step.top_original;
  const forced = step.top_forced;
  const share = step.n_allowed / step.vocab_size;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-x-8 gap-y-3">
        <Metric label="Step" value={`${step.i}`} />
        <Metric label="Chosen token" value={visibleToken(step.text) || "⟨eos⟩"} hint={`token id ${step.token_id} · raw ${JSON.stringify(step.token)}`} />
        <Metric
          label="Allowed tokens"
          value={`${formatInt(step.n_allowed)} / ${formatInt(step.vocab_size)}`}
          hint="Vocabulary entries the automaton allows at this step (finite logits after the mask)"
        />
        <Metric label="Vocabulary kept" value={formatPct(share, 2)} />
        <Metric
          label="Probability removed"
          value={formatPct(step.mass_removed)}
          hint="Probability mass the model had put on tokens the mask forbids"
        />
        <Metric
          label={mode === "fsm" ? "FSM state" : "Stack depth"}
          value={mode === "fsm" ? (step.fsm_state === null ? "—" : `${step.fsm_state}`) : `${step.stack_depth}`}
          hint={mode === "fsm" ? "outlines_core Guide.get_state() before this token" : "Open { and [ brackets in the text so far"}
        />
      </div>

      {step.was_overridden ? (
        <p className="text-sm rounded-md px-3 py-2 bg-accent-soft text-ink">
          <strong>Overridden.</strong> The model&apos;s top choice was{" "}
          <code className="px-1">{visibleToken(original[0]?.text ?? "")}</code> ({formatPct(original[0]?.p ?? 0)}); the mask forbade it, so{" "}
          <code className="px-1">{visibleToken(step.text) || "⟨eos⟩"}</code> was sampled instead
          {step.p_original > 0 ? ` (it had ${formatPct(step.p_original, 2)} before masking, ${formatPct(step.p_forced)} after)` : ""}.
        </p>
      ) : (
        <p className="text-sm text-ink-2">
          The model&apos;s own top choice was allowed. Before masking it had {formatPct(step.p_original)}; after renormalisation {formatPct(step.p_forced)}.
        </p>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <Bars entries={original} color="var(--series-original)" chosen={step.token_id} title="Original intent" note="raw logits → softmax" />
        <Bars entries={forced} color="var(--series-forced)" chosen={step.token_id} title="Forced" note="after −∞ mask → softmax" />
      </div>
      <p className="text-xs text-muted">Struck-through grey bars are tokens the automaton forbids: their logit became −∞ and their probability 0. The remaining mass is renormalised on the right.</p>
    </div>
  );
}
