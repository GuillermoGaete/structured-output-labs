"""HTTP surface of the lab backend.

    GET  /health    -> is the model loaded, which one
    GET  /presets   -> editable starting points (schema + prompt)
    POST /compile   -> schema -> regex + automata for the graph view
    POST /generate  -> Server-Sent Events: meta, step*, done
"""

from __future__ import annotations

import asyncio
import json
import os
import queue
import threading
import time
from contextlib import asynccontextmanager
from typing import Any, Literal

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from .engine import Engine
from .logprobs import MAX_NEW_TOKENS_CAP as STREAM_TOKENS_CAP, MAX_TOP_K, stream as stream_logprobs
from .registry import ModelRegistry, registry_from_env
from .presets import PRESETS
from .pydantic_schema import MAX_SOURCE_CHARS, BadModel, from_pydantic

MAX_NEW_TOKENS_CAP = int(os.environ.get("MAX_NEW_TOKENS_CAP", "200"))


class State:
    registry: ModelRegistry | None = None
    error: str | None = None
    started_at: float = time.time()
    busy: bool = False


state = State()
generation_lock = asyncio.Lock()


def _build_registry() -> None:
    try:
        registry = registry_from_env()
        state.registry = registry
        registry.start_loading(None)  # the default model; the others load on demand
    except Exception as exc:  # surfaced through /health so the UI can show it
        state.error = f"{type(exc).__name__}: {exc}"


@asynccontextmanager
async def lifespan(app: FastAPI):
    threading.Thread(target=_build_registry, name="registry", daemon=True).start()
    yield


app = FastAPI(title="Structured Output Labs backend", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ModelChoice(BaseModel):
    """Which model to use. Omitted means the default, the first of MODEL_IDS."""

    model: str | None = Field(default=None, max_length=200)

    model_config = {"populate_by_name": True, "protected_namespaces": ()}


class CompileRequest(ModelChoice):
    schema_: dict[str, Any] = Field(alias="schema")
    mode: Literal["auto", "fsm", "cfg"] = "auto"


class StreamRequest(ModelChoice):
    """The logprobs mode: no schema, no mask, just the distribution per token."""

    prompt: str = Field(min_length=1, max_length=4000)
    max_new_tokens: int = Field(default=48, ge=1, le=STREAM_TOKENS_CAP)
    temperature: float = Field(default=0.8, ge=0.0, le=2.0)
    top_k: int = Field(default=0, ge=0, le=1000)
    top_p: float = Field(default=1.0, ge=0.0, le=1.0)
    seed: int | None = None
    use_chat_template: bool = True
    top_k_report: int = Field(default=12, ge=1, le=MAX_TOP_K)
    tail_bins: int = Field(default=48, ge=0, le=256)


class PydanticRequest(BaseModel):
    """A pasted Pydantic model. The source is parsed, never executed."""

    source: str = Field(min_length=1, max_length=MAX_SOURCE_CHARS)
    model: str | None = Field(default=None, max_length=200)


class GenerateRequest(CompileRequest):
    prompt: str = Field(min_length=1, max_length=4000)
    max_new_tokens: int = Field(default=120, ge=1, le=MAX_NEW_TOKENS_CAP)
    temperature: float = Field(default=0.0, ge=0.0, le=2.0)
    top_k_sampling: int = Field(default=0, ge=0, le=100)
    top_k_report: int = Field(default=8, ge=1, le=20)
    seed: int | None = None
    use_chat_template: bool = True


def _engine_or_503(model_id: str | None = None) -> Engine:
    """The engine for `model_id`, or 404 if it is not on the allowlist, or 503 while it loads.

    A model that is on the allowlist but not resident starts loading here, so a
    503 plus `Retry-After` is the client's cue to poll /models and come back.
    """
    registry = state.registry
    if registry is None:
        if state.error:
            raise HTTPException(status_code=503, detail=f"the registry failed to start: {state.error}")
        raise HTTPException(status_code=503, detail="starting up", headers={"Retry-After": "2"})
    try:
        resolved = registry.resolve_id(model_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"{model_id!r} is not in MODEL_IDS") from None
    engine = registry.get(resolved)
    if engine is not None:
        return engine
    error = registry.error(resolved)
    if error:
        raise HTTPException(status_code=503, detail=f"{resolved} failed to load: {error}")
    registry.start_loading(resolved)
    raise HTTPException(status_code=503, detail=f"{resolved} is loading", headers={"Retry-After": "5"})


@app.get("/")
def root() -> dict[str, Any]:
    return {"service": "structured-output-labs", "docs": "/docs", "health": "/health"}


@app.get("/health")
def health() -> dict[str, Any]:
    """State of the default model, kept flat for the client, plus a row per allowlisted model."""
    registry = state.registry
    rows = registry.status() if registry else []
    default = next((r for r in rows if r["default"]), None)
    # `loaded` means the service can serve, not that the default model happens to
    # be resident: MAX_RESIDENT_MODELS can evict it while another model answers.
    loaded = any(r["loaded"] for r in rows)
    error = state.error or (default["error"] if default else None)
    return {
        "status": "ok" if loaded else ("error" if error else "loading"),
        "loaded": loaded,
        "loading": not loaded and not error,
        "error": error,
        "model_id": default["id"] if default else "",
        "toy": bool(default and default["toy"]),
        "device": "cpu",
        "vocab_size": default.get("vocab_size") if default else None,
        "busy": state.busy,
        "uptime_s": round(time.time() - state.started_at, 1),
        "load_time_s": default.get("load_time_s") if default else None,
        "max_new_tokens_cap": MAX_NEW_TOKENS_CAP,
        "models": rows,
        "max_resident_models": registry.max_resident if registry else None,
    }


@app.get("/models")
def models() -> dict[str, Any]:
    registry = state.registry
    if registry is None:
        raise HTTPException(status_code=503, detail="starting up", headers={"Retry-After": "2"})
    return {"default": registry.default_id, "max_resident": registry.max_resident, "models": registry.status()}


@app.post("/models/load", status_code=202)
def load_model(req: ModelChoice) -> dict[str, Any]:
    """Start loading a model in the background. Idempotent: 202 whether or not it was already resident."""
    registry = state.registry
    if registry is None:
        raise HTTPException(status_code=503, detail="starting up", headers={"Retry-After": "2"})
    try:
        resolved = registry.resolve_id(req.model)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"{req.model!r} is not in MODEL_IDS") from None
    started = registry.start_loading(resolved)
    return {"model": resolved, "started": started, "models": registry.status()}


@app.get("/presets")
def presets() -> list[dict[str, Any]]:
    return list(PRESETS.values())


@app.post("/compile")
def compile_schema(req: CompileRequest) -> dict[str, Any]:
    engine = _engine_or_503(req.model)
    try:
        return engine.compile(req.schema_, req.mode)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"{type(exc).__name__}: {exc}") from exc


@app.post("/schema/from-pydantic")
def schema_from_pydantic(req: PydanticRequest) -> dict[str, Any]:
    """Pydantic source -> `model_json_schema()`, the first step of the pipeline.

    Nothing in `source` is executed: it is parsed with `ast`, checked against an
    allowlist of classes, annotations and `Field()` keywords, and rebuilt with
    `pydantic.create_model`. See `app/pydantic_schema.py`.
    """
    try:
        return from_pydantic(req.source, req.model)
    except BadModel as exc:
        raise HTTPException(status_code=400, detail=exc.to_dict()) from exc


@app.post("/stream")
async def stream_endpoint(req: StreamRequest, request: Request) -> EventSourceResponse:
    """Unconstrained generation, streaming the distribution behind every token.

    Steps carry raw logits plus a histogram of the tail, so the browser can
    re-apply temperature / top-k / top-p to a recorded run without generating
    again. See `app/logprobs.py`.
    """
    engine = _engine_or_503(req.model)
    events: queue.Queue[tuple[str, Any] | None] = queue.Queue()
    halt = threading.Event()

    def worker() -> None:
        try:
            with engine.lock:
                for name, payload in stream_logprobs(
                    engine,
                    prompt=req.prompt,
                    max_new_tokens=req.max_new_tokens,
                    temperature=req.temperature,
                    top_k=req.top_k,
                    top_p=req.top_p,
                    seed=req.seed,
                    use_chat_template=req.use_chat_template,
                    top_k_report=req.top_k_report,
                    tail_bins=req.tail_bins,
                    stop=halt,
                ):
                    events.put((name, payload))
        except Exception as exc:
            events.put(("error", {"detail": f"{type(exc).__name__}: {exc}"}))
        finally:
            events.put(None)

    async def body():
        async with generation_lock:
            state.busy = True
            try:
                threading.Thread(target=worker, name="stream", daemon=True).start()
                while True:
                    if await request.is_disconnected():
                        halt.set()
                    item = await asyncio.to_thread(events.get)
                    if item is None:
                        break
                    name, payload = item
                    yield {"event": name, "data": json.dumps(payload)}
            finally:
                halt.set()
                state.busy = False

    return EventSourceResponse(body(), ping=15)


@app.post("/generate")
async def generate(req: GenerateRequest) -> EventSourceResponse:
    engine = _engine_or_503(req.model)
    events: queue.Queue[tuple[str, Any] | None] = queue.Queue()

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
                state.busy = False

    return EventSourceResponse(stream(), ping=15)
