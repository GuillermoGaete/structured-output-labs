"use client";

import Link from "next/link";
import { useHref, useT } from "@/i18n/client";
import { useDeck } from "./DeckContext";

export function DeckControls({ visible, onFullscreen, onPresenter, onTheme }: { visible: boolean; onFullscreen: () => void; onPresenter: () => void; onTheme: () => void }) {
  const t = useT();
  const href = useHref();
  const deck = useDeck();
  return (
    <div
      className={`deck-chrome pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-2 p-3 text-xs text-ink-2 transition-opacity ${visible ? "opacity-100" : "opacity-0"}`}
      aria-hidden={!visible}
    >
      <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-panel px-3 py-1.5 shadow-lg">
        <Link href={href(`/${deck.moduleId}`)} className="btn text-xs" title={t.deck.exit}>
          ✕
        </Link>
        <button type="button" className="btn text-xs" onClick={deck.prev} disabled={deck.index === 0} aria-label={t.deck.prev}>
          ←
        </button>
        <span className="mono min-w-[64px] text-center">
          {deck.index + 1} / {deck.count}
        </span>
        <button type="button" className="btn text-xs" onClick={deck.next} disabled={deck.index >= deck.count - 1} aria-label={t.deck.next}>
          →
        </button>
        <button type="button" className="btn text-xs" onClick={onFullscreen}>
          {t.deck.fullscreen}
        </button>
        <button type="button" className="btn text-xs" onClick={onPresenter}>
          {t.deck.presenter}
        </button>
        <button type="button" className="btn text-xs" onClick={onTheme}>
          {t.theme.toggle}
        </button>
        <span className="hidden text-muted md:inline">{t.deck.keys}</span>
      </div>
    </div>
  );
}
