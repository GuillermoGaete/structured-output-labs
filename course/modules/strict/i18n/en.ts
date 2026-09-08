import { EXPERIMENT_UI } from "@/lib/experiments/ui";
import type { ModuleUi } from "@/modules/types";

const ui: ModuleUi = {
  ...EXPERIMENT_UI.en,
  "labTitle": "Experiment Runner · with strict mode + Time Machine",
  "labIntro": "The same seeds as in M3, now with the mask. And every run can be scrubbed step by step.",
  "compareSeeds": "Compare with “prompt only” by seed",
  "runsTitle": "Runs with strict mode",
  "recordedHint": "Recorded mode: recorded runs; the first two keep their steps.",
  "liveHint": "Live: every run is a real generation and lands in the Time Machine.",
  "timeMachine": "Time Machine",
  "timeMachineIntro": "Original intent against forced, step by step: struck-through tokens, overridden steps, mass removed, allowed tokens.",
  "compareTitle": "The same seed ({seed}), without and with the mask",
  "maskLabTitle": "Write −∞ yourself",
  "maskLabHint": "Click a step-0 token to forbid it: the rest renormalises.",
  "maskLabRemoved": "mass removed",
  "maskLabReset": "Allow everything",
};

export default ui;
