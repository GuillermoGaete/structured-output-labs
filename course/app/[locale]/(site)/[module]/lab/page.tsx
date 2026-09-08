import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LabHost } from "@/components/LabHost";
import { isLocale } from "@/i18n/config";
import { isModuleId, moduleById } from "@/modules";

export default async function LabPage({ params }: { params: Promise<{ locale: string; module: string }> }) {
  const { locale, module } = await params;
  if (!isLocale(locale) || !isModuleId(module)) notFound();
  const def = moduleById(module);
  const ui = (await def.ui[locale]()).default;
  return (
    <Suspense fallback={<div className="panel p-6 text-sm text-muted">…</div>}>
      <LabHost moduleId={def.id} locale={locale} ui={ui} />
    </Suspense>
  );
}
