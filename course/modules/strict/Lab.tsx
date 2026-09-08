"use client";

import { useBackend } from "@/components/backend/BackendProvider";
import { ExperimentControls } from "@/components/experiments/ExperimentControls";
import { scrubberLabels } from "@/components/experiments/labels";
import { RunOneMore } from "@/components/experiments/RunOneMore";
import { RunOutputDrawer } from "@/components/experiments/RunOutputDrawer";
import { RunsTable } from "@/components/experiments/RunsTable";
import { RunSummaryBar } from "@/components/experiments/RunSummaryBar";
import { useExperimentFixtures } from "@/components/experiments/useExperimentFixture";
import { Scrubber } from "@/components/scrubber/Scrubber";
import { useDataSource, useModuleFixtures } from "@/data/DataSourceProvider";
import { useLocale, useT } from "@/i18n/client";
import { baseRequest, DEFAULT_PARAMS } from "@/lib/experiments/base";
import { useExperiment, useRunner } from "@/lib/experiments/store";
import { experimentKey, type ConstraintMode } from "@/lib/experiments/types";
import { codecs, useUrlState, type UrlSchema } from "@/lib/urlState";
import type { LabProps } from "@/modules/types";
import { FIXTURES } from "./fixtures";
import { MaskLab } from "./widgets/MaskLab";
import { RunCompare } from "./widgets/RunCompare";

interface State {
  preset: "person" | "invoice";
  n: number;
  T: number;
  p: number;
  max: number;
  sp: boolean;
  run: string;
  i: number;
  cmp: boolean;
}

const SCHEMA: UrlSchema<State> = {
  preset: { codec: codecs.enumOf(["person", "invoice"] as const), default: DEFAULT_PARAMS.preset },
  n: { codec: codecs.number({ min: 1, max: 50 }), default: 8 },
  T: { codec: codecs.number({ min: 0, max: 1.5 }), default: DEFAULT_PARAMS.temperature },
  p: { codec: codecs.number({ min: 0.1, max: 1 }), default: DEFAULT_PARAMS.topP },
  max: { codec: codecs.number({ min: 8, max: 200 }), default: DEFAULT_PARAMS.maxTokens },
  sp: { codec: codecs.boolean(), default: DEFAULT_PARAMS.schemaInPrompt },
  run: { codec: codecs.string(), default: "" },
  i: { codec: codecs.number({ min: 0 }), default: 0 },
  cmp: { codec: codecs.boolean(), default: true },
};

export default function StrictLab({ ui }: LabProps) {
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
  const { runs } = useExperiment(key);
  const runner = useRunner(key, base);
  const fixtureRuns = runs.filter((r) => r.source === "fixture").sort((a, b) => (a.seed ?? 0) - (b.seed ?? 0));
  const liveRuns = runs.filter((r) => r.source !== "fixture");
  const strictShown = [...fixtureRuns.filter((r) => r.mode === "strict").slice(0, state.n), ...liveRuns.filter((r) => r.mode === "strict")];
  const selected = strictShown.find((r) => r.id === state.run) ?? strictShown.find((r) => r.detail === "full") ?? null;
  const plainTwin = selected ? runs.find((r) => r.mode === "plain" && r.seed === selected.seed && r.source === selected.source) ?? null : null;
  const modes: ConstraintMode[] = state.cmp ? ["plain", "strict"] : ["strict"];
  const summaryRuns = state.cmp ? [...strictShown, ...fixtureRuns.filter((r) => r.mode === "plain").slice(0, state.n), ...liveRuns.filter((r) => r.mode === "plain")] : strictShown;
  const step0 = selected?.trace.steps[0] ?? null;
  const maxFixture = fixtureRuns.filter((r) => r.mode === "strict").length;

  return (
    <div className="flex flex-col gap-5">
      <ExperimentControls params={params} onChange={(patch) => update({ ...(patch.preset ? { preset: patch.preset } : {}), ...(patch.temperature !== undefined ? { T: patch.temperature } : {}), ...(patch.topP !== undefined ? { p: patch.topP } : {}), ...(patch.maxTokens !== undefined ? { max: patch.maxTokens } : {}), ...(patch.schemaInPrompt !== undefined ? { sp: patch.schemaInPrompt } : {}) })} ui={ui}>
        <label className="ml-2 inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={state.cmp} onChange={(e) => update({ cmp: e.target.checked })} /> {ui.compareSeeds}
        </label>
        <label className="inline-flex items-center gap-2 text-sm">
          {ui.rowsPerMode} <input type="number" className="input w-16 text-xs" min={1} max={50} value={state.n} onChange={(e) => update({ n: Number(e.target.value) || 8 })} />
        </label>
        <span className="ml-auto text-xs text-muted">{effective === "recorded" ? ui.recordedHint : ui.liveHint}</span>
      </ExperimentControls>

      {fixtureRuns.length === 0 && <p className="text-sm text-warn">{ui.keyHint}</p>}
      <RunSummaryBar runs={summaryRuns} modes={modes} ui={ui} locale={locale} />

      <section className="panel-raised flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-extrabold tracking-tight">{ui.runsTitle}</h2>
          <span className="text-xs text-muted">{ui.liveMark}</span>
          <div className="ml-auto">
            <RunOneMore runner={runner} onRun={() => void runner.runMany(state.cmp ? ["plain", "strict"] : ["strict"], 1)} onReveal={() => update({ n: state.n + 1 })} canReveal={state.n < maxFixture} ui={ui} />
          </div>
        </div>
        <RunsTable runs={strictShown} selectedId={selected?.id ?? null} onSelect={(r) => update({ run: r.id, i: 0 })} onScrub={(r) => update({ run: r.id, i: 0 })} ui={ui} locale={locale} showMode={false} />
        {runner.running && (
          <button type="button" className="btn self-start text-xs" onClick={runner.stop}>
            {t.common.stop}
          </button>
        )}
      </section>

      {selected && (
        <section className="panel flex flex-col gap-4 p-4">
          <h2 className="text-lg font-extrabold tracking-tight">{ui.timeMachine}</h2>
          <p className="text-sm text-ink-2">{ui.timeMachineIntro}</p>
          {selected.detail === "full" ? (
            <Scrubber trace={selected.trace} initialIndex={state.i} onIndex={(i) => update({ i })} labels={scrubberLabels(ui)} focusable={false} />
          ) : (
            <p className="text-sm text-muted">{ui.tm_compactRun}</p>
          )}
          <RunOutputDrawer run={selected} ui={ui} />
        </section>
      )}

      {selected && state.cmp && (
        <section className="panel flex flex-col gap-3 p-4">
          <h2 className="text-lg font-extrabold tracking-tight">{ui.compareTitle.replace("{seed}", String(selected.seed ?? "·"))}</h2>
          <RunCompare plain={plainTwin} strict={selected} ui={ui} />
        </section>
      )}

      {step0 && (
        <section className="panel p-4">
          <MaskLab entries={step0.top_original} ui={ui} />
        </section>
      )}
    </div>
  );
}
