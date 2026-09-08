"use client";

import Link from "next/link";
import { use } from "react";
import { useHref, useT } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { loadSlides } from "@/modules/slides.client";
import type { ModuleId } from "@/modules/types";

/** Placeholder until the deck engine lands: renders one slide at 1920×1080 scaled into the viewport. */
export function DeckHost({ moduleId, locale, slideIds, initialIndex }: { moduleId: ModuleId; locale: Locale; slideIds: readonly string[]; initialIndex: number }) {
  const t = useT();
  const href = useHref();
  const slides = use(loadSlides(moduleId, locale));
  const id = slideIds[Math.min(Math.max(initialIndex, 0), slideIds.length - 1)];
  const slide = slides[id];
  return (
    <div className="fixed inset-0 flex flex-col bg-page">
      <div className="flex items-center gap-3 border-b border-rule px-4 py-2 text-xs text-ink-2">
        <Link href={href(`/${moduleId}`)} className="btn text-xs">
          ← {t.deck.exit}
        </Link>
        <span className="mono">
          {t.deck.slide} {initialIndex + 1} {t.deck.of} {slideIds.length}
        </span>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <div className="absolute left-1/2 top-1/2 h-[1080px] w-[1920px] origin-center -translate-x-1/2 -translate-y-1/2 scale-[0.5] bg-page p-[96px_120px]">
          {slide ? slide.render() : null}
        </div>
      </div>
    </div>
  );
}
