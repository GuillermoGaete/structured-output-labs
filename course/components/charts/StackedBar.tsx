"use client";

/** One bar, segments with a 2px surface gap; a legend below (identity is never colour alone). */
export function StackedBar({ segments, total, title, locale = "en" }: { segments: { label: string; value: number; color: string; pattern?: boolean }[]; total: number; title?: string; locale?: string }) {
  const shown = segments.filter((s) => s.value > 0);
  return (
    <div className="flex flex-col gap-2">
      {title && <span className="text-sm font-semibold">{title}</span>}
      <div className="flex h-5 w-full gap-[2px] overflow-hidden rounded-full bg-raised">
        {shown.map((s) => (
          <div key={s.label} title={`${s.label}: ${s.value} / ${total}`} style={{ width: `${(s.value / Math.max(total, 1)) * 100}%`, background: s.pattern ? `repeating-linear-gradient(135deg, ${s.color} 0 4px, transparent 4px 8px)` : s.color }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
        {shown.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            {s.label} · {s.value} ({((s.value / Math.max(total, 1)) * 100).toLocaleString(locale, { maximumFractionDigits: 0 })} %)
          </span>
        ))}
      </div>
    </div>
  );
}
