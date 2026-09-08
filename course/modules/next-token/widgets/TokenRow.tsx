"use client";

import { useState } from "react";
import { cleanBpeGlyphs, pastelFor } from "@/lib/tokens";
import type { ForwardToken } from "@/lib/types";
import type { ModuleUi } from "@/modules/types";

/** The running input: template folded into one grey chip, the newest token outlined. */
export function TokenRow({ tokens, newIndex, ui, hidden, compact = false }: { tokens: ForwardToken[]; newIndex: number | null; ui: ModuleUi; hidden?: boolean; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const templateCount = tokens.filter((t) => t.is_template).length;
  const visible = expanded ? tokens : tokens.filter((t) => !t.is_template);
  const last = tokens[tokens.length - 1];
  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2 text-xs text-muted">
        <span className="font-semibold uppercase tracking-wide">1 · {ui.tokensTitle}</span>
        <span className="mono">
          {tokens.length} {ui.positions} · 0–{tokens.length - 1}
        </span>
      </div>
      <div className={`mono flex flex-wrap content-start gap-1 ${compact ? "text-[12px]" : "text-[14px]"} leading-[1.7]`}>
        {templateCount > 0 && !expanded && (
          <button type="button" className="rounded-md bg-raised px-2 text-ink-2" onClick={() => setExpanded(true)} title={ui.expandTemplate}>
            ⟨{ui.template} · {templateCount}⟩
          </button>
        )}
        {visible.map((t) => {
          const isNew = t.position === newIndex;
          const dim = t.is_template;
          return (
            <span
              key={t.position}
              title={`#${t.position} · id ${t.id} · ${JSON.stringify(t.token)}`}
              className={`rounded-md px-1.5 ${hidden && isNew ? "invisible" : ""}`}
              style={{ background: dim ? "var(--sf-raised)" : pastelFor(t.position), color: dim ? "var(--ink-3)" : "#000", outline: isNew ? "3px solid var(--series-chosen)" : "none", outlineOffset: 1, fontStyle: t.is_special ? "italic" : "normal", transition: "outline-color 0.2s" }}
              onClick={dim ? () => setExpanded(false) : undefined}
            >
              {t.text === "" ? "⟨eos⟩" : cleanBpeGlyphs(t.text).replace(/\n/g, "⏎").replace(/ /g, "␠")}
            </span>
          );
        })}
      </div>
      {last && (
        <div className="mt-auto flex items-center gap-2 text-xs text-ink-2">
          <span className="mono">E[{last.id}]</span>
          <span className="inline-flex gap-px" aria-hidden="true">
            {Array.from({ length: 12 }).map((_, i) => (
              <span key={i} className="inline-block h-3 w-1.5 rounded-sm" style={{ background: "var(--series-third)", opacity: 0.35 + ((last.id * (i + 3)) % 7) / 10 }} />
            ))}
          </span>
          <span>{ui.lookup}</span>
        </div>
      )}
    </div>
  );
}
