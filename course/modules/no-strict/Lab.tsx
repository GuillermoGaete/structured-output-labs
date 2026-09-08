"use client";

import { useState } from "react";
import { useBackend } from "@/components/backend/BackendProvider";
import { ExperimentControls } from "@/components/experiments/ExperimentControls";
import { RunOneMore } from "@/components/experiments/RunOneMore";
import { RunOutputDrawer } from "@/components/experiments/RunOutputDrawer";
import { RunsTable } from "@/components/experiments/RunsTable";
import { RunSummaryBar } from "@/components/experiments/RunSummaryBar";
import { useExperimentFixtures } from "@/components/experiments/useExperimentFixture";
import { useDataSource, useModuleFixtures } from "@/data/DataSourceProvider";
import { useLocale, useT } from "@/i18n/client";
import { baseRequest, DEFAULT_PARAMS } from "@/lib/experiments/base";
import { useExperiment, useRunner } from "@/lib/experiments/store";
import { experimentKey, type ConstraintMode } from "@/lib/experiments/types";
import { codecs, useUrlState, type UrlSchema } from "@/lib/urlState";
import type { LabProps } from "@/modules/types";
import { FIXTURES } from "./fixtures";

interface State {
  preset: "person" | "invoice";
  json: boolean;
  n: number;
  T: number;
  p: number;
  max: number;
  sp: boolean;
  run: string;
}

const SCHEMA: UrlSchema<State> = {
  preset: { codec: codecs.enumOf(["person", "invoice"] as const), default: DEFAULT_PARAMS.preset },
  json: { codec: codecs.boolean(), default: false },
  n: { codec: codecs.number({ min: 1, max: 50 }), default: 8 },
  T: { codec: codecs.number({ min: 0, max: 1.5 }), default: DEFAULT_PARAMS.temperature },
  p: { codec: codecs.number({ min: 0.1, max: 1 }), default: DEFAULT_PARAMS.topP },
  max: { codec: codecs.number({ min: 8, max: 200 }), default: DEFAULT_PARAMS.maxTokens },
  sp: { codec: codecs.boolean(), default: DEFAULT_PARAMS.schemaInPrompt },
  run: { codec: codecs.string(), default: "" },
};

export default function NoStrictLab({ ui }: LabProps) {
  const t = useT();
  const locale = useLocale();
  useModuleFixtures(FIXTURES);
  useExperimentFixtures();
  const { presets } = useBackend();
  const { effective } = useDataSource();
  const [state, update] = useUrlState(SCHEMA);
  const params = { preset: state.preset, temperature: state.T, topP: state.p, maxTokens: state.max, schemaInPrompt: state.sp };
  const base = baseRequest(params, presets);
  const key = experimentKey(base, state.preset);
  const modes: ConstraintMode[] = state.json ? ["plain", "json_mode"] : ["plain"];
  const { runs } = useExperiment(key);
  const runner = useRunner(key, base);
  const [copiedTick, setCopiedTick] = useState(0);
  void copiedTick;

  const fixtureRuns = runs.filter((r) => r.source === "fixture").sort((a, b) => (a.seed ?? 0) - (b.seed ?? 0));
  const liveRuns = runs.filter((r) => r.source !== "fixture");
  const shown = [...modes.flatMap((m) => fixtureRuns.filter((r) => r.mode === m).slice(0, state.n)), ...liveRuns.filter((r) => modes.includes(r.mode))];
  const selected = shown.find((r) => r.id === state.run) ?? null;
  const maxFixturePerMode = Math.max(...modes.map((m) => fixtureRuns.filter((r) => r.mode === m).length), 0);
  const noRecording = fixtureRuns.length === 0;

  return (
    <div className="flex flex-col gap-5">
      <ExperimentControls params={params} onChange={(patch) => update({ ...(patch.preset ? { preset: patch.preset } : {}), ...(patch.temperature !== undefined ? { T: patch.temperature } : {}), ...(patch.topP !== undefined ? { p: patch.topP } : {}), ...(patch.maxTokens !== undefined ? { max: patch.maxTokens } : {}), ...(patch.schemaInPrompt !== undefined ? { sp: patch.schemaInPrompt } : {}) })} ui={ui}>
        <label className="ml-2 inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={state.json} onChange={(e) => update({ json: e.target.checked })} /> {ui.includeJson}
        </label>
        <label className="inline-flex items-center gap-2 text-sm">
          {ui.rowsPerMode} <input type="number" className="input w-16 text-xs" min={1} max={50} value={state.n} onChange={(e) => update({ n: Number(e.target.value) || 8 })} />
        </label>
        <span className="ml-auto text-xs text-muted">{effective === "recorded" ? ui.recordedHint : ui.liveHint}</span>
      </ExperimentControls>

      {noRecording && <p className="text-sm text-warn">{ui.keyHint}</p>}

      <RunSummaryBar runs={shown} modes={modes} ui={ui} locale={locale} />

      <section className="panel-raised flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-extrabold tracking-tight">{ui.runsTitle}</h2>
          <span className="text-xs text-muted">{ui.liveMark}</span>
          <div className="ml-auto">
            <RunOneMore runner={runner} onRun={() => void runner.runMany(modes, 1)} onReveal={() => update({ n: state.n + 1 })} canReveal={state.n < maxFixturePerMode} ui={ui} />
          </div>
        </div>
        <RunsTable runs={shown} selectedId={selected?.id ?? null} onSelect={(r) => { update({ run: r.id }); setCopiedTick((x) => x + 1); }} ui={ui} locale={locale} showMode={modes.length > 1} />
        {selected && (
          <div className="panel p-4">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{ui.selectedRun}</span>
            <RunOutputDrawer run={selected} ui={ui} />
          </div>
        )}
        {runner.running && (
          <button type="button" className="btn self-start text-xs" onClick={runner.stop}>
            {t.common.stop}
          </button>
        )}
      </section>
    </div>
  );
}
