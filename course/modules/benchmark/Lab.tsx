"use client";

import { useBackend } from "@/components/backend/BackendProvider";
import { ExperimentControls } from "@/components/experiments/ExperimentControls";
import { RunOneMore } from "@/components/experiments/RunOneMore";
import { useExperimentFixtures } from "@/components/experiments/useExperimentFixture";
import { useDataSource, useModuleFixtures } from "@/data/DataSourceProvider";
import { useT } from "@/i18n/client";
import { baseRequest, DEFAULT_PARAMS } from "@/lib/experiments/base";
import { useExperiment, useRunner } from "@/lib/experiments/store";
import { experimentKey, MODES } from "@/lib/experiments/types";
import { codecs, useUrlState, type UrlSchema } from "@/lib/urlState";
import type { LabProps } from "@/modules/types";
import { FIXTURES } from "./fixtures";
import { BenchmarkPanel } from "./widgets/BenchmarkPanel";

interface State {
  preset: "person" | "invoice";
  T: number;
  p: number;
  max: number;
  sp: boolean;
  k: number;
}

const SCHEMA: UrlSchema<State> = {
  preset: { codec: codecs.enumOf(["person", "invoice"] as const), default: "person" },
  T: { codec: codecs.number({ min: 0, max: 1.5 }), default: DEFAULT_PARAMS.temperature },
  p: { codec: codecs.number({ min: 0.1, max: 1 }), default: DEFAULT_PARAMS.topP },
  max: { codec: codecs.number({ min: 8, max: 200 }), default: DEFAULT_PARAMS.maxTokens },
  sp: { codec: codecs.boolean(), default: DEFAULT_PARAMS.schemaInPrompt },
  k: { codec: codecs.number({ min: 1, max: 10 }), default: 3 },
};

export default function BenchmarkLab({ ui }: LabProps) {
  const t = useT();
  useModuleFixtures(FIXTURES);
  useExperimentFixtures();
  const { presets } = useBackend();
  const { effective, loaded } = useDataSource();
  const [state, update] = useUrlState(SCHEMA);
  const params = { preset: state.preset, temperature: state.T, topP: state.p, maxTokens: state.max, schemaInPrompt: state.sp };
  const base = baseRequest(params, presets);
  const key = experimentKey(base, state.preset);
  const { runs } = useExperiment(key);
  const runner = useRunner(key, base);
  const meta = loaded.find((f) => f.kind === "experiment")?.meta;
  return (
    <div className="flex flex-col gap-5">
      <ExperimentControls params={params} onChange={(patch) => update({ ...(patch.preset ? { preset: patch.preset } : {}), ...(patch.temperature !== undefined ? { T: patch.temperature } : {}), ...(patch.topP !== undefined ? { p: patch.topP } : {}), ...(patch.maxTokens !== undefined ? { max: patch.maxTokens } : {}), ...(patch.schemaInPrompt !== undefined ? { sp: patch.schemaInPrompt } : {}) })} ui={ui}>
        <label className="ml-2 inline-flex items-center gap-2 text-sm">
          {ui.perMode} <input type="number" className="input w-16 text-xs" min={1} max={10} value={state.k} onChange={(e) => update({ k: Number(e.target.value) || 3 })} />
        </label>
        <span className="ml-auto text-xs text-muted">{effective === "recorded" ? ui.recordedHint : ui.liveHint}</span>
      </ExperimentControls>
      {runs.length === 0 && <p className="text-sm text-warn">{ui.keyHint}</p>}
      <section className="panel-raised flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-extrabold tracking-tight">{ui.chartsTitle}</h2>
          {meta && (
            <span className="mono text-xs text-muted">
              {meta.model_id} · {meta.hardware} · {meta.recorded_at?.slice(0, 10)}
            </span>
          )}
          <div className="ml-auto">
            <RunOneMore runner={runner} onRun={() => void runner.runMany(MODES, state.k)} n={state.k * MODES.length} ui={ui} />
          </div>
        </div>
        <BenchmarkPanel runs={runs} modes={MODES} ui={ui} />
        {runner.running && (
          <button type="button" className="btn self-start text-xs" onClick={runner.stop}>
            {t.common.stop}
          </button>
        )}
      </section>
      <section className="panel flex flex-col gap-2 p-4 text-sm text-ink-2">
        <h2 className="text-base font-extrabold tracking-tight text-ink">{ui.readingTitle}</h2>
        <ul className="list-disc pl-5">
          <li>{ui.reading1}</li>
          <li>{ui.reading2}</li>
          <li>{ui.reading3}</li>
        </ul>
      </section>
    </div>
  );
}
