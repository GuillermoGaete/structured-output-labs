import type { Step } from "@/lib/types";
import { cleanBpeGlyphs, formatInt } from "@/lib/tokens";

interface Props {
  steps: Step[];
  index: number;
  onIndex: (i: number) => void;
  /** The step the chips describe; the strip marks it. */
  step?: Step;
}

/** One cell per step: forced by the constraint (a single allowed token) or chosen by the model. */
export function AuthorStrip({ steps, index, onIndex, step }: Props) {
  const forced = steps.filter((s) => s.n_allowed === 1).length;
  const ff = step?.ff_text ? cleanBpeGlyphs(step.ff_text) : "";
  return (
    <div className="flex flex-col gap-2 talk-hide">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <span className="eyebrow">Who wrote each token</span>
        <span className="text-xs text-muted inline-flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-forced" /> forced by the constraint · {forced}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-original" /> chosen by the model · {steps.length - forced}
          </span>
        </span>
      </div>
      <div className="flex flex-wrap gap-[2px]" role="list" aria-label="Steps, forced or chosen">
        {steps.map((s, i) => (
          <button
            key={i}
            type="button"
            role="listitem"
            onClick={() => onIndex(i)}
            className={`h-3.5 w-2.5 rounded-[2px] ${s.n_allowed === 1 ? "bg-forced" : "bg-original"} ${i === index ? "outline outline-2 outline-ink outline-offset-1" : ""}`}
            title={`#${i} · ${JSON.stringify(cleanBpeGlyphs(s.text))} · ${s.n_allowed === 1 ? "forced: one token allowed" : `${formatInt(s.n_allowed)} allowed`}`}
            aria-label={`step ${i}`}
          />
        ))}
      </div>
      {step && (step.accepting !== undefined || step.ff_token_ids !== undefined) && (
        <div className="flex items-center gap-2 flex-wrap">
          {ff ? (
            <span className="chip" title="Tokens the grammar forces from here: only one path forward until they are written">
              grammar forces next · {JSON.stringify(ff)}
            </span>
          ) : (
            <span className="chip" title="More than one token is allowed here; the model chooses">
              free choice · {formatInt(step.n_allowed)} allowed
            </span>
          )}
          {step.accepting !== undefined && step.accepting !== null && (
            <span className={`chip ${step.accepting ? "chip-good" : ""}`} title="Whether the grammar would accept the end of the sequence at this point">
              {step.accepting ? "EOS accepted here" : "EOS not accepted"}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
