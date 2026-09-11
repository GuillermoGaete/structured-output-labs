import { pastelFor, tokenDisplay } from "@/lib/tokens";

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
  /** Tokens before this index were replayed from a parent run: drawn dimmed, with the branch point marked. */
  dimUntil?: number;
}

/**
 * The final JSON, one pastel background per token. Text is forced to #000000
 * inline so it stays legible in dark mode; BPE glyphs are cleaned before render.
 */
export function TokenRenderer({ tokens, activeIndex, limit, onPick, dimUntil = 0 }: Props) {
  const shown = limit === undefined ? tokens : tokens.slice(0, limit);
  return (
    <div className="tokens font-mono text-[15px] leading-[2] whitespace-pre-wrap break-all" aria-label="Generated text, coloured per token">
      {shown.map((t, i) => {
        // The backend sends "" both for EOS and for sentencepiece's bare "▁", which is a space.
        const { shown: text, isEnd } = tokenDisplay(t.text, t.token);
        const active = i === activeIndex;
        const replayed = i < dimUntil;
        return (
          <span key={`${i}-${t.token_id}`}>
            {dimUntil > 0 && i === dimUntil && (
              <span
                className="inline-block align-middle mx-1 border-l-2 border-accent font-mono text-[10px] text-accent pl-1"
                title={`branch point: the first ${dimUntil} tokens were replayed from the parent run`}
              >
                ↳ {dimUntil}
              </span>
            )}
            <span
              title={`#${i} · id ${t.token_id} · ${JSON.stringify(t.token)}${replayed ? " · replayed from the parent run" : ""}`}
              onClick={onPick ? () => onPick(i) : undefined}
              style={{
                backgroundColor: pastelFor(i),
                color: "#000000",
                padding: "2px 1px",
                borderRadius: 2,
                opacity: replayed ? 0.45 : 1,
                outline: active ? "2px solid var(--series-forced)" : "none",
                outlineOffset: 1,
                cursor: onPick ? "pointer" : "default",
              }}
            >
              {isEnd ? "⟨eos⟩" : text}
            </span>
          </span>
        );
      })}
      {shown.length === 0 && <span className="text-muted font-sans text-sm">Nothing generated yet.</span>}
    </div>
  );
}
