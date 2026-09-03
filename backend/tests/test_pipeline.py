"""End-to-end tests on the toy model. No network needed."""

from __future__ import annotations

import json
import re

import interegular
import pytest
from fastapi.testclient import TestClient
from interegular.fsm import anything_else

from app.engine import Engine
from app.presets import PRESETS, is_recursive
from app.tracing import clean_bpe_glyphs, json_stack_depth


@pytest.fixture(scope="session")
def engine() -> Engine:
    return Engine(toy=True)


def test_recursion_detection():
    assert is_recursive(PRESETS["tree"]["schema"])
    assert not is_recursive(PRESETS["person"]["schema"])
    assert not is_recursive(PRESETS["invoice"]["schema"])


def test_text_utils():
    assert clean_bpe_glyphs("Ġname") == " name"
    assert clean_bpe_glyphs("Ċ") == "\n"
    assert json_stack_depth('{"a": [1, {"b"') == 3
    assert json_stack_depth('{"a": "{[["}') == 0


def test_compile_person(engine: Engine):
    payload = engine.compile(PRESETS["person"]["schema"], "auto")
    assert payload["mode"] == "fsm"
    assert payload["regex"].startswith("\\{")
    fsm = payload["char_fsm"]
    assert fsm["initial"] in {n["id"] for n in fsm["nodes"]}
    assert fsm["finals"]
    assert all(e["label"] for e in fsm["edges"])
    dfa = payload["token_dfa"]
    assert dfa["initial"] == 0
    assert dfa["finals"]
    assert dfa["edges"]
    # every edge points at a node we exported
    ids = {n["id"] for n in dfa["nodes"]}
    assert all(e["source"] in ids and e["target"] in ids for e in dfa["edges"])


def test_compile_tree_defaults_to_cfg(engine: Engine):
    payload = engine.compile(PRESETS["tree"]["schema"], "auto")
    assert payload["mode"] == "cfg"
    assert payload["recursive"]
    # outlines_core still produces a (bounded) regex for it
    assert payload["regex"]


def is_live_prefix(regex: str, text: str) -> bool:
    """True when `text` can still be extended into a full match of `regex`."""
    fsm = interegular.parse_pattern(regex).to_fsm()
    state = fsm.initial
    for ch in text:
        symbol = fsm.alphabet.get(ch) if ch in fsm.alphabet else fsm.alphabet.get(anything_else)
        nxt = fsm.map.get(state, {}).get(symbol)
        if nxt is None:
            return False
        state = nxt
    return fsm.islive(state)


# A schema whose regex is finite (booleans + bounded strings), so even a random
# model must reach EOS within a few dozen tokens.
BOUNDED_SCHEMA = {
    "type": "object",
    "properties": {
        "ok": {"type": "boolean"},
        "tag": {"type": "string", "maxLength": 4},
        "kind": {"type": "string", "enum": ["a", "b"]},
    },
    "required": ["ok", "tag", "kind"],
    "additionalProperties": False,
}


def test_generate_bounded_schema_reaches_eos(engine: Engine):
    events = list(engine.generate(BOUNDED_SCHEMA, "anything", mode="fsm", max_new_tokens=80, seed=1))
    meta, done = events[0][1], events[-1][1]
    steps = [p for n, p in events if n == "step"]
    assert done["stopped_by"] == "eos", done
    assert steps[-1]["token_id"] == engine.tokenizer.eos_token_id
    assert re.fullmatch(meta["regex"], done["text"]), done["text"]
    assert done["valid"], done["validation_error"]
    # at the final state the automaton allows exactly one continuation: EOS
    assert steps[-1]["n_allowed"] == 1


@pytest.mark.parametrize("preset_id", ["person", "invoice"])
def test_generate_fsm_never_leaves_the_automaton(engine: Engine, preset_id: str):
    preset = PRESETS[preset_id]
    events = list(engine.generate(preset["schema"], preset["prompt"], mode="fsm", max_new_tokens=60, seed=1))
    names = [n for n, _ in events]
    assert names[0] == "meta" and names[-1] == "done"
    meta = events[0][1]
    done = events[-1][1]
    steps = [p for n, p in events if n == "step"]
    assert steps, "no steps produced"
    # The random model may loop inside `[0-9]*` and hit max_new_tokens; what
    # must hold regardless is that every partial text is a live prefix.
    for step in steps:
        assert is_live_prefix(meta["regex"], step["partial_text"]), step["partial_text"]
    if done["stopped_by"] == "eos":
        assert re.fullmatch(meta["regex"], done["text"]), done["text"]
        assert done["valid"], done["validation_error"]
        json.loads(done["text"])
    for step in steps:
        assert 0 < step["n_allowed"] <= step["vocab_size"]
        assert 0.0 <= step["mass_removed"] <= 1.0 + 1e-6
        assert step["fsm_state"] is not None
        forced_mass = sum(e["p"] for e in step["top_forced"])
        assert forced_mass <= 1.0 + 1e-5
        assert all(e["allowed"] for e in step["top_forced"])
        # a token the mask forbids must not appear as allowed in the original list
        forbidden = {e["token_id"] for e in step["top_original"] if not e["allowed"]}
        assert forbidden.isdisjoint({e["token_id"] for e in step["top_forced"]})
    # the random model almost never wants JSON: the mask has to override it somewhere
    assert any(s["was_overridden"] for s in steps)


BOUNDED_RECURSIVE_SCHEMA = {
    "$defs": {
        "N": {
            "type": "object",
            "properties": {"ok": {"type": "boolean"}, "kids": {"type": "array", "items": {"$ref": "#/$defs/N"}}},
            "required": ["ok", "kids"],
            "additionalProperties": False,
        }
    },
    "$ref": "#/$defs/N",
}


def test_generate_cfg_recursive(engine: Engine):
    events = list(engine.generate(BOUNDED_RECURSIVE_SCHEMA, "a tree", mode="cfg", max_new_tokens=200, seed=3))
    done = events[-1][1]
    steps = [p for n, p in events if n == "step"]
    assert events[0][1]["backend"] == "llguidance"
    assert steps
    assert all(s["fsm_state"] is None for s in steps)  # llguidance exposes no automaton state
    # `{"ok": true, "kids": [` already needs a stack of two
    assert max(s["stack_depth"] for s in steps) >= 2
    if done["stopped_by"] == "eos":
        assert done["valid"], done["validation_error"]


def test_generate_cfg_tree_preset_runs(engine: Engine):
    preset = PRESETS["tree"]
    events = list(engine.generate(preset["schema"], preset["prompt"], mode="cfg", max_new_tokens=40, seed=3))
    assert events[0][1]["backend"] == "llguidance"
    assert events[0][1]["recursive"]
    assert events[-1][0] == "done"
    steps = [p for n, p in events if n == "step"]
    assert steps and steps[0]["partial_text"].startswith("{")


def test_observers_are_reset_between_runs(engine: Engine):
    preset = PRESETS["person"]
    first = [p for n, p in engine.generate(preset["schema"], preset["prompt"], mode="fsm", max_new_tokens=60, seed=1) if n == "step"]
    second = [p for n, p in engine.generate(preset["schema"], preset["prompt"], mode="fsm", max_new_tokens=60, seed=1) if n == "step"]
    assert [s["i"] for s in first] == list(range(len(first)))
    assert [s["token_id"] for s in first] == [s["token_id"] for s in second]


def test_http_surface(monkeypatch):
    monkeypatch.setenv("TOY_MODEL", "1")
    from app import main

    with TestClient(main.app) as client:
        # wait for the background loader
        for _ in range(200):
            health = client.get("/health").json()
            if health["loaded"] or health["error"]:
                break
        assert health["loaded"], health
        assert health["toy"]
        presets = client.get("/presets").json()
        assert {p["id"] for p in presets} == {"person", "invoice", "tree"}
        compiled = client.post("/compile", json={"schema": PRESETS["person"]["schema"], "mode": "auto"}).json()
        assert compiled["mode"] == "fsm"
        with client.stream(
            "POST",
            "/generate",
            json={"schema": PRESETS["person"]["schema"], "prompt": "hi", "max_new_tokens": 40, "seed": 1},
        ) as response:
            assert response.status_code == 200
            body = "".join(response.iter_text())
        assert "event: meta" in body
        assert "event: step" in body
        assert "event: done" in body
