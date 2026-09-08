"""HTTP surface of the lab backend.

    GET  /health    -> is the default model loaded, what it looks like inside, every model's state
    GET  /models    -> the allowlist (MODEL_IDS) and which ones are resident; POST /models/load starts one
    GET  /presets   -> editable starting points (schema + prompt)
    every POST accepts `model` (one of /models) and defaults to the first one
    POST /compile   -> schema -> regex + automata for the graph view
    POST /generate  -> Server-Sent Events: meta, step*, done (constraint: schema | json | none)
    POST /tokenize  -> tokens with ids, offsets, chat-template segments, BPE merge replay
    POST /forward   -> one forward pass: attention of the last position, logit lens, final top-k, a sample
    POST /logits    -> the whole next-token distribution (top-k exact, tail as a histogram)
"""

from __future__ import annotations

import asyncio
import json
import os
import queue
import threading
import time
from contextlib import asynccontextmanager
from typing import Any, Callable, Literal, TypeVar

import torch
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from . import __version__ as backend_version
from .engine import DEFAULT_MODEL_ID, Engine
from .introspect import (
    BadRequest,
    ComparisonTokenizerUnavailable,
    TooLarge,
    forward_payload,
    logits_payload,
    tokenize_payload,
)
from .presets import PRESETS
from .registry import ModelRegistry, registry_from_env

MAX_NEW_TOKENS_CAP = int(os.environ.get("MAX_NEW_TOKENS_CAP", "200"))
FORWARD_MAX_TOKENS = int(os.environ.get("FORWARD_MAX_TOKENS", "128"))
ATTENTION_ALL_MAX_TOKENS = int(os.environ.get("ATTENTION_ALL_MAX_TOKENS", "32"))
LOGITS_TOP_K_CAP = int(os.environ.get("LOGITS_TOP_K_CAP", "2000"))
T = TypeVar("T")


class State:
    registry: ModelRegistry | None = None
    error: str | None = None
    started_at: float = time.time()
    busy: bool = False


state = State()
generation_lock = asyncio.Lock()


def _boot() -> None:
    try:
        state.registry = registry_from_env()
        state.registry.start_loading(None)  # the default model loads at boot; the others on first use
    except Exception as exc:  # surfaced through /health so the UI can show it
        state.error = f"{type(exc).__name__}: {exc}"


@asynccontextmanager
async def lifespan(app: FastAPI):
    threading.Thread(target=_boot, name="model-loader", daemon=True).start()
    yield


app = FastAPI(title="Structured Output Labs backend", version=backend_version, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ModelChoice(BaseModel):
    model: str | None = Field(default=None, description="one of /models; the default model when omitted")

    model_config = {"populate_by_name": True, "protected_namespaces": ()}


class CompileRequest(ModelChoice):
    schema_: dict[str, Any] = Field(alias="schema")
    mode: Literal["auto", "fsm", "cfg"] = "auto"
    constraint: Literal["schema", "none", "json"] = "schema"


class GenerateRequest(CompileRequest):
    prompt: str = Field(min_length=1, max_length=4000)
    max_new_tokens: int = Field(default=120, ge=1, le=MAX_NEW_TOKENS_CAP)
    temperature: float = Field(default=0.0, ge=0.0, le=2.0)
    top_k_sampling: int = Field(default=0, ge=0, le=100)
    top_p: float = Field(default=1.0, gt=0.0, le=1.0)
    top_k_report: int = Field(default=8, ge=1, le=20)
    seed: int | None = None
    use_chat_template: bool = True
    schema_in_prompt: bool = False
    include_steps: bool = True
    force_compile: bool = False


class TokenizeRequest(ModelChoice):
    text: str = Field(min_length=1, max_length=20000)
    use_chat_template: bool = False
    tokenizer: Literal["model", "gpt2"] = "model"
    merges: bool = False


class LoadRequest(ModelChoice):
    pass


class SampleSpec(BaseModel):
    temperature: float = Field(default=0.0, ge=0.0, le=2.0)
    top_k: int = Field(default=0, ge=0, le=1000)
    top_p: float = Field(default=1.0, gt=0.0, le=1.0)
    seed: int | None = None
    u: float | None = Field(default=None, ge=0.0, lt=1.0)


class ForwardRequest(ModelChoice):
    prompt: str | None = Field(default=None, max_length=4000)
    token_ids: list[int] | None = None
    use_chat_template: bool = True
    top_k: int = Field(default=10, ge=1, le=64)
    attention: Literal["last", "all", "none"] = "last"
    layers: list[int] | None = None
    logit_lens: bool = True
    lens_top_k: int = Field(default=5, ge=1, le=20)
    sample: SampleSpec | None = None
    benchmark_cache: bool = False
    decimals: int = Field(default=4, ge=2, le=8)
    tail_bins: int = Field(default=64, ge=8, le=256)


class LogitsRequest(ModelChoice):
    prompt: str | None = Field(default=None, max_length=4000)
    token_ids: list[int] | None = None
    use_chat_template: bool = True
    top_k: int = Field(default=200, ge=1, le=LOGITS_TOP_K_CAP)
    tail_buckets: int = Field(default=64, ge=8, le=256)
    full_logits: bool = False
    decimals: int = Field(default=4, ge=2, le=8)


def _registry_or_503() -> ModelRegistry:
    if state.registry is None:
        if state.error:
            raise HTTPException(status_code=503, detail=f"backend failed to start: {state.error}")
        raise HTTPException(status_code=503, detail="backend is starting")
    return state.registry


def _engine_or_503(model_id: str | None = None) -> Engine:
    """The engine for `model_id`; starts loading it on first use and asks the client to retry."""
    registry = _registry_or_503()
    try:
        engine = registry.get(model_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"unknown model {model_id!r}; see /models") from None
    if engine is not None:
        return engine
    error = registry.error(model_id)
    if error:
        raise HTTPException(status_code=503, detail=f"model failed to load: {error}")
    registry.start_loading(model_id)
    raise HTTPException(
        status_code=503,
        detail=f"model {registry.resolve_id(model_id)} is loading; poll /models and retry",
        headers={"Retry-After": "10"},
    )


def _http_error(exc: Exception) -> HTTPException:
    if isinstance(exc, TooLarge):
        return HTTPException(status_code=413, detail=str(exc))
    if isinstance(exc, BadRequest):
        return HTTPException(status_code=400, detail=str(exc))
    if isinstance(exc, ComparisonTokenizerUnavailable):
        return HTTPException(status_code=503, detail=str(exc))
    return HTTPException(status_code=400, detail=f"{type(exc).__name__}: {exc}")


async def _run_exclusive(engine: Engine, fn: Callable[[], T]) -> T:
    """Run `fn` with the model, serialised with generation (one forward at a time)."""

    def locked() -> T:
        with engine.lock:
            return fn()

    async with generation_lock:
        state.busy = True
        try:
            return await asyncio.to_thread(locked)
        finally:
            state.busy = False


@app.get("/")
def root() -> dict[str, Any]:
    return {"service": "structured-output-labs", "docs": "/docs", "health": "/health"}


@app.get("/health")
def health() -> dict[str, Any]:
    """The default model's state (the fields the first web client reads) plus every model's."""
    registry = state.registry
    engine = registry.get(None) if registry is not None else None
    models = registry.status() if registry is not None else []
    default_row = next((m for m in models if m["default"]), None)
    error = state.error or (default_row["error"] if default_row else None)
    loaded = engine is not None
    loading = bool(default_row and default_row["loading"]) or (registry is None and not state.error)
    payload: dict[str, Any] = {
        "status": "ok" if loaded else ("error" if error else "loading"),
        "loaded": loaded,
        "loading": loading,
        "error": error,
        "model_id": registry.default_id if registry is not None else os.environ.get("MODEL_ID", DEFAULT_MODEL_ID),
        "toy": bool(engine and engine.toy),
        "device": "cpu",
        "vocab_size": engine.vocab_size if engine else None,
        "busy": state.busy,
        "warmed_up": bool(default_row and default_row["warmed_up"]),
        "uptime_s": round(time.time() - state.started_at, 1),
        "load_time_s": default_row["load_time_s"] if default_row else None,
        "models": models,
        "max_resident_models": registry.max_resident if registry is not None else None,
        "max_new_tokens_cap": MAX_NEW_TOKENS_CAP,
        "forward_max_tokens": FORWARD_MAX_TOKENS,
        "attention_all_max_tokens": ATTENTION_ALL_MAX_TOKENS,
        "logits_top_k_cap": LOGITS_TOP_K_CAP,
        "constraints": ["schema", "json", "none"],
        "modes": ["auto", "fsm", "cfg"],
        "backend_version": backend_version,
        "transformers_version": _version("transformers"),
        "torch_version": torch.__version__,
        "torch_threads": torch.get_num_threads(),
    }
    if engine is not None:
        payload.update(engine.model_info())
        payload["features"] = {
            "compare_tokenizer": engine.compare_tokenizer_id or None,
            "merges_replay": engine.merge_ranks() is not None,
        }
    return payload


def _version(package: str) -> str | None:
    try:
        from importlib.metadata import version

        return version(package)
    except Exception:  # pragma: no cover
        return None


@app.get("/presets")
def presets() -> list[dict[str, Any]]:
    return list(PRESETS.values())


@app.get("/models")
def models() -> dict[str, Any]:
    registry = _registry_or_503()
    return {"default": registry.default_id, "max_resident": registry.max_resident, "models": registry.status()}


@app.post("/models/load", status_code=202)
def load_model(req: LoadRequest) -> dict[str, Any]:
    """Start loading a model in the background (idempotent); poll /models for its state."""
    registry = _registry_or_503()
    try:
        started = registry.start_loading(req.model)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"unknown model {req.model!r}; see /models") from None
    return {"model": registry.resolve_id(req.model), "started": started, "models": registry.status()}


@app.post("/compile")
def compile_schema(req: CompileRequest) -> dict[str, Any]:
    engine = _engine_or_503(req.model)
    try:
        return engine.compile(req.schema_, req.mode, req.constraint)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"{type(exc).__name__}: {exc}") from exc


@app.post("/generate")
async def generate(req: GenerateRequest) -> EventSourceResponse:
    engine = _engine_or_503(req.model)
    events: queue.Queue[tuple[str, Any] | None] = queue.Queue()
    stop = threading.Event()

    def worker() -> None:
        try:
            with engine.lock:
                for name, payload in engine.generate(
                    schema=req.schema_,
                    prompt=req.prompt,
                    mode=req.mode,
                    max_new_tokens=req.max_new_tokens,
                    temperature=req.temperature,
                    top_k_sampling=req.top_k_sampling,
                    top_k_report=req.top_k_report,
                    seed=req.seed,
                    use_chat_template=req.use_chat_template,
                    constraint=req.constraint,
                    top_p=req.top_p,
                    schema_in_prompt=req.schema_in_prompt,
                    include_steps=req.include_steps,
                    stop=stop,
                    force_compile=req.force_compile,
                ):
                    events.put((name, payload))
        except Exception as exc:
            events.put(("error", {"detail": f"{type(exc).__name__}: {exc}"}))
        finally:
            events.put(None)

    async def stream():
        async with generation_lock:
            state.busy = True
            try:
                threading.Thread(target=worker, name="generate", daemon=True).start()
                while True:
                    item = await asyncio.to_thread(events.get)
                    if item is None:
                        break
                    name, payload = item
                    yield {"event": name, "data": json.dumps(payload)}
            finally:
                # A client that went away must not keep the model busy: the loop
                # checks this flag at the top of every step.
                stop.set()
                state.busy = False

    return EventSourceResponse(stream(), ping=15)


@app.post("/tokenize")
def tokenize(req: TokenizeRequest) -> dict[str, Any]:
    engine = _engine_or_503(req.model)
    try:
        return tokenize_payload(engine, req.text, req.use_chat_template, req.tokenizer, req.merges)
    except (BadRequest, ComparisonTokenizerUnavailable) as exc:
        raise _http_error(exc) from exc


@app.post("/forward")
async def forward(req: ForwardRequest) -> dict[str, Any]:
    engine = _engine_or_503(req.model)
    if (req.prompt is None) == (req.token_ids is None):
        raise HTTPException(status_code=400, detail="send exactly one of `prompt` or `token_ids`")
    try:
        return await _run_exclusive(
            engine,
            lambda: forward_payload(
                engine,
                prompt=req.prompt,
                token_ids=req.token_ids,
                use_chat_template=req.use_chat_template,
                top_k=req.top_k,
                attention=req.attention,
                layers=req.layers,
                logit_lens=req.logit_lens,
                lens_top_k=req.lens_top_k,
                sample=req.sample.model_dump() if req.sample is not None else None,
                benchmark_cache=req.benchmark_cache,
                decimals=req.decimals,
                tail_bins=req.tail_bins,
                max_tokens=FORWARD_MAX_TOKENS,
                attention_all_max=ATTENTION_ALL_MAX_TOKENS,
            ),
        )
    except (BadRequest, TooLarge) as exc:
        raise _http_error(exc) from exc


@app.post("/logits")
async def logits(req: LogitsRequest) -> dict[str, Any]:
    engine = _engine_or_503(req.model)
    if (req.prompt is None) == (req.token_ids is None):
        raise HTTPException(status_code=400, detail="send exactly one of `prompt` or `token_ids`")
    try:
        return await _run_exclusive(
            engine,
            lambda: logits_payload(
                engine,
                prompt=req.prompt,
                token_ids=req.token_ids,
                use_chat_template=req.use_chat_template,
                top_k=req.top_k,
                tail_buckets=req.tail_buckets,
                full_logits=req.full_logits,
                decimals=req.decimals,
                max_tokens=FORWARD_MAX_TOKENS,
            ),
        )
    except (BadRequest, TooLarge) as exc:
        raise _http_error(exc) from exc
