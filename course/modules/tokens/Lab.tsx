"use client";

import { useT } from "@/i18n/client";
import type { LabProps } from "@/modules/types";

export default function Lab({ ui }: LabProps) {
  const t = useT();
  return (
    <section className="panel-raised p-6 flex flex-col gap-2">
      <h2 className="text-xl font-extrabold tracking-tight">{ui.labTitle}</h2>
      <p className="text-ink-2 max-w-prose">{ui.labIntro}</p>
      <p className="text-sm text-muted">{t.common.comingSoon}</p>
    </section>
  );
}
