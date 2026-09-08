"use client";

import { useState } from "react";
import { ProbabilityBars } from "@/components/charts/ProbabilityBars";
import { useLocale } from "@/i18n/client";
import { formatPct } from "@/lib/tokens";
import type { TopEntry } from "@/lib/types";
import type { ModuleUi } from "@/modules/types";

/** Write −∞ by hand: click a bar to forbid it and watch the rest renormalise. */
export function MaskLab({ entries, ui }: { entries: TopEntry[]; ui: ModuleUi }) {
  const locale = useLocale();
  const [forbidden, setForbidden] = useState<Set<number>>(new Set());
  const original = entries.map((e) => ({ ...e, allowed: true }));
  const kept = entries.filter((e) => !forbidden.has(e.token_id));
  const keptMass = kept.reduce((a, e) => a + e.p, 0);
  const forced = entries.map((e) => (forbidden.has(e.token_id) ? { ...e, p: 0, allowed: false } : { ...e, p: keptMass > 0 ? e.p / keptMass : 0, allowed: true }));
  const removed = entries.filter((e) => forbidden.has(e.token_id)).reduce((a, e) => a + e.p, 0);
  return (
    <div className="flex flex-col gap-3" data-hotkeys="local">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">{ui.maskLabTitle}</span>
        <span className="text-xs text-muted">{ui.maskLabHint}</span>
        <span className="mono ml-auto text-xs text-ink-2">
          {ui.maskLabRemoved} {formatPct(removed, 1, locale)}
        </span>
        <button type="button" className="btn text-xs" onClick={() => setForbidden(new Set())}>
          {ui.maskLabReset}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {entries.map((e) => (
          <button
            key={e.token_id}
            type="button"
            className={`chip ${forbidden.has(e.token_id) ? "line-through opacity-60" : ""}`}
            style={{ background: forbidden.has(e.token_id) ? "var(--sf-raised)" : "var(--accent-soft)", color: forbidden.has(e.token_id) ? "var(--ink-3)" : "var(--accent-strong)" }}
            onClick={() =>
              setForbidden((prev) => {
                const next = new Set(prev);
                if (next.has(e.token_id)) next.delete(e.token_id);
                else next.add(e.token_id);
                return next;
              })
            }
          >
            {e.text === "" ? "⟨eos⟩" : e.text.replace(/\n/g, "⏎").replace(/ /g, "␠")}
            {forbidden.has(e.token_id) ? " −∞" : ""}
          </button>
        ))}
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <ProbabilityBars entries={original} color="var(--series-model)" chosen={null} title={ui.tm_original} note={ui.tm_originalNote} locale={locale} />
        <ProbabilityBars entries={forced} color="var(--series-chosen)" chosen={null} title={ui.tm_forced} note={ui.tm_forcedNote} locale={locale} />
      </div>
    </div>
  );
}
