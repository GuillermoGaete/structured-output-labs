import type { ModuleUi } from "@/modules/types";
import type { ScrubberLabels } from "@/components/scrubber/Scrubber";

/** The scrubber's strings come from the module dictionary under the `tm_` prefix. */
export function scrubberLabels(ui: ModuleUi): ScrubberLabels {
  const g = (k: string) => ui[`tm_${k}`] ?? k;
  return {
    step: g("step"), chosen: g("chosen"), allowed: g("allowed"), kept: g("kept"), removed: g("removed"), state: g("state"), depth: g("depth"),
    overridden: g("overridden"), overriddenText: g("overriddenText"), notOverridden: g("notOverridden"), original: g("original"), forced: g("forced"),
    originalNote: g("originalNote"), forcedNote: g("forcedNote"), noMask: g("noMask"), legend: g("legend"),
    first: g("first"), prev: g("prev"), play: g("play"), pause: g("pause"), next: g("next"), last: g("last"), textSoFar: g("textSoFar"), compact: g("compactRun"),
    engine: g("engine"), meanKept: g("meanKept"), meanRemoved: g("meanRemoved"), minAllowed: g("minAllowed"), maxDepth: g("maxDepth"), compile: g("compile"),
    cached: g("cached"), fresh: g("fresh"), tokPerS: g("tokPerS"), overriddenCount: g("overriddenCount"),
  };
}
