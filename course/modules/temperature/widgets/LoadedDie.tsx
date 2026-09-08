"use client";

import { useEffect, useRef, useState } from "react";
import { pickWithU, type LogitLike, type SoftmaxView } from "@/lib/math";
import { rng } from "@/lib/prng";
import { formatInt, pastelFor, visibleToken } from "@/lib/tokens";
import type { ModuleUi } from "@/modules/types";

interface Rolls {
  counts: Map<number | "tail", number>;
  total: number;
}

/** The whole probability mass as one stacked bar; a pointer lands where u falls. Roll once or a thousand times. */
export function LoadedDie({ top, view, seed, ui, locale = "en" }: { top: LogitLike[]; view: SoftmaxView; seed: number; ui: ModuleUi; locale?: string }) {
  const [u, setU] = useState<number | null>(null);
  const [landed, setLanded] = useState<number | "tail" | null>(null);
  const [rolls, setRolls] = useState<Rolls>({ counts: new Map(), total: 0 });
  const [sweeping, setSweeping] = useState(false);
  const random = useRef(rng(seed));
  const viewKey = JSON.stringify([view.p.map((p) => Math.round(p * 1e4)), view.tailMass]);

  useEffect(() => {
    random.current = rng(seed);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRolls({ counts: new Map(), total: 0 });
    setU(null);
    setLanded(null);
  }, [seed, viewKey]);

  const roll = (n: number) => {
    const counts = new Map(rolls.counts);
    let lastU = 0;
    let last: number | "tail" = 0;
    for (let i = 0; i < n; i++) {
      lastU = random.current();
      last = pickWithU(view, lastU);
      counts.set(last, (counts.get(last) ?? 0) + 1);
    }
    setRolls({ counts, total: rolls.total + n });
    setU(lastU);
    setLanded(last);
    if (n === 1) {
      setSweeping(true);
      setTimeout(() => setSweeping(false), 700);
    }
  };

  const segments = view.p.map((p, i) => ({ key: i as number | "tail", p, allowed: view.allowed[i], label: visibleToken(top[i].text) })).filter((s) => s.allowed && s.p > 0);
  if (view.tailAllowed && view.tailMass > 0) segments.push({ key: "tail", p: view.tailMass, allowed: true, label: ui.everythingElse });

  return (
    <div className="flex flex-col gap-3" data-hotkeys="local">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">{ui.die}</span>
        <button type="button" className="btn btn-primary text-xs" onClick={() => roll(1)}>
          {ui.roll}
        </button>
        <button type="button" className="btn text-xs" onClick={() => roll(100)}>
          ×100
        </button>
        <button type="button" className="btn text-xs" onClick={() => roll(1000)}>
          ×1000
        </button>
        <button type="button" className="btn text-xs" onClick={() => { setRolls({ counts: new Map(), total: 0 }); setU(null); setLanded(null); random.current = rng(seed); }}>
          {ui.resetRolls}
        </button>
        <span className="mono ml-auto text-xs text-ink-2">
          {u !== null ? `u = ${u.toLocaleString(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}` : ""}
        </span>
      </div>
      <div className="relative">
        <div className="flex h-10 w-full overflow-hidden rounded-full border border-rule-2">
          {segments.map((s, i) => (
            <div
              key={String(s.key)}
              className="relative flex items-center justify-center overflow-hidden text-[11px] font-semibold"
              style={{ width: `${s.p * 100}%`, background: s.key === "tail" ? "var(--series-masked)" : pastelFor(typeof s.key === "number" ? s.key : i), color: s.key === "tail" ? "var(--sf-page)" : "#000", outline: landed === s.key ? "3px solid var(--series-chosen)" : "none", outlineOffset: -3 }}
              title={`${s.label} · ${(s.p * 100).toFixed(2)} %`}
            >
              {s.p > 0.06 ? s.label : ""}
            </div>
          ))}
        </div>
        {u !== null && (
          <div className="pointer-events-none absolute -top-1 h-12 w-0.5 bg-ink" style={{ left: `${u * 100}%`, transition: sweeping ? "left 0.6s cubic-bezier(.2,.8,.2,1)" : "none" }} aria-hidden="true" />
        )}
      </div>
      {landed !== null && (
        <p className="text-sm text-ink-2">
          {ui.landedOn} <span className="mono font-semibold text-ink">{landed === "tail" ? ui.everythingElse : visibleToken(top[landed].text)}</span>
          {view.greedy ? ` · ${ui.greedyDie}` : ""}
        </p>
      )}
      {rolls.total > 0 && (
        <div className="flex flex-col gap-1 text-xs">
          <span className="text-muted">
            {formatInt(rolls.total, locale)} {ui.rollsSoFar}
          </span>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {segments
              .map((s, i) => ({ s, i, c: rolls.counts.get(s.key) ?? 0 }))
              .filter(({ c }) => c > 0)
              .sort((a, b) => b.c - a.c)
              .slice(0, 12)
              .map(({ s, i, c }) => {
              return (
                <span key={String(s.key)} className="mono inline-flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.key === "tail" ? "var(--series-masked)" : pastelFor(typeof s.key === "number" ? s.key : i) }} />
                  {s.label} {c} ({((c / rolls.total) * 100).toFixed(1)} % · {(s.p * 100).toFixed(1)} %)
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
