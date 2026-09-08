"use client";

import { useEffect, useState } from "react";
import { useHotkeys } from "@/lib/hotkeys";

/** First / previous / play / next / last + a slider over N steps. Arrow keys scrub while the transport has focus (or always, in a lab). */
export function Transport({ index, count, onIndex, labels, autoplayMs = 450, focusable = false, disabled = false }: { index: number; count: number; onIndex: (i: number) => void; labels: { first: string; prev: string; play: string; pause: string; next: string; last: string; step: string }; autoplayMs?: number; focusable?: boolean; disabled?: boolean }) {
  const [playing, setPlaying] = useState(false);
  const [focused, setFocused] = useState(!focusable);
  const last = Math.max(count - 1, 0);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      if (index >= last) setPlaying(false);
      else onIndex(Math.min(index + 1, last));
    }, autoplayMs);
    return () => clearInterval(id);
  }, [playing, index, last, onIndex, autoplayMs]);

  useHotkeys(
    "scrubber",
    [
      { keys: ["ArrowLeft"], handler: () => onIndex(Math.max(index - 1, 0)) },
      { keys: ["ArrowRight"], handler: () => onIndex(Math.min(index + 1, last)) },
      { keys: ["Home"], handler: () => onIndex(0) },
      { keys: ["End"], handler: () => onIndex(last) },
      { keys: [" "], handler: () => setPlaying((p) => !p) },
    ],
    { active: focused && !disabled && count > 0 },
  );

  return (
    <div
      className={`flex flex-wrap items-center gap-2 rounded-xl p-1 ${focusable ? "outline-none focus-within:ring-2 focus-within:ring-accent" : ""}`}
      tabIndex={focusable ? 0 : undefined}
      onFocus={focusable ? () => setFocused(true) : undefined}
      onBlur={focusable ? (e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocused(false); } : undefined}
      data-hotkeys={focusable ? undefined : "local"}
    >
      <button type="button" className="btn text-xs" onClick={() => onIndex(0)} disabled={disabled || index === 0} aria-label={labels.first}>
        ⏮
      </button>
      <button type="button" className="btn text-xs" onClick={() => onIndex(Math.max(index - 1, 0))} disabled={disabled || index === 0} aria-label={labels.prev}>
        ◀
      </button>
      <button type="button" className="btn btn-primary text-xs" onClick={() => setPlaying((p) => !p)} disabled={disabled || count < 2} aria-label={playing ? labels.pause : labels.play}>
        {playing ? "❚❚" : "▶"} {playing ? labels.pause : labels.play}
      </button>
      <button type="button" className="btn text-xs" onClick={() => onIndex(Math.min(index + 1, last))} disabled={disabled || index >= last} aria-label={labels.next}>
        ▶
      </button>
      <button type="button" className="btn text-xs" onClick={() => onIndex(last)} disabled={disabled || index >= last} aria-label={labels.last}>
        ⏭
      </button>
      <input type="range" className="min-w-[160px] flex-1" min={0} max={last} value={Math.min(index, last)} onChange={(e) => onIndex(Number(e.target.value))} disabled={disabled || count < 2} aria-label={labels.step} />
      <span className="mono text-xs text-ink-2">
        {labels.step} {index} / {last}
      </span>
    </div>
  );
}
