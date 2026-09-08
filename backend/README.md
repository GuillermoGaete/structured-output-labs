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
| GET | `/health` | default model state (`loaded, model_id, vocab_size, busy, warmed_up, …`), its shape (`n_layers, n_heads, n_params, tied_embeddings, attn_implementation`), versions, and `models[]` |
| GET | `/models` | the allowlist (`MODEL_IDS`) with `loaded / loading / error / warmed_up` per model |
| POST | `/models/load` | `{model}` → 202, starts loading that model in the background (idempotent) |
| GET | `/presets` | schema + prompt starting points |
| POST | `/compile` | `{schema, mode, constraint}` → regex, character FSM, token DFA (automata only for `constraint: schema`) |
| POST | `/generate` | `{schema, prompt, constraint, mode, max_new_tokens, temperature, top_k_sampling, top_p, seed, schema_in_prompt, include_steps, …}` → SSE `meta`, `step`*, `done` |
| POST | `/tokenize` | `{text, use_chat_template, tokenizer: model \| gpt2, merges}` → tokens with ids, raw strings, char/byte/UTF-16 offsets, chat-template segments, optional BPE merge replay |
| POST | `/forward` | `{prompt \| token_ids, top_k, attention: last \| all \| none, layers, logit_lens, sample, benchmark_cache}` → one forward pass: attention of the last position per layer and head, logit lens after every block, final top-k + tail histogram, the sampled next token, timings |
| POST | `/logits` | `{prompt \| token_ids, top_k, tail_buckets, full_logits}` → the whole next-token distribution: top-k exact, tail as a logit-space histogram, cumulative mass, optional fp16 dump |

Every POST accepts `model` (one of `/models`; the default when omitted). A model that is not resident yet answers
`503` with `Retry-After` and starts loading; poll `/models`.

`constraint` is `schema` (the JSON Schema is enforced), `json` (any JSON object, llguidance with a permissive schema
and free whitespace, like the APIs' JSON mode: forbidding whitespace masks the ` "` the model writes after every colon
and pushes it to `null`) or `none` (prompting only: no processor, the observers still run). With `schema`, `mode` picks the engine: `auto`
(FSM unless the schema is recursive), `fsm` (`outlines_core`) or `cfg` (`llguidance`).

`done` carries `validation` (raw vs stripped text, parse/schema errors, `failure_class`: `ok | fence | preamble |
invalid_json | truncated | schema_type | schema_missing_key | schema_extra_key`), `timing` (compile, prefill, decode,
mask and observer time, tokens/s) and `summary` (overridden steps, vocabulary kept, mass removed, max nesting).

## Configuration (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `MODEL_IDS` | empty (falls back to `MODEL_ID`) | comma-separated allowlist for the model selector; the first one loads at boot, the others on first use |
| `MODEL_ID` | `Qwen/Qwen2.5-0.5B-Instruct` | the single model when `MODEL_IDS` is empty |
| `MAX_RESIDENT_MODELS` | `2` | how many models stay in memory (least recently used is evicted; a 0.5B fp32 model is ~2 GB) |
| `WARMUP` | `1` | run two tiny generations after loading so the first visitor does not pay the one-off setup costs |
| `TORCH_THREADS` | `2` in the Dockerfile, `4` in compose | CPU threads for inference |
| `MAX_NEW_TOKENS_CAP` | `200` | hard ceiling per request |
| `FORWARD_MAX_TOKENS` | `128` | longest input `/forward` and `/logits` accept |
| `ATTENTION_ALL_MAX_TOKENS` | `32` | longest input for `attention: all` (n×n weights per layer and head) |
| `LOGITS_TOP_K_CAP` | `2000` | ceiling for `/logits` `top_k` |
| `COMPARE_TOKENIZER_ID` | `openai-community/gpt2` | the second tokenizer `/tokenize` can contrast with (loaded lazily from the Hub; empty disables) |
| `TOY_MODEL` | unset | `1` = tiny random model + locally trained tokenizer, for tests/dev without a download |

Changing the models is only these variables; the Space needs a restart to reload.

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
docker compose run --rm backend-test     # 47 tests on the toy model
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
