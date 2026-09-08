"""Unconstrained / JSON-mode generation, timings, stop, summary. Toy model, no network."""

from __future__ import annotations

import threading

from app.engine import Engine
from app.presets import PRESETS
from app.validate import FAILURE_CLASSES

PERSON = PRESETS["person"]
SAMPLING = dict(temperature=0.7, top_k_sampling=20, top_p=0.8)


def run(engine: Engine, **kw):
    events = list(engine.generate(PERSON["schema"], PERSON["prompt"], **kw))
    meta = events[0][1]
    done = events[-1][1]
    steps = [p for n, p in events if n == "step"]
    return meta, steps, done


def test_none_mode_masks_nothing(engine: Engine):
    meta, steps, done = run(engine, constraint="none", max_new_tokens=12, seed=1, **SAMPLING)
    assert meta["constraint"] == "none" and meta["mode"] == "none"
    assert meta["backend"] == "none" and meta["engine_backend"] == "none"
    assert meta["compile_cached"] is None and meta["compile_ms"] == 0.0
    assert meta["sampling"] == {"temperature": 0.7, "top_k": 20, "top_p": 0.8, "seed": 1}
    assert steps
    for step in steps:
        assert step["n_allowed"] == step["vocab_size"]
        assert step["mass_removed"] == 0.0
        assert step["fsm_state"] is None
        assert not step["was_overridden"]
        assert step["mask_ms"] == 0.0
        assert [(e["token_id"], e["p"]) for e in step["top_forced"]] == [(e["token_id"], e["p"]) for e in step["top_original"]]
        assert all(e["allowed"] for e in step["top_original"])
    assert done["engine_backend"] == "none" and done["mode"] == "none"
    assert done["validation"]["failure_class"] in FAILURE_CLASSES
    assert done["validation"]["stop_reason"] == done["stop_reason"] == done["stopped_by"]
    assert done["timing"]["n_new_tokens"] == len(done["tokens"])
    assert done["summary"]["n_overridden"] == 0


def test_sampling_is_seeded_and_top_p_can_force_argmax(engine: Engine):
    first = run(engine, constraint="none", max_new_tokens=10, seed=7, **SAMPLING)[1]
    second = run(engine, constraint="none", max_new_tokens=10, seed=7, **SAMPLING)[1]
    assert [s["token_id"] for s in first] == [s["token_id"] for s in second]
    _, steps, _ = run(engine, constraint="none", max_new_tokens=8, seed=7, temperature=0.9, top_p=1e-6)
    assert steps and all(s["argmax_taken"] for s in steps)
    assert all(s["token_id"] == s["top_original"][0]["token_id"] for s in steps)


def test_json_mode_uses_the_grammar_engine(engine: Engine):
    meta, steps, done = run(engine, constraint="json", max_new_tokens=30, seed=2, **SAMPLING)
    assert meta["constraint"] == "json" and meta["mode"] == "json"
    assert meta["engine_backend"] == "llguidance" and meta["compile_cached"] is False
    assert steps and steps[0]["partial_text"].startswith("{")
    assert all(s["n_allowed"] < s["vocab_size"] for s in steps)
    if done["stop_reason"] == "eos":
        assert done["validation"]["parse_ok"], done["validation"]


def test_schema_in_prompt_is_rendered(engine: Engine):
    plain, _, _ = run(engine, constraint="none", max_new_tokens=1)
    with_schema, _, _ = run(engine, constraint="none", max_new_tokens=1, schema_in_prompt=True)
    assert with_schema["schema_in_prompt"]
    assert '"properties"' in with_schema["prompt_rendered"]
    assert with_schema["prompt_token_count"] > plain["prompt_token_count"]
    assert plain["prompt_rendered"].startswith("<|im_start|>")  # the toy tokenizer has a chat template


def test_timings_and_compile_cache(engine: Engine):
    schema = dict(PERSON["schema"])
    schema["title"] = "PersonCacheProbe"  # a regex the LRU has not seen
    fresh = list(engine.generate(schema, PERSON["prompt"], constraint="schema", mode="fsm", max_new_tokens=6, seed=1))
    again = list(engine.generate(schema, PERSON["prompt"], constraint="schema", mode="fsm", max_new_tokens=6, seed=1))
    assert fresh[0][1]["compile_cached"] is False
    assert again[0][1]["compile_cached"] is True
    forced = list(engine.generate(schema, PERSON["prompt"], constraint="schema", mode="fsm", max_new_tokens=2, seed=1, force_compile=True))
    assert forced[0][1]["compile_cached"] is False and forced[0][1]["compile_ms"] > 0
    steps = [p for n, p in again if n == "step"]
    done = again[-1][1]
    timing = done["timing"]
    assert timing["prefill_ms"] == steps[0]["forward_ms"]
    assert abs(timing["decode_ms"] - sum(s["forward_ms"] for s in steps[1:])) < 1e-6
    assert abs(timing["processor_ms"] - sum(s["mask_ms"] for s in steps)) < 1e-6
    assert timing["total_ms"] >= timing["compile_ms"] + sum(s["dt_ms"] for s in steps) - 1e-6
    assert timing["n_prompt_tokens"] == again[0][1]["prompt_token_count"]
    assert timing["tokens_per_s"] > 0 and timing["torch_threads"] >= 1
    assert all(s["mask_ms"] > 0 for s in steps)
    assert all(s["dt_ms"] >= s["forward_ms"] + s["mask_ms"] for s in steps)


def test_include_steps_false_keeps_the_summary(engine: Engine):
    events = list(engine.generate(PERSON["schema"], PERSON["prompt"], mode="fsm", max_new_tokens=10, seed=1, include_steps=False))
    assert [n for n, _ in events] == ["meta", "done"]
    done = events[-1][1]
    assert done["n_steps"] >= 1
    assert set(done["summary"]) == {"n_overridden", "n_argmax_taken", "mean_vocab_kept", "mean_mass_removed", "min_n_allowed", "max_stack_depth"}
    assert 0 < done["summary"]["mean_vocab_kept"] <= 1
    assert done["summary"]["min_n_allowed"] >= 1
    assert done["timing"]["n_new_tokens"] == len(done["tokens"])


def test_stop_event_ends_the_run(engine: Engine):
    stop = threading.Event()
    stop.set()
    events = list(engine.generate(PERSON["schema"], PERSON["prompt"], mode="fsm", max_new_tokens=10, stop=stop))
    assert [n for n, _ in events] == ["meta", "done"]
    assert events[-1][1]["stop_reason"] == "stopped"
    assert events[-1][1]["n_steps"] == 0


def test_overridden_means_the_argmax_was_forbidden(engine: Engine):
    _, steps, _ = run(engine, mode="fsm", max_new_tokens=40, seed=1)
    assert any(s["was_overridden"] for s in steps)
    for step in steps:
        top = step["top_original"][0]  # the model's argmax is the first entry of the original top-k
        assert step["was_overridden"] == (not top["allowed"])
        if step["argmax_taken"]:
            assert not step["was_overridden"]
            assert step["token_id"] == top["token_id"]


def test_compile_reports_constraint(engine: Engine):
    none = engine.compile(PERSON["schema"], "auto", "none")
    assert none["mode"] == "none" and none["engine_backend"] == "none"
    assert none["char_fsm"] is None and none["token_dfa"] is None and none["regex"]
    json_mode = engine.compile(PERSON["schema"], "auto", "json")
    assert json_mode["mode"] == "json" and json_mode["engine_backend"] == "llguidance"
    schema = engine.compile(PERSON["schema"], "auto", "schema")
    assert schema["mode"] == "fsm" and schema["constraint"] == "schema" and schema["token_dfa"]
