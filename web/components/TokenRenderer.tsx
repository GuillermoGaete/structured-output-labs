import { cleanBpeGlyphs, pastelFor } from "@/lib/tokens";

interface TokenLike {
  token_id: number;
  token: string;
  text: string;
}

interface Props {
  tokens: TokenLike[];
  /** Highlight this index (the Time Machine's current step). */
  activeIndex?: number;
  /** Render only the first `limit` tokens (partial text during playback). */
  limit?: number;
  onPick?: (index: number) => void;
}

/**
 * The final JSON, one pastel background per token. Text is forced to #000000
 * inline so it stays legible in dark mode; BPE glyphs are cleaned before render.
 */
export function TokenRenderer({ tokens, activeIndex, limit, onPick }: Props) {
  const shown = limit === undefined ? tokens : tokens.slice(0, limit);
  return (
    <div className="font-mono text-[15px] leading-[2] whitespace-pre-wrap break-all" aria-label="Generated text, coloured per token">
      {shown.map((t, i) => {
        // The backend sends "" for EOS; anything else is decoded text (raw token as a last resort).
        const text = t.text === "" ? "" : cleanBpeGlyphs(t.text ?? t.token);
        const active = i === activeIndex;
        return (
          <span
            key={`${i}-${t.token_id}`}
            title={`#${i} · id ${t.token_id} · ${JSON.stringify(t.token)}`}
            onClick={onPick ? () => onPick(i) : undefined}
            style={{
              backgroundColor: pastelFor(i),
              color: "#000000",
              padding: "2px 1px",
              borderRadius: 2,
              outline: active ? "2px solid var(--series-forced)" : "none",
              outlineOffset: 1,
              cursor: onPick ? "pointer" : "default",
            }}
          >
            {text === "" ? "⟨eos⟩" : text}
          </span>
        );
      })}
      {shown.length === 0 && <span className="text-muted font-sans text-sm">Nothing generated yet.</span>}
    </div>
  );
}
