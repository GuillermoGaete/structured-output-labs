"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Locale } from "@/i18n/config";
import { useFullscreen } from "@/lib/fullscreen";
import { useHotkeys } from "@/lib/hotkeys";
import { useTheme } from "@/lib/theme";
import type { ModuleId, SlideDefinition } from "@/modules/types";
import "./deck.css";
import { DeckContext, type DeckMode, type DeckValue } from "./DeckContext";
import { DeckControls } from "./DeckControls";
import { Presenter } from "./Presenter";
import { SlideFrame } from "./SlideFrame";
import { useDeckChannel } from "./useDeckChannel";
import { useDeckNavigation } from "./useDeckNavigation";

export interface DeckProps {
  moduleId: ModuleId;
  moduleOrder: number;
  moduleTitle: string;
  locale: Locale;
  slides: SlideDefinition[];
  initialIndex: number;
  mode: DeckMode;
}

export function Deck({ moduleId, moduleOrder, moduleTitle, locale, slides, initialIndex, mode }: DeckProps) {
  const router = useRouter();
  const { toggle: toggleFullscreen } = useFullscreen();
  const { toggle: toggleTheme } = useTheme();

  const hrefFor = useCallback(
    (index: number, opts: { presenter?: boolean } = {}) => {
      const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
      const presenter = opts.presenter ?? mode === "presenter";
      if (presenter) params.set("presenter", "1");
      else params.delete("presenter");
      const query = params.toString();
      return `/${locale}/${moduleId}/slides/${index + 1}${query ? `?${query}` : ""}`;
    },
    [locale, moduleId, mode],
  );

  const { index, goTo, next, prev } = useDeckNavigation(slides.length, initialIndex, hrefFor);
  useDeckChannel(`${moduleId}:${locale}`, index, goTo);

  const [chromeVisible, setChromeVisible] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const poke = useCallback(() => {
    setChromeVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setChromeVisible(false), 2500);
  }, []);
  useEffect(() => {
    if (mode !== "present") return;
    hideTimer.current = setTimeout(() => setChromeVisible(false), 2500);
    window.addEventListener("mousemove", poke);
    return () => {
      window.removeEventListener("mousemove", poke);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [mode, poke]);

  const openPresenter = useCallback(() => {
    router.push(hrefFor(index, { presenter: true }));
  }, [router, hrefFor, index]);
  const openAudience = useCallback(() => {
    window.open(hrefFor(index, { presenter: false }), "sol-deck-audience");
  }, [hrefFor, index]);
  const exit = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else router.push(`/${locale}/${moduleId}`);
  }, [router, locale, moduleId]);

  useHotkeys(
    "deck",
    [
      { keys: ["ArrowRight", "PageDown", " ", "j", "Enter"], handler: next },
      { keys: ["ArrowLeft", "PageUp", "Backspace", "k"], handler: prev },
      { keys: ["Home"], handler: () => goTo(0) },
      { keys: ["End"], handler: () => goTo(slides.length - 1) },
      { keys: ["f"], handler: () => void toggleFullscreen() },
      { keys: ["p"], handler: openPresenter },
      { keys: ["t"], handler: toggleTheme },
      { keys: ["Escape"], handler: exit },
    ],
    { active: mode !== "print" },
  );

  const value = useMemo<DeckValue>(
    () => ({ moduleId, moduleOrder, moduleTitle, locale, slides, index, count: slides.length, mode, goTo, next, prev, hrefFor }),
    [moduleId, moduleOrder, moduleTitle, locale, slides, index, mode, goTo, next, prev, hrefFor],
  );

  if (mode === "print") {
    return (
      <DeckContext.Provider value={value}>
        <div className="deck-print">
          {slides.map((slide, i) => (
            <div key={slide.id} className="deck-print-page">
              <PrintSlide slide={slide} index={i} />
            </div>
          ))}
        </div>
      </DeckContext.Provider>
    );
  }

  if (mode === "presenter") {
    return (
      <DeckContext.Provider value={value}>
        <div className="h-full">
          <Presenter onOpenAudience={openAudience} />
        </div>
      </DeckContext.Provider>
    );
  }

  const slide = slides[index];
  return (
    <DeckContext.Provider value={value}>
      <div className={`relative h-full w-full ${chromeVisible ? "" : "cursor-none"}`} onClick={poke}>
        {slide && <SlideFrame slide={slide} />}
        <DeckControls visible={chromeVisible} onFullscreen={() => void toggleFullscreen()} onPresenter={openPresenter} onTheme={toggleTheme} />
      </div>
    </DeckContext.Provider>
  );
}

function PrintSlide({ slide }: { slide: SlideDefinition; index: number }) {
  const themed = slide.theme && slide.theme !== "inherit" ? { "data-theme": slide.theme } : {};
  return (
    <div style={{ width: 1920, height: 1080 }} {...themed}>
      <section className={`slide-stage slide-layout-${slide.layout ?? "top"} slide-kind-${slide.kind ?? "content"}`}>{slide.render()}</section>
    </div>
  );
}
