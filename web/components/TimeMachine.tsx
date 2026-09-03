"use client";

import { useEffect, useRef } from "react";

interface Props {
  count: number;
  index: number;
  playing: boolean;
  streaming: boolean;
  onIndex: (i: number) => void;
  onPlay: (playing: boolean) => void;
}

/** Slider + transport controls over the recorded steps. */
export function TimeMachine({ count, index, playing, streaming, onIndex, onPlay }: Props) {
  const last = Math.max(count - 1, 0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => {
      if (index >= last) {
        if (!streaming) onPlay(false);
        return;
      }
      onIndex(index + 1);
    }, 450);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing, index, last, streaming, onIndex, onPlay]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === "TEXTAREA" || (e.target as HTMLElement | null)?.tagName === "INPUT") return;
      if (e.key === "ArrowLeft") onIndex(Math.max(index - 1, 0));
      if (e.key === "ArrowRight") onIndex(Math.min(index + 1, last));
      if (e.key === " ") {
        e.preventDefault();
        onPlay(!playing);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, last, playing, onIndex, onPlay]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <button className="btn" type="button" onClick={() => onIndex(0)} disabled={count === 0} aria-label="First step">
          ⏮
        </button>
        <button className="btn" type="button" onClick={() => onIndex(Math.max(index - 1, 0))} disabled={count === 0 || index === 0} aria-label="Previous step">
          ◀
        </button>
        <button className="btn btn-primary min-w-[88px] justify-center" type="button" onClick={() => onPlay(!playing)} disabled={count === 0}>
          {playing ? "Pause" : "Play"}
        </button>
        <button className="btn" type="button" onClick={() => onIndex(Math.min(index + 1, last))} disabled={count === 0 || index >= last} aria-label="Next step">
          ▶
        </button>
        <button className="btn" type="button" onClick={() => onIndex(last)} disabled={count === 0} aria-label="Last step">
          ⏭
        </button>
        <span className="font-mono text-sm tabular-nums ml-2">
          {count === 0 ? "— / —" : `${index + 1} / ${count}`}
          {streaming && <span className="text-muted"> · streaming</span>}
        </span>
        <span className="text-xs text-muted ml-auto">← → step · space play</span>
      </div>
      <input
        type="range"
        min={0}
        max={last}
        value={Math.min(index, last)}
        onChange={(e) => {
          onPlay(false);
          onIndex(Number(e.target.value));
        }}
        disabled={count === 0}
        aria-label="Step"
      />
    </div>
  );
}
