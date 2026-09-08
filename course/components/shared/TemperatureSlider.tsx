"use client";

export function TemperatureSlider({ value, onChange, label, greedyLabel, locale = "en", max = 2 }: { value: number; onChange: (v: number) => void; label: string; greedyLabel: string; locale?: string; max?: number }) {
  return (
    <label className="flex w-full flex-col gap-1 text-sm">
      <span className="flex items-baseline justify-between gap-2">
        <span className="font-semibold">{label}</span>
        <span className="mono text-xs text-ink-2">{value <= 0 ? greedyLabel : `T = ${value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</span>
      </span>
      <input type="range" min={0} max={max} step={0.05} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
    </label>
  );
}
