"""Hosted models in the logprobs mode. No network: the HTTP layer is stubbed."""

from __future__ import annotations

import json
import math

import pytest

from app import providers
from app.providers import ProviderError, _step, _tail_from_residual, is_provider, parse_model, stream


def test_parse_model_splits_the_provider_off():
    assert parse_model("openai:gpt-4.1-mini") == ("openai", "gpt-4.1-mini")
    assert parse_model("gemini:gemini-2.5-flash-lite") == ("gemini", "gemini-2.5-flash-lite")
    assert is_provider("openai:gpt-4o") and not is_provider("Qwen/Qwen2.5-0.5B-Instruct")
    assert not is_provider(None)


@pytest.mark.parametrize("bad", ["Qwen/Qwen2.5-0.5B-Instruct", "anthropic:claude-haiku-4-5", "openai", "nope:x"])
def test_a_model_that_is_not_a_supported_provider_is_a_404(bad: str):
    with pytest.raises(ProviderError) as e:
        parse_model(bad)
    assert e.value.status == 404


def test_a_missing_key_is_rejected_before_any_request():
    with pytest.raises(ProviderError) as e:
        list(stream("openai:gpt-4.1-mini", "hi", key=""))
    assert e.value.status == 401 and "API key" in e.value.message


def test_the_tail_bucket_reproduces_the_residual_mass():
    """`softmaxView` multiplies count by exp(logit_mean); that must give the residual back."""
    tail = _tail_from_residual(top_p_sum=0.8, vocab=1000, k=20)
    assert tail["n"] == 980 and tail["approx"] is True
    assert tail["mass"] == pytest.approx(0.2)
    reconstructed = tail["counts"][0] * math.exp(tail["logit_mean"][0])
    assert reconstructed == pytest.approx(0.2, rel=1e-3)


def test_a_top_that_already_covers_everything_leaves_a_tail_with_no_mass():
    """The count still matters: "980 more · 0.0%" says more than hiding the row."""
    tail = _tail_from_residual(top_p_sum=1.0, vocab=1000, k=20)
    assert tail["n"] == 980 and tail["mass"] == 0.0 and tail["counts"] == []


def test_step_shapes_log_probabilities_like_a_local_step():
    # log(0.5), log(0.3), log(0.2): a distribution whose arithmetic is obvious.
    top = [("b", math.log(0.3)), ("a", math.log(0.5)), ("c", math.log(0.2))]
    step = _step(0, "a", top, partial="a", vocab=1000)
    assert [e["rank"] for e in step["top"]] == [0, 1, 2], "sorted by log probability"
    assert step["top"][0]["text"] == "a" and step["top"][0]["p"] == pytest.approx(0.5)
    assert step["chosen_rank"] == 0 and step["chosen_p"] == pytest.approx(0.5)
    # Entropy of (0.5, 0.3, 0.2) is 1.485 bits.
    assert step["entropy_bits"] == pytest.approx(1.4855, abs=1e-3)
    # The reported top covers everything, so the tail carries no mass.
    assert step["tail"]["mass"] == 0.0
    assert step["logsumexp"] == 0.0, "log probabilities are already normalised"


def test_step_marks_a_chosen_token_that_the_top_list_omitted():
    """Providers cap the list; the sampled token can fall outside it."""
    step = _step(3, "zzz", [("a", math.log(0.6)), ("b", math.log(0.3))], partial="…zzz", vocab=99)
    assert step["chosen_rank"] is None or step["top"][step["chosen_rank"]]["text"] == "zzz"


class _FakeStream:
    """Stands in for `httpx.Client.stream`'s context manager."""

    def __init__(self, status: int, lines: list[str], body: bytes = b"") -> None:
        self.status_code = status
        self._lines = lines
        self._body = body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def iter_lines(self):
        return iter(self._lines)

    def read(self):
        return self._body


def _openai_chunk(token: str, top: list[tuple[str, float]]) -> str:
    payload = {
        "choices": [
            {
                "logprobs": {
                    "content": [
                        {
                            "token": token,
                            "logprob": next(lp for t, lp in top if t == token),
                            "top_logprobs": [{"token": t, "logprob": lp} for t, lp in top],
                        }
                    ]
                }
            }
        ]
    }
    return f"data: {json.dumps(payload)}"


def test_openai_stream_is_translated(monkeypatch):
    chunks = [
        _openai_chunk(" Paris", [(" Paris", math.log(0.7)), (" Lyon", math.log(0.2))]),
        _openai_chunk(".", [(".", math.log(0.9)), (",", math.log(0.05))]),
        "data: [DONE]",
    ]
    sent: dict = {}

    class FakeClient:
        def __init__(self, **kw):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def stream(self, method, url, headers=None, json=None):
            sent.update({"url": url, "headers": headers or {}, "body": json or {}})
            return _FakeStream(200, chunks)

    monkeypatch.setattr(providers.httpx, "Client", FakeClient)
    events = list(stream("openai:gpt-4.1-mini", "The capital of France is", key="sk-test", max_new_tokens=8, top_k_report=8))
    kinds = [name for name, _ in events]
    assert kinds == ["meta", "step", "step", "done"]

    meta = events[0][1]
    assert meta["model_id"] == "openai:gpt-4.1-mini" and meta["provider"] == "openai"
    assert meta["tail_approx"] is True
    assert meta["sampling"]["temperature"] == 1.0

    # Temperature 1 on the wire is what keeps the reported values raw.
    assert sent["body"]["temperature"] == 1
    assert sent["body"]["logprobs"] is True and sent["body"]["top_logprobs"] == 8
    assert sent["headers"]["Authorization"] == "Bearer sk-test"

    first = events[1][1]
    assert first["text"] == " Paris" and first["chosen_rank"] == 0
    assert first["chosen_p"] == pytest.approx(0.7, rel=1e-3)
    assert first["tail"]["mass"] == pytest.approx(0.1, rel=1e-2), "1 − 0.7 − 0.2"
    assert events[-1][1]["text"] == " Paris." and events[-1][1]["n_steps"] == 2


def test_openai_errors_carry_the_status(monkeypatch):
    class FakeClient:
        def __init__(self, **kw):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def stream(self, *a, **kw):
            return _FakeStream(401, [], body=b'{"error":{"message":"Incorrect API key"}}')

    monkeypatch.setattr(providers.httpx, "Client", FakeClient)
    with pytest.raises(ProviderError) as e:
        list(stream("openai:gpt-4.1-mini", "hi", key="sk-wrong"))
    assert e.value.status == 401 and "Incorrect API key" in e.value.message


class _FakeResponse:
    def __init__(self, status: int, payload: dict | None = None, text: str = "") -> None:
        self.status_code = status
        self._payload = payload or {}
        self.text = text or json.dumps(self._payload)

    def json(self):
        return self._payload


def test_gemini_response_is_translated(monkeypatch):
    payload = {
        "candidates": [
            {
                "logprobsResult": {
                    "chosenCandidates": [
                        {"token": " Paris", "tokenId": 1234, "logProbability": math.log(0.8)},
                        {"token": ".", "tokenId": 13, "logProbability": math.log(0.95)},
                    ],
                    "topCandidates": [
                        {"candidates": [{"token": " Paris", "logProbability": math.log(0.8)}, {"token": " Lyon", "logProbability": math.log(0.1)}]},
                        {"candidates": [{"token": ".", "logProbability": math.log(0.95)}]},
                    ],
                }
            }
        ]
    }
    sent: dict = {}

    class FakeClient:
        def __init__(self, **kw):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def post(self, url, headers=None, json=None):
            sent.update({"url": url, "headers": headers or {}, "body": json or {}})
            return _FakeResponse(200, payload)

    monkeypatch.setattr(providers.httpx, "Client", FakeClient)
    events = list(stream("gemini:gemini-2.5-flash-lite", "The capital of France is", key="AIza-test", max_new_tokens=8))
    assert [name for name, _ in events] == ["meta", "step", "step", "done"]
    assert sent["headers"]["x-goog-api-key"] == "AIza-test"
    assert sent["body"]["generationConfig"]["temperature"] == 1
    assert sent["body"]["generationConfig"]["responseLogprobs"] is True
    first = events[1][1]
    assert first["text"] == " Paris" and first["token_id"] == 1234
    assert first["chosen_p"] == pytest.approx(0.8, rel=1e-3)
    assert events[-1][1]["text"] == " Paris."


def test_gemini_without_logprobs_says_which_models_have_them(monkeypatch):
    class FakeClient:
        def __init__(self, **kw):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def post(self, *a, **kw):
            return _FakeResponse(200, {"candidates": [{"content": {"parts": [{"text": "Paris"}]}}]})

    monkeypatch.setattr(providers.httpx, "Client", FakeClient)
    with pytest.raises(ProviderError) as e:
        list(stream("gemini:gemini-3.8-flash", "hi", key="AIza-test"))
    assert e.value.status == 422 and "2.5" in e.value.message
