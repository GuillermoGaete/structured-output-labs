"use client";

import { useEffect, useState } from "react";
import { useDataSource, useModuleFixtures } from "@/data/DataSourceProvider";
import { useT } from "@/i18n/client";
import { codecs, useUrlState, type UrlSchema } from "@/lib/urlState";
import type { LabProps } from "@/modules/types";
import { FIXTURES } from "./fixtures";
import { LOOP_PROMPTS, fixtureFor, type LoopPresetId } from "./presets";
import { InferenceLoop } from "./widgets/InferenceLoop";
import type { LoopSpeed } from "./widgets/useForwardLoop";

interface State {
  preset: LoopPresetId | "custom";
  q: string;
  tpl: boolean;
  T: number;
  k: number;
  p: number;
  seed: number;
  max: number;
  speed: LoopSpeed;
  rows: number;
  layer: number;
  tab: "output" | "block";
}

const SCHEMA: UrlSchema<State> = {
  preset: { codec: codecs.enumOf(["person", "capital", "fibonacci", "custom"] as const), default: "person" },
  q: { codec: codecs.string(), default: "" },
  tpl: { codec: codecs.boolean(), default: true },
  T: { codec: codecs.number({ min: 0, max: 2 }), default: 0 },
  k: { codec: codecs.number({ min: 0, max: 200 }), default: 0 },
  p: { codec: codecs.number({ min: 0.05, max: 1 }), default: 1 },
  seed: { codec: codecs.number({ min: 0 }), default: 7 },
  max: { codec: codecs.number({ min: 1, max: 120 }), default: 48 },
  speed: { codec: codecs.enumOf(["slow", "real", "fast"] as const), default: "real" },
  rows: { codec: codecs.number({ min: 4, max: 20 }), default: 8 },
  layer: { codec: codecs.number({ min: 0, max: 47 }), default: 11 },
  tab: { codec: codecs.enumOf(["output", "block"] as const), default: "output" },
};

export default function NextTokenLab({ ui }: LabProps) {
  const t = useT();
  useModuleFixtures(FIXTURES);
  const { effective, setActiveFixture } = useDataSource();
  const [state, update, meta] = useUrlState(SCHEMA);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const prompt = state.preset === "custom" ? state.q : LOOP_PROMPTS[state.preset].prompt;
  const useChatTemplate = state.preset === "custom" ? state.tpl : LOOP_PROMPTS[state.preset].useChatTemplate;

  useEffect(() => {
    setActiveFixture(fixtureFor(state.preset, state.T));
  }, [state.preset, state.T, setActiveFixture]);

  return (
    <div className="flex flex-col gap-5">
      <section className="panel flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(LOOP_PROMPTS) as LoopPresetId[]).map((id) => (
            <button key={id} type="button" className={`btn text-xs ${state.preset === id ? "btn-primary" : ""}`} onClick={() => update({ preset: id })}>
              {ui[`preset_${id}`] ?? id}
            </button>
          ))}
          <button type="button" className={`btn text-xs ${state.preset === "custom" ? "btn-primary" : ""}`} onClick={() => { setDraft(prompt); setEditing(true); }}>
            {ui.preset_custom}
          </button>
          <span className="ml-auto text-xs text-muted">{effective === "recorded" ? ui.recordedHint : ui.liveHint}</span>
        </div>
        {editing && (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              update({ preset: "custom", q: draft });
              setEditing(false);
            }}
          >
            <textarea className="input mono min-h-[64px] text-[13px]" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={ui.promptLabel} spellCheck={false} />
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={state.tpl} onChange={(e) => update({ tpl: e.target.checked })} /> {ui.chatTemplate}
              </label>
              <button type="submit" className="btn btn-primary text-xs">
                {ui.apply}
              </button>
              <button type="button" className="btn text-xs" onClick={() => setEditing(false)}>
                {t.common.reset}
              </button>
            </div>
          </form>
        )}
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="inline-flex items-center gap-2">
            {ui.seed} <input type="number" className="input w-20 text-xs" min={0} value={state.seed} onChange={(e) => update({ seed: Number(e.target.value) || 0 })} />
          </label>
          <label className="inline-flex items-center gap-2">
            {ui.maxSteps} <input type="number" className="input w-20 text-xs" min={1} max={120} value={state.max} onChange={(e) => update({ max: Number(e.target.value) || 48 })} />
          </label>
          <label className="inline-flex items-center gap-2">
            {ui.rows} <input type="number" className="input w-16 text-xs" min={4} max={20} value={state.rows} onChange={(e) => update({ rows: Number(e.target.value) || 8 })} />
          </label>
          <button type="button" className="btn ml-auto text-xs" onClick={() => navigator.clipboard?.writeText(window.location.origin + meta.href).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}>
            {copied ? t.common.copied : t.common.copyLink}
          </button>
        </div>
      </section>
      <InferenceLoop
        params={{ prompt, useChatTemplate, temperature: state.T, topK: state.k, topP: state.p, seed: state.seed, maxSteps: state.max, topKReport: 12 }}
        speed={state.speed}
        onSpeed={(speed) => update({ speed })}
        rows={state.rows}
        ui={ui}
        layer={state.layer}
        onLayer={(layer) => update({ layer })}
        tab={state.tab}
        onTab={(tab) => update({ tab })}
        onSampler={(patch) => update({ ...(patch.temperature !== undefined ? { T: patch.temperature } : {}), ...(patch.topK !== undefined ? { k: patch.topK } : {}), ...(patch.topP !== undefined ? { p: patch.topP } : {}) })}
        onEdit={() => { setDraft(prompt); setEditing(true); }}
      />
    </div>
  );
}
