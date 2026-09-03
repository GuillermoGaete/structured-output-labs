"""The two observers that sit around the outlines mask in the processor chain.

    LogitsProcessorList([ PreMaskObserver, <outlines processor>, MasterObserver ])
                          ^ position 0                            ^ last position

Neither observer changes the scores. `PreMaskObserver` keeps a copy of the raw
logits (the model's "original intent"). `MasterObserver` sees the same tensor
after outlines has written `-inf` over every token the automaton forbids, and
records the comparison for the current step.
"""

from __future__ import annotations

import math
from typing import Callable

import torch
from transformers import LogitsProcessor


class PreMaskObserver(LogitsProcessor):
    def __init__(self) -> None:
        self.raw: list[torch.Tensor] = []

    def reset(self) -> None:
        self.raw.clear()

    def __call__(self, input_ids: torch.LongTensor, scores: torch.FloatTensor) -> torch.FloatTensor:
        self.raw.append(scores.detach().clone())
        return scores


class MasterObserver(LogitsProcessor):
    """Records, per step, what the mask did to the distribution.

    Parameters
    ----------
    pre:
        The `PreMaskObserver` that ran first in the same chain.
    top_k:
        How many entries of each distribution to keep.
    state_getter:
        Optional callable returning the automaton state the mask was computed
        from (only the outlines_core backend exposes one).
    """

    def __init__(self, pre: PreMaskObserver, top_k: int = 8, state_getter: Callable[[], int | None] | None = None) -> None:
        self.pre = pre
        self.top_k = top_k
        self.state_getter = state_getter
        self.records: list[dict] = []

    def reset(self) -> None:
        self.records.clear()
        self.pre.reset()

    def __call__(self, input_ids: torch.LongTensor, scores: torch.FloatTensor) -> torch.FloatTensor:
        if not self.pre.raw:
            raise RuntimeError("MasterObserver ran before PreMaskObserver; check the processor order")
        raw = self.pre.raw[-1][0].float()
        masked = scores[0].float()

        allowed = torch.isfinite(masked)
        n_allowed = int(allowed.sum().item())
        p_raw = torch.softmax(raw, dim=-1)
        if n_allowed > 0:
            p_forced = torch.softmax(masked, dim=-1)
            p_forced = torch.where(allowed, p_forced, torch.zeros_like(p_forced))
        else:
            p_forced = torch.zeros_like(p_raw)
        mass_removed = float(p_raw[~allowed].sum().item())

        k = min(self.top_k, raw.numel())
        raw_p, raw_ids = torch.topk(p_raw, k)
        forced_p, forced_ids = torch.topk(p_forced, min(k, max(n_allowed, 1)))

        state = None
        if self.state_getter is not None:
            try:
                state = self.state_getter()
            except Exception:  # pragma: no cover - defensive, the getter reaches into outlines internals
                state = None

        self.records.append(
            {
                "n_allowed": n_allowed,
                "vocab_size": int(raw.numel()),
                "mass_removed": mass_removed,
                "argmax_raw": int(torch.argmax(raw).item()),
                "top_original": [(int(t), float(p), bool(allowed[t])) for p, t in zip(raw_p.tolist(), raw_ids.tolist())],
                "top_forced": [(int(t), float(p), True) for p, t in zip(forced_p.tolist(), forced_ids.tolist()) if p > 0],
                "p_raw": p_raw,
                "p_forced": p_forced,
                "fsm_state": state,
            }
        )
        return scores

    def probs_for(self, step: int, token_id: int) -> tuple[float, float]:
        rec = self.records[step]
        p_o = float(rec["p_raw"][token_id].item())
        p_f = float(rec["p_forced"][token_id].item())
        return (0.0 if math.isnan(p_o) else p_o, 0.0 if math.isnan(p_f) else p_f)
