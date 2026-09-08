"""Shapes shared with the web client, plus the small text utilities.

Every dataclass here is serialised as-is into the SSE stream, so the field
names are the contract with `course/lib/types.ts` (and the older
`web/lib/types.ts`, which only reads the original fields).
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Literal

# Engine actually used for a run. `none` = no constraint at all (prompting only),
# `json` = any valid JSON object (llguidance with a permissive schema).
Mode = Literal["fsm", "cfg", "none", "json"]
Constraint = Literal["schema", "none", "json"]
EngineBackend = Literal["outlines_core", "llguidance", "none"]
StopReason = Literal["eos", "max_new_tokens", "stopped"]

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
    was_overridden: bool  # the model's argmax was forbidden by the mask
    p_original: float  # probability the model gave the chosen token before masking
    p_forced: float  # probability after masking + renormalisation
    argmax_taken: bool = True  # the chosen token is the model's own argmax
    dt_ms: float = 0.0  # forward pass + processors + sampling
    forward_ms: float = 0.0
    mask_ms: float = 0.0  # the constraint processor alone (0 without a constraint)
    observer_ms: float = 0.0
    sample_ms: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class Meta:
    mode: Mode
    backend: str  # same as engine_backend; kept for the first web client
    model_id: str
    regex: str | None
    prompt_token_count: int
    vocab_size: int
    max_new_tokens: int
    temperature: float
    recursive: bool
    constraint: Constraint = "schema"
    engine_backend: EngineBackend = "outlines_core"
    sampling: dict[str, Any] = field(default_factory=dict)
    schema_in_prompt: bool = False
    use_chat_template: bool = True
    prompt_rendered: str = ""
    compile_ms: float = 0.0
    compile_cached: bool | None = None
    include_steps: bool = True

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class Validation:
    """What happened to the generated text: raw, after the usual stripping, and why it failed."""

    raw_text: str
    stripped_text: str
    strip_applied: list[str]  # subset of {"fence", "preamble", "trailing"}
    raw_parse_ok: bool
    raw_schema_ok: bool
    parse_ok: bool  # of stripped_text
    parse_error: dict[str, Any] | None
    schema_ok: bool  # of stripped_text
    schema_error: dict[str, Any] | None
    schema_error_counts: dict[str, int]
    stop_reason: str
    failure_class: str  # of the raw text, first cause
    failure_class_stripped: str  # what still fails after stripping
    parsed: Any

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class Timing:
    compile_ms: float
    compile_cached: bool | None
    prefill_ms: float
    decode_ms: float
    forward_ms: float
    processor_ms: float
    observer_ms: float
    sample_ms: float
    total_ms: float
    n_prompt_tokens: int
    n_new_tokens: int
    tokens_per_s: float
    decode_tokens_per_s: float
    first_token_ms: float
    torch_threads: int

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class Summary:
    n_overridden: int
    n_argmax_taken: int
    mean_vocab_kept: float
    mean_mass_removed: float
    min_n_allowed: int
    max_stack_depth: int

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
    mode: Mode = "fsm"
    engine_backend: EngineBackend = "outlines_core"
    stop_reason: str = "max_new_tokens"
    validation: dict[str, Any] | None = None
    timing: dict[str, Any] | None = None
    summary: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
