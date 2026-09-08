"use client";

import type { Run } from "@/lib/experiments/types";
import { formatMs } from "@/lib/tokens";
import type { ModuleUi } from "@/modules/types";

export const MODE_COLOR: Record<Run["mode"], string> = { plain: "var(--series-model)", json_mode: "var(--series-third)", strict: "var(--series-chosen)" };

export function RunsTable({ runs, selectedId, onSelect, onScrub, ui, locale = "en", showMode = true }: { runs: Run[]; selectedId: string | null; onSelect: (run: Run) => void; onScrub?: (run: Run) => void; ui: ModuleUi; locale?: string; showMode?: boolean }) {
  if (!runs.length) return <p className="text-sm text-muted">{ui.noRuns}</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-rule">
      <table className="w-full text-xs">
        <thead className="bg-raised text-left text-muted">
          <tr>
            <th className="px-2 py-1.5">#</th>
            {showMode && <th className="px-2 py-1.5">{ui.mode}</th>}
            <th className="px-2 py-1.5">{ui.result}</th>
            <th className="px-2 py-1.5">{ui.why}</th>
            <th className="px-2 py-1.5">{ui.output}</th>
            <th className="px-2 py-1.5 text-right">{ui.tokens}</th>
            <th className="px-2 py-1.5 text-right">{ui.time}</th>
            <th className="px-2 py-1.5 text-right">tok/s</th>
            <th className="px-2 py-1.5"></th>
          </tr>
        </thead>
        <tbody className="mono">
          {runs.map((r) => {
            const timing = r.trace.done?.timing;
            const raw = r.trace.done?.validation.raw_text ?? r.trace.error ?? "";
            const selected = r.id === selectedId;
            return (
              <tr key={r.id} className={`cursor-pointer border-t border-rule ${selected ? "bg-accent-soft" : "hover:bg-raised"}`} onClick={() => onSelect(r)}>
                <td className="px-2 py-1.5 text-muted">{r.seed ?? "·"}{r.source === "live" ? " ●" : ""}</td>
                {showMode && (
                  <td className="px-2 py-1.5">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block h-2 w-2 rounded-sm" style={{ background: MODE_COLOR[r.mode] }} />
                      {ui[`mode_${r.mode}`]}
                    </span>
                  </td>
                )}
                <td className="px-2 py-1.5">
                  <span className={`rounded-full px-2 py-0.5 font-sans font-semibold ${r.outcome.ok ? "bg-good/15 text-good" : "bg-critical/15 text-critical"}`}>{r.outcome.ok ? "✓ " + ui.ok : "✕ " + ui.fail}</span>
                </td>
                <td className="px-2 py-1.5 font-sans">
                  {r.outcome.ok ? "" : ui[`class_${r.outcome.failureClass}`] ?? r.outcome.failureClass}
                  {r.outcome.rescuable && <span className="ml-1 text-muted">· {ui.rescuable}</span>}
                </td>
                <td className="max-w-[260px] truncate px-2 py-1.5 text-ink-2" title={raw}>
                  {raw.replace(/\n/g, "⏎").slice(0, 60)}
                </td>
                <td className="px-2 py-1.5 text-right">{timing?.n_new_tokens ?? "·"}</td>
                <td className="px-2 py-1.5 text-right">{timing ? formatMs(timing.total_ms, locale) : "·"}</td>
                <td className="px-2 py-1.5 text-right">{timing ? timing.tokens_per_s.toFixed(1) : "·"}</td>
                <td className="px-2 py-1.5 text-right">
                  {onScrub && (
                    <button type="button" className="btn text-[11px]" disabled={r.detail !== "full"} title={r.detail !== "full" ? ui.compactHint : undefined} onClick={(e) => { e.stopPropagation(); onScrub(r); }}>
                      {ui.openScrubber}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
