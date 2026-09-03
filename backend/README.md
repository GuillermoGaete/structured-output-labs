---
title: Structured Output Labs backend
emoji: 🧭
colorFrom: gray
colorTo: green
sdk: docker
app_port: 7860
pinned: false
license: mit
---

# Structured Output Labs — backend

FastAPI service that runs a small causal LM through `outlines` with two observing `LogitsProcessor`s and streams every
decoding step to the web app. This folder is a complete Hugging Face Space (the header above is the Space card).

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | `{loaded, model_id, vocab_size, busy, …}` — the UI polls this |
| GET | `/presets` | schema + prompt starting points |
| POST | `/compile` | `{schema, mode}` → regex, character FSM, token DFA |
| POST | `/generate` | `{schema, prompt, mode, max_new_tokens, temperature, …}` → SSE `meta`, `step`*, `done` |

`mode` is `auto` (FSM unless the schema is recursive), `fsm` (`outlines_core`) or `cfg` (`llguidance`).

## Configuration (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `MODEL_ID` | `Qwen/Qwen2.5-0.5B-Instruct` | any causal LM on the Hub that `AutoModelForCausalLM` loads |
| `TORCH_THREADS` | `2` in the Dockerfile | CPU threads for inference |
| `MAX_NEW_TOKENS_CAP` | `200` | hard ceiling per request |
| `TOY_MODEL` | unset | `1` = tiny random model + locally trained tokenizer, for tests/dev without a download |

Changing the model is only this variable; the Space needs a restart to reload.

## Deploy as a Hugging Face Space

1. **New Space** → SDK **Docker** → hardware **CPU basic** (free, 2 vCPU, 16 GB).
2. Upload everything in this folder (`Dockerfile`, `requirements.txt`, `app/`, this README) or push it with git.
3. Build takes ~5 min (torch CPU wheel), then the container starts and downloads the model in the background.
   `/health` answers immediately with `loaded: false`, then `loaded: true` a few minutes later.
4. Optional: Settings → Variables → `MODEL_ID` to switch models.

Qwen2.5-0.5B-Instruct on the free CPU generates roughly 2–5 tokens/s, so a 120-token JSON takes 30–60 s. A free Space
goes to sleep after 48 h without requests and needs about a minute to wake up.

## Run locally with Docker (from the repo root)

```bash
docker compose up --build                # real model, weights cached in a volume
TOY_MODEL=1 docker compose up --build    # offline toy model
docker compose run --rm backend-test     # 11 tests on the toy model
```

## Layout

```
app/main.py      FastAPI routes, background model load, SSE streaming
app/engine.py    model loading, schema → processor, the observed decode loop
app/spy.py       PreMaskObserver + MasterObserver
app/fsm.py       interegular char FSM and outlines_core token DFA → graph JSON
app/presets.py   Pydantic presets (Person, Invoice, TreeNode) + recursion detection
app/tracing.py   Step/Meta/Done dataclasses, BPE glyph cleanup, bracket depth
app/toy.py       offline test double
tests/           pytest suite
```
