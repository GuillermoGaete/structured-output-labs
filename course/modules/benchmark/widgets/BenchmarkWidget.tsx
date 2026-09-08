"use client";

import { useBackend } from "@/components/backend/BackendProvider";
import { useExperimentFixtures } from "@/components/experiments/useExperimentFixture";
import { baseRequest, DEFAULT_PARAMS } from "@/lib/experiments/base";
import { useExperiment } from "@/lib/experiments/store";
import { experimentKey, MODES } from "@/lib/experiments/types";
import type { ModuleUi } from "@/modules/types";
import { BenchmarkPanel } from "./BenchmarkPanel";

/** Slide-embeddable benchmark over the recorded experiment. */
export function BenchmarkWidget({ ui }: { ui: ModuleUi }) {
  useExperimentFixtures();
  const { presets } = useBackend();
  const base = baseRequest(DEFAULT_PARAMS, presets);
  const { runs } = useExperiment(experimentKey(base, DEFAULT_PARAMS.preset));
  return (
    <div data-hotkeys="local">
      <BenchmarkPanel runs={runs} modes={MODES} ui={ui} compact />
    </div>
  );
}
