import Link from "next/link";
import { notFound } from "next/navigation";
import { BackendSettings } from "@/components/backend/BackendSettings";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/server";
import { MODULES } from "@/modules";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = await getDictionary(locale);
  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-4">
        <span className="eyebrow self-start">{t.course.name}</span>
        <h1 className="max-w-3xl text-4xl font-extrabold tracking-tight">{t.home.title}</h1>
        <p className="max-w-3xl text-lg text-ink-2">{t.home.intro}</p>
        <pre className="panel mono overflow-x-auto p-4 text-sm text-ink-2">{t.home.spine}</pre>
      </header>
      <ol className="grid gap-4 md:grid-cols-2">
        {MODULES.map((m) => {
          const offline = m.fixtures.length > 0 || m.endpoints.length === 0;
          return (
            <li key={m.id} className="panel flex flex-col gap-3 p-5">
              <div className="flex items-center justify-between gap-3">
                <span className="eyebrow">M{m.order}</span>
                <span className={`text-[11px] font-semibold ${offline ? "text-good" : "text-muted"}`}>{offline ? t.home.offline : t.home.needsBackend}</span>
              </div>
              <h2 className="text-xl font-extrabold tracking-tight">{m.title[locale]}</h2>
              <p className="text-sm text-ink-2">{m.summary[locale]}</p>
              <div className="mt-auto flex gap-2">
                <Link href={`/${locale}/${m.id}/slides/1`} className="btn btn-primary">
                  {t.home.openSlides} · {m.slideIds.length}
                </Link>
                <Link href={`/${locale}/${m.id}/lab`} className="btn">
                  {t.home.openLab}
                </Link>
              </div>
            </li>
          );
        })}
      </ol>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-extrabold tracking-tight">{t.home.backendSection}</h2>
        <BackendSettings />
      </section>
    </div>
  );
}
