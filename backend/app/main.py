"""HTTP surface of the lab backend.

    GET  /health    -> is the model loaded, which one, what it looks like inside
    GET  /presets   -> editable starting points (schema + prompt)
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
from .engine import DEFAULT_MODEL_ID, Engine, engine_from_env
from .introspect import (
    BadRequest,
    ComparisonTokenizerUnavailable,
    TooLarge,
    forward_payload,
    logits_payload,
    tokenize_payload,
)
from .presets import PRESETS

MAX_NEW_TOKENS_CAP = int(os.environ.get("MAX_NEW_TOKENS_CAP", "200"))
FORWARD_MAX_TOKENS = int(os.environ.get("FORWARD_MAX_TOKENS", "128"))
ATTENTION_ALL_MAX_TOKENS = int(os.environ.get("ATTENTION_ALL_MAX_TOKENS", "32"))
LOGITS_TOP_K_CAP = int(os.environ.get("LOGITS_TOP_K_CAP", "2000"))
WARMUP = os.environ.get("WARMUP", "1") == "1"

T = TypeVar("T")


class State:
    engine: Engine | None = None
    error: str | None = None
    loading: bool = True
    started_at: float = time.time()
    loaded_at: float | None = None
    busy: bool = False
    warmed_up: bool = False
    model_id: str = os.environ.get("MODEL_ID", DEFAULT_MODEL_ID)


state = State()
generation_lock = asyncio.Lock()


def _load_engine() -> None:
    try:
        engine = engine_from_env()
        state.engine = engine
        state.model_id = engine.model_id
        state.loaded_at = time.time()
        state.loading = False
        if WARMUP and not engine.toy:
            engine.warm_up()
        state.warmed_up = True
    except Exception as exc:  # surfaced through /health so the UI can show it
        state.error = f"{type(exc).__name__}: {exc}"
    finally:
        state.loading = False


@asynccontextmanager
async def lifespan(app: FastAPI):
    threading.Thread(target=_load_engine, name="model-loader", daemon=True).start()
    yield


app = FastAPI(title="Structured Output Labs backend", version=backend_version, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class CompileRequest(BaseModel):
    schema_: dict[str, Any] = Field(alias="schema")
    mode: Literal["auto", "fsm", "cfg"] = "auto"
    constraint: Literal["schema", "none", "json"] = "schema"

    model_config = {"populate_by_name": True}


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


class TokenizeRequest(BaseModel):
    text: str = Field(min_length=1, max_length=20000)
    use_chat_template: bool = False
    tokenizer: Literal["model", "gpt2"] = "model"
    merges: bool = False


class SampleSpec(BaseModel):
    temperature: float = Field(default=0.0, ge=0.0, le=2.0)
    top_k: int = Field(default=0, ge=0, le=1000)
    top_p: float = Field(default=1.0, gt=0.0, le=1.0)
    seed: int | None = None
    u: float | None = Field(default=None, ge=0.0, lt=1.0)


class ForwardRequest(BaseModel):
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


class LogitsRequest(BaseModel):
    prompt: str | None = Field(default=None, max_length=4000)
    token_ids: list[int] | None = None
    use_chat_template: bool = True
    top_k: int = Field(default=200, ge=1, le=LOGITS_TOP_K_CAP)
    tail_buckets: int = Field(default=64, ge=8, le=256)
    full_logits: bool = False
    decimals: int = Field(default=4, ge=2, le=8)


def _engine_or_503() -> Engine:
    if state.engine is None:
        if state.error:
            raise HTTPException(status_code=503, detail=f"model failed to load: {state.error}")
        raise HTTPException(status_code=503, detail="model is still loading")
    return state.engine


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
    engine = state.engine
    loaded = engine is not None
    payload: dict[str, Any] = {
        "status": "ok" if loaded else ("error" if state.error else "loading"),
        "loaded": loaded,
        "loading": state.loading,
        "error": state.error,
        "model_id": state.model_id,
        "toy": bool(engine and engine.toy),
        "device": "cpu",
        "vocab_size": engine.vocab_size if engine else None,
        "busy": state.busy,
        "warmed_up": state.warmed_up,
        "uptime_s": round(time.time() - state.started_at, 1),
        "load_time_s": round(state.loaded_at - state.started_at, 1) if state.loaded_at else None,
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


@app.post("/compile")
def compile_schema(req: CompileRequest) -> dict[str, Any]:
    engine = _engine_or_503()
    try:
        return engine.compile(req.schema_, req.mode, req.constraint)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"{type(exc).__name__}: {exc}") from exc


@app.post("/generate")
async def generate(req: GenerateRequest) -> EventSourceResponse:
    engine = _engine_or_503()
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
    engine = _engine_or_503()
    try:
        return tokenize_payload(engine, req.text, req.use_chat_template, req.tokenizer, req.merges)
    except (BadRequest, ComparisonTokenizerUnavailable) as exc:
        raise _http_error(exc) from exc


@app.post("/forward")
async def forward(req: ForwardRequest) -> dict[str, Any]:
    engine = _engine_or_503()
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
    engine = _engine_or_503()
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
