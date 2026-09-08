import { EXPERIMENT_UI } from "@/lib/experiments/ui";
import type { ModuleUi } from "@/modules/types";

const ui: ModuleUi = {
  ...EXPERIMENT_UI.en,
  "labTitle": "Bench Lab",
  "labIntro": "What the constraint costs, measured on the same runs: compile, prefill, per token, and the cost of retries.",
  "perMode": "New runs per mode",
  "recordedHint": "Recorded mode: timings come from the recordings (see the hardware next to the title).",
  "liveHint": "Live: “Run N more” adds runs in all three modes, sequentially.",
  "chartsTitle": "Timings per mode",
  "expectedToValid": "until one valid JSON",
  "expectedHint": "Expected time until one valid JSON when failures are retried: total / p(ok).",
  "tokPerS": "tok/s",
  "chartTotal": "Total time per run",
  "chartTotalNote": "dots = runs · bar = median · tick = p90",
  "chartPerToken": "Milliseconds per token (decode)",
  "chartPerTokenNote": "the forward pass dominates; the mask adds tenths of a ms",
  "chartPrefill": "Prefill (the pass over the prompt)",
  "chartPrefillNote": "median per mode",
  "chartCompile": "Compile and mask (strict)",
  "chartCompileNote": "first time vs cached index · total mask time per run",
  "compileCold": "compile, cold",
  "compileWarm": "compile, cached",
  "compileNoCold": "No run paid the compile: the index was already cached.",
  "maskPerRun": "mask, per run",
  "chartTimeline": "Milliseconds per step",
  "chartTimelineNote": "mean over the full runs · the first step includes the prefill",
  "readingTitle": "How to read it",
  "reading1": "The constraint costs one compile per (schema, vocabulary), cached afterwards, and one lookup per token that vanishes next to the forward pass.",
  "reading2": "Without a constraint the model tends to write more tokens (fences, extra text) and sometimes needs a retry: “until one valid JSON” is the metric that matters.",
  "reading3": "On another machine the numbers change; the ratios between modes do not.",
};

export default ui;
