// Record backend responses as fixture files the course loads with no backend.
//   BACKEND_URL=http://127.0.0.1:7860 node scripts/record-fixtures.mjs tokens [temperature ...]
// Writes modules/<id>/fixtures/<fixture>.json and regenerates modules/<id>/fixtures/index.ts.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RECIPES } from "./recipes.mjs";

// Same PRNG as lib/prng.ts, so the browser can regenerate the recorded draws from (seed, step).
function splitmix32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x9e3779b9) >>> 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t = t ^ (t >>> 15);
    t = Math.imul(t, 0x735a2d97);
    t = t ^ (t >>> 15);
    return (t >>> 0) / 4294967296;
  };
}
const uFor = (seed, step) => splitmix32((seed * 1000003 + step * 7919) >>> 0)();

/** Fixtures keep the head-mean of the attention only (24 × n instead of 24 × 14 × n). */
function compactForward(res) {
  if (!res.attention || res.attention.mode !== "last") return res;
  const weights = res.attention.weights.map((heads) => {
    const n = heads[0]?.length ?? 0;
    const mean = new Array(n).fill(0);
    for (const row of heads) for (let p = 0; p < n; p++) mean[p] += row[p];
    return [mean.map((v) => Number((v / heads.length).toFixed(4)))];
  });
  return { ...res, attention: { ...res.attention, weights, heads_recorded: "mean" } };
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const base = (process.env.BACKEND_URL ?? "http://127.0.0.1:7860").replace(/\/+$/, "");
const wanted = process.argv.slice(2);
const modules = wanted.length ? wanted : Object.keys(RECIPES);

async function getJson(path) {
  const res = await fetch(base + path);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}
async function postJson(path, body) {
  const res = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}
async function postSse(path, body) {
  const res = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json", accept: "text/event-stream" }, body: JSON.stringify(body) });
  if (!res.ok || !res.body) throw new Error(`${path} -> ${res.status} ${await res.text()}`);
  const events = [];
  let buffer = "";
  const decoder = new TextDecoder();
  const dispatch = (block) => {
    let event = "message";
    const data = [];
    for (const line of block.split("\n")) {
      if (line.startsWith(":")) continue;
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
    }
    if (data.length) events.push({ event, data: JSON.parse(data.join("\n")) });
  };
  for await (const chunk of res.body) {
    buffer = (buffer + decoder.decode(chunk, { stream: true })).replace(/\r\n?/g, "\n");
    let idx;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      if (block.trim()) dispatch(block);
    }
  }
  if (buffer.trim()) dispatch(buffer);
  return events;
}

const health = await getJson("/health");
const presets = Object.fromEntries((await getJson("/presets")).map((p) => [p.id, p]));
const meta = {
  recorded_at: new Date().toISOString(),
  model_id: health.model_id,
  transformers_version: health.transformers_version,
  torch_version: health.torch_version,
  torch_threads: health.torch_threads,
  backend_version: health.backend_version,
  hardware: process.env.RECORD_HARDWARE ?? `${process.platform} ${process.arch}, ${health.torch_threads} threads`,
};

for (const moduleId of modules) {
  const recipes = RECIPES[moduleId];
  if (!recipes) {
    console.error(`no recipes for module ${moduleId}`);
    continue;
  }
  const dir = join(root, "modules", moduleId, "fixtures");
  mkdirSync(dir, { recursive: true });
  const entries = [];
  for (const recipe of recipes) {
    const request = typeof recipe.request === "function" ? recipe.request({ presets }) : recipe.request;
    const started = Date.now();
    let response;
    let compile;
    if (recipe.kind === "experiment") {
      const runs = [];
      for (const constraint of recipe.modes) {
        for (let seed = 0; seed < recipe.n; seed++) {
          const includeSteps = seed < recipe.full;
          const req = { ...request, constraint, seed, include_steps: includeSteps };
          const t0 = Date.now();
          const events = await postSse("/generate", req);
          const meta_ = events.find((e) => e.event === "meta")?.data ?? null;
          const done = events.find((e) => e.event === "done")?.data ?? null;
          const error = events.find((e) => e.event === "error")?.data?.detail ?? null;
          runs.push({
            constraint,
            seed,
            detail: includeSteps ? "full" : "compact",
            request: req,
            trace: { meta: meta_, steps: events.filter((e) => e.event === "step").map((e) => e.data), done, error },
            wall_ms: Date.now() - t0,
          });
          process.stdout.write(`  ${recipe.id} ${constraint} seed ${seed}: ${done?.validation?.failure_class ?? error} ${Date.now() - t0} ms\n`);
        }
      }
      response = { presetId: recipe.presetId, modes: recipe.modes, n: recipe.n, runs };
    } else if (recipe.kind === "generate") {
      const events = await postSse("/generate", request);
      const meta_ = events.find((e) => e.event === "meta")?.data;
      const done = events.find((e) => e.event === "done")?.data;
      const error = events.find((e) => e.event === "error")?.data;
      if (error) throw new Error(`generate ${recipe.id}: ${error.detail}`);
      response = { meta: meta_, steps: events.filter((e) => e.event === "step").map((e) => e.data), done };
      if (recipe.withCompile) compile = await postJson("/compile", { schema: request.schema, mode: request.mode ?? "auto", constraint: request.constraint ?? "schema" });
    } else if (recipe.kind === "loop") {
      const steps = [];
      let tokenIds = null;
      for (let i = 0; i < recipe.steps; i++) {
        const prompt = request.prompt ?? presets.person.prompt;
        const sample = recipe.seed !== undefined ? { ...request.step.sample, u: uFor(recipe.seed, i) } : request.step.sample;
        const req = tokenIds ? { ...request.step, sample, token_ids: tokenIds } : { ...request.step, sample, prompt, use_chat_template: request.use_chat_template };
        const res = compactForward(await postJson("/forward", req));
        steps.push({ request: req, response: res, u: res.sampled?.u ?? null });
        process.stdout.write(`  ${recipe.id} step ${i} ${JSON.stringify(res.sampled?.text ?? "")} ${res.timing_ms.total} ms\n`);
        if (!res.next_token_ids || res.sampled?.is_eos) break;
        tokenIds = res.next_token_ids;
      }
      response = { steps, prompt: request.prompt ?? presets.person.prompt, use_chat_template: request.use_chat_template, seed: recipe.seed ?? null };
    } else {
      const path = { tokenize: "/tokenize", logits: "/logits", forward: "/forward", compile: "/compile" }[recipe.kind];
      response = await postJson(path, request);
    }
    const file = {
      $schema: "sol-fixture/1",
      id: recipe.id,
      kind: recipe.kind,
      module: moduleId,
      title: recipe.title,
      recordedAt: meta.recorded_at,
      model_id: health.model_id,
      request,
      response,
      ...(compile ? { compile } : {}),
      meta,
    };
    const out = join(dir, `${recipe.id}.json`);
    writeFileSync(out, JSON.stringify(file, null, 1) + "\n");
    const size = readFileSync(out).length;
    entries.push({ id: recipe.id, kind: recipe.kind, title: recipe.title });
    console.log(`${moduleId}/${recipe.id}.json  ${(size / 1024).toFixed(1)} KB  ${Date.now() - started} ms`);
  }
  const index = `// Generated by scripts/record-fixtures.mjs. Do not edit by hand.
import type { FixtureFile, FixtureManifestEntry } from "@/data/fixtures";

const load = (importer: () => Promise<{ default: unknown }>) => () => importer().then((m) => m.default as FixtureFile);

export const FIXTURES: FixtureManifestEntry[] = [
${entries.map((e) => `  { id: ${JSON.stringify(e.id)}, kind: ${JSON.stringify(e.kind)}, title: ${JSON.stringify(e.title)}, load: load(() => import("./${e.id}.json")) },`).join("\n")}
];
`;
  writeFileSync(join(dir, "index.ts"), index);
  console.log(`${moduleId}: ${entries.length} fixtures, index.ts written`);
}
