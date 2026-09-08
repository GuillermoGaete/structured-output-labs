import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/server";
import { isModuleId, moduleById } from "@/modules";

export default async function ModuleOverview({ params }: { params: Promise<{ locale: string; module: string }> }) {
  const { locale, module } = await params;
  if (!isLocale(locale) || !isModuleId(module)) notFound();
  const def = moduleById(module);
  const t = await getDictionary(locale);
  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-3xl text-lg text-ink-2">{def.summary[locale]}</p>
      <div className="flex gap-2">
        <Link href={`/${locale}/${def.id}/slides/1`} className="btn btn-primary">
          {t.home.openSlides} · {def.slideIds.length}
        </Link>
        <Link href={`/${locale}/${def.id}/lab`} className="btn">
          {t.home.openLab}
        </Link>
      </div>
    </div>
  );
}
