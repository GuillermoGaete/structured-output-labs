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

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from .engine import DEFAULT_MODEL_ID, Engine, engine_from_env
from .presets import PRESETS

MAX_NEW_TOKENS_CAP = int(os.environ.get("MAX_NEW_TOKENS_CAP", "200"))


class State:
    engine: Engine | None = None
    error: str | None = None
    loading: bool = True
    started_at: float = time.time()
    loaded_at: float | None = None
    busy: bool = False
    model_id: str = os.environ.get("MODEL_ID", DEFAULT_MODEL_ID)


state = State()
generation_lock = asyncio.Lock()


def _load_engine() -> None:
    try:
        state.engine = engine_from_env()
        state.model_id = state.engine.model_id
        state.loaded_at = time.time()
    except Exception as exc:  # surfaced through /health so the UI can show it
        state.error = f"{type(exc).__name__}: {exc}"
    finally:
        state.loading = False


@asynccontextmanager
async def lifespan(app: FastAPI):
    threading.Thread(target=_load_engine, name="model-loader", daemon=True).start()
    yield


app = FastAPI(title="Structured Output Labs backend", version="0.1.0", lifespan=lifespan)
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

    model_config = {"populate_by_name": True}


class GenerateRequest(CompileRequest):
    prompt: str = Field(min_length=1, max_length=4000)
    max_new_tokens: int = Field(default=120, ge=1, le=MAX_NEW_TOKENS_CAP)
    temperature: float = Field(default=0.0, ge=0.0, le=2.0)
    top_k_sampling: int = Field(default=0, ge=0, le=100)
    top_k_report: int = Field(default=8, ge=1, le=20)
    seed: int | None = None
    use_chat_template: bool = True


def _engine_or_503() -> Engine:
    if state.engine is None:
        if state.error:
            raise HTTPException(status_code=503, detail=f"model failed to load: {state.error}")
        raise HTTPException(status_code=503, detail="model is still loading")
    return state.engine


@app.get("/")
def root() -> dict[str, Any]:
    return {"service": "structured-output-labs", "docs": "/docs", "health": "/health"}


@app.get("/health")
def health() -> dict[str, Any]:
    loaded = state.engine is not None
    return {
        "status": "ok" if loaded else ("error" if state.error else "loading"),
        "loaded": loaded,
        "loading": state.loading,
        "error": state.error,
        "model_id": state.model_id,
        "toy": bool(state.engine and state.engine.toy),
        "device": "cpu",
        "vocab_size": state.engine.vocab_size if state.engine else None,
        "busy": state.busy,
        "uptime_s": round(time.time() - state.started_at, 1),
        "load_time_s": round(state.loaded_at - state.started_at, 1) if state.loaded_at else None,
        "max_new_tokens_cap": MAX_NEW_TOKENS_CAP,
    }


@app.get("/presets")
def presets() -> list[dict[str, Any]]:
    return list(PRESETS.values())


@app.post("/compile")
def compile_schema(req: CompileRequest) -> dict[str, Any]:
    engine = _engine_or_503()
    try:
        return engine.compile(req.schema_, req.mode)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"{type(exc).__name__}: {exc}") from exc


@app.post("/generate")
async def generate(req: GenerateRequest) -> EventSourceResponse:
    engine = _engine_or_503()
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
