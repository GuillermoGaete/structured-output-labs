"""Several models in one process: an allowlist, lazy loading, a few resident at a time.

    MODEL_IDS=Qwen/Qwen2.5-0.5B-Instruct,Qwen/Qwen2.5-1.5B-Instruct   # first = default
    MAX_RESIDENT_MODELS=2                                              # LRU eviction beyond this

The default model loads at boot; the others load in a background thread the
first time a request names them (the request gets a 503 with Retry-After and
the client polls /models). Every request is still serialised by the HTTP
layer, so two models never run at the same time on the CPU.
"""

from __future__ import annotations

import gc
import os
import threading
import time
from collections import OrderedDict
from typing import Any

import torch

from .engine import DEFAULT_MODEL_ID, TOY_MODEL_ID, Engine


class ModelRegistry:
    def __init__(self, ids: list[str], toy: bool = False, max_resident: int = 2, warm_up: bool = True) -> None:
        self.toy = toy
        self.ids = [TOY_MODEL_ID] if toy else list(dict.fromkeys(ids))  # de-duplicated, order kept
        if not self.ids:
            raise ValueError("MODEL_IDS is empty")
        self.default_id = self.ids[0]
        self.max_resident = max(1, max_resident)
        self.warm_up = warm_up
        self._engines: OrderedDict[str, Engine] = OrderedDict()
        self._loading: dict[str, threading.Thread] = {}
        self._errors: dict[str, str] = {}
        self._load_times: dict[str, float] = {}
        self._warmed: set[str] = set()
        self._lock = threading.Lock()

    # ------------------------------------------------------------------ lookup
    def resolve_id(self, model_id: str | None) -> str:
        if model_id is None or model_id == "":
            return self.default_id
        if model_id not in self.ids:
            raise KeyError(model_id)
        return model_id

    def get(self, model_id: str | None) -> Engine | None:
        """The loaded engine for `model_id` (touching the LRU order), or None while it is not resident."""
        resolved = self.resolve_id(model_id)
        with self._lock:
            engine = self._engines.get(resolved)
            if engine is not None:
                self._engines.move_to_end(resolved)
            return engine

    def error(self, model_id: str | None) -> str | None:
        return self._errors.get(self.resolve_id(model_id))

    def is_loading(self, model_id: str | None) -> bool:
        resolved = self.resolve_id(model_id)
        with self._lock:
            thread = self._loading.get(resolved)
            return thread is not None and thread.is_alive()

    # ------------------------------------------------------------------ loading
    def start_loading(self, model_id: str | None) -> bool:
        """Load `model_id` in a background thread; returns False when it is already resident or loading."""
        resolved = self.resolve_id(model_id)
        with self._lock:
            if resolved in self._engines:
                return False
            thread = self._loading.get(resolved)
            if thread is not None and thread.is_alive():
                return False
            self._errors.pop(resolved, None)
            thread = threading.Thread(target=self._load, args=(resolved,), name=f"load:{resolved}", daemon=True)
            self._loading[resolved] = thread
            thread.start()
            return True

    def load_blocking(self, model_id: str | None) -> Engine:
        resolved = self.resolve_id(model_id)
        self.start_loading(resolved)
        thread = self._loading.get(resolved)
        if thread is not None:
            thread.join()
        engine = self.get(resolved)
        if engine is None:
            raise RuntimeError(self._errors.get(resolved, f"{resolved} did not load"))
        return engine

    def _evict_to(self, keep: int) -> None:
        """Drop least-recently-used engines until at most `keep` remain."""
        evicted: list[Engine] = []
        with self._lock:
            while len(self._engines) > max(keep, 0):
                victim_id, victim = self._engines.popitem(last=False)
                self._warmed.discard(victim_id)
                evicted.append(victim)
        if evicted:
            del evicted
            gc.collect()

    def _load(self, resolved: str) -> None:
        started = time.time()
        # Make room *before* allocating: building the new Engine while `max_resident`
        # are still held peaks at one model too many, which is what gets a
        # memory-tight container OOM-killed mid-download.
        self._evict_to(self.max_resident - 1)
        try:
            engine = Engine(model_id=resolved, toy=self.toy)
        except Exception as exc:
            with self._lock:
                self._errors[resolved] = f"{type(exc).__name__}: {exc}"
                self._loading.pop(resolved, None)
            return
        with self._lock:
            self._engines[resolved] = engine
            self._engines.move_to_end(resolved)
            self._load_times[resolved] = time.time() - started
            self._loading.pop(resolved, None)
        self._evict_to(self.max_resident)
        gc.collect()
        if self.warm_up and not self.toy:
            try:
                engine.warm_up()
            except Exception:  # pragma: no cover - warm-up is best effort
                pass
        with self._lock:
            self._warmed.add(resolved)

    # ------------------------------------------------------------------ status
    def status(self) -> list[dict[str, Any]]:
        with self._lock:
            rows = []
            for model_id in self.ids:
                engine = self._engines.get(model_id)
                thread = self._loading.get(model_id)
                row: dict[str, Any] = {
                    "id": model_id,
                    "default": model_id == self.default_id,
                    "loaded": engine is not None,
                    "loading": thread is not None and thread.is_alive(),
                    "warmed_up": model_id in self._warmed,
                    "error": self._errors.get(model_id),
                    "load_time_s": round(self._load_times[model_id], 1) if model_id in self._load_times else None,
                    "toy": self.toy,
                }
                if engine is not None:
                    info = engine.model_info()
                    row.update(
                        {
                            "vocab_size": engine.vocab_size,
                            "n_params": info["n_params"],
                            "n_layers": info["n_layers"],
                            "hidden_size": info["hidden_size"],
                            "tied_embeddings": info["tied_embeddings"],
                        }
                    )
                rows.append(row)
            return rows

    @property
    def resident_ids(self) -> list[str]:
        with self._lock:
            return list(self._engines)


def registry_from_env() -> ModelRegistry:
    toy = os.environ.get("TOY_MODEL", "0") == "1"
    threads = os.environ.get("TORCH_THREADS")
    if threads:
        torch.set_num_threads(int(threads))
    raw = os.environ.get("MODEL_IDS") or os.environ.get("MODEL_ID", DEFAULT_MODEL_ID)
    ids = [part.strip() for part in raw.split(",") if part.strip()]
    return ModelRegistry(
        ids,
        toy=toy,
        max_resident=int(os.environ.get("MAX_RESIDENT_MODELS", "2")),
        warm_up=os.environ.get("WARMUP", "1") == "1",
    )
