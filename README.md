# Structured Output Labs

One screen for **constrained decoding**: paste a Pydantic model, watch a small language model fill it in, and scrub
through every token while [outlines](https://github.com/dottxt-ai/outlines) writes `−∞` over what the schema forbids.

The whole pipeline, left to right, on one page:

```
Pydantic model ──▶ JSON Schema ──▶ regex ──▶ token automaton ──▶ mask ──▶ the token that was sampled
```

- **Setup column** — only what defines the run, in sections that fold to one line showing their current value: the
  model, the schema (a Pydantic `BaseModel` or JSON Schema directly; *Expand* opens a wide editor with the derived
  schema next to the source, the `model_json_schema()` conversion done server-side), the prompt, and the engine and
  sampling knobs. *Generate* sits at the foot, always visible; ⌘/Ctrl+Enter presses it.
- **Result column** — before the first run, the presets as cards. After it: the JSON typing itself out one pastel
  token at a time with the run's numbers under it (valid, steps, time, overridden, vocabulary kept, mass removed);
  the step inspector with the transport, and per step the model's *original* top-K against the *forced* top-K with
  the forbidden tokens struck through; and, folded until asked for, the token automaton with the path taken (or the
  parser stack, in CFG mode). Decimals, bar scale and rows live in a small view popover next to the numbers.

There is no explanatory copy: every string is a control label, a number, or a chip. The reasoning lives in tooltips.

## Runs, repeats and branches

Every run lands in a tab above the result, in both modes, and nothing is lost when you generate again. A tab's menu
re-runs it with the same seed (the same trace again, token by token, on a local model) or a new one, puts its
schema, prompt and knobs back in the setup, or closes it. Summaries of the last 200 runs survive a reload; the full
steps of the last 20 stay in memory.

- **Repeat ×N** — the split half of *Generate* runs the same request 3, 5, 10, 20 or N times, one after the other on a
  local model (three at a time on a hosted one), with a fresh seed per run or the same seed for all. The batch is one
  tab; its panel shows validity (with pass@k and pass^k), the distinct outputs with counts, **agreement per JSON
  field** (the mask fixes the shape; this is the content), the token where the runs first part ways as a prefix tree,
  timing, and a row per run that opens it in the inspector. At temperature 0 every repetition is identical, and the
  app says so. *Stop* cancels what is left; the backend drops the run within a step.
- **Branch from here** — standing on any step of the Time Machine, start a new run from the tokens before it: resample
  with another seed or temperature, press an allowed row in the bars to write *that* token next, or continue a
  constrained run without its mask in the logprobs mode. The backend replays the prefix in one forward pass through
  the same processors, so the automaton or the parser is exactly where the original run left it; the replayed steps
  arrive marked and are drawn dimmed. Local models only: hosted APIs cannot continue a reply.
- **Resample ×N from here**, in the same menu, starts N branches from that step, one fresh seed each. Their batch
  tab opens with a **Branch point** panel: for the step where they part ways, the probability the parent's model put
  on each next token next to how many of the N branches actually drew it, and the spread of both in bits. The
  outputs, field agreement and divergence tree below it are measured after the shared prefix.
- **Lab / Talk**, in the top bar. Talk hides the view settings, the branch menu, the per-token strips and the
  keyboard hint, and enlarges the tokens: the projector view. The automaton opens in its *Near* scope, the states
  within two hops of the current one plus the path so far, fitted to the box as you scrub; *Whole* shows every drawn
  state. Pressing a state focuses it: only that state and its destinations stay on screen, and a table beside the
  graph lists every transition that leaves it, the first tokens on it, how many tokens it carries, the state it
  reaches and whether the run took it; pressing a destination walks the automaton, Esc lets go. A tab's menu can *Pin to compare*: two pinned runs are shown side by side, shared tokens dimmed, differing
  ones outlined, and their JSON leaf by leaf. On a narrow screen the setup folds into a sheet that slides up from a
  bar at the bottom.
- In CFG mode the *Parser* section shows the JSON so far as a tree with the open brackets as the stack, the cursor's
  path in the schema, what the grammar forces next and whether it would accept EOS (both from llguidance's matcher),
  a strip of who wrote each token (the constraint, when only one token was allowed, or the model), and a BNF reading
  of the schema. llguidance compiles that grammar internally and does not print it, so the text is derived from the
  schema with the same compact separators; it is a reading, not a dump.

```
web/            Next.js app, one route (deploy to Vercel)   ── talks to ──▶  backend/   FastAPI + outlines (deploy to a Hugging Face Space)
presentation/   HTML/SVG slides → PNG 1920×1080 + SVG
```

## Several models, one process

`MODEL_IDS` is a comma-separated allowlist; the first entry is the default and loads at boot, the rest load the first
time the app asks for them. The *Model* picker at the top of the setup column is that list, and it remembers the
choice per browser.

The default list is seven small instruct models, ordered by size after the default. Every one was loaded, checked for
a chat template and made to emit schema-valid JSON through this pipeline before it went in:

| Model | Params | Vocabulary | RAM (float32) | Speed (10 threads) |
|---|---:|---:|---:|---:|
| `Qwen/Qwen2.5-0.5B-Instruct` (default) | 494M | 151,936 | 2.0 GB | 4.8 tok/s |
| `Felladrin/Minueza-32M-UltraChat` | 33M | 32,002 | 0.1 GB | 16.8 tok/s |
| `Felladrin/Llama-160M-Chat-v1` | 162M | 32,000 | 0.6 GB | 10.8 tok/s |
| `HuggingFaceTB/SmolLM2-135M-Instruct` | 135M | 49,152 | 0.5 GB | 6.3 tok/s |
| `HuggingFaceTB/SmolLM2-360M-Instruct` | 362M | 49,152 | 1.4 GB | 3.7 tok/s |
| `LiquidAI/LFM2-350M` | 354M | 65,536 | 1.4 GB | 7.2 tok/s |
| `Qwen/Qwen3-0.6B` | 596M | 151,936 | 2.4 GB | 2.5 tok/s |

Four vocabulary widths, which is the axis that matters here: the automaton is built over the vocabulary, so the same
schema costs a different number of steps and draws a different graph at 32,000 tokens than at 151,936.

The smallest models are also the fastest, and they make the point of the whole lab better than the big ones do.
`Minueza-32M-UltraChat` answers the Person prompt with `{ "name": "John Doe", "age": 45, "city": "},  " }` — valid
JSON, matching the schema, and completely made up. The mask guarantees the shape; nothing guarantees the content.

**Memory is the real limit, not speed.** Weights load in float32, so budget **4 bytes per parameter**, times
`MAX_RESIDENT_MODELS` (default 2). A default Docker Desktop VM has around 8 GB, which a 1.5B model alone very nearly
fills at 6.2 GB; asking for one next to the resident default gets the container OOM-killed, and the app then shows
`backend unreachable`. Either raise Docker's memory, or set `MODEL_DTYPE=bfloat16` to halve the cost — at some
precision in the probabilities this lab puts on screen, which is why float32 is the default.

```bash
# a bigger model, at half the memory
MODEL_IDS=Qwen/Qwen2.5-1.5B-Instruct MODEL_DTYPE=bfloat16 MAX_RESIDENT_MODELS=1 \
TORCH_THREADS=10 docker compose up -d backend
```

- Any id `transformers` can load works; the weights download once into the `hf-cache` Docker volume. Gated models
  (Gemma, Llama) need a token this setup does not pass, so they fail to load.
- `MAX_RESIDENT_MODELS` caps how many stay in memory; beyond it the least recently used one is evicted, so switching
  back and forth reloads from the disk cache rather than from the network.
- Requests carry `model`; omitting it means the default. An id outside the list is a `404`, and one that is still
  loading is a `503` with `Retry-After` while the load runs in a background thread.
- Changing the **list** needs a container restart, because it is an environment variable. Changing the **model** does
  not: that is the dropdown.
- `GET /models` reports one row per id with `loaded`, `loading`, `error`, `n_params` and the load time.

Comparing models is the point: the same schema compiles to the same regex, but each tokenizer walks it differently.
Qwen2.5 has 151,936 tokens, SmolLM2 has 49,152, so the same JSON costs a different number of steps and the automaton
is a different size.

## The catalogue

The presets are grouped by what they show, and every one runs on both engines. *Structure*: Person, Invoice, Tree, and Shapes (a union: the mask picks the branch at
the `kind` token). *Classification & bias*: a review with three labels, a suspect the text never identifies (answer
only, and reasoning first), a loan decision and a candidate score with too little to go on. These last ones are bias
probes: the schema forces a verdict the prompt does not justify, so Repeat ×10 and the per-field agreement show the
model's priors, and swapping a name or an age in the prompt shows whether they move. *Reasoning*: the same
arithmetic question with the result first and with a list of steps before it, and a multiple-choice question with the
reasoning written first. *Extraction*: an event with a date pattern and an optional field, and a tool call.

*Bias probes* are forced choices: one prompt lists two to four people or situations that are identical except for
the sensitive attribute (a name that signals origin, a nationality, a gender, an age), and the schema must pick one:
hire one of four, who gets the flat and who is turned down first, who took the wallet (with `cannot tell` allowed),
whom to trust with a phone, a salary per person in one object, a loan for Martín or María, which doctor, who is at
fault. One run shows the pick and the reason; Repeat ×10 and the per-field agreement show the distribution, and
even odds mean no bias. The prompts are plain on purpose: the decision is the measurement, never the wording.

*Counterfactual probes* are the stricter version of the same idea: one prompt, one attribute swapped, everything
else the same, one batch per variant. Each card lists its variants; a chip runs one, *Generate all ×N* queues them
all as they come, and *Edit prompts & schema* loads them into the setup first: the Prompt section becomes a list of
variants (label and prompt each, add or remove), the schema is edited as usual, and *Run all variants ×N* launches
the batches from what the setup holds. The *Probe* table then puts the variants side by side: valid runs and the
decision fields as shares or means. Every edit of the prompts or the schema starts a new table, so runs of
different wordings are never pooled. A gap between rows comes from the model, not from the text.

The logprobs mode has its own prompts, grouped the same way: facts the model is sure of, bias probes where the next
token is the choice itself (the best of four candidates, who took the wallet, who gets the flat: the bars are the
model's prior over the names), counterfactual prompts with country and name variants compared at the first token in
the probe table, a pronoun probe, a question answered step by step and answered directly, and code and
prose. All of them are in `backend/app/presets.py` and `web/lib/logprobsState.ts`.

### Numeric bounds (`ge`, `le`, `gt`, `lt`)

The two engines differ here. llguidance enforces `minimum`/`maximum` on integers and numbers at the token level.
outlines_core accepts the keywords and then ignores them: its regex for `{"type": "integer", "minimum": 1,
"maximum": 5}` is the regex of any integer, so the mask lets `7` or `-2` through and only the validation at the end
marks the run invalid. The lab closes the gap where a regex can: before compiling for the FSM engine it turns a
bounded integer range of up to 500 values into the equivalent `enum`, which outlines_core does honour. What is left
(open ranges, floats, `multipleOf`) is reported by `/compile` as `fsm_ignored` and shown as a warning chip on the run;
switch the engine to CFG for those.

### Three engines

The engine buttons name the library that runs, not the technique. `Auto` picks outlines_core for a flat schema and
llguidance for a recursive one; the other tiles force one:

| Button | Technique | What it builds | What the lab can show |
|---|---|---|---|
| outlines_core | FSM | JSON Schema → regex → automaton over tokens | the automaton graph, the state per step, the regex |
| llguidance | CFG | JSON Schema → grammar with a pushdown stack | the parse tree and stack, forced tokens, EOS acceptance; the grammar shown is a reading of the schema, llguidance does not print its own |
| xgrammar (optional) | CFG | JSON Schema → grammar, pushdown automaton, cache of token masks | the same parser view, plus the grammar **the engine itself compiled**, and its jump-forward strings as the forced text |

A fifth tile, **Prompt only**, is the control group: no mask at all. A hint is appended to the prompt, asking for the
JSON directly ("Answer directly with one JSON object that matches this JSON Schema. Do not explain… Return just the
JSON:"), the model writes what it wants, and only the validation at the end says whether the shape came out. The
hint is editable in the setup while Prompt only is selected; the schema goes in without titles and descriptions,
which the engines ignore anyway and which would otherwise leak the lab's own commentary to the model. Every run
keeps a folded **Prompt as sent** with the exact text that was tokenized: system prompt, chat template, hint. The step view shows one distribution instead
of two, and the run carries a "prompt only · no mask" chip. **Mask vs prompt ×N**, on every preset card and in the
Repeat menu, queues two batches of N with the same schema and prompt, one with the mask and one without, and the
probe table puts them side by side: valid runs and the decision fields. That gap, over N repetitions, is what
structured output buys.

Two things keep that comparison honest. The system prompt asks for the JSON directly, with no reasoning outside it,
in both rows. And chat templates that open a thinking block by default (Qwen3) are rendered with
`enable_thinking=False`, because a mask forbids `<think>` from the first token anyway; without it the unmasked run
spends its whole budget reasoning in prose and the masked run starts with a spurious override. Templates without
that variable ignore it.

Where a preset asks for a reason, that field comes **first** in the schema, so the mask makes the model write the
reason before the verdict (Review, Loan decision, Tenant, Trust, Hire, Phone, Loan pick, Doctor, Fault; the
"answer only" presets are the deliberate contrast). Property order is generation order under a mask.

XGrammar is optional: `pip install xgrammar` (in `requirements.txt` by default). `/health` lists the engines the build can
run and the app only offers the modes it reports. All three run through the same processor chain, the same
observers, the same prefix replay for branching and the same cancellation.

## Pydantic in, JSON Schema out

`POST /schema/from-pydantic` takes pasted source and returns `model_json_schema()`. **The source is never executed.**
It is parsed with `ast`, every class, annotation and `Field()` keyword is checked against an allowlist, and the models
are rebuilt with `pydantic.create_model`, so `os.system(...)` is an unsupported statement rather than a shell command.
Supported: `BaseModel` and `str`/`int` `Enum` classes, the JSON scalars, `list`/`dict`/`set`/`tuple`, `Optional`,
unions, `Literal`, references between the classes in the same source (recursion included) and
`ConfigDict(extra=...)`. Anything else is rejected with a message and a line number. See
`backend/app/pydantic_schema.py` and `backend/tests/test_pydantic_schema.py`, which asserts that the three presets'
source reproduces their schema exactly.

## How the backend instruments the model

Every generation step runs a `LogitsProcessorList([PreMaskObserver, <outlines processor>, MasterObserver])`:

1. `PreMaskObserver` clones the raw logits (the model's "original intent").
2. The outlines processor (`outlines_core` for finite schemas, `llguidance` for recursive ones) sets forbidden tokens to `−∞`.
3. `MasterObserver` compares the two tensors and records, per token: allowed-token count, top-K before/after, probability
   mass removed, `Guide.get_state()`, whether the model's argmax was overridden.

Steps stream to the browser as Server-Sent Events. See `backend/app/spy.py` and `backend/app/engine.py`.

## Run locally

You need **Docker** (the backend runs in a container) and **Node 20+** (the web app runs on the host). The backend
listens on `7860`, the app on `3000`.

**1. Start the backend.** The first run builds the image and downloads the default model into a Docker volume, so it
takes a few minutes; after that it is seconds.

```bash
TORCH_THREADS=10 docker compose up -d --build backend      # use however many cores you can spare
```

**2. Wait for the model.** `loaded` flips to `true` when it is ready to serve:

```bash
curl -s localhost:7860/health | python3 -m json.tool | head -20
# or block until it is up:
until curl -sf localhost:7860/health | grep -q '"loaded":true'; do sleep 3; done; echo ready
```

**3. Start the app**, in another terminal:

```bash
cd web && npm install
NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:7860 npm run dev
```

Open <http://localhost:3000>. The dot in the top bar turns green with the model's name next to it. If it does not,
the gear opens a field where you can paste the backend URL by hand; the app keeps it in the browser.

**Stopping:** `docker compose stop backend` and `Ctrl-C` in the npm terminal. `docker compose down -v` also deletes
the volume with the downloaded weights, so only use it if you want that.

### Variants

```bash
# a different model list (see "Several models" above); the first entry is the default
MODEL_IDS=Qwen/Qwen2.5-0.5B-Instruct,HuggingFaceTB/SmolLM2-360M-Instruct docker compose up -d backend

# no download at all: a tiny randomly-initialised model. The whole pipeline runs
# (vocabulary, automaton, mask, observers); the probabilities are meaningless.
TOY_MODEL=1 docker compose up -d --build backend

# the backend test suite, on that toy model, offline
docker compose run --rm backend-test

# the web app's checks
cd web && npx tsc --noEmit && npm run lint && npm run build
```

Environment variables, all optional: `MODEL_IDS` (comma-separated allowlist), `MAX_RESIDENT_MODELS` (2),
`MODEL_DTYPE` (float32; bfloat16 or float16 halve the memory), `TORCH_THREADS` (4), `TOY_MODEL` (0), `WARMUP` (1),
`MAX_NEW_TOKENS_CAP` (200).

## Deploy

### 1. Backend on Hugging Face Spaces (free CPU)

1. Create a Space: **SDK = Docker**, hardware **CPU basic** (free), visibility public.
2. Upload the contents of `backend/` to the Space (drag-and-drop in the web UI, or `git push` to the Space repo).
3. Wait for the build, then the first boot downloads the model (a few minutes). `GET /health` reports `loaded: true` when ready.
4. Your backend URL is `https://<user>-<space-name>.hf.space`.

**Change the models:** Space → Settings → Variables → `MODEL_IDS` (comma-separated; the first is the default). Restart
the Space. No code changes. A free CPU Space has 16 GB of RAM, so keep `MAX_RESIDENT_MODELS` at 2 with small models.

A free Space sleeps after 48 h without traffic and wakes in about a minute on the next request; the app shows that state.
Details in [`backend/README.md`](backend/README.md).

### 2. Frontend on Vercel

1. Import this repository in Vercel and set **Root Directory** to `web`.
2. Add the environment variable `NEXT_PUBLIC_BACKEND_URL=https://<user>-<space-name>.hf.space`.
3. Deploy. Visitors can also paste a different backend URL inside the app, behind the gear in the top bar (kept in
   their browser).

## Presentation figures

`presentation/slides/*.html` are 1920×1080 pages with one inline SVG each; `npm run build` renders them with Chromium to
`presentation/out/` and also extracts the SVG so you can edit it. The web app no longer embeds them.

```bash
cd presentation && npm install && npx playwright install chromium && npm run build
```

The talk itself lives next to the figures: [`presentation/TALK.md`](presentation/TALK.md) is the outline (timing, the one
idea per block, demo clicks, risks, pre-talk checklist) and [`presentation/deck.md`](presentation/deck.md) is the
[Marp](https://marp.app) deck that embeds the figures. `npm run deck` renders it to `presentation/deck.html` (open it
in a browser, `p` for presenter notes); `npm run deck:pdf` writes `presentation/out/deck.pdf`.

| # | Figure |
|---|--------|
| 00a | Tokens, not characters: the same JSON as 26 characters and 13 tokens |
| 00b | Embeddings: a token is a row in a table, and the LM head is the same table |
| 01 | Decoder-only transformer, end to end |
| 02 | The output layer: one dot product per vocabulary entry |
| 03 | Logits → probabilities (softmax, temperature) |
| 04 | Constrained decoding: write −∞ over what the schema forbids |
| 05 | Where the mask comes from: an automaton state and its edges |
| 06 | Two observers around the mask (the instrumentation this lab uses) |
| 07 | FSM vs CFG: a regex cannot count, a grammar carries a stack |

## Notes on outlines 1.3

- JSON Schema → regex is `outlines_core.json_schema.build_regex_from_schema`; the token-level automaton is
  `outlines_core.Index(regex, vocabulary)` and `Index.get_transitions()` is what the token-level graph draws.
- A recursive schema does **not** become a CFG in `outlines_core` 0.2: the regex is unrolled a fixed number of levels. The
  lab's CFG mode uses the `llguidance` backend instead (grammar with a stack); it exposes no automaton state, so the stack
  depth shown is computed from the text (unclosed `{`/`[`).
- Bug worth showing in the talk: at the innermost unrolled level `outlines_core` 0.2.14 drops the recursive property but keeps
  the comma before it (`\{"value": <int>, \}`), so a deep enough run in FSM mode ends in JSON the automaton accepts and a
  parser rejects. The app shows a chip as soon as it compiles a regex with that shape; `auto` mode avoids it by using the
  grammar engine for recursive schemas.
