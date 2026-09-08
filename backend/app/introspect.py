"""Look inside the model: the tokenizer, one forward pass, the whole next-token distribution.

Pure functions over an `Engine`. Everything that runs the model is called
under `engine.lock` by the HTTP layer (see `main._run_exclusive`).
"""

from __future__ import annotations

import base64
import math
import time
from contextlib import ExitStack
from typing import Any

import torch

from .engine import SYSTEM_PROMPT, Engine

LN2 = math.log(2.0)


class BadRequest(ValueError):
    """The request cannot be served as asked (400)."""


class TooLarge(ValueError):
    """The input is longer than the server is willing to run (413)."""


class ComparisonTokenizerUnavailable(RuntimeError):
    """The second tokenizer could not be loaded (503)."""


def _r(value: Any, decimals: int) -> float:
    return round(float(value), decimals)


def _rlist(tensor: torch.Tensor, decimals: int) -> list[float]:
    return [round(v, decimals) for v in tensor.tolist()]


# ---------------------------------------------------------------- tokenize
def _prefix_sums(text: str) -> tuple[list[int], list[int]]:
    """Byte and UTF-16 offsets for every code-point boundary of `text`."""
    byte_at = [0]
    utf16_at = [0]
    for ch in text:
        byte_at.append(byte_at[-1] + len(ch.encode("utf-8")))
        utf16_at.append(utf16_at[-1] + (2 if ord(ch) > 0xFFFF else 1))
    return byte_at, utf16_at


def token_segments(rendered: str, system_prompt: str, user_text: str) -> list[dict[str, Any]]:
    """Split a rendered chat prompt into template / system / user spans."""
    segments: list[dict[str, Any]] = []

    def add(role: str, start: int, end: int) -> None:
        if end > start:
            segments.append({"role": role, "start": start, "end": end})

    pos = 0
    sys_start = rendered.find(system_prompt) if system_prompt else -1
    if sys_start >= 0:
        add("template", 0, sys_start)
        add("system", sys_start, sys_start + len(system_prompt))
        pos = sys_start + len(system_prompt)
    user_start = rendered.find(user_text, pos) if user_text else -1
    if user_start >= 0:
        add("template", pos, user_start)
        add("user", user_start, user_start + len(user_text))
        pos = user_start + len(user_text)
    add("template", pos, len(rendered))
    return segments


def _segment_for(segments: list[dict[str, Any]], start: int, end: int) -> str:
    for seg in segments:
        if start >= seg["start"] and end <= seg["end"]:
            return seg["role"]
    return "template"


def tokenize_payload(
    engine: Engine,
    text: str,
    use_chat_template: bool = False,
    tokenizer_kind: str = "model",
    merges: bool = False,
    system_prompt: str = SYSTEM_PROMPT,
) -> dict[str, Any]:
    if tokenizer_kind == "gpt2":
        try:
            tok = engine.compare_tokenizer()
        except RuntimeError as exc:
            raise ComparisonTokenizerUnavailable(str(exc)) from exc
        tokenizer_id = engine.compare_tokenizer_id
        rendered = text  # GPT-2 has no chat template
        use_chat_template = False
        added = frozenset(int(i) for i in tok.get_added_vocab().values())
    else:
        tok = engine.tokenizer
        tokenizer_id = engine.model_id
        rendered = engine.format_prompt(text, use_chat_template)
        added = engine.added_ids

    enc = tok(rendered, return_offsets_mapping=True, add_special_tokens=False)
    ids = [int(i) for i in enc["input_ids"]]
    offsets = enc["offset_mapping"]
    byte_at, utf16_at = _prefix_sums(rendered)
    segments = token_segments(rendered, system_prompt, text) if rendered != text else None

    tokens = []
    for i, (tid, (start, end)) in enumerate(zip(ids, offsets)):
        decoded = tok.decode([tid])
        segment = _segment_for(segments, start, end) if segments else "user"
        tokens.append(
            {
                "i": i,
                "id": tid,
                "token": tok.convert_ids_to_tokens(tid),
                "text": decoded,
                "start": int(start),
                "end": int(end),
                "byte_start": byte_at[start],
                "byte_end": byte_at[end],
                "utf16_start": utf16_at[start],
                "utf16_end": utf16_at[end],
                "is_special": tid in added,
                "is_template": segment != "user",
                "segment": segment,
                "partial_utf8": "�" in decoded,
            }
        )
    payload: dict[str, Any] = {
        "tokenizer": tokenizer_kind,
        "tokenizer_id": tokenizer_id,
        "text": text,
        "rendered": rendered,
        "use_chat_template": use_chat_template,
        "n_chars": len(rendered),
        "n_bytes": byte_at[-1],
        "n_utf16": utf16_at[-1],
        "n_tokens": len(tokens),
        "vocab_entries": int(len(tok)),
        "vocab_size": engine.vocab_size if tokenizer_kind == "model" else int(len(tok)),
        "segments": segments,
        "tokens": tokens,
        "merges": None,
    }
    if merges and tokenizer_kind == "model":
        payload["merges"] = bpe_merge_replay(engine, text)
    return payload


def bpe_merge_replay(engine: Engine, text: str, max_pieces: int = 8, max_chars: int = 200) -> dict[str, Any]:
    """Replay the BPE merges, pre-token by pre-token, from the raw bytes to the final tokens."""
    ranks = engine.merge_ranks()
    if ranks is None:
        return {"unsupported": "the tokenizer is not a plain BPE model (merges cannot be replayed)"}
    backend = engine.tokenizer.backend_tokenizer
    text = text[:max_chars]
    normalized = backend.normalizer.normalize_str(text) if backend.normalizer is not None else text
    if backend.pre_tokenizer is not None:
        pre = backend.pre_tokenizer.pre_tokenize_str(normalized)
    else:
        pre = [(normalized, (0, len(normalized)))]
    vocab = engine.tokenizer.get_vocab()
    pieces = []
    for piece, (start, end) in pre[:max_pieces]:
        symbols = list(piece)
        steps = []
        while len(symbols) > 1:
            best_rank: int | None = None
            best_pair: tuple[str, str] | None = None
            for j in range(len(symbols) - 1):
                pair = (symbols[j], symbols[j + 1])
                rank = ranks.get(pair)
                if rank is not None and (best_rank is None or rank < best_rank):
                    best_rank, best_pair = rank, pair
            if best_pair is None:
                break
            merged: list[str] = []
            j = 0
            while j < len(symbols):
                if j < len(symbols) - 1 and (symbols[j], symbols[j + 1]) == best_pair:
                    merged.append(symbols[j] + symbols[j + 1])
                    j += 2
                else:
                    merged.append(symbols[j])
                    j += 1
            symbols = merged
            steps.append({"rank": best_rank, "pair": list(best_pair), "result": list(symbols)})
        pieces.append(
            {
                "piece": piece,
                "start": start,
                "end": end,
                "symbols": list(piece),
                "steps": steps,
                "final": symbols,
                "final_ids": [vocab.get(sym) for sym in symbols],
            }
        )
    return {"n_merges_total": len(ranks), "pieces": pieces}


# ---------------------------------------------------------------- shared
def _resolve_ids(
    engine: Engine,
    prompt: str | None,
    token_ids: list[int] | None,
    use_chat_template: bool,
    max_tokens: int,
) -> tuple[list[int], str | None, list[dict[str, Any]] | None, list[tuple[int, int]] | None]:
    tok = engine.tokenizer
    if (prompt is None) == (token_ids is None):
        raise BadRequest("send exactly one of `prompt` or `token_ids`")
    if prompt is not None:
        rendered = engine.format_prompt(prompt, use_chat_template)
        enc = tok(rendered, return_offsets_mapping=True, add_special_tokens=False)
        ids = [int(i) for i in enc["input_ids"]]
        offsets = [(int(s), int(e)) for s, e in enc["offset_mapping"]]
        segments = token_segments(rendered, SYSTEM_PROMPT, prompt) if rendered != prompt else None
    else:
        ids = [int(i) for i in token_ids or []]
        limit = int(len(tok))
        bad = [i for i in ids if i < 0 or i >= limit]
        if bad:
            raise BadRequest(f"token ids out of range 0..{limit - 1}: {bad[:5]}")
        rendered, offsets, segments = None, None, None
    if not ids:
        raise BadRequest("the input has no tokens")
    if len(ids) > max_tokens:
        raise TooLarge(f"{len(ids)} tokens; this server runs at most {max_tokens}")
    return ids, rendered, segments, offsets


def _token_rows(engine: Engine, ids: list[int], segments, offsets) -> list[dict[str, Any]]:
    rows = []
    for position, tid in enumerate(ids):
        if segments and offsets:
            segment = _segment_for(segments, *offsets[position])
        else:
            segment = "user"
        rows.append(
            {
                "position": position,
                "id": tid,
                "token": engine.token_raw(tid),
                "text": engine.token_text(tid),
                "is_special": tid in engine.added_ids,
                "is_template": segment != "user",
                "segment": segment,
            }
        )
    return rows


def _entry(engine: Engine, tid: int, logit: float, p: float, decimals: int, rank: int | None = None) -> dict[str, Any]:
    row: dict[str, Any] = {
        "token_id": int(tid),
        "token": engine.token_raw(int(tid)),
        "text": engine.token_text(int(tid)),
        "logit": _r(logit, decimals),
        "p": _r(p, decimals),
    }
    if rank is not None:
        row = {"rank": rank, **row}
    return row


def tail_histogram(tail_logits: torch.Tensor, logsumexp: float, buckets: int, decimals: int) -> dict[str, Any]:
    """Histogram, in logit space, of the entries that did not make the top-k.

    With the per-bucket count and mean logit the browser can re-apply a
    temperature to the tail approximately (count · exp(mean / T)) while it
    recomputes the top-k exactly.
    """
    n = int(tail_logits.numel())
    if n == 0:
        return {"n": 0, "mass": 0.0, "space": "logit", "buckets": 0, "edges": [], "counts": [], "mass_per_bucket": [], "logit_mean": []}
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
        "mass": _r(masses.sum(), max(decimals, 6)),
        "space": "logit",
        "buckets": buckets,
        "edges": _rlist(edges, decimals),
        "counts": [int(c) for c in counts.tolist()],
        "mass_per_bucket": _rlist(masses, max(decimals, 8)),
        "logit_mean": _rlist(logit_mean, decimals),
    }


def sample_token(
    engine: Engine,
    logits: torch.Tensor,
    temperature: float = 0.0,
    top_k: int = 0,
    top_p: float = 1.0,
    seed: int | None = None,
    u: float | None = None,
    decimals: int = 4,
) -> dict[str, Any]:
    """Pick the next token the way `Engine._sample` does, and report how it was picked.

    When `u` (a number in [0, 1)) is given, the draw is the inverse-CDF walk over
    the final distribution sorted by probability, so a browser that showed the
    same `u` on its bars gets the exact same winner.
    """
    p_model = torch.softmax(logits, dim=-1)
    eos_id = engine.tokenizer.eos_token_id
    if temperature <= 0:
        tid = int(torch.argmax(logits).item())
        return {
            "token_id": tid,
            "token": engine.token_raw(tid),
            "text": engine.token_text(tid),
            "p": _r(p_model[tid], decimals),
            "p_after": 1.0,
            "n_candidates": 1,
            "method": "greedy",
            "is_eos": tid == eos_id,
            "u": None,
            "cum_lo": None,
            "cum_hi": None,
        }
    z = logits / temperature
    if top_k and top_k > 0:
        k = min(top_k, z.numel())
        kth = torch.topk(z, k).values[-1]
        z = torch.where(z < kth, torch.full_like(z, float("-inf")), z)
    probs = torch.softmax(z, dim=-1)
    if 0 < top_p < 1:
        sorted_p, order = torch.sort(probs, descending=True)
        keep_sorted = (torch.cumsum(sorted_p, dim=-1) - sorted_p) < top_p
        keep = torch.zeros_like(keep_sorted).scatter(0, order, keep_sorted)
        probs = torch.where(keep, probs, torch.zeros_like(probs))
        probs = probs / probs.sum()
    n_candidates = int((probs > 0).sum().item())
    cum_lo = cum_hi = None
    if u is not None:
        sorted_p, order = torch.sort(probs, descending=True)
        cumulative = torch.cumsum(sorted_p, dim=-1)
        pos = int(torch.searchsorted(cumulative, torch.tensor([u], dtype=cumulative.dtype)).item())
        pos = min(pos, n_candidates - 1)
        tid = int(order[pos].item())
        cum_hi = float(cumulative[pos])
        cum_lo = cum_hi - float(sorted_p[pos])
    else:
        generator = torch.Generator().manual_seed(seed) if seed is not None else None
        tid = int(torch.multinomial(probs, 1, generator=generator).item())
    return {
        "token_id": tid,
        "token": engine.token_raw(tid),
        "text": engine.token_text(tid),
        "p": _r(p_model[tid], decimals),
        "p_after": _r(probs[tid], decimals),
        "n_candidates": n_candidates,
        "method": "sampled",
        "is_eos": tid == eos_id,
        "u": u,
        "cum_lo": _r(cum_lo, 6) if cum_lo is not None else None,
        "cum_hi": _r(cum_hi, 6) if cum_hi is not None else None,
    }


# ---------------------------------------------------------------- forward
def forward_payload(
    engine: Engine,
    *,
    prompt: str | None = None,
    token_ids: list[int] | None = None,
    use_chat_template: bool = True,
    top_k: int = 10,
    attention: str = "last",
    layers: list[int] | None = None,
    logit_lens: bool = True,
    lens_top_k: int = 5,
    sample: dict[str, Any] | None = None,
    benchmark_cache: bool = False,
    decimals: int = 4,
    tail_bins: int = 64,
    max_tokens: int = 128,
    attention_all_max: int = 32,
) -> dict[str, Any]:
    """One forward pass over the current tokens, with the internals the Inference Loop draws."""
    model = engine.model
    info = engine.model_info()
    n_layers = info["n_layers"]
    started = time.perf_counter()
    ids, rendered, segments, offsets = _resolve_ids(engine, prompt, token_ids, use_chat_template, max_tokens)
    n = len(ids)
    if attention not in ("last", "all", "none"):
        raise BadRequest("attention must be last, all or none")
    if attention == "all" and n > attention_all_max:
        raise BadRequest(f"attention='all' needs at most {attention_all_max} tokens ({n} given); use 'last' or `layers`")
    layer_set = set(range(n_layers)) if not layers else {int(k) for k in layers}
    if any(k < 0 or k >= n_layers for k in layer_set):
        raise BadRequest(f"layers must be in 0..{n_layers - 1}")

    residuals: list[torch.Tensor | None] = [None] * (n_layers + 1)
    attn: dict[int, torch.Tensor] = {}
    input_ids = torch.tensor([ids], dtype=torch.long)
    t_attn_extract = 0.0
    with ExitStack() as stack:
        stack.enter_context(torch.inference_mode())
        if attention != "none":
            stack.enter_context(engine.eager_attention())
        for k, layer in enumerate(model.model.layers):

            def keep_residual(_mod, _args, output, k=k):
                out = output if torch.is_tensor(output) else output[0]
                residuals[k + 1] = out[0, -1].detach().float().clone()

            stack.callback(layer.register_forward_hook(keep_residual).remove)
            if attention != "none" and k in layer_set:

                def keep_attention(_mod, _args, output, k=k):
                    weights = output[1] if isinstance(output, tuple) and len(output) > 1 else None
                    if weights is None:
                        return
                    picked = weights[0, :, -1, :] if attention == "last" else weights[0]
                    attn[k] = picked.detach().float().clone()

                stack.callback(layer.self_attn.register_forward_hook(keep_attention).remove)
        residuals[0] = model.get_input_embeddings()(input_ids)[0, -1].detach().float().clone()
        t0 = time.perf_counter()
        out = model(input_ids=input_ids, use_cache=False, logits_to_keep=1)
        forward_ms = (time.perf_counter() - t0) * 1000.0
        logits = out.logits[0, -1].float()
        attn_used = engine.attn_implementation

    if attention != "none" and not attn:
        raise RuntimeError("the attention hooks captured nothing; the model did not return attention weights")

    with torch.inference_mode():
        # ---- final distribution
        p = torch.softmax(logits, dim=-1)
        logsumexp = float(torch.logsumexp(logits, dim=-1))
        argmax = int(torch.argmax(logits).item())
        k = min(top_k, int(p.numel()))
        top_p_vals, top_ids = torch.topk(p, k)
        entropy_nats = float(-(p * torch.log(p.clamp_min(1e-30))).sum())
        sorted_logits, _ = torch.sort(logits, descending=True)
        normed_last = model.model.norm(residuals[n_layers].unsqueeze(0))[0]
        final = {
            "argmax": _entry(engine, argmax, logits[argmax], p[argmax], decimals),
            "top": [_entry(engine, t, logits[t], pv, decimals) for pv, t in zip(top_p_vals.tolist(), top_ids.tolist())],
            "top_mass": _r(top_p_vals.sum(), 6),
            "tail": tail_histogram(sorted_logits[k:], logsumexp, tail_bins, decimals),
            "entropy_nats": _r(entropy_nats, decimals),
            "entropy_bits": _r(entropy_nats / LN2, decimals),
            "logsumexp": _r(logsumexp, decimals),
            "max_logit": _r(logits[argmax], decimals),
            "h_norm": _r(normed_last.norm(), decimals),
            "h_preview": _rlist(normed_last[:12], decimals),
        }

        # ---- logit lens: the exit read after every block
        lens_payload = None
        lens_ms = 0.0
        if logit_lens:
            t0 = time.perf_counter()
            stack_t = torch.stack([r for r in residuals])  # (L+1, d)
            normed = model.model.norm(stack_t)
            lens_logits = normed @ model.get_output_embeddings().weight.T  # one matmul for all layers
            lens_p = torch.softmax(lens_logits, dim=-1)
            entries = []
            for layer_index in range(n_layers + 1):
                if 0 < layer_index < n_layers and (layer_index - 1) not in layer_set:
                    continue
                p_k = lens_p[layer_index]
                top_vals, top_i = torch.topk(p_k, min(lens_top_k, int(p_k.numel())))
                label = "embeddings" if layer_index == 0 else f"block {layer_index}"
                if layer_index == n_layers:
                    label += " (= final)"
                entries.append(
                    {
                        "after_block": layer_index,
                        "label": label,
                        "residual_norm": _r(residuals[layer_index].norm(), decimals),
                        "top": [
                            _entry(engine, t, lens_logits[layer_index, t], pv, decimals)
                            for pv, t in zip(top_vals.tolist(), top_i.tolist())
                        ],
                        "p_final_top": _r(p_k[argmax], decimals),
                        "rank_final_top": int((p_k > p_k[argmax]).sum().item()) + 1,
                    }
                )
            lens_ms = (time.perf_counter() - t0) * 1000.0
            lens_payload = {
                "entries": entries,
                "method": "final RMSNorm + the tied LM head applied to the last position's residual stream after each block",
                "caveat": "early layers were never trained to be read by the exit table: read the trend, not the absolute probabilities",
            }

        # ---- attention of the last position
        attention_payload = None
        if attention != "none":
            t0 = time.perf_counter()
            layers_sorted = sorted(attn)
            if attention == "last":
                weights = [[_rlist(row, decimals) for row in attn[kk]] for kk in layers_sorted]
            else:
                weights = [[[_rlist(row, decimals) for row in head] for head in attn[kk]] for kk in layers_sorted]
            t_attn_extract = (time.perf_counter() - t0) * 1000.0
            attention_payload = {
                "mode": attention,
                "query_position": n - 1,
                "layers": layers_sorted,
                "weights": weights,
            }

        # ---- the next token, if asked
        sampled = None
        next_ids = None
        if sample is not None:
            sampled = sample_token(
                engine,
                logits,
                temperature=float(sample.get("temperature", 0.0)),
                top_k=int(sample.get("top_k", 0) or 0),
                top_p=float(sample.get("top_p", 1.0) if sample.get("top_p") is not None else 1.0),
                seed=sample.get("seed"),
                u=sample.get("u"),
                decimals=decimals,
            )
            sampled["in_top"] = sampled["token_id"] in set(top_ids.tolist())
            next_ids = ids + [sampled["token_id"]]

        # ---- what a KV cache saves, measured
        cached = None
        if benchmark_cache and n > 1:
            t0 = time.perf_counter()
            prefix = model(input_ids=input_ids[:, :-1], use_cache=True)
            t_prefix = (time.perf_counter() - t0) * 1000.0
            t0 = time.perf_counter()
            last = model(input_ids=input_ids[:, -1:], past_key_values=prefix.past_key_values, use_cache=True)
            t_last = (time.perf_counter() - t0) * 1000.0
            cached = {
                "forward_prefix_ms": _r(t_prefix, 1),
                "forward_last_token_with_cache_ms": _r(t_last, 1),
                "n_tokens_computed": 1,
                "argmax_matches": int(torch.argmax(last.logits[0, -1]).item()) == argmax,
            }

    return {
        "model_id": engine.model_id,
        "n_tokens": n,
        "n_layers": n_layers,
        "n_heads": info["n_heads"],
        "n_kv_heads": info["n_kv_heads"],
        "hidden_size": info["hidden_size"],
        "vocab_size": engine.vocab_size,
        "tied_embeddings": info["tied_embeddings"],
        "eos_token_id": info["eos_token_id"],
        "attn_implementation_used": attn_used,
        "decimals": decimals,
        "rendered": rendered,
        "tokens": _token_rows(engine, ids, segments, offsets),
        "attention": attention_payload,
        "logit_lens": lens_payload,
        "final": final,
        "sampled": sampled,
        "next_token_ids": next_ids,
        "timing_ms": {
            "forward": _r(forward_ms, 1),
            "attention_extract": _r(t_attn_extract, 1),
            "logit_lens": _r(lens_ms, 1),
            "total": _r((time.perf_counter() - started) * 1000.0, 1),
            "n_tokens_computed": n,
            "cached": cached,
        },
    }


# ---------------------------------------------------------------- logits
def logits_payload(
    engine: Engine,
    *,
    prompt: str | None = None,
    token_ids: list[int] | None = None,
    use_chat_template: bool = True,
    top_k: int = 200,
    tail_buckets: int = 64,
    full_logits: bool = False,
    decimals: int = 4,
    max_tokens: int = 128,
) -> dict[str, Any]:
    """The whole next-token distribution for one prompt: top-k exactly, the tail as a histogram."""
    model = engine.model
    started = time.perf_counter()
    ids, rendered, _segments, _offsets = _resolve_ids(engine, prompt, token_ids, use_chat_template, max_tokens)
    input_ids = torch.tensor([ids], dtype=torch.long)
    with torch.inference_mode():
        out = model(input_ids=input_ids, use_cache=False, logits_to_keep=1)
        logits = out.logits[0, -1].float()
        vocab = int(logits.numel())
        logsumexp = float(torch.logsumexp(logits, dim=-1))
        sorted_logits, order = torch.sort(logits, descending=True)
        sorted_p = torch.exp(sorted_logits - logsumexp)
        k = min(top_k, vocab)
        top = [
            _entry(engine, int(order[r]), sorted_logits[r], sorted_p[r], decimals, rank=r)
            for r in range(k)
        ]
        cumulative = torch.cumsum(sorted_p, dim=-1)
        ranks = []
        r = 1
        while r < vocab:
            ranks.append(r)
            r *= 2
        ranks.append(vocab)
        entropy_nats = float(-(sorted_p * torch.log(sorted_p.clamp_min(1e-30))).sum())
        payload: dict[str, Any] = {
            "model_id": engine.model_id,
            "rendered": rendered,
            "n_tokens": len(ids),
            "vocab_size": vocab,
            "vocab_entries": int(len(engine.tokenizer)),
            "padding_rows_start": int(len(engine.tokenizer)),
            "logsumexp": _r(logsumexp, decimals),
            "max_logit": _r(sorted_logits[0], decimals),
            "min_logit": _r(sorted_logits[-1], decimals),
            "entropy_nats": _r(entropy_nats, decimals),
            "entropy_bits": _r(entropy_nats / LN2, decimals),
            "top": top,
            "top_mass": _r(sorted_p[:k].sum(), 6),
            "tail": tail_histogram(sorted_logits[k:], logsumexp, tail_buckets, decimals),
            "cumulative": {"ranks": ranks, "mass": [_r(cumulative[rank - 1], 6) for rank in ranks]},
            "full_logits": None,
            "timing_ms": _r((time.perf_counter() - started) * 1000.0, 1),
        }
        if full_logits:
            raw = logits.to(torch.float16).contiguous().numpy().tobytes()
            payload["full_logits"] = {
                "dtype": "float16",
                "encoding": "base64",
                "n": vocab,
                "data": base64.b64encode(raw).decode("ascii"),
            }
    return payload
