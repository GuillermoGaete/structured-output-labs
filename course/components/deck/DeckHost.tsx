"use client";

import { useSearchParams } from "next/navigation";
import { use, useMemo } from "react";
import { Deck } from "@/deck/Deck";
import type { DeckMode } from "@/deck/DeckContext";
import type { Locale } from "@/i18n/config";
import { useModuleFixtures } from "@/data/DataSourceProvider";
import { moduleById } from "@/modules";
import { loadSlides } from "@/modules/slides.client";
import type { ModuleId } from "@/modules/types";

export function DeckHost({
  moduleId,
  moduleOrder,
  moduleTitle,
  locale,
  slideIds,
  initialIndex,
}: {
  moduleId: ModuleId;
  moduleOrder: number;
  moduleTitle: string;
  locale: Locale;
  slideIds: readonly string[];
  initialIndex: number;
}) {
  const params = useSearchParams();
  useModuleFixtures(moduleById(moduleId).fixtures);
  const mode: DeckMode = params.get("presenter") === "1" ? "presenter" : params.get("print") === "1" ? "print" : "present";
  const bySlideId = use(loadSlides(moduleId, locale));
  const slides = useMemo(() => slideIds.map((id) => bySlideId[id]).filter(Boolean), [bySlideId, slideIds]);
  return <Deck moduleId={moduleId} moduleOrder={moduleOrder} moduleTitle={moduleTitle} locale={locale} slides={slides} initialIndex={initialIndex} mode={mode} />;
}
