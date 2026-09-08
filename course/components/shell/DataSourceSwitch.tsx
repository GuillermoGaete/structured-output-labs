"use client";

import { useDataSource, type DataSourceMode } from "@/data/DataSourceProvider";
import { useT } from "@/i18n/client";

export function DataSourceSwitch() {
  const t = useT();
  const { mode, setMode, effective } = useDataSource();
  const options: DataSourceMode[] = ["auto", "live", "recorded"];
  return (
    <div className="inline-flex items-center gap-2 text-xs text-ink-2" title={t.dataSource.autoHint}>
      <span>{t.dataSource.label}</span>
      <div className="inline-flex overflow-hidden rounded-full border border-rule-2" role="group" aria-label={t.dataSource.label}>
        {options.map((o) => (
          <button
            key={o}
            type="button"
            className={`px-2.5 py-1 font-semibold ${o === mode ? "bg-accent text-accent-ink" : "hover:bg-raised"}`}
            aria-pressed={o === mode}
            onClick={() => setMode(o)}
          >
            {t.dataSource[o]}
          </button>
        ))}
      </div>
      <span className={`inline-block h-2 w-2 rounded-full ${effective === "live" ? "bg-good" : "bg-chosen"}`} aria-hidden="true" />
      <span className="mono">{effective === "live" ? t.dataSource.effectiveLive : t.dataSource.effectiveRecorded}</span>
    </div>
  );
}
