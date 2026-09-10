# Structured Output Labs

One screen for **constrained decoding**: paste a Pydantic model, watch a small language model fill it in, and scrub
through every token while [outlines](https://github.com/dottxt-ai/outlines) writes `−∞` over what the schema forbids.

The whole pipeline, left to right, on one page:

```
Pydantic model ──▶ JSON Schema ──▶ regex ──▶ token automaton ──▶ mask ──▶ the token that was sampled
```

- **Left column** — a Pydantic `BaseModel` (or JSON Schema directly), the prompt, the constraint engine, temperature.
  The derived schema is shown next to the source: that conversion is `model_json_schema()`, done server-side.
- **Right column** — the transport, the JSON typing itself out one pastel token at a time, and per step: the model's
  *original* top-K against the *forced* top-K with the forbidden tokens struck through, how much of the vocabulary
  survived, how much probability mass the mask removed, and where you are in the automaton (or in the parser stack,
  in CFG mode).

There is no explanatory copy: every string is a control label, a number, or a chip. The reasoning lives in tooltips.

```
web/            Next.js app, one route (deploy to Vercel)   ── talks to ──▶  backend/   FastAPI + outlines (deploy to a Hugging Face Space)
presentation/   HTML/SVG slides → PNG 1920×1080 + SVG
```

## Several models, one process

`MODEL_IDS` is a comma-separated allowlist; the first entry is the default and loads at boot, the rest load the first
time the app asks for them. The picker in the top bar is that list, and it remembers the choice per browser.

```bash
MODEL_IDS=Qwen/Qwen2.5-0.5B-Instruct,HuggingFaceTB/SmolLM2-360M-Instruct \
MAX_RESIDENT_MODELS=2 TORCH_THREADS=10 docker compose up -d backend
```

- Any id `transformers` can load works; the weights download once into the `hf-cache` Docker volume. Sizes are the
  constraint on a laptop CPU: 0.5B is comfortable, 1.5B is roughly 3× slower, above that it stops being a demo.
- `MAX_RESIDENT_MODELS` (default 2) caps how many stay in memory; beyond it the least recently used one is evicted, so
  switching back and forth reloads from the disk cache rather than from the network.
- Requests carry `model`; omitting it means the default. An id outside the list is a `404`, and one that is still
  loading is a `503` with `Retry-After` while the load runs in a background thread.
- Changing the **list** needs a container restart, because it is an environment variable. Changing the **model** does
  not: that is the dropdown.
- `GET /models` reports one row per id with `loaded`, `loading`, `error`, `n_params` and the load time.

Comparing models is the point: the same schema compiles to the same regex, but each tokenizer walks it differently.
Qwen2.5 has 151,936 tokens and writes `{"name":` in four; SmolLM2 has 49,152 and needs more.

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

## Run locally (Docker for the backend, npm for the web)

```bash
# backend — real models (the first download lands in a Docker volume)
docker compose up --build
# backend — a specific list, more CPU threads
MODEL_IDS=Qwen/Qwen2.5-0.5B-Instruct,HuggingFaceTB/SmolLM2-360M-Instruct TORCH_THREADS=10 docker compose up -d backend
# backend — offline toy model (no download; same pipeline, meaningless probabilities)
TOY_MODEL=1 docker compose up --build
# backend tests (toy model)
docker compose run --rm backend-test

# web, in another terminal
cd web && npm install
NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:7860 npm run dev      # http://localhost:3000
```

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
