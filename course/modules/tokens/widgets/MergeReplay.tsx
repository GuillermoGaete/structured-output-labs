"use client";

import { useState } from "react";
import type { MergePiece } from "@/lib/types";
import type { ModuleUi } from "@/modules/types";

/** How byte-level BPE builds one pre-token: the merge steps, lowest rank first. */
export function MergeReplay({ pieces, ui }: { pieces: MergePiece[]; ui: ModuleUi }) {
  const candidates = pieces.filter((p) => p.steps.length > 0);
  const [which, setWhich] = useState(0);
  if (!candidates.length) return null;
  const piece = candidates[Math.min(which, candidates.length - 1)];
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">{ui.merges}</span>
        {candidates.map((p, i) => (
          <button key={p.start} type="button" className={`chip ${i === which ? "outline outline-2 outline-accent" : ""}`} style={{ background: "var(--sf-raised)", color: "var(--ink-1)" }} onClick={() => setWhich(i)}>
            {JSON.stringify(p.piece)}
          </button>
        ))}
      </div>
      <ol className="mono flex flex-col gap-1 text-[13px]">
        <li className="flex gap-3">
          <span className="w-16 text-muted">{ui.bytes}</span>
          <span>{piece.symbols.join(" · ")}</span>
        </li>
        {piece.steps.map((s) => (
          <li key={s.rank} className="flex gap-3">
            <span className="w-16 text-muted">#{s.rank}</span>
            <span>
              <span className="rounded bg-accent-soft px-1 text-accent-strong">{s.pair[0] + s.pair[1]}</span> → {s.result.join(" · ")}
            </span>
          </li>
        ))}
        <li className="flex gap-3">
          <span className="w-16 text-muted">ids</span>
          <span>{piece.final_ids.join(" · ")}</span>
        </li>
      </ol>
    </div>
  );
}
