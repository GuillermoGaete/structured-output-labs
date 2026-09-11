"""Shapes shared with the web client, plus the small text utilities.

Every dataclass here is serialised as-is into the SSE stream, so the field
names are the contract with `web/lib/types.ts`.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Literal

Mode = Literal["fsm", "cfg", "xgr", "none"]

# Byte-level BPE tokenizers (GPT-2, Qwen, DeepSeek, Llama 3…) encode a leading
# space as `Ġ`, a newline as `Ċ` and a tab as `ĉ`. The model never sees these
# glyphs, they are only in the *string form* of the vocabulary, but if you
# print raw tokens you get them. We replace them before rendering.
BPE_GLYPHS = {"Ġ": " ", "Ċ": "\n", "ĉ": "\t"}


def clean_bpe_glyphs(token: str) -> str:
    for glyph, replacement in BPE_GLYPHS.items():
        token = token.replace(glyph, replacement)
    return token


def json_stack_depth(text: str) -> int:
    """How many `{` / `[` are open in `text`, ignoring brackets inside strings.

    This is the "stack" a pushdown automaton would carry. A regex cannot count
    this; a grammar can.
    """
    depth = 0
    in_string = False
    escaped = False
    for ch in text:
        if in_string:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch in "{[":
            depth += 1
        elif ch in "}]":
            depth = max(0, depth - 1)
    return depth


@dataclass
class TopEntry:
    token_id: int
    token: str  # raw vocabulary string (may contain Ġ/Ċ)
    text: str  # what the token decodes to
    p: float
    allowed: bool


@dataclass
class Step:
    i: int
    token_id: int
    token: str
    text: str
    partial_text: str
    n_allowed: int
    vocab_size: int
    mass_removed: float
    top_original: list[TopEntry]
    top_forced: list[TopEntry]
    fsm_state: int | None
    stack_depth: int
    was_overridden: bool
    p_original: float  # probability the model gave the chosen token before masking
    p_forced: float  # probability after masking + renormalisation
    # The grammar engine only: what it forces next, and whether it would accept EOS here.
    ff_token_ids: list[int] = field(default_factory=list)
    ff_text: str = ""
    accepting: bool | None = None
    # A branch recomputes its parent's prefix through the same processors; those steps are marked.
    replayed: bool = False

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class Meta:
    mode: Mode
    backend: str
    model_id: str
    regex: str | None
    prompt_token_count: int
    vocab_size: int
    max_new_tokens: int
    temperature: float
    recursive: bool
    # "none" mode: no mask; the prompt carries the schema and only the final validation checks the shape.
    schema_in_prompt: bool = False
    # The exact text that was tokenized: system prompt, chat template, and the hint in "none" mode.
    prompt_text: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class Done:
    text: str
    parsed: Any
    valid: bool
    validation_error: str | None
    n_steps: int
    elapsed_s: float
    stopped_by: str
    tokens: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
