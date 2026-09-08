"use client";

export function CutoffInputs({ topK, topP, onChange, labels, locale = "en" }: { topK: number; topP: number; onChange: (patch: { topK?: number; topP?: number }) => void; labels: { topK: string; topP: string; off: string }; locale?: string }) {
  return (
    <div className="flex flex-wrap gap-4 text-sm">
      <label className="flex items-center gap-2">
        <span className="font-semibold">{labels.topK}</span>
        <input type="number" className="input w-20 text-xs" min={0} max={200} value={topK} onChange={(e) => onChange({ topK: Math.max(0, Number(e.target.value) || 0) })} aria-label={labels.topK} />
        <span className="mono text-xs text-muted">{topK > 0 ? `k = ${topK}` : labels.off}</span>
      </label>
      <label className="flex min-w-[200px] flex-1 flex-col gap-1">
        <span className="flex items-baseline justify-between">
          <span className="font-semibold">{labels.topP}</span>
          <span className="mono text-xs text-muted">{topP < 1 ? `p = ${topP.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : labels.off}</span>
        </span>
        <input type="range" min={0.05} max={1} step={0.05} value={topP} onChange={(e) => onChange({ topP: Number(e.target.value) })} aria-label={labels.topP} />
      </label>
    </div>
  );
}
