"use client";

import { cleanBpeGlyphs, pastelFor } from "@/lib/tokens";

export interface ChipToken {
  id: number;
  token: string;
  text: string;
  /** Template / system tokens are drawn grey: not the user's text. */
  segment?: "template" | "system" | "user";
  is_special?: boolean;
}

interface Props {
  tokens: ChipToken[];
  activeIndex?: number;
  /** Render only the first `limit` tokens (partial text during playback). */
  limit?: number;
  onPick?: (index: number) => void;
  /** Show the raw vocabulary string (Ġ, Ċ) instead of the decoded text. */
  glyphs?: boolean;
  size?: "sm" | "md" | "lg";
  emptyLabel?: string;
}

const SIZE = { sm: "text-[13px] leading-[1.9]", md: "text-[15px] leading-[2]", lg: "text-[30px] leading-[1.8]" };

/**
 * Text as a row of chips, one pastel per token. Text is forced to #000 so it
 * stays legible in dark mode; the pastel is the token's identity, never a data series.
 */
export function TokenChips({ tokens, activeIndex, limit, onPick, glyphs = false, size = "md", emptyLabel = "" }: Props) {
  const shown = limit === undefined ? tokens : tokens.slice(0, limit);
  return (
    <div className={`mono whitespace-pre-wrap break-all ${SIZE[size]}`}>
      {shown.map((t, i) => {
        const raw = t.text === "" ? "" : glyphs ? t.token : cleanBpeGlyphs(t.text ?? t.token);
        const active = i === activeIndex;
        const dim = t.segment !== undefined && t.segment !== "user";
        return (
          <span
            key={`${i}-${t.id}`}
            title={`#${i} · id ${t.id} · ${JSON.stringify(t.token)}`}
            onClick={onPick ? () => onPick(i) : undefined}
            style={{
              backgroundColor: dim ? "var(--sf-raised)" : pastelFor(i),
              color: dim ? "var(--ink-3)" : "#000000",
              padding: "2px 2px",
              borderRadius: 4,
              outline: active ? "2px solid var(--series-chosen)" : "none",
              outlineOffset: 1,
              cursor: onPick ? "pointer" : "default",
              fontStyle: t.is_special ? "italic" : "normal",
            }}
          >
            {raw === "" ? "⟨eos⟩" : raw}
          </span>
        );
      })}
      {shown.length === 0 && <span className="font-sans text-sm text-muted">{emptyLabel}</span>}
    </div>
  );
}
