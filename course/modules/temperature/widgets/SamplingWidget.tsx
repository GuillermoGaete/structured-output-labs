"use client";

import { useState } from "react";
import { CutoffInputs } from "@/components/shared/CutoffInputs";
import { SoftmaxBars } from "@/components/shared/SoftmaxBars";
import { TemperatureSlider } from "@/components/shared/TemperatureSlider";
import { useLocale, useT } from "@/i18n/client";
import { softmaxView } from "@/lib/math";
import type { ModuleUi } from "@/modules/types";
import { LoadedDie } from "./LoadedDie";
import { PROMPTS, type PromptId } from "../presets";
import { useLogits } from "./useLogits";

export function barLabels(ui: ModuleUi) {
  return {
    logits: ui.logits,
    probabilities: ui.probabilities,
    everythingElse: ui.everythingElse,
    tokens: ui.tokens,
    entropy: ui.entropy,
    choices: ui.choices,
    greedyNote: ui.greedyNote,
    cutNote: ui.cutNote,
  };
}

/** Slide-embeddable: one prompt's distribution with the controls the slide asks for. */
export function SamplingWidget({ prompt, ui, controls = ["temperature"], initialTemperature = 1, showDie = false, rows = 8 }: { prompt: PromptId; ui: ModuleUi; controls?: ("temperature" | "cutoffs")[]; initialTemperature?: number; showDie?: boolean; rows?: number }) {
  const t = useT();
  const locale = useLocale();
  const [temperature, setTemperature] = useState(initialTemperature);
  const [topK, setTopK] = useState(0);
  const [topP, setTopP] = useState(1);
  const state = useLogits(PROMPTS[prompt], 0);
  if (state.missing) return <p className="text-warn">{t.dataSource.noRecording}</p>;
  if (state.error) return <p className="text-critical">{state.error}</p>;
  if (!state.data) return <p className="text-muted">{t.common.loading}</p>;
  const { top, tail } = state.data;
  const view = softmaxView(top, tail, { temperature, topK, topP });
  return (
    <div className="flex flex-col gap-4" data-hotkeys="local">
      <SoftmaxBars
        top={top}
        tail={tail}
        temperature={temperature}
        topK={topK}
        topP={topP}
        rows={rows}
        labels={barLabels(ui)}
        locale={locale}
        arrowSlot={
          <div className="flex w-56 flex-col gap-2">
            <span className="mono text-sm text-ink-2">softmax(z / T) →</span>
            {controls.includes("temperature") && <TemperatureSlider value={temperature} onChange={setTemperature} label={ui.temperature} greedyLabel={ui.greedy} locale={locale} />}
            {controls.includes("cutoffs") && <CutoffInputs topK={topK} topP={topP} onChange={(p) => { if (p.topK !== undefined) setTopK(p.topK); if (p.topP !== undefined) setTopP(p.topP); }} labels={{ topK: ui.topK, topP: ui.topP, off: ui.off }} locale={locale} />}
          </div>
        }
      />
      {showDie && <LoadedDie top={top} view={view} seed={7} ui={ui} locale={locale} />}
    </div>
  );
}
