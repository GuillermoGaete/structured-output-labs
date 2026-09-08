import { notFound } from "next/navigation";
import { DataSourceSwitch } from "@/components/shell/DataSourceSwitch";
import { ModuleTabs } from "@/components/shell/ModuleTabs";
import { isLocale } from "@/i18n/config";
import { MODULE_IDS, isModuleId, moduleById } from "@/modules";

type Params = Promise<{ locale: string; module: string }>;

export function generateStaticParams() {
  return MODULE_IDS.map((module) => ({ module }));
}

export default async function ModuleLayout({ children, params }: { children: React.ReactNode; params: Params }) {
  const { locale, module } = await params;
  if (!isLocale(locale) || !isModuleId(module)) notFound();
  const def = moduleById(module);
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-4">
        <div className="flex flex-col gap-2">
          <span className="eyebrow self-start">M{def.order}</span>
          <h1 className="text-2xl font-extrabold tracking-tight">{def.title[locale]}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <ModuleTabs moduleId={def.id} slideCount={def.slideIds.length} />
          <DataSourceSwitch />
        </div>
      </header>
      {children}
    </div>
  );
}
