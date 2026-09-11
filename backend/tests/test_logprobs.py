"""The logprobs mode: unconstrained streaming with the distribution per token."""

from __future__ import annotations

import math

import pytest
import torch
from fastapi.testclient import TestClient

from app.engine import Engine
from app.logprobs import _sample, stream


@pytest.fixture(scope="module")
def engine() -> Engine:
    return Engine(toy=True)


def run(engine: Engine, **kw):
    events = list(stream(engine, prompt="Write a person as JSON", **kw))
    meta = events[0][1]
    done = events[-1][1]
    steps = [p for name, p in events if name == "step"]
    return meta, steps, done


def test_meta_describes_the_run(engine: Engine):
    meta, steps, done = run(engine, max_new_tokens=6, temperature=0.0)
    assert meta["model_id"] == engine.model_id
    assert meta["vocab_size"] == engine.vocab_size
    assert meta["prompt_token_count"] > 0
    assert meta["sampling"] == {"temperature": 0.0, "top_k": 0, "top_p": 1.0, "seed": None}
    # The toy tokenizer has no chat template, so the prompt is passed through
    # unchanged. What matters is that no JSON system prompt was prepended: this
    # mode is not about JSON.
    assert meta["prompt_rendered"] == "Write a person as JSON"
    assert "JSON generator" not in meta["prompt_rendered"]
    assert steps and done["n_steps"] == len([s for s in steps if s["text"] != ""])


def test_every_step_carries_the_distribution(engine: Engine):
    _, steps, _ = run(engine, max_new_tokens=5, temperature=0.0, top_k_report=8)
    for s in steps:
        assert len(s["top"]) == 8
        # Sorted by logit, descending, and ranked from zero.
        assert [e["rank"] for e in s["top"]] == list(range(8))
        assert all(a["logit"] >= b["logit"] for a, b in zip(s["top"], s["top"][1:]))
        assert 0.0 <= s["chosen_p"] <= 1.0
        assert s["entropy_bits"] >= 0


def test_greedy_picks_the_top_ranked_token(engine: Engine):
    _, steps, _ = run(engine, max_new_tokens=6, temperature=0.0)
    assert all(s["chosen_rank"] == 0 for s in steps), "greedy must take rank 0"


def test_top_mass_and_tail_mass_account_for_the_whole_vocabulary(engine: Engine):
    """The tail histogram is what lets the browser redraw the bars honestly."""
    _, steps, _ = run(engine, max_new_tokens=4, temperature=0.0, top_k_report=10, tail_bins=32)
    for s in steps:
        top_mass = sum(e["p"] for e in s["top"])
        assert s["tail"]["n"] == engine.vocab_size - 10
        assert math.isclose(top_mass + s["tail"]["mass"], 1.0, abs_tol=2e-3), (top_mass, s["tail"]["mass"])
        assert len(s["tail"]["counts"]) == s["tail"]["buckets"]
        assert len(s["tail"]["edges"]) == s["tail"]["buckets"] + 1
        assert sum(s["tail"]["counts"]) == s["tail"]["n"]


def test_logits_are_raw_so_the_client_can_reapply_temperature(engine: Engine):
    """Same seed, different temperature: the reported logits must not move.

    This is the contract the whole mode rests on. If temperature were baked into
    the reported numbers, moving the slider in the browser would be a lie.
    """
    _, cold, _ = run(engine, max_new_tokens=1, temperature=0.0)
    _, hot, _ = run(engine, max_new_tokens=1, temperature=1.9, seed=0)
    assert [e["logit"] for e in cold[0]["top"]] == [e["logit"] for e in hot[0]["top"]]
    assert cold[0]["logsumexp"] == hot[0]["logsumexp"]


def test_seed_makes_a_sampled_run_reproducible(engine: Engine):
    _, a, _ = run(engine, max_new_tokens=8, temperature=1.0, seed=7)
    _, b, _ = run(engine, max_new_tokens=8, temperature=1.0, seed=7)
    assert [s["token_id"] for s in a] == [s["token_id"] for s in b]


def test_the_cuts_are_applied_in_the_hugging_face_order():
    """`_sample` on a crafted distribution, where the right answer is arithmetic.

    softmax([4, 3, 0, 0]) = [0.639, 0.235, 0.0585, 0.0585] at T = 1.
    """
    logits = torch.tensor([4.0, 3.0, 0.0, 0.0])
    gen = torch.Generator().manual_seed(0)
    assert _sample(logits, 0.0, 0, 1.0, gen) == 0, "T = 0 is greedy"
    assert all(_sample(logits, 1.0, 1, 1.0, gen) == 0 for _ in range(20)), "top_k = 1 leaves the argmax"
    # cumulative-before for rank 1 is 0.639, so top_p = 0.5 keeps only rank 0.
    assert all(_sample(logits, 1.0, 0, 0.5, gen) == 0 for _ in range(20))
    # top_p = 0.7 also admits rank 1 (0.639 < 0.7) but nothing beyond it.
    assert set(_sample(logits, 1.0, 0, 0.7, gen) for _ in range(200)) <= {0, 1}
    # Unrestricted, the tail is reachable.
    assert set(_sample(logits, 1.0, 0, 1.0, gen) for _ in range(400)) == {0, 1, 2, 3}


def test_top_k_restricts_a_real_run(engine: Engine):
    """They change what is *drawn*, never what is *reported*."""
    _, steps, _ = run(engine, max_new_tokens=10, temperature=1.5, top_k=1, seed=3)
    assert all(s["chosen_rank"] == 0 for s in steps), "top_k=1 leaves only the argmax"
    assert all(len(s["top"]) > 1 for s in steps), "the report still shows the whole top-k"


def test_partial_text_accumulates(engine: Engine):
    _, steps, done = run(engine, max_new_tokens=6, temperature=0.0)
    texts = [s["partial_text"] for s in steps if s["text"] != ""]
    assert all(b.startswith(a) for a, b in zip(texts, texts[1:]))
    assert done["text"] == texts[-1]


def test_http_stream(monkeypatch):
    monkeypatch.setenv("TOY_MODEL", "1")
    from app import main

    with TestClient(main.app) as client:
        for _ in range(200):
            health = client.get("/health").json()
            if health["loaded"] or health["error"]:
                break
        assert health["loaded"], health
        with client.stream("POST", "/stream", json={"prompt": "hola", "max_new_tokens": 3, "temperature": 0}) as res:
            assert res.status_code == 200
            body = "".join(res.iter_text())
        assert "event: meta" in body and "event: step" in body and "event: done" in body
        assert client.post("/stream", json={"prompt": "hola", "model": "nope/unknown"}).status_code == 404
        assert client.post("/stream", json={"prompt": "", "max_new_tokens": 3}).status_code == 422



def test_stream_from_prefix_replays_then_continues(engine: Engine):
    _, base, _ = run(engine, max_new_tokens=8, temperature=0.0)
    prefix = [s["token_id"] for s in base[:3]]
    assert engine.tokenizer.eos_token_id not in prefix
    _, steps, done = run(engine, max_new_tokens=8, temperature=0.0, prefix_token_ids=prefix)
    assert [s["token_id"] for s in steps[:3]] == prefix
    assert all(s["replayed"] for s in steps[:3]) and not steps[3]["replayed"]
    # the same context gives the same distribution, whether replayed in one pass or step by step
    for a, b in zip(steps[:3], base[:3]):
        assert abs(a["chosen_logit"] - b["chosen_logit"]) < 1e-2
    # greedy, so the continuation matches the original run too
    assert [s["token_id"] for s in steps[3:6]] == [s["token_id"] for s in base[3:6]]
    assert done["n_steps"] == len([s for s in steps if s["text"] != ""])


def test_stream_can_render_the_constrained_prompt(engine: Engine):
    meta, _, _ = run(engine, max_new_tokens=2, temperature=0.0, json_system_prompt=True)
    # the toy tokenizer has no chat template, so the prompt passes through either way;
    # what matters is that the option is accepted and reported
    assert meta["prompt_rendered"]
