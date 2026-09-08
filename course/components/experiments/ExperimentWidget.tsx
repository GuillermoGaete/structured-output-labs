"use client";

import { useState } from "react";
import { useBackend } from "@/components/backend/BackendProvider";
import { useLocale } from "@/i18n/client";
import { baseRequest, DEFAULT_PARAMS, type ExperimentPresetId } from "@/lib/experiments/base";
import { useExperiment, useRunner } from "@/lib/experiments/store";
import { experimentKey, type ConstraintMode, type Run } from "@/lib/experiments/types";
import type { ModuleUi } from "@/modules/types";
import { RunOneMore } from "./RunOneMore";
import { RunOutputDrawer } from "./RunOutputDrawer";
import { RunsTable } from "./RunsTable";
import { RunSummaryBar } from "./RunSummaryBar";
import { useExperimentFixtures } from "./useExperimentFixture";

/** Slide-embeddable experiment: summary per mode, the first rows, and "run one more" when live. */
export function ExperimentWidget({ modes, preset = "invoice", rows = 6, ui, showTable = true }: { modes: ConstraintMode[]; preset?: ExperimentPresetId; rows?: number; ui: ModuleUi; showTable?: boolean }) {
  const locale = useLocale();
  const { presets } = useBackend();
  useExperimentFixtures();
  const [schemaInPrompt, setSchemaInPrompt] = useState(DEFAULT_PARAMS.schemaInPrompt);
  const base = baseRequest({ ...DEFAULT_PARAMS, preset, schemaInPrompt }, presets);
  const key = experimentKey(base, preset);
  const { runs } = useExperiment(key);
  const runner = useRunner(key, base);
  const [selected, setSelected] = useState<Run | null>(null);
  const shown = runs.filter((r) => modes.includes(r.mode)).sort((a, b) => (a.seed ?? 0) - (b.seed ?? 0)).slice(0, rows * modes.length);
  return (
    <div className="flex flex-col gap-3" data-hotkeys="local">
      <label className="inline-flex items-center gap-2 self-end text-sm">
        <input type="checkbox" checked={schemaInPrompt} onChange={(e) => setSchemaInPrompt(e.target.checked)} /> {ui.schemaInPrompt}
      </label>
      <RunSummaryBar runs={runs} modes={modes} ui={ui} locale={locale} />
      {showTable && <RunsTable runs={shown} selectedId={selected?.id ?? null} onSelect={setSelected} ui={ui} locale={locale} showMode={modes.length > 1} />}
      {selected && (
        <div className="panel p-3">
          <RunOutputDrawer run={selected} ui={ui} />
        </div>
      )}
      <RunOneMore runner={runner} onRun={() => void runner.runMany(modes, 1)} ui={ui} />
    </div>
  );
}
