"use client";

import { useEffect, useState } from "react";
import { CutoffInputs } from "@/components/shared/CutoffInputs";
import { SoftmaxBars } from "@/components/shared/SoftmaxBars";
import { TemperatureSlider } from "@/components/shared/TemperatureSlider";
import { useDataSource, useModuleFixtures } from "@/data/DataSourceProvider";
import { useLocale, useT } from "@/i18n/client";
import { softmaxView } from "@/lib/math";
import { formatInt } from "@/lib/tokens";
import type { LogitsRequest } from "@/lib/types";
import { codecs, useUrlState, type UrlSchema } from "@/lib/urlState";
import type { LabProps } from "@/modules/types";
import { FIXTURES } from "./fixtures";
import { PROMPTS, type PromptId } from "./presets";
import { LoadedDie } from "./widgets/LoadedDie";
import { barLabels } from "./widgets/SamplingWidget";
import { useLogits } from "./widgets/useLogits";

interface State {
  preset: PromptId | "custom";
  q: string;
  tpl: boolean;
  T: number;
  k: number;
  p: number;
  seed: number;
  rows: number;
  log: boolean;
  cmp: boolean;
}

const SCHEMA: UrlSchema<State> = {
  preset: { codec: codecs.enumOf(["person", "tree", "capital", "fibonacci", "custom"] as const), default: "person" },
  q: { codec: codecs.string(), default: "" },
  tpl: { codec: codecs.boolean(), default: true },
  T: { codec: codecs.number({ min: 0, max: 2 }), default: 1 },
  k: { codec: codecs.number({ min: 0, max: 200 }), default: 0 },
  p: { codec: codecs.number({ min: 0.05, max: 1 }), default: 1 },
  seed: { codec: codecs.number({ min: 0 }), default: 7 },
  rows: { codec: codecs.number({ min: 3, max: 20 }), default: 10 },
  log: { codec: codecs.boolean(), default: false },
  cmp: { codec: codecs.boolean(), default: false },
};

export default function TemperatureLab({ ui }: LabProps) {
  const t = useT();
  const locale = useLocale();
  useModuleFixtures(FIXTURES);
  const { effective } = useDataSource();
  const [state, update, meta] = useUrlState(SCHEMA);
  const request: LogitsRequest | null =
    state.preset === "custom"
      ? state.q.trim()
        ? { prompt: state.q, use_chat_template: state.tpl, top_k: 200, tail_buckets: 64, full_logits: false }
        : null
      : PROMPTS[state.preset];
  const [draft, setDraft] = useState(request?.prompt ?? "");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(request?.prompt ?? "");
  }, [request?.prompt]);
  const logits = useLogits(request);
  const [copied, setCopied] = useState(false);
  const labels = barLabels(ui);
  const data = logits.data;
  const view = data ? softmaxView(data.top, data.tail, { temperature: state.T, topK: state.k, topP: state.p }) : null;

  return (
    <div className="flex flex-col gap-6">
      <section className="panel flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(PROMPTS) as PromptId[]).map((id) => (
            <button key={id} type="button" className={`btn text-xs ${state.preset === id ? "btn-primary" : ""}`} onClick={() => update({ preset: id })}>
              {ui[`preset_${id}`] ?? id}
            </button>
          ))}
          <button type="button" className={`btn text-xs ${state.preset === "custom" ? "btn-primary" : ""}`} onClick={() => update({ preset: "custom", q: draft })}>
            {ui.preset_custom}
          </button>
          <span className="ml-auto text-xs text-muted">{effective === "recorded" ? ui.recordedHint : ui.liveHint}</span>
        </div>
        <textarea className="input mono min-h-[64px] text-[13px]" value={draft} onChange={(e) => { setDraft(e.target.value); update({ preset: "custom", q: e.target.value }); }} spellCheck={false} aria-label={ui.promptLabel} />
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={state.tpl} disabled={state.preset !== "custom"} onChange={(e) => update({ tpl: e.target.checked })} /> {ui.chatTemplate}
          </label>
          <label className="inline-flex items-center gap-2">
            {ui.rows} <input type="number" className="input w-16 text-xs" min={3} max={20} value={state.rows} onChange={(e) => update({ rows: Number(e.target.value) || 10 })} />
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={state.log} onChange={(e) => update({ log: e.target.checked })} /> {ui.logScale}
          </label>
          <label className="inline-flex items-center gap-2">
            {ui.seed} <input type="number" className="input w-20 text-xs" min={0} value={state.seed} onChange={(e) => update({ seed: Number(e.target.value) || 0 })} />
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={state.cmp} onChange={(e) => update({ cmp: e.target.checked })} /> {ui.compare}
          </label>
          <button type="button" className="btn ml-auto text-xs" onClick={() => navigator.clipboard?.writeText(window.location.origin + meta.href).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}>
            {copied ? t.common.copied : t.common.copyLink}
          </button>
        </div>
      </section>

      <section className="panel-raised flex flex-col gap-5 p-5">
        {logits.missing && <p className="text-sm text-warn">{t.dataSource.noRecording}</p>}
        {logits.error && <p className="text-sm text-critical">{logits.error}</p>}
        {data && view && (
          <div className={`flex flex-col gap-5 ${logits.loading ? "opacity-60" : ""}`}>
            <p className="text-sm text-ink-2">
              {ui.stepZeroIntro} <span className="mono">{formatInt(data.vocab_size, locale)}</span> {ui.stepZeroIntroTail}
            </p>
            <SoftmaxBars
              top={data.top}
              tail={data.tail}
              temperature={state.T}
              topK={state.k}
              topP={state.p}
              rows={state.rows}
              log={state.log}
              labels={labels}
              locale={locale}
              arrowSlot={
                <div className="flex w-60 flex-col gap-3">
                  <span className="mono text-sm text-ink-2">softmax(z / T) →</span>
                  <TemperatureSlider value={state.T} onChange={(v) => update({ T: v })} label={ui.temperature} greedyLabel={ui.greedy} locale={locale} />
                  <CutoffInputs topK={state.k} topP={state.p} onChange={(patch) => update({ ...(patch.topK !== undefined ? { k: patch.topK } : {}), ...(patch.topP !== undefined ? { p: patch.topP } : {}) })} labels={{ topK: ui.topK, topP: ui.topP, off: ui.off }} locale={locale} />
                </div>
              }
            />
            <LoadedDie top={data.top} view={view} seed={state.seed} ui={ui} locale={locale} />
          </div>
        )}
      </section>

      {state.cmp && data && (
        <section className="panel flex flex-col gap-4 p-5">
          <h2 className="text-lg font-extrabold tracking-tight">{ui.compareTitle}</h2>
          <div className="grid gap-6 md:grid-cols-2">
            {[0.2, 1.2].map((T) => (
              <div key={T} className="flex flex-col gap-2">
                <span className="mono text-sm text-ink-2">T = {T.toLocaleString(locale, { minimumFractionDigits: 1 })}</span>
                <SoftmaxBars top={data.top} tail={data.tail} temperature={T} rows={state.rows} log={state.log} labels={labels} locale={locale} layout="probabilities" />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
