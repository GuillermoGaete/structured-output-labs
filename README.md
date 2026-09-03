# Structured Output Labs

An interactive lab for **constrained decoding**: watch a small language model generate JSON while
[outlines](https://github.com/dottxt-ai/outlines) writes `−∞` over every token the schema forbids, one step at a time.

- **Schema → Automaton** — paste a JSON Schema, see the regex outlines compiles it to and the finite-state machine behind it,
  at character level (interegular) and at token level (the `outlines_core` index generation actually walks).
- **Time Machine** — generate with the model and scrub through every token: the model's *original* top-K vs the *forced*
  top-K, how much of the vocabulary survived the mask, how much probability mass was removed, the automaton state, the
  nesting depth. Final JSON rendered with one pastel background per token.
- **How it works** — the seven presentation figures (transformer → logits → softmax → mask → automaton → observers → FSM vs CFG).

```
web/            Next.js app (deploy to Vercel)          ── talks to ──▶  backend/   FastAPI + outlines (deploy to a Hugging Face Space)
presentation/   HTML/SVG slides → PNG 1920×1080 + SVG
```

## How the backend instruments the model

Every generation step runs a `LogitsProcessorList([PreMaskObserver, <outlines processor>, MasterObserver])`:

1. `PreMaskObserver` clones the raw logits (the model's "original intent").
2. The outlines processor (`outlines_core` for finite schemas, `llguidance` for recursive ones) sets forbidden tokens to `−∞`.
3. `MasterObserver` compares the two tensors and records, per token: allowed-token count, top-K before/after, probability
   mass removed, `Guide.get_state()`, whether the model's argmax was overridden.

Steps stream to the browser as Server-Sent Events. See `backend/app/spy.py` and `backend/app/engine.py`.

## Run locally (Docker for the backend, npm for the web)

```bash
# backend — real model (downloads Qwen2.5-0.5B-Instruct once into a Docker volume)
docker compose up --build
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

**Change the model:** Space → Settings → Variables → `MODEL_ID` (default `Qwen/Qwen2.5-0.5B-Instruct`; the 1.5B
`deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B` also works, about 3× slower on CPU). Restart the Space. No code changes.

A free Space sleeps after 48 h without traffic and wakes in about a minute on the next request; the app shows that state.
Details in [`backend/README.md`](backend/README.md).

### 2. Frontend on Vercel

1. Import this repository in Vercel and set **Root Directory** to `web`.
2. Add the environment variable `NEXT_PUBLIC_BACKEND_URL=https://<user>-<space-name>.hf.space`.
3. Deploy. Visitors can also paste a different backend URL inside the app (kept in their browser).

## Presentation figures

`presentation/slides/*.html` are 1920×1080 pages with one inline SVG each; `npm run build` renders them with Chromium to
`presentation/out/` and also extracts the SVG so you can edit it. The same PNGs are copied to `web/public/figures/` for the
"How it works" page.

```bash
cd presentation && npm install && npx playwright install chromium && npm run build
```

| # | Figure |
|---|--------|
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
