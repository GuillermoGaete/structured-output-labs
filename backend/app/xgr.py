"""XGrammar as a third mask: a pushdown automaton over the schema's grammar, with a token-mask cache.

Optional. `xgrammar` is imported lazily; without it the engine reports the mode
as unavailable and the UI hides it. Unlike llguidance, XGrammar prints the
grammar it compiles, so the Parser section can show the engine's own text.
"""

from __future__ import annotations

import json
from typing import Any

import torch


def available() -> bool:
    try:
        import xgrammar  # noqa: F401
    except Exception:
        return False
    return True


class XGrammarCompiler:
    """One compiler per tokenizer; it caches compiled schemas."""

    def __init__(self, tokenizer: Any, vocab_size: int) -> None:
        import xgrammar as xgr

        self.vocab_size = vocab_size
        self.info = xgr.TokenizerInfo.from_huggingface(tokenizer, vocab_size=vocab_size)
        self.compiler = xgr.GrammarCompiler(self.info)

    def compile(self, schema: dict[str, Any]) -> Any:
        # Compact JSON, the same shape the other two engines produce.
        return self.compiler.compile_json_schema(json.dumps(schema), any_whitespace=False, indent=None, separators=(",", ":"))

    @staticmethod
    def grammar_text(compiled: Any) -> str:
        return str(compiled.grammar)


class XGrammarMask:
    """The outlines-shaped processor: `reset()`, then one call per step.

    The first call only fills the mask; every later call first consumes the
    token that was sampled (the last of `input_ids`), the way the outlines and
    llguidance processors advance, which is what makes the prefix replay work
    unchanged.
    """

    def __init__(self, compiled: Any, vocab_size: int) -> None:
        import xgrammar as xgr

        self._xgr = xgr
        self.vocab_size = vocab_size
        self.matcher = xgr.GrammarMatcher(compiled)
        self.bitmask = xgr.allocate_token_bitmask(1, vocab_size)
        self.is_first_token = True
        self.filled = False

    def reset(self) -> None:
        self.matcher.reset()
        self.is_first_token = True
        self.filled = False

    def __call__(self, input_ids: torch.LongTensor, scores: torch.FloatTensor) -> torch.FloatTensor:
        if self.is_first_token:
            self.is_first_token = False
        elif not self.matcher.is_terminated():
            self.matcher.accept_token(int(input_ids[0, -1]))
        if self.matcher.is_terminated():
            return scores  # the stop token was accepted; nothing left to constrain
        self._xgr.reset_token_bitmask(self.bitmask)
        self.matcher.fill_next_token_bitmask(self.bitmask, 0)
        self.filled = True
        # The kernel wants float32 on the same device as the mask; the engine keeps logits in float32.
        self._xgr.apply_token_bitmask_inplace(scores, self.bitmask)
        return scores

    def allows(self, token_id: int) -> bool:
        if not self.filled:
            return True
        word = int(self.bitmask[0, token_id // 32])
        return bool((word >> (token_id % 32)) & 1)

    def probe(self, eos_id: int | None) -> dict[str, Any]:
        """What the grammar forces next, and whether it would accept the end of the sequence here."""
        try:
            forced = self.matcher.find_jump_forward_string()
        except Exception:
            forced = ""
        return {
            "ff_token_ids": [],
            "ff_text": forced,
            "accepting": bool(self.allows(eos_id)) if eos_id is not None and self.filled else None,
        }
