"""Plain streaming generation that reports the distribution behind every token.

This is the lab's second mode and it has nothing to do with constrained
decoding: no schema, no grammar, no mask. One prompt goes in, tokens come out,
and each step carries the model's own distribution so the browser can show what
the sampler was choosing from.

The step payload reports **raw logits**, not probabilities, plus a histogram of
everything below the top-k. That is deliberate: with logits and the tail the
browser can re-apply temperature, top-k and top-p to a recorded run and redraw
the bars instantly, without generating anything again. Send probabilities and
that is impossible, because a temperature has already been baked in.
"""

from __future__ import annotations

import time
from typing import Any, Iterator

import torch

from .engine import ENABLE_THINKING, Engine

# What the browser reprojects exactly (the top-k) vs approximately (the tail).
DEFAULT_TOP_K = 12
MAX_TOP_K = 200
DEFAULT_TAIL_BINS = 48
MAX_NEW_TOKENS_CAP = 256


def _round(value: Any, decimals: int = 4) -> Any:
    if isinstance(value, torch.Tensor):
        return [round(float(v), decimals) for v in value.tolist()]
    return round(float(value), decimals)


def tail_histogram(tail_logits: torch.Tensor, logsumexp: float, buckets: int) -> dict[str, Any]:
    """Histogram, in logit space, of the entries that did not make the top-k.

    With a per-bucket count and mean logit the browser can re-apply a temperature
    to the tail approximately (count · exp(mean / T)) while it recomputes the
    top-k exactly. Without this the bars would silently ignore ~99% of the
    vocabulary and the probabilities would not add up.
    """
    n = int(tail_logits.numel())
    if n == 0:
        return {"n": 0, "mass": 0.0, "buckets": 0, "edges": [], "counts": [], "logit_mean": []}
    lo = float(tail_logits.min())
    hi = float(tail_logits.max())
    if hi <= lo:
        hi = lo + 1e-6
    edges = torch.linspace(lo, hi, buckets + 1)
    idx = (((tail_logits - lo) / (hi - lo)) * buckets).long().clamp_(0, buckets - 1)
    counts = torch.bincount(idx, minlength=buckets)
    masses = torch.bincount(idx, weights=torch.exp(tail_logits - logsumexp), minlength=buckets)
    logit_sum = torch.bincount(idx, weights=tail_logits, minlength=buckets)
    logit_mean = logit_sum / counts.clamp_min(1)
    return {
        "n": n,
        "mass": round(float(masses.sum()), 8),
        "buckets": buckets,
        "edges": _round(edges),
        "counts": [int(c) for c in counts.tolist()],
        "logit_mean": _round(logit_mean),
    }


def render_prompt(engine: Engine, prompt: str, use_chat_template: bool) -> str:
    """The prompt as the model will see it.

    Deliberately not `Engine.format_prompt`: that one prepends "You are a JSON
    generator", which belongs to the constrained-decoding mode. Here the prompt
    is whatever the visitor typed, wrapped in the model's chat template when it
    has one.
    """
    template = getattr(engine.tokenizer, "chat_template", None)
    if use_chat_template and template:
        return engine.tokenizer.apply_chat_template(
            [{"role": "user", "content": prompt}], tokenize=False, add_generation_prompt=True, enable_thinking=ENABLE_THINKING
        )
    return prompt


def _sample(logits: torch.Tensor, temperature: float, top_k: int, top_p: float, generator: torch.Generator | None) -> int:
    """Greedy at T <= 0; otherwise temperature, then top-k, then top-p, then draw.

    The order is the one Hugging Face's warpers use, so a run here matches what
    the same parameters would do in `model.generate`.
    """
    if temperature <= 0:
        return int(torch.argmax(logits).item())
    scaled = logits / temperature
    if top_k and top_k > 0:
        k = min(top_k, scaled.numel())
        kth = torch.topk(scaled, k).values[-1]
        scaled = torch.where(scaled < kth, torch.full_like(scaled, float("-inf")), scaled)
    probs = torch.softmax(scaled, dim=-1)
    if 0 < top_p < 1:
        ordered, order = torch.sort(probs, descending=True)
        cumulative_before = torch.cumsum(ordered, dim=-1) - ordered
        keep_sorted = cumulative_before < top_p  # the first entry is always kept
        keep = torch.zeros_like(keep_sorted).scatter(0, order, keep_sorted)
        probs = torch.where(keep, probs, torch.zeros_like(probs))
    total = probs.sum()
    if not torch.isfinite(probs).all() or total <= 0:
        return int(torch.argmax(logits).item())
    return int(torch.multinomial(probs / total, 1, generator=generator).item())


def stream(
    engine: Engine,
    prompt: str,
    max_new_tokens: int = 48,
    temperature: float = 0.8,
    top_k: int = 0,
    top_p: float = 1.0,
    seed: int | None = None,
    use_chat_template: bool = True,
    top_k_report: int = DEFAULT_TOP_K,
    tail_bins: int = DEFAULT_TAIL_BINS,
    stop: Any = None,
    prefix_token_ids: list[int] | None = None,
    json_system_prompt: bool = False,
) -> Iterator[tuple[str, dict[str, Any]]]:
    """Yield ("meta" | "step" | "done", payload) for one unconstrained generation.

    `prefix_token_ids` is a branch: those tokens are replayed first (one forward
    pass, teacher-forced, steps marked `replayed`) and sampling starts after
    them. `json_system_prompt` renders the prompt the way the constrained mode
    does, so a constrained run can be continued here without its mask.
    """
    top_k_report = max(1, min(top_k_report, MAX_TOP_K))
    max_new_tokens = max(1, min(max_new_tokens, MAX_NEW_TOKENS_CAP))

    rendered = engine.format_prompt(prompt, use_chat_template) if json_system_prompt else render_prompt(engine, prompt, use_chat_template)
    input_ids = engine.tokenizer(rendered, return_tensors="pt").input_ids
    prefix = [int(t) for t in (prefix_token_ids or [])]
    eos_id = engine.tokenizer.eos_token_id
    if eos_id in prefix:
        raise ValueError("the prefix already ends the sequence")
    if len(prefix) >= max_new_tokens:
        raise ValueError(f"the prefix has {len(prefix)} tokens and max_new_tokens is {max_new_tokens}")
    yield "meta", {
        "model_id": engine.model_id,
        "vocab_size": engine.vocab_size,
        "prompt_token_count": int(input_ids.shape[1]),
        "prompt_rendered": rendered,
        "max_new_tokens": max_new_tokens,
        "sampling": {"temperature": temperature, "top_k": top_k, "top_p": top_p, "seed": seed},
        "top_k_report": top_k_report,
        "tail_bins": tail_bins,
        "use_chat_template": use_chat_template,
    }

    generator = torch.Generator().manual_seed(seed) if seed is not None else None
    generated: list[int] = []
    partial = ""
    stop_reason = "max_new_tokens"
    started = time.perf_counter()
    cur_ids = input_ids
    past = None

    def describe(i: int, logits: torch.Tensor, next_id: int, step_started: float, forward_ms: float, replayed: bool) -> dict[str, Any]:
        nonlocal partial
        logsumexp = float(torch.logsumexp(logits, dim=-1))
        probs = torch.softmax(logits, dim=-1)
        entropy_nats = float(-(probs * torch.log(probs.clamp_min(1e-12))).sum())
        k = min(top_k_report, logits.numel())
        top_values, top_ids = torch.topk(logits, k)
        ordered = torch.sort(logits, descending=True).values
        is_eos = next_id == eos_id
        text = "" if is_eos else engine.token_text(next_id)
        if not is_eos:
            generated.append(next_id)
            partial = engine.tokenizer.decode(generated)
        top = [
            {
                "rank": rank,
                "token_id": int(tid),
                "token": engine.token_raw(int(tid)),
                "text": engine.token_text(int(tid)),
                "logit": round(float(lv), 4),
                "p": round(float(probs[int(tid)]), 8),
            }
            for rank, (lv, tid) in enumerate(zip(top_values.tolist(), top_ids.tolist()))
        ]
        chosen_rank = next((e["rank"] for e in top if e["token_id"] == next_id), None)
        return {
            "i": i,
            "token_id": next_id,
            "token": engine.token_raw(next_id),
            "text": text,
            "partial_text": partial,
            "chosen_logit": round(float(logits[next_id]), 4),
            "chosen_p": round(float(probs[next_id]), 8),
            "chosen_rank": chosen_rank,
            "logsumexp": round(logsumexp, 4),
            "entropy_bits": round(entropy_nats / 0.6931471805599453, 4),
            "top": top,
            "tail": tail_histogram(ordered[k:], logsumexp, tail_bins),
            "dt_ms": round((time.perf_counter() - step_started) * 1000.0, 2),
            "forward_ms": round(forward_ms, 2),
            "replayed": replayed,
        }

    first = 0
    pending_logits: torch.Tensor | None = None
    with torch.no_grad():
        if prefix:
            step_started = time.perf_counter()
            ids = torch.cat([input_ids, torch.tensor([prefix], dtype=input_ids.dtype)], dim=1)
            p_len = int(input_ids.shape[1])
            out = engine.model(input_ids=ids, use_cache=True)
            forward_ms = (time.perf_counter() - step_started) * 1000.0 / len(prefix)
            for j, tok in enumerate(prefix):
                yield "step", describe(j, out.logits[0, p_len - 1 + j, :].float(), tok, step_started, forward_ms, replayed=True)
            past = out.past_key_values
            pending_logits = out.logits[0, -1, :].float()
            first = len(prefix)

        for i in range(first, max_new_tokens):
            if stop is not None and stop.is_set():
                stop_reason = "stopped"
                break
            step_started = time.perf_counter()
            if pending_logits is not None:
                logits = pending_logits
                pending_logits = None
                forward_ms = 0.0
            else:
                out = engine.model(input_ids=cur_ids, past_key_values=past, use_cache=True)
                past = out.past_key_values
                logits = out.logits[0, -1, :].float()
                forward_ms = (time.perf_counter() - step_started) * 1000.0

            next_id = _sample(logits, temperature, top_k, top_p, generator)
            yield "step", describe(i, logits, next_id, step_started, forward_ms, replayed=False)
            if next_id == eos_id:
                stop_reason = "eos"
                break
            cur_ids = torch.tensor([[next_id]], dtype=input_ids.dtype)

    elapsed = time.perf_counter() - started
    n = len(generated)
    yield "done", {
        "text": partial,
        "n_steps": n,
        "stop_reason": stop_reason,
        "elapsed_s": round(elapsed, 3),
        "tokens_per_s": round(n / elapsed, 2) if elapsed > 0 and n else 0.0,
    }
