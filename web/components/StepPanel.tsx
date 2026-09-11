import type { Mode, Step, TopEntry } from "@/lib/types";
import { formatInt, formatPct, visibleToken } from "@/lib/tokens";
import { Stats } from "./shell/Stat";

const LOG_FLOOR = 1e-8; // probabilities below this share the shortest bar on the log scale

function Bars({
  entries,
  color,
  chosen,
  title,
  note,
  digits,
  log,
  rows,
  legend,
  onContinue,
  cutFrom,
}: {
  entries: TopEntry[];
  color: string;
  chosen: number;
  title: string;
  note: string;
  digits: number;
  log: boolean;
  /** Rows to reserve, so both charts keep one height while the mask shrinks the allowed list. */
  rows: number;
  /** Explain the struck-through rows; only the chart that can have them carries it. */
  legend?: boolean;
  /** Pressing an allowed row continues the run from here with that token. */
  onContinue?: (tokenId: number) => void;
  /** Top-k sampling: allowed rows past this rank could not be drawn, and are marked cut. */
  cutFrom?: number;
}) {
  const rowH = 22;
  const labelW = 112;
  const width = 360;
  const barMax = width - labelW - 56;
  const height = Math.max(rows, 1) * rowH + 6;
  const shown = entries.slice(0, rows);
  const max = Math.max(...shown.map((e) => e.p), 1e-9);
  const widthFor = (p: number) => {
    if (p <= 0) return 0;
    if (!log) return Math.max((p / max) * barMax, 2);
    // log scale from LOG_FLOOR up to the largest entry
    const lo = Math.log10(LOG_FLOOR);
    const hi = Math.log10(max);
    return Math.max(((Math.log10(Math.max(p, LOG_FLOOR)) - lo) / (hi - lo)) * barMax, 2);
  };
  return (
    <figure className="flex flex-col gap-1 min-w-0">
      <figcaption className="flex items-baseline justify-between gap-2 flex-wrap">
        <span className="text-sm font-medium inline-flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
          {title}
        </span>
        <span className="text-xs text-muted inline-flex items-center gap-2">
          {note}
          {legend && (
            <span className="inline-flex items-center gap-1" title="Grey, struck-through rows are tokens the automaton forbids: logit −∞, probability 0">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ background: "var(--series-masked)" }} aria-hidden="true" />
              masked
            </span>
          )}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" role="img" aria-label={title}>
        {shown.map((e, i) => {
          const y = i * rowH + 3;
          const w = widthFor(e.p);
          const masked = !e.allowed;
          // Rank among the allowed rows above this one: top-k counts allowed tokens only.
          const allowedRank = shown.slice(0, i + 1).filter((x) => x.allowed).length;
          const cut = !masked && cutFrom !== undefined && allowedRank > cutFrom;
          const isChosen = e.token_id === chosen;
          const pressable = !!onContinue && !masked;
          return (
            <g
              key={i}
              className={pressable ? "bar-row" : undefined}
              onClick={pressable ? () => onContinue(e.token_id) : undefined}
              tabIndex={pressable ? 0 : undefined}
              onKeyDown={pressable ? (ev) => ev.key === "Enter" && onContinue(e.token_id) : undefined}
              role={pressable ? "button" : undefined}
              aria-label={pressable ? `continue from here with ${visibleToken(e.text, e.token)}` : undefined}
            >
              {pressable ? <title>{cut ? `outside top-k ${cutFrom}: the sampler could not draw it; a branch can still force it` : "continue from here with this token"}</title> : cut ? <title>{`outside top-k ${cutFrom}: the sampler could not draw it`}</title> : null}
              {pressable && <rect x={0} y={y} width={width} height={rowH} fill="transparent" />}
              <text
                x={labelW - 8}
                y={y + 14}
                textAnchor="end"
                fontSize={11.5}
                fontFamily="var(--font-mono)"
                fill={masked || cut ? "var(--muted)" : "var(--ink)"}
                fontWeight={isChosen ? 600 : 400}
                style={masked ? { textDecoration: "line-through" } : undefined}
              >
                {visibleToken(e.text, e.token).slice(0, 12)}
              </text>
              <rect
                x={labelW}
                y={y + 4}
                width={w}
                height={rowH - 10}
                rx={2}
                fill={masked ? "var(--series-masked)" : color}
                opacity={masked ? 0.8 : cut ? 0.3 : 1}
                stroke={cut ? color : undefined}
                strokeDasharray={cut ? "3 2" : undefined}
                strokeOpacity={cut ? 0.7 : undefined}
                style={{ transition: "width 140ms ease-out" }}
              />
              <text x={labelW + w + 6} y={y + 14} fontSize={11} fontFamily="var(--font-mono)" fill={cut ? "var(--muted)" : "var(--ink-2)"}>
                {formatPct(e.p, digits)}
                {masked ? " ✕" : cut ? " · cut" : ""}
                {isChosen ? " ←" : ""}
              </text>
              {pressable && (
                <text className="go" x={width - 4} y={y + 14} fontSize={10} fontFamily="var(--font-mono)" textAnchor="end">
                  ↳ continue
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

interface Props {
  step: Step;
  /** Only "fsm" has an automaton state to show; the grammar engines show the stack depth. */
  mode: Mode;
  /** The automaton state in the graph's numbering (FSM mode). */
  stateLabel?: string;
  stateHint?: string;
  digits?: number;
  logBars?: boolean;
  rows?: number;
  /** Pressing an allowed row starts a branch that writes that token here. */
  onContinue?: (tokenId: number) => void;
  /** How the run drew its tokens. The bars show the distribution before sampling; top-k marks what it could not draw. */
  sampling?: { temperature: number; topK: number };
}

export function StepPanel({ step, mode, stateLabel = "—", stateHint, digits = 1, logBars = false, rows = 8, onContinue, sampling }: Props) {
  const original = step.top_original;
  const forced = step.top_forced;
  const share = step.n_allowed / step.vocab_size;
  const shown = Math.max(1, Math.min(rows, Math.max(original.length, forced.length)));
  // Greedy ignores top-k; with T > 0 the sampler kept only the k most likely allowed tokens.
  const topK = sampling && sampling.temperature > 0 && sampling.topK > 0 ? sampling.topK : undefined;
  const samplingChip =
    sampling && sampling.temperature > 0 ? (
      <span
        className="chip"
        title={
          topK
            ? `The bars are the distribution before sampling, at temperature 1. The sampler divided the logits by ${sampling.temperature.toFixed(2)} and kept only the ${topK} most likely allowed tokens: rows past ${topK} are marked cut and could not be drawn.`
            : `The bars are the distribution before sampling, at temperature 1. The sampler divided the logits by ${sampling.temperature.toFixed(2)} and drew from every allowed token.`
        }
      >
        sampling · T {sampling.temperature.toFixed(2)}
        {topK ? ` · top-k ${topK}` : " · top-k off"}
      </span>
    ) : null;
  if (mode === "none") {
    // No mask: one distribution, and the shape is only the prompt's request.
    return (
      <div className="flex flex-col gap-5">
        <Stats
          items={[
            { label: "Chosen token", value: visibleToken(step.text, step.token), hint: `token id ${step.token_id} · raw ${JSON.stringify(step.token)}` },
            { label: "Its probability", value: formatPct(step.p_original, Math.max(digits, 2)), hint: "Probability of the chosen token, nothing masked" },
            { label: "Rank", value: `#${Math.max(1, original.findIndex((e) => e.token_id === step.token_id) + 1) || "…"}`, hint: "Where the chosen token sat in the model's own ranking, within the reported rows" },
            { label: "Stack depth", value: `${step.stack_depth}`, hint: "Open { and [ brackets in the text so far; nothing enforces them here" },
          ]}
        />
        {samplingChip && <div className="flex items-center gap-2 flex-wrap">{samplingChip}</div>}
        <div className="grid md:grid-cols-2 gap-6">
          <Bars
            entries={original}
            color="var(--series-original)"
            chosen={step.token_id}
            title="Distribution"
            note={`raw logits → softmax · no mask${topK ? ` · top-k ${topK} cuts the rest` : ""}`}
            digits={digits}
            log={logBars}
            rows={shown}
            onContinue={onContinue}
            cutFrom={topK}
          />
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      <Stats
        items={[
          { label: "Chosen token", value: visibleToken(step.text, step.token), hint: `token id ${step.token_id} · raw ${JSON.stringify(step.token)}` },
          {
            label: "Allowed tokens",
            value: `${formatInt(step.n_allowed)} / ${formatInt(step.vocab_size)}`,
            hint: "Vocabulary entries the automaton allows at this step (finite logits after the mask)",
          },
          { label: "Vocabulary kept", value: formatPct(share, Math.max(digits, 2)), hint: "Allowed tokens ÷ vocabulary size" },
          { label: "Probability removed", value: formatPct(step.mass_removed, digits), hint: "Probability mass the model had put on tokens the mask forbids" },
          mode === "fsm"
            ? { label: "State", value: stateLabel, hint: stateHint ?? "Automaton state the mask was read from, before this token" }
            : { label: "Stack depth", value: `${step.stack_depth}`, hint: "Open { and [ brackets in the text so far" },
        ]}
      />

      <div className="flex items-center gap-2 flex-wrap">
        {step.was_overridden ? (
          <span className="chip chip-warning" title="The model's own argmax was forbidden by the mask, so a different token was sampled">
            overridden · wanted {visibleToken(original[0]?.text ?? "", original[0]?.token)} ({formatPct(original[0]?.p ?? 0, digits)})
          </span>
        ) : (
          <span className="chip" title="The model's own top choice was allowed by the mask">
            argmax allowed
          </span>
        )}
        <span className="chip" title="Probability of the chosen token before masking, then after renormalisation">
          {visibleToken(step.text, step.token)} · {formatPct(step.p_original, Math.max(digits, 2))} → {formatPct(step.p_forced, digits)}
        </span>
        {samplingChip}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Bars entries={original} color="var(--series-original)" chosen={step.token_id} title="Original intent" note="raw logits → softmax" digits={digits} log={logBars} rows={shown} legend onContinue={onContinue} />
        <Bars
          entries={forced}
          color="var(--series-forced)"
          chosen={step.token_id}
          title="Forced"
          note={`after −∞ mask → softmax${topK ? ` · top-k ${topK} cuts the rest` : ""}`}
          digits={digits}
          log={logBars}
          rows={shown}
          onContinue={onContinue}
          cutFrom={topK}
        />
      </div>
    </div>
  );
}
