export type Tone = "good" | "critical";

export interface StatProps {
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
}

const TONE: Record<Tone, string> = { good: "text-good", critical: "text-critical" };

/** A number with its label. */
export function Stat({ label, value, hint, tone }: StatProps) {
  return (
    <div className="stat" title={hint}>
      <span className="eyebrow">{label}</span>
      <span className={`stat-value ${tone ? TONE[tone] : ""}`}>{value}</span>
    </div>
  );
}

export function Stats({ items }: { items: StatProps[] }) {
  return (
    <div className="stats">
      {items.map((s) => (
        <Stat key={s.label} {...s} />
      ))}
    </div>
  );
}
