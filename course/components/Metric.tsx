export function Metric({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "good" | "warn" | "critical" }) {
  const color = tone === "good" ? "text-good" : tone === "warn" ? "text-warn" : tone === "critical" ? "text-critical" : "";
  return (
    <div className="flex min-w-[110px] flex-col gap-0.5" title={hint}>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</span>
      <span className={`mono text-[15px] tabular-nums ${color}`}>{value}</span>
    </div>
  );
}
