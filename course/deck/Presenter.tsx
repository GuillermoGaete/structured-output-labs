"use client";

import { useEffect, useState } from "react";
import { useT } from "@/i18n/client";
import { useDeck } from "./DeckContext";
import { SlideFrame } from "./SlideFrame";

function useTimer(key: string) {
  const [elapsed, setElapsed] = useState(0);
  const [start, setStart] = useState<number | null>(null);
  useEffect(() => {
    let stored: number | null = null;
    try {
      const raw = sessionStorage.getItem(key);
      stored = raw ? Number(raw) : null;
    } catch {
      /* ignore */
    }
    const s = stored ?? Date.now();
    try {
      sessionStorage.setItem(key, String(s));
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStart(s);
  }, [key]);
  useEffect(() => {
    if (start === null) return;
    const id = setInterval(() => setElapsed(Date.now() - start), 1000);
    return () => clearInterval(id);
  }, [start]);
  const reset = () => {
    const s = Date.now();
    try {
      sessionStorage.setItem(key, String(s));
    } catch {
      /* ignore */
    }
    setStart(s);
    setElapsed(0);
  };
  return { elapsed, reset };
}

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function Presenter({ onOpenAudience }: { onOpenAudience: () => void }) {
  const t = useT();
  const deck = useDeck();
  const { elapsed, reset } = useTimer(`sol-deck-timer:${deck.moduleId}`);
  const [clock, setClock] = useState("");
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString(deck.locale, { hour: "2-digit", minute: "2-digit" }));
    tick();
    const id = setInterval(tick, 10000);
    return () => clearInterval(id);
  }, [deck.locale]);
  const current = deck.slides[deck.index];
  const upNext = deck.slides[deck.index + 1];
  return (
    <div className="grid h-full grid-cols-[3fr_2fr] grid-rows-[auto_1fr_auto] gap-4 bg-page p-4 text-ink">
      <div className="col-span-2 flex flex-wrap items-center gap-3 text-sm">
        <span className="eyebrow">{t.deck.presenter}</span>
        <span className="mono">
          {t.deck.slide} {deck.index + 1} {t.deck.of} {deck.count} · {current?.title ?? current?.id}
        </span>
        <span className="mono ml-auto text-2xl font-semibold tabular-nums">{fmt(elapsed)}</span>
        <button type="button" className="btn text-xs" onClick={reset}>
          {t.deck.resetTimer}
        </button>
        <span className="mono text-muted">{clock}</span>
        <button type="button" className="btn btn-primary text-xs" onClick={onOpenAudience}>
          {t.deck.openAudience}
        </button>
      </div>
      <div className="panel flex min-h-0 flex-col gap-2 p-3">
        <span className="text-xs font-semibold text-muted">{t.deck.current}</span>
        <div className="min-h-0 flex-1">{current && <SlideFrame slide={current} />}</div>
      </div>
      <div className="flex min-h-0 flex-col gap-4">
        <div className="panel flex min-h-0 flex-1 flex-col gap-2 p-3">
          <span className="text-xs font-semibold text-muted">{t.deck.upNext}</span>
          <div className="min-h-0 flex-1 opacity-80">{upNext ? <SlideFrame slide={upNext} /> : <div className="grid h-full place-items-center text-muted">{t.deck.end}</div>}</div>
        </div>
        <div className="panel-raised flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-4 text-lg leading-relaxed">
          <span className="text-xs font-semibold text-muted">{t.deck.notes}</span>
          {current?.notes ?? <p className="text-muted">{t.deck.noNotes}</p>}
        </div>
      </div>
      <div className="col-span-2 flex items-center gap-2 text-sm text-ink-2">
        <button type="button" className="btn" onClick={deck.prev} disabled={deck.index === 0}>
          ← {t.deck.prev}
        </button>
        <button type="button" className="btn" onClick={deck.next} disabled={deck.index >= deck.count - 1}>
          {t.deck.next} →
        </button>
        <span className="ml-auto text-muted">{t.deck.keys}</span>
      </div>
    </div>
  );
}
