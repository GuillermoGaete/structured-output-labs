// Shrink a recorded experiment: fields that repeat across the N runs are kept once (the loader restores them).
//   node scripts/compact-experiment.mjs modules/no-strict/fixtures/*.json
import { readFileSync, writeFileSync } from "node:fs";

export function compactExperiment(fixture) {
  const base = fixture.request;
  for (const run of fixture.response.runs) {
    const r = run.request ?? {};
    run.request = { constraint: r.constraint ?? run.constraint, seed: r.seed ?? run.seed, include_steps: r.include_steps ?? run.detail === "full", force_compile: Boolean(r.force_compile) };
    const meta = run.trace?.meta;
    if (meta && run.seed !== 0) {
      meta.prompt_rendered = "";
      meta.regex = null;
    }
    for (const step of run.trace?.steps ?? []) {
      delete step.partial_text; // = the texts so far; rebuilt on load
      if (run.constraint !== "schema") {
        step.top_original = [];
        step.top_forced = [];
      }
    }
  }
  fixture.compacted = { version: 1, restores: ["request from the fixture request", "meta.prompt_rendered/regex from seed 0", "step.partial_text accumulated"] };
  void base;
  return fixture;
}

if (process.argv[1] && process.argv[1].endsWith("compact-experiment.mjs")) {
  for (const path of process.argv.slice(2)) {
    const before = readFileSync(path).length;
    const fixture = JSON.parse(readFileSync(path, "utf8"));
    if (fixture.kind !== "experiment") continue;
    writeFileSync(path, JSON.stringify(compactExperiment(fixture), null, 1) + "\n");
    console.log(`${path}: ${(before / 1024).toFixed(0)} KB → ${(readFileSync(path).length / 1024).toFixed(0)} KB`);
  }
}
