"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { IconPause, IconPlay, IconSkipBack, IconSkipForward, IconStepBack, IconStepForward } from "./icons";

interface Props {
  count: number;
  index: number;
  playing: boolean;
  streaming: boolean;
  onIndex: (i: number) => void;
  onPlay: (playing: boolean) => void;
  /** Controls that sit at the right end of the transport row. */
  trailing?: ReactNode;
}

/** Transport and slider over the recorded steps. ← → step, space plays. */
export function TimeMachine({ count, index, playing, streaming, onIndex, onPlay, trailing }: Props) {
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
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT") return;
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

  const none = count === 0;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="eyebrow">Step</span>
        <span className="font-mono text-sm tabular-nums">{none ? "— / —" : `${index + 1} / ${count}`}</span>
        <div className="flex items-center gap-1 ml-1" role="group" aria-label="Transport" title="← → step · space play/pause">
          <button className="btn btn-icon" type="button" onClick={() => onIndex(0)} disabled={none} aria-label="First step">
            <IconSkipBack />
          </button>
          <button className="btn btn-icon" type="button" onClick={() => onIndex(Math.max(index - 1, 0))} disabled={none || index === 0} aria-label="Previous step">
            <IconStepBack />
          </button>
          <button className={`btn btn-icon ${playing ? "border-accent" : ""}`} type="button" onClick={() => onPlay(!playing)} disabled={none} aria-label={playing ? "Pause" : "Play"}>
            {playing ? <IconPause /> : <IconPlay />}
          </button>
          <button className="btn btn-icon" type="button" onClick={() => onIndex(Math.min(index + 1, last))} disabled={none || index >= last} aria-label="Next step">
            <IconStepForward />
          </button>
          <button className="btn btn-icon" type="button" onClick={() => onIndex(last)} disabled={none} aria-label="Last step">
            <IconSkipForward />
          </button>
        </div>
        {streaming && <span className="chip">streaming</span>}
        {trailing && <span className="ml-auto flex items-center gap-2">{trailing}</span>}
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
        disabled={none}
        aria-label="Step"
      />
    </div>
  );
}
