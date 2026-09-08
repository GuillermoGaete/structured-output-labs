import { EXPERIMENT_UI } from "@/lib/experiments/ui";
import type { ModuleUi } from "@/modules/types";

const ui: ModuleUi = {
  ...EXPERIMENT_UI.en,
  "labTitle": "Experiment Runner · without strict mode",
  "labIntro": "The same prompt N times, asking for JSON with words only. Sometimes it fails.",
  "includeJson": "Include JSON mode (the middle rung)",
  "runsTitle": "Runs",
  "recordedHint": "Recorded mode: the recorded runs are shown; “reveal” adds the next one.",
  "liveHint": "Live: every run is a real generation (5–15 s).",
};

export default ui;
