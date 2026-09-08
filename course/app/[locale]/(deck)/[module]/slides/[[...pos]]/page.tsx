import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DeckHost } from "@/components/deck/DeckHost";
import { isLocale } from "@/i18n/config";
import { MODULE_IDS, isModuleId, moduleById } from "@/modules";

export function generateStaticParams() {
  return MODULE_IDS.map((module) => ({ module }));
}

/** `pos` is a 1-based number or a slide id; missing means the first slide. */
export default async function SlidesPage({ params }: { params: Promise<{ locale: string; module: string; pos?: string[] }> }) {
  const { locale, module, pos } = await params;
  if (!isLocale(locale) || !isModuleId(module)) notFound();
  const def = moduleById(module);
  const raw = pos?.[0] ?? "1";
  const byNumber = /^\d+$/.test(raw) ? Number(raw) - 1 : -1;
  const byId = def.slideIds.indexOf(raw);
  const index = byId >= 0 ? byId : Math.min(Math.max(byNumber, 0), def.slideIds.length - 1);
  return (
    <Suspense fallback={null}>
      <DeckHost moduleId={def.id} moduleOrder={def.order} moduleTitle={def.title[locale]} locale={locale} slideIds={def.slideIds} initialIndex={index} />
    </Suspense>
  );
}
