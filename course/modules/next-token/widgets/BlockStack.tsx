"use client";

import { useEffect, useRef, useState } from "react";
import type { ModuleUi } from "@/modules/types";

/**
 * The 24 blocks as a column (1 at the bottom, 24 at the top) on the residual line.
 * During a forward pass the slabs light up bottom→top on a metronome (the server
 * only reports the whole pass); the measured time is printed elsewhere.
 */
export function BlockStack({ nLayers, running, expectedMs, selected, onSelect, ui, compact = false }: { nLayers: number; running: boolean; expectedMs: number; selected: number | null; onSelect?: (layer: number) => void; ui: ModuleUi; compact?: boolean }) {
  const [lit, setLit] = useState(0);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (!running) return;
    const started = performance.now();
    const tick = () => {
      const frac = Math.min((performance.now() - started) / Math.max(expectedMs, 200), 0.96);
      setLit(Math.floor(frac * nLayers));
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [running, expectedMs, nLayers]);
  const slabH = compact ? 5 : 7;
  return (
    <div className="flex h-full flex-col items-center gap-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">2 · {ui.blocksTitle}</div>
      <div className="mono text-[10px] text-ink-2">h ↑</div>
      <div className="relative flex flex-col-reverse gap-[2px]" data-hotkeys="local">
        <div className="absolute bottom-0 left-1/2 top-0 w-[2px] -translate-x-1/2" style={{ background: "var(--series-third)", opacity: 0.35 }} aria-hidden="true" />
        {Array.from({ length: nLayers }).map((_, i) => {
          const layer = i + 1;
          const on = running && i < (running ? lit : 0);
          const isSel = selected === i;
          return (
            <button
              key={layer}
              type="button"
              onClick={onSelect ? () => onSelect(i) : undefined}
              title={`${ui.block} ${layer}`}
              className="relative z-10 rounded-sm transition-colors"
              style={{ width: compact ? 64 : 88, height: slabH, background: on ? "var(--series-third)" : "var(--sf-raised)", outline: isSel ? "2px solid var(--series-third)" : "none", outlineOffset: 1, cursor: onSelect ? "pointer" : "default" }}
              aria-label={`${ui.block} ${layer}`}
              aria-pressed={isSel}
            />
          );
        })}
      </div>
      <div className="mono text-[10px] text-ink-2">↑ E[id]</div>
      <p className="mt-auto max-w-[120px] text-center text-[10px] leading-tight text-muted">{ui.blocksCaption}</p>
    </div>
  );
}
