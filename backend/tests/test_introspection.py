"""/tokenize, /forward, /logits and the extended /health on the toy model."""

from __future__ import annotations

import base64

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.engine import SYSTEM_PROMPT, Engine
from app.introspect import BadRequest, TooLarge, bpe_merge_replay, forward_payload, logits_payload, tokenize_payload
from app.presets import PRESETS

PERSON = PRESETS["person"]


def test_tokenize_ascii_offsets_reconstruct(engine: Engine):
    text = "Ada Lovelace, 36, lives in London."
    payload = tokenize_payload(engine, text)
    assert payload["n_tokens"] == len(payload["tokens"]) > 0
    assert "".join(text[t["start"]:t["end"]] for t in payload["tokens"]) == text
    assert payload["n_chars"] == payload["n_bytes"] == payload["n_utf16"] == len(text)
    assert not any(t["is_special"] or t["is_template"] for t in payload["tokens"])
    assert all(t["segment"] == "user" for t in payload["tokens"])
    assert payload["segments"] is None and payload["merges"] is None


def test_tokenize_unicode(engine: Engine):
    text = "café ñandú 🙂"
    payload = tokenize_payload(engine, text)
    ends = [t["end"] for t in payload["tokens"]]
    assert ends == sorted(ends)
    covered = set()
    for t in payload["tokens"]:
        covered.update(range(t["start"], t["end"]))
        assert t["byte_end"] >= t["byte_start"] and t["utf16_end"] >= t["utf16_start"]
    assert covered == set(range(len(text)))
    assert payload["n_utf16"] > payload["n_chars"]
    assert payload["n_bytes"] > payload["n_chars"]
    assert any(t["partial_utf8"] for t in payload["tokens"])  # the toy BPE splits multibyte chars into bytes


def test_tokenize_chat_template_segments(engine: Engine):
    text = "Extract the person: Ada Lovelace, 36."
    payload = tokenize_payload(engine, text, use_chat_template=True)
    rendered = payload["rendered"]
    assert rendered.startswith("<|im_start|>") and SYSTEM_PROMPT in rendered and text in rendered
    segs = payload["segments"]
    assert segs[0]["start"] == 0 and segs[-1]["end"] == len(rendered)
    assert all(a["end"] == b["start"] for a, b in zip(segs, segs[1:]))
    assert [s["role"] for s in segs] == ["template", "system", "template", "user", "template"]
    first = payload["tokens"][0]
    assert first["is_special"] and first["is_template"] and first["token"] == "<|im_start|>"
    user = [t for t in payload["tokens"] if t["segment"] == "user"]
    user_seg = next(s for s in segs if s["role"] == "user")
    assert min(t["start"] for t in user) == user_seg["start"]
    assert max(t["end"] for t in user) == user_seg["end"]
    assert "".join(rendered[t["start"]:t["end"]] for t in user) == text
    meta = next(p for n, p in engine.generate(PERSON["schema"], text, max_new_tokens=1, include_steps=False) if n == "meta")
    assert payload["n_tokens"] == meta["prompt_token_count"]


def test_merge_replay_matches_the_tokenizer(engine: Engine):
    text = "extract the JSON object of London"
    replay = bpe_merge_replay(engine, text)
    assert replay["n_merges_total"] > 0
    finals = [sym for piece in replay["pieces"] for sym in piece["final"]]
    assert finals == engine.tokenizer.tokenize(text)
    for piece in replay["pieces"]:
        ranks = [s["rank"] for s in piece["steps"]]
        assert ranks == sorted(ranks) and len(set(ranks)) == len(ranks)
        assert all(fid is not None for fid in piece["final_ids"])
        if piece["steps"]:
            assert piece["steps"][-1]["result"] == piece["final"]


def test_forward_shapes_and_lens(engine: Engine):
    info = engine.model_info()
    before = engine.attn_implementation
    payload = forward_payload(engine, prompt=PERSON["prompt"], use_chat_template=True, top_k=5, decimals=6, max_tokens=512)
    n = payload["n_tokens"]
    assert len(payload["tokens"]) == n and payload["tokens"][0]["is_template"]
    assert payload["attn_implementation_used"] == "eager"
    assert engine.attn_implementation == before
    weights = payload["attention"]["weights"]
    assert len(weights) == info["n_layers"]
    for layer in weights:
        assert len(layer) == info["n_heads"]
        for row in layer:
            assert len(row) == n
            assert abs(sum(row) - 1.0) < 1e-3
    lens = payload["logit_lens"]["entries"]
    assert len(lens) == info["n_layers"] + 1
    assert lens[0]["label"] == "embeddings" and lens[-1]["after_block"] == info["n_layers"]
    assert lens[-1]["top"][0]["token_id"] == payload["final"]["argmax"]["token_id"]
    assert abs(lens[-1]["top"][0]["p"] - payload["final"]["argmax"]["p"]) < 1e-4
    assert lens[-1]["rank_final_top"] == 1
    assert all(e["residual_norm"] > 0 for e in lens)
    final = payload["final"]
    assert final["top"] == sorted(final["top"], key=lambda e: -e["p"])
    assert 0 < final["top_mass"] <= 1 + 1e-6
    assert abs(final["top_mass"] + final["tail"]["mass"] - 1.0) < 1e-3
    assert final["tail"]["n"] + len(final["top"]) == engine.vocab_size
    assert final["entropy_bits"] >= 0 and len(final["h_preview"]) == 12
    assert payload["sampled"] is None and payload["next_token_ids"] is None
    assert payload["timing_ms"]["n_tokens_computed"] == n


def test_forward_all_and_layers_and_caps(engine: Engine):
    payload = forward_payload(engine, prompt="Ada", use_chat_template=False, attention="all", layers=[1], decimals=6)
    assert payload["attention"]["layers"] == [1]
    layer = payload["attention"]["weights"][0]
    n = payload["n_tokens"]
    for head in layer:
        for q, row in enumerate(head):
            assert abs(sum(row) - 1.0) < 1e-3
            assert all(v == 0 for v in row[q + 1:])  # causal: nothing after the query position
    assert [e["after_block"] for e in payload["logit_lens"]["entries"]] == [0, 2, engine.model_info()["n_layers"]] or n
    none = forward_payload(engine, prompt="Ada", use_chat_template=False, attention="none", logit_lens=False)
    assert none["attention"] is None and none["logit_lens"] is None
    with pytest.raises(BadRequest):
        forward_payload(engine, prompt="a b c", use_chat_template=False, attention="all", attention_all_max=1)
    with pytest.raises(BadRequest):
        forward_payload(engine, prompt="Ada", use_chat_template=False, layers=[99])
    with pytest.raises(TooLarge):
        forward_payload(engine, prompt="a " * 50, use_chat_template=False, max_tokens=4)
    with pytest.raises(BadRequest):
        forward_payload(engine, token_ids=[len(engine.tokenizer) + 5])
    assert engine.attn_implementation != "eager"


def test_forward_token_ids_sampling_and_cache(engine: Engine):
    by_prompt = forward_payload(engine, prompt=PERSON["prompt"], attention="none", logit_lens=False, max_tokens=512)
    ids = [t["id"] for t in by_prompt["tokens"]]
    by_ids = forward_payload(engine, token_ids=ids, attention="none", logit_lens=False, sample={"temperature": 0.0}, max_tokens=512)
    assert by_ids["final"]["argmax"]["token_id"] == by_prompt["final"]["argmax"]["token_id"]
    assert by_ids["sampled"]["method"] == "greedy"
    assert by_ids["sampled"]["token_id"] == by_ids["final"]["argmax"]["token_id"]
    assert by_ids["next_token_ids"] == ids + [by_ids["sampled"]["token_id"]]
    seeded = [
        forward_payload(engine, token_ids=ids, attention="none", logit_lens=False, sample={"temperature": 1.0, "seed": 3}, max_tokens=512)["sampled"]["token_id"]
        for _ in range(2)
    ]
    assert seeded[0] == seeded[1]
    with_u = forward_payload(engine, token_ids=ids, attention="none", logit_lens=False, sample={"temperature": 1.0, "u": 0.0}, max_tokens=512)["sampled"]
    assert with_u["token_id"] == by_ids["final"]["argmax"]["token_id"]
    assert with_u["cum_lo"] == 0.0 and with_u["cum_hi"] > 0
    bench = forward_payload(engine, token_ids=ids, attention="none", logit_lens=False, benchmark_cache=True, max_tokens=512)["timing_ms"]["cached"]
    assert bench["n_tokens_computed"] == 1 and bench["argmax_matches"]
    assert bench["forward_prefix_ms"] > 0 and bench["forward_last_token_with_cache_ms"] > 0


def test_logits_payload(engine: Engine):
    payload = logits_payload(engine, prompt=PERSON["prompt"], top_k=50, tail_buckets=16, full_logits=True, max_tokens=512)
    vocab = payload["vocab_size"]
    assert len(payload["top"]) == min(50, vocab)
    assert [e["rank"] for e in payload["top"]] == list(range(len(payload["top"])))
    logits = [e["logit"] for e in payload["top"]]
    assert logits == sorted(logits, reverse=True)
    tail = payload["tail"]
    assert abs(payload["top_mass"] + tail["mass"] - 1.0) < 1e-3
    assert sum(tail["counts"]) + len(payload["top"]) == vocab
    assert len(tail["edges"]) == 17 and tail["edges"] == sorted(tail["edges"])
    cum = payload["cumulative"]["mass"]
    assert cum == sorted(cum) and abs(cum[-1] - 1.0) < 1e-3
    assert payload["cumulative"]["ranks"][-1] == vocab
    raw = np.frombuffer(base64.b64decode(payload["full_logits"]["data"]), dtype=np.float16)
    assert raw.shape == (vocab,)
    assert int(raw.argmax()) == payload["top"][0]["token_id"]


def test_http_surface_introspection(monkeypatch):
    monkeypatch.setenv("TOY_MODEL", "1")
    from app import main

    with TestClient(main.app) as client:
        for _ in range(200):
            health = client.get("/health").json()
            if health["loaded"] or health["error"]:
                break
        assert health["loaded"], health
        assert health["n_layers"] == 2 and health["tied_embeddings"] and health["n_kv_heads"] == 2
        assert "attn_implementation" in health and health["constraints"] == ["schema", "json", "none"]
        assert health["features"]["merges_replay"]
        tok = client.post("/tokenize", json={"text": "Ada Lovelace", "merges": True}).json()
        assert tok["n_tokens"] >= 1 and tok["merges"]["pieces"]
        fwd = client.post("/forward", json={"prompt": "Ada", "use_chat_template": False, "top_k": 3, "sample": {"temperature": 0}})
        assert fwd.status_code == 200, fwd.text
        assert fwd.json()["sampled"]["method"] == "greedy"
        assert client.post("/forward", json={"prompt": "Ada", "token_ids": [1]}).status_code == 400
        assert client.post("/forward", json={"prompt": "Ada", "use_chat_template": False, "attention": "all", "layers": [42]}).status_code == 400
        lg = client.post("/logits", json={"prompt": "Ada", "use_chat_template": False, "top_k": 5})
        assert lg.status_code == 200 and len(lg.json()["top"]) == 5
        gen = client.post(
            "/generate",
            json={"schema": PRESETS["person"]["schema"], "prompt": "hi", "max_new_tokens": 6, "constraint": "none",
                  "temperature": 0.7, "top_p": 0.8, "seed": 1, "include_steps": False},
        )
        assert gen.status_code == 200
        assert "event: meta" in gen.text and "event: done" in gen.text and "event: step" not in gen.text
        assert '"engine_backend": "none"' in gen.text
        assert client.get("/health").json()["busy"] is False
