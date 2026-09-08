"use client";

import { createContext, useContext } from "react";
import type { Locale } from "@/i18n/config";
import type { ModuleId, SlideDefinition } from "@/modules/types";

export type DeckMode = "present" | "presenter" | "print" | "embed";

export interface DeckValue {
  moduleId: ModuleId;
  moduleOrder: number;
  moduleTitle: string;
  locale: Locale;
  slides: SlideDefinition[];
  index: number;
  count: number;
  mode: DeckMode;
  goTo: (index: number) => void;
  next: () => void;
  prev: () => void;
  hrefFor: (index: number, opts?: { presenter?: boolean }) => string;
}

export const DeckContext = createContext<DeckValue | null>(null);

export function useDeck(): DeckValue {
  const ctx = useContext(DeckContext);
  if (!ctx) throw new Error("useDeck must be used inside a Deck");
  return ctx;
}

/** Non-throwing variant for primitives that also render outside a deck (docs, previews). */
export function useDeckOptional(): DeckValue | null {
  return useContext(DeckContext);
}
