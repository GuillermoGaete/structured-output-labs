import type { ReactNode } from "react";
import { TokenRenderer } from "@/components/TokenRenderer";
import { Stats, type StatProps } from "./Stat";

interface TokenLike {
  token_id: number;
  token: string;
  text: string;
}

interface Props {
  tokens: TokenLike[];
  limit: number;
  activeIndex: number;
  onPick: (i: number) => void;
  /** Warnings and states that belong to the whole run. */
  chips?: ReactNode;
  tiles: StatProps[];
  /** Facts about the run that never change while it streams: model, engine, vocabulary. */
  meta?: string;
  error?: string | null;
  /** Tokens before this index were replayed from a parent run. */
  dimUntil?: number;
}

/** The text so far, then the run in numbers. */
export function OutputStrip({ tokens, limit, activeIndex, onPick, chips, tiles, meta, error, dimUntil }: Props) {
  return (
    <section className="panel p-4 flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <span className="eyebrow">Output</span>
        {chips && <span className="flex items-center gap-2 flex-wrap">{chips}</span>}
      </div>
      <TokenRenderer tokens={tokens} limit={limit} activeIndex={activeIndex} onPick={onPick} dimUntil={dimUntil} />
      {error && <p className="font-mono text-xs text-critical break-all">{error}</p>}
      {tiles.length > 0 && <Stats items={tiles} />}
      {meta && <p className="stat-note break-all">{meta}</p>}
    </section>
  );
}
