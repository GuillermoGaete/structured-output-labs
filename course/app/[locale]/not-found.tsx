"use client";

import Link from "next/link";
import { useHref, useT } from "@/i18n/client";

export default function NotFound() {
  const t = useT();
  const href = useHref();
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-5 py-24">
      <h1 className="text-3xl font-extrabold tracking-tight">{t.notFound.title}</h1>
      <p className="text-ink-2">{t.notFound.body}</p>
      <Link href={href("/")} className="btn self-start">
        {t.notFound.home}
      </Link>
    </main>
  );
}
