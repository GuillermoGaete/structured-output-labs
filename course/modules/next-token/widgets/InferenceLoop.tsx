"use client";

import { useEffect, useRef, useState } from "react";
import { useDataSource } from "@/data/DataSourceProvider";
import { useT } from "@/i18n/client";
import { argmaxIndex, pickWithU, softmaxView } from "@/lib/math";
import type { ModuleUi } from "@/modules/types";
import { BlockStack } from "./BlockStack";
import { BlockView } from "./BlockView";
import { LoopArrow } from "./LoopArrow";
import { LoopTransport } from "./LoopTransport";
import { OutputStage, type SamplerControls } from "./OutputStage";
import { OutputStageMini } from "./OutputStageMini";
import { TokenRow } from "./TokenRow";
import { useForwardLoop, type LoopParams, type LoopSpeed } from "./useForwardLoop";

export interface InferenceLoopProps {
  params: LoopParams;
  speed: LoopSpeed;
  rows?: number;
  ui: ModuleUi;
  compact?: boolean;
  layer?: number;
  onLayer?: (layer: number) => void;
  tab?: "output" | "block";
  onTab?: (tab: "output" | "block") => void;
  onSampler?: SamplerControls["onChange"];
  onSpeed?: (s: LoopSpeed) => void;
  onEdit?: () => void;
}

const TRAVEL: Record<LoopSpeed, number> = { slow: 900, real: 300, fast: 0 };

/** Map row (tokens → blocks → output) + loop band + magnifier. Used by the lab and, compact, by the slides. */
export function InferenceLoop({ params, speed, rows = 8, ui, compact = false, layer: layerProp, onLayer, tab: tabProp, onTab, onSampler, onSpeed, onEdit }: InferenceLoopProps) {
  const t = useT();
  const { effective } = useDataSource();
  const loop = useForwardLoop(params, speed);
  const [localLayer, setLocalLayer] = useState(11);
  const [localTab, setLocalTab] = useState<"output" | "block">("output");
  const [localSpeed, setLocalSpeed] = useState<LoopSpeed>(speed);
  const layer = layerProp ?? localLayer;
  const setLayer = onLayer ?? setLocalLayer;
  const tab = tabProp ?? localTab;
  const setTab = onTab ?? setLocalTab;
  const effSpeed = onSpeed ? speed : localSpeed;
  const setSpeed = onSpeed ?? setLocalSpeed;
  const [samplerLocal, setSamplerLocal] = useState({ temperature: params.temperature, topK: params.topK, topP: params.topP });
  const sampler = onSampler ? { temperature: params.temperature, topK: params.topK, topP: params.topP } : samplerLocal;
  const onSamplerChange: SamplerControls["onChange"] = onSampler ?? ((patch) => setSamplerLocal((s) => ({ ...s, ...patch })));

  // (Re)start when the prompt or the sampler settings change; debounced so a slider drag is one restart.
  const key = JSON.stringify([params.prompt, params.useChatTemplate, sampler.temperature, sampler.topK, sampler.topP, params.seed, effective]);
  const startRef = useRef(loop.start);
  useEffect(() => {
    startRef.current = loop.start;
  });
  useEffect(() => {
    const timer = setTimeout(() => void startRef.current(), 400);
    return () => clearTimeout(timer);
  }, [key]);

  const current = loop.current;
  const response = current?.response ?? null;
  // Only step 0 (the prompt) knows which positions belong to the chat template; later steps send raw ids.
  const templateMask = loop.history[0]?.response.tokens.map((tk) => tk.is_template) ?? [];
  const tokens = response ? response.tokens.map((tk) => (templateMask[tk.position] ? { ...tk, is_template: true, segment: "template" as const } : tk)) : [];
  const view = response ? softmaxView(response.final.top, response.final.tail, { temperature: sampler.temperature, topK: sampler.topK, topP: sampler.topP }) : null;
  const sampled = response?.sampled ?? null;
  const position = response ? response.tokens.length : 0;
  const expectedWinner = view && response ? (view.greedy ? argmaxIndex(response.final.top) : current?.u !== null && current?.u !== undefined ? pickWithU(view, current.u) : null) : null;
  const recordedPath = effective === "recorded" && sampled !== null && expectedWinner !== null && expectedWinner !== "tail" && response !== null && response.final.top[expectedWinner]?.token_id !== sampled.token_id;
  const traveling = loop.phase === "travel";
  const forwarding = loop.phase === "forward";
  const newIndex = loop.index > 0 && response ? response.tokens.length - 1 : null;
  const mapH = compact ? 140 : 220;

  return (
    <div className="flex flex-col gap-3">
      <LoopTransport
        index={loop.index}
        count={loop.history.length}
        positions={position}
        phase={loop.phase}
        playing={loop.playing}
        canStep={loop.canStep}
        lastMs={loop.lastMs}
        speed={effSpeed}
        onStep={() => void loop.step()}
        onPlay={() => loop.setPlaying(!loop.playing)}
        onReset={loop.reset}
        onSpeed={setSpeed}
        onEdit={onEdit}
        effective={effective}
        ui={ui}
        compact={compact}
      />
      {loop.history.length > 1 && !compact && (
        <div className="flex items-center gap-2 text-xs text-ink-2" data-hotkeys="local">
          <button type="button" className="btn text-xs" onClick={() => loop.setIndex(Math.max(0, loop.index - 1))} disabled={loop.index === 0 || loop.playing || forwarding}>
            ◀ {ui.prevStep}
          </button>
          <input type="range" className="max-w-[240px]" min={0} max={loop.history.length - 1} value={loop.index} onChange={(e) => loop.setIndex(Number(e.target.value))} disabled={loop.playing || forwarding} aria-label={ui.step} />
          <button type="button" className="btn text-xs" onClick={() => loop.setIndex(Math.min(loop.history.length - 1, loop.index + 1))} disabled={loop.index >= loop.history.length - 1 || loop.playing || forwarding}>
            {ui.nextStep} ▶
          </button>
        </div>
      )}
      {loop.missing && <p className="text-sm text-warn">{t.dataSource.noRecording}</p>}
      {loop.error && <p className="text-sm text-critical">{loop.error}</p>}
      {response && view && (
        <>
          <div className="grid gap-4 md:grid-cols-[1.3fr_auto_1.15fr]" style={{ minHeight: mapH }}>
            <div className="panel p-3">
              <TokenRow tokens={tokens} newIndex={newIndex} ui={ui} compact={compact} />
            </div>
            <div className="panel px-4 py-3">
              <BlockStack nLayers={response.n_layers} running={forwarding} expectedMs={loop.expectedMs} selected={tab === "block" ? layer : null} onSelect={(l) => { setLayer(l); setTab("block"); }} ui={ui} compact={compact} />
            </div>
            <div className="panel p-3">
              <OutputStageMini final={response.final} view={view} sampled={sampled} temperature={sampler.temperature} position={position} ui={ui} dimmed={forwarding || traveling} />
            </div>
          </div>
          <LoopArrow traveling={traveling} chipText={sampled?.text ?? null} position={position} ui={ui} travelMs={TRAVEL[effSpeed]} />
          <div className="flex items-center gap-2 text-xs" data-hotkeys="local">
            <button type="button" className={`btn text-xs ${tab === "output" ? "btn-primary" : ""}`} onClick={() => setTab("output")}>
              {ui.tabOutput}
            </button>
            <button type="button" className={`btn text-xs ${tab === "block" ? "btn-primary" : ""}`} onClick={() => setTab("block")}>
              {ui.tabBlock} {layer + 1}
            </button>
          </div>
          <div className={`panel-raised ${compact ? "p-3" : "p-4"}`}>
            {tab === "output" ? (
              <OutputStage final={response.final} sampled={sampled} position={position} controls={{ ...sampler, onChange: onSamplerChange }} rows={rows} ui={ui} recordedPath={recordedPath} dimmed={forwarding} compact={compact} />
            ) : (
              <BlockView response={response} tokens={tokens} layer={layer} onLayer={setLayer} ui={ui} />
            )}
          </div>
        </>
      )}
      {!response && !loop.missing && !loop.error && <p className="text-sm text-muted">{t.common.loading}</p>}
    </div>
  );
}
