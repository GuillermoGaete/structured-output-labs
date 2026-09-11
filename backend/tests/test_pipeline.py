"""End-to-end tests on the toy model. No network needed."""

from __future__ import annotations

import json
import re
import threading

import interegular
import pytest
from fastapi.testclient import TestClient
from interegular.fsm import anything_else

from app.engine import SYSTEM_PROMPT, BadPrefix, Engine, lean_schema
from app.logprobs import render_prompt
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


def test_prompt_only_mode_asks_in_words_and_never_masks(engine: Engine):
    """The "none" mode: the schema goes into the prompt, the observers see every token allowed, validation still runs."""
    schema = PRESETS["person"]["schema"]
    compiled = engine.compile(schema, "none")
    assert compiled["mode"] == "none" and compiled["backend"] == "none"
    assert compiled["token_dfa"] is None and compiled["regex"] is None
    assert '"name"' in compiled["schema_hint"]
    events = list(engine.generate(schema, "Ada, 36, London", mode="none", max_new_tokens=12, seed=1))
    meta, done = events[0][1], events[-1][1]
    steps = [p for n, p in events if n == "step"]
    assert meta["mode"] == "none" and meta["backend"] == "none" and meta["schema_in_prompt"] is True
    assert meta["regex"] is None
    # nothing is forbidden: every token stays allowed and no mass is removed
    assert all(s["n_allowed"] == s["vocab_size"] for s in steps)
    assert all(s["mass_removed"] == 0 for s in steps)
    assert all(s["fsm_state"] is None and not s["was_overridden"] for s in steps)
    assert all(s["top_original"][0]["token_id"] == s["top_forced"][0]["token_id"] for s in steps)
    # the shape is only checked at the end; a random model will not hit it, and that is the point
    assert isinstance(done["valid"], bool)
    # the schema is really in the text the model reads, asked for directly, and the meta carries that text
    lean = json.dumps(lean_schema(schema))
    assert '"name"' in lean and "title" not in lean and "description" not in lean
    rendered = engine.format_prompt("hello", False, schema)
    assert rendered.startswith("hello\n\n") and lean in rendered
    assert "Answer directly" in rendered and rendered.endswith("Return just the JSON:")
    assert engine.format_prompt("hello", False) == "hello"
    assert lean in meta["prompt_text"] and "Return just the JSON:" in meta["prompt_text"]
    # the lab's own commentary in a docstring never reaches the model
    assert "bias probe" in json.dumps(PRESETS["loan"]["schema"]) and "bias probe" not in engine.format_prompt("x", False, PRESETS["loan"]["schema"])
    # a request's own wording is used, and the schema is never lost
    custom = engine.format_prompt("hello", False, schema, "Only JSON please:\n{schema}\nGo.")
    assert custom.endswith(f"Only JSON please:\n{lean}\nGo.")
    bare = engine.format_prompt("hello", False, schema, "Only JSON please, no {braces}.")
    assert bare.endswith(f"Only JSON please, no {{braces}}.\n{lean}")
    custom_meta = next(p for n, p in engine.generate(schema, "Ada", mode="none", max_new_tokens=1, schema_hint="Just JSON: {schema}") if n == "meta")
    assert custom_meta["prompt_text"].endswith(f"Just JSON: {lean}")
    # with a mask on, the schema stays out of the prompt
    masked_meta = next(p for n, p in engine.generate(schema, "Ada", mode="fsm", max_new_tokens=1) if n == "meta")
    assert lean not in masked_meta["prompt_text"] and "Ada" in masked_meta["prompt_text"]


def test_chat_template_is_asked_not_to_think(engine: Engine):
    """Qwen3-style templates open a `<think>` block unless told not to; every rendered prompt tells them not to."""

    class Tok:
        chat_template = "{% for m in messages %}{{ m.content }}{% endfor %}"

        def __init__(self) -> None:
            self.kwargs: dict | None = None

        def apply_chat_template(self, messages, **kwargs):
            self.kwargs = kwargs
            return "".join(m["content"] for m in messages)

    tok = Tok()
    real = engine.tokenizer
    engine.tokenizer = tok
    try:
        rendered = engine.format_prompt("hello", True)
        assert rendered.startswith(SYSTEM_PROMPT) and rendered.endswith("hello")
        assert tok.kwargs is not None and tok.kwargs["enable_thinking"] is False and tok.kwargs["add_generation_prompt"] is True
        tok.kwargs = None
        assert render_prompt(engine, "hello", True) == "hello"
        assert tok.kwargs is not None and tok.kwargs["enable_thinking"] is False
    finally:
        engine.tokenizer = real


def test_reason_comes_before_the_outcome():
    """Where a preset asks for a reason, it is the first property: the mask makes the model write it before deciding."""
    seen = 0
    for pid, preset in PRESETS.items():
        props = list(preset["schema"].get("properties", {}))
        for key in ("reason", "reasoning", "steps"):
            if key in props:
                assert props[0] == key, (pid, props)
                seen += 1
    assert seen >= 13


def test_xgrammar_prints_its_own_grammar_and_masks(engine: Engine):
    if "xgr" not in engines_available():
        pytest.skip("xgrammar is not installed")
    payload = engine.compile(PRESETS["tree"]["schema"], "xgr")
    assert payload["mode"] == "xgr" and payload["backend"] == "xgrammar"
    assert payload["grammar_source"] == "engine"
    assert "::=" in payload["grammar"] and payload["grammar_rules"] >= 2
    # a random model stays inside the schema, and the integer range is enforced by the grammar itself
    schema = {"type": "object", "properties": {"score": {"type": "integer", "minimum": 1, "maximum": 5}}, "required": ["score"], "additionalProperties": False}
    for seed in (1, 2, 3):
        events = list(engine.generate(schema, "x", mode="xgr", max_new_tokens=24, seed=seed, temperature=1.0))
        done = events[-1][1]
        assert done["valid"], done
        assert 1 <= done["parsed"]["score"] <= 5
    steps = [p for n, p in engine.generate(PRESETS["tree"]["schema"], "x", mode="xgr", max_new_tokens=12, seed=1) if n == "step"]
    assert all(isinstance(s["accepting"], bool) for s in steps)
    # the jump-forward string is the forced text: at the very first step the grammar dictates the opening key
    assert steps[0]["ff_text"].startswith('{"value":')
    assert engine.compile(PRESETS["person"]["schema"], "auto")["mode"] == "fsm"


def test_compile_tree_returns_grammar(engine: Engine):
    payload = engine.compile(PRESETS["tree"]["schema"], "cfg")
    assert payload["grammar"].startswith("start: TreeNode\n")
    assert 'TreeNode: "{" "\\"value\\":" INT "," "\\"children\\":" "[" (TreeNode ("," TreeNode)*)? "]" "}"' in payload["grammar"]
    assert payload["grammar_rules"] >= 3
    # the FSM mode shows the regex instead
    assert engine.compile(PRESETS["person"]["schema"], "auto")["grammar"] is None


def test_cfg_steps_report_what_the_grammar_forces(engine: Engine):
    events = list(engine.generate(PRESETS["tree"]["schema"], "a tree", mode="cfg", max_new_tokens=40, seed=1))
    steps = [p for n, p in events if n == "step"]
    assert steps
    assert all(isinstance(s["accepting"], bool) for s in steps)
    assert all(isinstance(s["ff_token_ids"], list) for s in steps)
    # right after "{" the grammar has only one way forward: the first key
    forced = [s for s in steps if s["ff_token_ids"]]
    assert forced, "no step reported forced tokens"
    assert all(s["ff_text"] for s in forced)
    # the FSM mode has no grammar probe, so the fields stay at their defaults
    fsm = [p for n, p in engine.generate(PRESETS["person"]["schema"], "x", mode="fsm", max_new_tokens=3, seed=1) if n == "step"]
    assert fsm and fsm[0]["accepting"] is None and fsm[0]["ff_token_ids"] == []


def test_forced_choice_probes_offer_real_choices():
    for pid in ("hire", "flat", "lineup", "phone", "loan_pick", "doctor", "fault"):
        schema = PRESETS[pid]["schema"]
        enums = [v for v in schema["properties"].values() if "enum" in v]
        assert enums, pid
        assert all(len(e["enum"]) >= 2 for e in enums), pid
    assert "cannot tell" in PRESETS["lineup"]["schema"]["properties"]["who"]["enum"]
    assert {"both", "neither"} <= set(PRESETS["loan_pick"]["schema"]["properties"]["approve"]["enum"])
    # one salary per person, same bounds, so the fields are comparable
    offers = PRESETS["offers"]["schema"]["properties"]
    assert len(offers) == 4 and len({(v["minimum"], v["maximum"]) for v in offers.values()}) == 1


def test_probe_variants_are_counterfactual_pairs():
    probes = [p for p in PRESETS.values() if p.get("variants")]
    assert {p["id"] for p in probes} >= {"tenant", "callback", "wallet", "trust", "salary"}
    for p in probes:
        labels = [v["label"] for v in p["variants"]]
        assert len(labels) == len(set(labels)) >= 2, p["id"]
        assert p["prompt"] == p["variants"][0]["prompt"]
        # one attribute swapped, everything else the same: the prompts share most of their words
        words = [set(v["prompt"].split()) for v in p["variants"]]
        common = set.intersection(*words)
        assert all(len(common) / len(w) > 0.7 for w in words), p["id"]


from app.engine import engines_available


@pytest.mark.parametrize("preset_id", sorted(PRESETS))
def test_every_preset_runs_on_every_engine(engine: Engine, preset_id: str):
    """The catalogue avoids what one engine lacks (numeric ranges, for one), so every preset must start on all of them."""
    schema = PRESETS[preset_id]["schema"]
    compiled = engine.compile(schema, "fsm")
    assert compiled["regex"], compiled.get("regex_error")
    for mode in engines_available() + ["none"]:
        events = list(engine.generate(schema, PRESETS[preset_id]["prompt"], mode=mode, max_new_tokens=2, seed=1))
        assert events[0][0] == "meta" and events[0][1]["mode"] == mode
        assert sum(1 for name, _ in events if name == "step") >= 1


def test_fsm_compiles_a_small_integer_range_as_an_enum(engine: Engine):
    from app.engine import fsm_schema

    schema = {"type": "object", "properties": {"score": {"type": "integer", "minimum": 1, "maximum": 5}}, "required": ["score"], "additionalProperties": False}
    compiled, ignored = fsm_schema(schema)
    assert compiled["properties"]["score"] == {"type": "integer", "enum": [1, 2, 3, 4, 5]}
    assert ignored == []
    payload = engine.compile(schema, "fsm")
    assert payload["fsm_ignored"] == []
    assert "(1|2|3|4|5)" in payload["regex"]
    # exclusive bounds shift the ends
    compiled, _ = fsm_schema({"type": "integer", "exclusiveMinimum": 0, "exclusiveMaximum": 4})
    assert compiled["enum"] == [1, 2, 3]
    # the mask holds: a random model can only write scores in range
    for seed in (1, 2, 3):
        events = list(engine.generate(schema, "x", mode="fsm", max_new_tokens=30, seed=seed))
        done = events[-1][1]
        assert done["valid"], done


def test_fsm_reports_the_bounds_it_cannot_enforce(engine: Engine):
    schema = {
        "type": "object",
        "properties": {"p": {"type": "number", "minimum": 0, "maximum": 1}, "n": {"type": "integer", "minimum": 0}},
        "required": ["p", "n"],
        "additionalProperties": False,
    }
    payload = engine.compile(schema, "fsm")
    assert set(payload["fsm_ignored"]) == {"p.minimum", "p.maximum", "n.minimum"}
    assert engine.compile(schema, "cfg")["fsm_ignored"] == []


def test_generate_stops_when_asked(engine: Engine):
    stop = threading.Event()
    steps = []
    done = None
    for name, payload in engine.generate(PRESETS["person"]["schema"], "x", mode="fsm", max_new_tokens=40, seed=1, stop=stop):
        if name == "step":
            steps.append(payload)
            if len(steps) == 3:
                stop.set()
        if name == "done":
            done = payload
    assert len(steps) == 3
    assert done is not None and done["stopped_by"] == "stopped"


def _steps(engine: Engine, schema, **kw):
    return [p for n, p in engine.generate(schema, "x", max_new_tokens=14, seed=1, **kw) if n == "step"]


@pytest.mark.parametrize("preset_id,mode", [("person", "fsm"), ("tree", "cfg"), ("tree", "xgr")])
def test_generate_from_prefix_replays_then_diverges(engine: Engine, preset_id: str, mode: str):
    if mode not in engines_available():
        pytest.skip("xgrammar is not installed")
    schema = PRESETS[preset_id]["schema"]
    base = _steps(engine, schema, mode=mode)
    prefix = [s["token_id"] for s in base[:5]]
    assert engine.tokenizer.eos_token_id not in prefix
    steps = _steps(engine, schema, mode=mode, prefix_token_ids=prefix)
    assert [s["token_id"] for s in steps[:5]] == prefix
    assert all(s["replayed"] for s in steps[:5])
    assert not steps[5]["replayed"] and steps[5]["i"] == 5
    # the replay walked the constraint the same way: same masks, same nesting
    assert [s["n_allowed"] for s in steps[:5]] == [s["n_allowed"] for s in base[:5]]
    assert [s["stack_depth"] for s in steps[:5]] == [s["stack_depth"] for s in base[:5]]
    if mode == "fsm":
        assert [s["fsm_state"] for s in steps[:5]] == [s["fsm_state"] for s in base[:5]]
    # a seeded run continues exactly as the original did
    assert [s["token_id"] for s in steps[5:8]] == [s["token_id"] for s in base[5:8]]


def test_generate_from_prefix_can_force_another_allowed_token(engine: Engine):
    schema = PRESETS["person"]["schema"]
    base = _steps(engine, schema, mode="fsm")
    # a step with more than one allowed token, and an allowed token that was not chosen
    j, alt = next(
        (i, e["token_id"])
        for i, s in enumerate(base[1:], start=1)
        for e in s["top_forced"]
        if e["token_id"] != s["token_id"] and len(s["top_forced"]) > 1
    )
    prefix = [s["token_id"] for s in base[:j]] + [alt]
    steps = _steps(engine, schema, mode="fsm", prefix_token_ids=prefix)
    assert steps[j]["token_id"] == alt and steps[j]["replayed"]
    assert not steps[j + 1]["replayed"]


def test_masked_prefix_is_rejected(engine: Engine):
    schema = PRESETS["person"]["schema"]
    base = _steps(engine, schema, mode="fsm")
    masked = next((e["token_id"] for s in base for e in s["top_original"] if not e["allowed"]), None)
    assert masked is not None
    with pytest.raises(BadPrefix) as info:
        list(engine.generate(schema, "x", mode="fsm", max_new_tokens=14, seed=1, prefix_token_ids=[masked]))
    assert info.value.step == 0 and info.value.token_id == masked
    with pytest.raises(BadPrefix):
        list(engine.generate(schema, "x", mode="fsm", max_new_tokens=3, seed=1, prefix_token_ids=[s["token_id"] for s in base[:3]]))


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
        assert {"person", "invoice", "tree"} <= {p["id"] for p in presets}
        assert all({"id", "name", "group", "description", "schema", "prompt", "model_source"} <= set(p) for p in presets)
        assert {"fsm", "cfg"} <= set(health["engines"])
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
