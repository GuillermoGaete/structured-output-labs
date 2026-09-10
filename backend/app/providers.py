"""Hosted models in the logprobs mode, behind the same event shape as a local one.

Only providers that return per-token log probabilities can take part. Today that
is OpenAI and Gemini; Anthropic returns none, in any form, so it is absent here
rather than half-supported.

Two decisions shape everything below.

**Temperature is always 1 on the wire.** Neither provider documents whether the
log probabilities they return are computed before or after their own temperature.
Asking for 1 makes the question moot: at T = 1 the reported values *are* the raw
distribution, up to an additive constant softmax ignores. So the browser can
re-project them onto any temperature honestly, and the provider's own sampling
only decides which token happened to be emitted.

**The tail is approximated, and labelled.** A provider returns at most 20
alternatives out of a vocabulary of 100k+. The rest is a single lump: we know its
total mass (1 − Σ top) but not its shape. It is modelled as one bucket of
`vocab_size − k` entries sharing a mean logit, which is exactly right at T = 1 and
a mean-field guess elsewhere. `tail.approx` says so, and the UI marks it.

The caller's API key is passed in per request and never stored, logged, or read
from the environment.
"""

from __future__ import annotations

import json
import math
import time
from typing import Any, Iterator

import httpx

# Vocabulary sizes, needed only to say how many entries the tail lumps together.
# Approximate on purpose: neither provider publishes an exact figure.
VOCAB_HINT = {"openai": 200_000, "gemini": 262_144}
MAX_TOP_LOGPROBS = 20
TIMEOUT = httpx.Timeout(120.0, connect=15.0)


class ProviderError(Exception):
    """A provider refused the request. `status` is what to hand back to the browser."""

    def __init__(self, message: str, status: int = 502) -> None:
        super().__init__(message)
        self.message = message
        self.status = status


def parse_model(model_id: str) -> tuple[str, str]:
    """`openai:gpt-4.1-mini` -> ("openai", "gpt-4.1-mini"). Raises for a local id."""
    provider, _, rest = model_id.partition(":")
    if not rest or provider not in PROVIDERS:
        raise ProviderError(f"{model_id!r} is not a provider model", status=404)
    return provider, rest


def is_provider(model_id: str | None) -> bool:
    return bool(model_id) and model_id.split(":", 1)[0] in PROVIDERS


def _tail_from_residual(top_p_sum: float, vocab: int, k: int) -> dict[str, Any]:
    """One bucket standing in for everything the provider did not report.

    `logit_mean` is chosen so that `count · exp(logit_mean)` reproduces the
    residual mass at T = 1, which is what `softmaxView` in the browser expects.
    """
    n = max(vocab - k, 0)
    mass = max(0.0, min(1.0, 1.0 - top_p_sum))
    if n == 0 or mass <= 0:
        # Still report how many entries are down there, just with no mass to draw.
        return {"n": n, "mass": 0.0, "buckets": 0, "edges": [], "counts": [], "logit_mean": [], "approx": True}
    mean = math.log(mass / n)
    return {
        "n": n,
        "mass": round(mass, 8),
        "buckets": 1,
        "edges": [round(mean, 4), round(mean, 4)],
        "counts": [n],
        "logit_mean": [round(mean, 4)],
        "approx": True,
    }


def _step(
    i: int,
    token: str,
    top: list[tuple[str, float]],
    partial: str,
    vocab: int,
    token_id: int = -1,
) -> dict[str, Any]:
    """Shape one step like `logprobs.stream` does, from (token, logprob) pairs."""
    ordered = sorted(top, key=lambda t: t[1], reverse=True)
    entries = [
        {
            "rank": rank,
            "token_id": -1,
            "token": text,
            "text": text,
            # A log probability is a logit shifted by logsumexp, and softmax is
            # invariant to that shift, so the browser can treat it as a logit.
            "logit": round(lp, 4),
            "p": round(math.exp(lp), 8),
        }
        for rank, (text, lp) in enumerate(ordered)
    ]
    chosen_rank = next((e["rank"] for e in entries if e["token"] == token), None)
    chosen_lp = next((lp for t, lp in ordered if t == token), None)
    top_mass = sum(e["p"] for e in entries)
    entropy = -sum(e["p"] * math.log(max(e["p"], 1e-12)) for e in entries)
    return {
        "i": i,
        "token_id": token_id,
        "token": token,
        "text": token,
        "partial_text": partial,
        "chosen_logit": round(chosen_lp, 4) if chosen_lp is not None else 0.0,
        "chosen_p": round(math.exp(chosen_lp), 8) if chosen_lp is not None else 0.0,
        "chosen_rank": chosen_rank,
        "logsumexp": 0.0,  # log probabilities are already normalised
        "entropy_bits": round(entropy / math.log(2), 4),
        "top": entries,
        "tail": _tail_from_residual(top_mass, vocab, len(entries)),
        "dt_ms": 0.0,
        "forward_ms": 0.0,
    }


# ----------------------------------------------------------------------- OpenAI


def _openai(model: str, prompt: str, key: str, max_new_tokens: int, top_k_report: int, stop: Any) -> Iterator[tuple[str, dict[str, Any]]]:
    body = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "max_completion_tokens": max_new_tokens,
        "temperature": 1,  # see the module docstring: keeps the logprobs raw
        "logprobs": True,
        "top_logprobs": min(top_k_report, MAX_TOP_LOGPROBS),
        "stream": True,
    }
    vocab = VOCAB_HINT["openai"]
    yield "meta", {
        "model_id": f"openai:{model}",
        "vocab_size": vocab,
        "prompt_token_count": 0,
        "prompt_rendered": prompt,
        "max_new_tokens": max_new_tokens,
        "sampling": {"temperature": 1.0, "top_k": 0, "top_p": 1.0, "seed": None},
        "top_k_report": min(top_k_report, MAX_TOP_LOGPROBS),
        "tail_bins": 1,
        "use_chat_template": True,
        "provider": "openai",
        "tail_approx": True,
    }
    started = time.perf_counter()
    partial = ""
    i = 0
    with httpx.Client(timeout=TIMEOUT) as client:
        with client.stream(
            "POST",
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json=body,
        ) as res:
            if res.status_code != 200:
                detail = res.read().decode("utf-8", "replace")[:400]
                raise ProviderError(f"OpenAI returned {res.status_code}: {detail}", status=res.status_code if res.status_code in (401, 403, 404, 429) else 502)
            for line in res.iter_lines():
                if stop is not None and stop.is_set():
                    break
                if not line.startswith("data:"):
                    continue
                payload = line[5:].strip()
                if payload == "[DONE]":
                    break
                try:
                    chunk = json.loads(payload)
                except json.JSONDecodeError:
                    continue
                for choice in chunk.get("choices", []):
                    for entry in (choice.get("logprobs") or {}).get("content") or []:
                        token = entry.get("token", "")
                        top = [(t["token"], float(t["logprob"])) for t in entry.get("top_logprobs") or []]
                        if not any(t == token for t, _ in top):
                            top.append((token, float(entry.get("logprob", 0.0))))
                        partial += token
                        yield "step", _step(i, token, top, partial, vocab)
                        i += 1
    yield "done", _finish(partial, i, started, "stopped" if stop is not None and stop.is_set() else "eos")


# ----------------------------------------------------------------------- Gemini


def _gemini(model: str, prompt: str, key: str, max_new_tokens: int, top_k_report: int, stop: Any) -> Iterator[tuple[str, dict[str, Any]]]:
    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "maxOutputTokens": max_new_tokens,
            "temperature": 1,  # see the module docstring
            "responseLogprobs": True,
            "logprobs": min(top_k_report, MAX_TOP_LOGPROBS),
        },
    }
    vocab = VOCAB_HINT["gemini"]
    yield "meta", {
        "model_id": f"gemini:{model}",
        "vocab_size": vocab,
        "prompt_token_count": 0,
        "prompt_rendered": prompt,
        "max_new_tokens": max_new_tokens,
        "sampling": {"temperature": 1.0, "top_k": 0, "top_p": 1.0, "seed": None},
        "top_k_report": min(top_k_report, MAX_TOP_LOGPROBS),
        "tail_bins": 1,
        "use_chat_template": True,
        "provider": "gemini",
        "tail_approx": True,
    }
    started = time.perf_counter()
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    with httpx.Client(timeout=TIMEOUT) as client:
        res = client.post(url, headers={"x-goog-api-key": key, "Content-Type": "application/json"}, json=body)
    if res.status_code != 200:
        raise ProviderError(
            f"Gemini returned {res.status_code}: {res.text[:400]}",
            status=res.status_code if res.status_code in (401, 403, 404, 429) else 502,
        )
    data = res.json()
    candidates = data.get("candidates") or []
    if not candidates:
        raise ProviderError(f"Gemini returned no candidates: {json.dumps(data)[:300]}")
    result = candidates[0].get("logprobsResult") or {}
    chosen = result.get("chosenCandidates") or []
    tops = result.get("topCandidates") or []
    if not chosen:
        raise ProviderError(
            "Gemini returned no logprobs. They were removed from the 3.x models; use a 2.5 model such as gemini-2.5-flash-lite.",
            status=422,
        )
    partial = ""
    for i, pick in enumerate(chosen):
        if stop is not None and stop.is_set():
            break
        token = pick.get("token", "")
        bucket = tops[i].get("candidates", []) if i < len(tops) else []
        top = [(c.get("token", ""), float(c.get("logProbability", 0.0))) for c in bucket]
        if not any(t == token for t, _ in top):
            top.append((token, float(pick.get("logProbability", 0.0))))
        partial += token
        yield "step", _step(i, token, top, partial, vocab, token_id=int(pick.get("tokenId", -1)))
    yield "done", _finish(partial, len(chosen), started, "eos")


def _finish(text: str, n: int, started: float, stop_reason: str) -> dict[str, Any]:
    elapsed = time.perf_counter() - started
    return {
        "text": text,
        "n_steps": n,
        "stop_reason": stop_reason,
        "elapsed_s": round(elapsed, 3),
        "tokens_per_s": round(n / elapsed, 2) if elapsed > 0 and n else 0.0,
    }


PROVIDERS = {"openai": _openai, "gemini": _gemini}


def stream(
    model_id: str,
    prompt: str,
    key: str,
    max_new_tokens: int = 48,
    top_k_report: int = 12,
    stop: Any = None,
) -> Iterator[tuple[str, dict[str, Any]]]:
    """Yield ("meta" | "step" | "done", payload) from a hosted model."""
    provider, model = parse_model(model_id)
    if not key:
        raise ProviderError(f"no API key for {provider}; add one in the app's settings", status=401)
    yield from PROVIDERS[provider](model, prompt, key, max_new_tokens, top_k_report, stop)
