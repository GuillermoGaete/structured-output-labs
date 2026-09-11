"use client";

import type { Variant } from "@/lib/labState";

interface Props {
  variants: Variant[];
  onChange: (variants: Variant[]) => void;
  /** Run one variant once. */
  onRunOne: (index: number) => void;
  /** Every variant, `repeatN` times each, one batch after another. */
  onRunAll: () => void;
  repeatN: number;
  disabled?: boolean;
  action: string;
}

/** The prompts of a probe, side by side and editable: swap the attribute, keep the rest, then run them all. */
export function VariantsEditor({ variants, onChange, onRunOne, onRunAll, repeatN, disabled = false, action }: Props) {
  const set = (i: number, patch: Partial<Variant>) => onChange(variants.map((v, k) => (k === i ? { ...v, ...patch } : v)));
  const remove = (i: number) => onChange(variants.filter((_, k) => k !== i));
  const add = () => onChange([...variants, { label: `variant ${variants.length + 1}`, prompt: variants[variants.length - 1]?.prompt ?? "" }]);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <span className="eyebrow">Variants · {variants.length}</span>
        <span className="text-xs text-muted" title="Keep every prompt identical except for the one attribute you are probing">one attribute swapped, the rest the same</span>
      </div>
      <div className="flex flex-col gap-2">
        {variants.map((v, i) => (
          <div key={i} className="variant">
            <div className="flex items-center gap-1.5">
              <input
                className="input py-0.5 px-1.5 text-xs font-mono"
                style={{ width: "9rem" }}
                value={v.label}
                onChange={(e) => set(i, { label: e.target.value })}
                disabled={disabled}
                aria-label={`Label of variant ${i + 1}`}
                placeholder="label"
              />
              <button type="button" className="btn py-0.5 px-2 text-xs" onClick={() => onRunOne(i)} disabled={disabled || !v.prompt.trim()} title={`${action} this variant once`}>
                {action} once
              </button>
              <button type="button" className="btn btn-icon ml-auto" onClick={() => remove(i)} disabled={disabled || variants.length <= 1} aria-label={`Remove variant ${i + 1}`} title="Remove">
                ×
              </button>
            </div>
            <textarea className="input text-sm min-h-[56px]" value={v.prompt} onChange={(e) => set(i, { prompt: e.target.value })} disabled={disabled} aria-label={`Prompt of variant ${i + 1}`} />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" className="btn py-1 px-2.5 text-[13px]" onClick={add} disabled={disabled}>
          Add variant
        </button>
        <button
          type="button"
          className="btn py-1 px-2.5 text-[13px] border-accent"
          onClick={onRunAll}
          disabled={disabled || !variants.some((v) => v.prompt.trim())}
          title={`Every variant, ${repeatN} runs each, one batch after another; then the probe table compares them`}
        >
          Run all variants ×{repeatN}
        </button>
        <button type="button" className="text-xs text-muted hover:text-ink" onClick={() => onChange([])} disabled={disabled} title="Back to a single prompt">
          drop variants
        </button>
      </div>
    </div>
  );
}
