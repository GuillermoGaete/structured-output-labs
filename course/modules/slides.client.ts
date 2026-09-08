"use client";

import type { Locale } from "@/i18n/config";
import type { ModuleId, SlideDefinition } from "./types";

type Loader = () => Promise<{ default: Record<string, SlideDefinition> }>;

const LOADERS: Record<ModuleId, Record<Locale, Loader>> = {
  tokens: { es: () => import("./tokens/slides/es"), en: () => import("./tokens/slides/en") },
  "next-token": { es: () => import("./next-token/slides/es"), en: () => import("./next-token/slides/en") },
  temperature: { es: () => import("./temperature/slides/es"), en: () => import("./temperature/slides/en") },
  "no-strict": { es: () => import("./no-strict/slides/es"), en: () => import("./no-strict/slides/en") },
  strict: { es: () => import("./strict/slides/es"), en: () => import("./strict/slides/en") },
  benchmark: { es: () => import("./benchmark/slides/es"), en: () => import("./benchmark/slides/en") },
};

const cache = new Map<string, Promise<Record<string, SlideDefinition>>>();

/** Cached promise per (module, locale) so React's `use()` can suspend on it. */
export function loadSlides(moduleId: ModuleId, locale: Locale): Promise<Record<string, SlideDefinition>> {
  const key = `${moduleId}:${locale}`;
  let promise = cache.get(key);
  if (!promise) {
    promise = LOADERS[moduleId][locale]().then((m) => m.default);
    cache.set(key, promise);
  }
  return promise;
}
