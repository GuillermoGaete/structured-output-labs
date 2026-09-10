"""The model registry and the `model` request field, on the toy model."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.engine import TOY_MODEL_ID
from app.presets import PRESETS
from app.registry import ModelRegistry


def test_registry_toy_lifecycle():
    registry = ModelRegistry(["ignored/when-toy"], toy=True, max_resident=1, warm_up=False)
    assert registry.ids == [TOY_MODEL_ID] and registry.default_id == TOY_MODEL_ID
    assert registry.get(None) is None
    assert registry.start_loading(None)
    assert not registry.start_loading(None)  # already loading
    engine = registry.load_blocking(None)
    assert registry.get(TOY_MODEL_ID) is engine
    rows = registry.status()
    assert rows[0]["loaded"] and rows[0]["default"] and rows[0]["n_layers"] == 2 and not rows[0]["loading"]
    try:
        registry.get("nope/unknown")
        assert False, "unknown ids must raise"
    except KeyError:
        pass


def test_http_models_and_model_field(monkeypatch):
    monkeypatch.setenv("TOY_MODEL", "1")
    from app import main

    with TestClient(main.app) as client:
        for _ in range(200):
            health = client.get("/health").json()
            if health["loaded"] or health["error"]:
                break
        assert health["loaded"], health
        assert health["models"][0]["id"] == TOY_MODEL_ID and health["models"][0]["default"]
        listing = client.get("/models").json()
        assert listing["default"] == TOY_MODEL_ID and listing["models"][0]["loaded"]
        assert client.post("/models/load", json={"model": TOY_MODEL_ID}).status_code == 202
        assert client.post("/models/load", json={"model": "nope/unknown"}).status_code == 404
        ok = client.post("/compile", json={"schema": PRESETS["person"]["schema"], "model": TOY_MODEL_ID})
        assert ok.status_code == 200 and ok.json()["model_id"] == TOY_MODEL_ID
        assert client.post("/compile", json={"schema": PRESETS["person"]["schema"], "model": "nope/unknown"}).status_code == 404
        assert client.post("/compile", json={"schema": PRESETS["person"]["schema"]}).status_code == 200  # default
        gen = client.post("/generate", json={"schema": PRESETS["person"]["schema"], "prompt": "hi", "max_new_tokens": 3, "model": "nope/unknown"})
        assert gen.status_code == 404
