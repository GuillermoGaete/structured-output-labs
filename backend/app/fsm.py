"""Export the automata behind a schema as node/edge lists for the graph view.

Two levels are exposed:

* the character-level FSM `interegular` builds from the regex (what the
  notebook drew), and
* the token-level DFA `outlines_core` actually walks at inference time
  (`Index.get_transitions()`), where each edge is a vocabulary token.
"""

from __future__ import annotations

from collections import defaultdict, deque
from typing import Any, Callable

import interegular
from interegular.fsm import anything_else

from .tracing import clean_bpe_glyphs

CHAR_STATE_CAP = 400
TOKEN_STATE_CAP = 300
TOKEN_EDGE_SAMPLES = 8


def _printable(ch: str) -> str:
    if ch == " ":
        return "␠"
    if ch == "\n":
        return "⏎"
    if ch == "\t":
        return "⇥"
    if ch == '"':
        return '"'
    return ch


def compress_chars(chars: list[str]) -> str:
    """Turn ['0','1',…,'9','a','b','c'] into '0-9 a-c'."""
    codes = sorted({ord(c) for c in chars})
    if not codes:
        return "∅"
    runs: list[tuple[int, int]] = []
    start = prev = codes[0]
    for code in codes[1:]:
        if code == prev + 1:
            prev = code
            continue
        runs.append((start, prev))
        start = prev = code
    runs.append((start, prev))
    parts = []
    for a, b in runs:
        if a == b:
            parts.append(_printable(chr(a)))
        elif b - a == 1:
            parts.append(_printable(chr(a)) + _printable(chr(b)))
        else:
            parts.append(f"{_printable(chr(a))}-{_printable(chr(b))}")
    label = " ".join(parts)
    if len(label) <= 14:
        return label
    # A big class (e.g. "any printable except quote and backslash") reads
    # better as a count than as a wall of ranges.
    return f"{len(codes)} chars"


def char_fsm_payload(regex: str, state_cap: int = CHAR_STATE_CAP) -> dict[str, Any]:
    fsm = interegular.parse_pattern(regex).to_fsm()
    # interegular numbers states from 0; we keep its ids so the UI can talk
    # about "state 12" consistently.
    by_transition = fsm.alphabet.by_transition
    order: list[int] = []
    seen = {fsm.initial}
    queue = deque([fsm.initial])
    while queue and len(order) < state_cap:
        state = queue.popleft()
        order.append(state)
        for _, target in sorted(fsm.map.get(state, {}).items()):
            if target not in seen:
                seen.add(target)
                queue.append(target)
    kept = set(order)
    edges: dict[tuple[int, int], list[str]] = defaultdict(list)
    for src in order:
        for symbol, dst in fsm.map.get(src, {}).items():
            if dst not in kept:
                continue
            chars = by_transition.get(symbol, [])
            if anything_else in chars:
                edges[(src, dst)].append("<other>")
                chars = [c for c in chars if c is not anything_else]
            edges[(src, dst)].extend(chars)
    edge_list = []
    for (src, dst), chars in edges.items():
        other = "<other>" in chars
        real = [c for c in chars if c != "<other>"]
        label = compress_chars(real)
        if other:
            label = (label + " ¬" if real else "¬")  # anything not otherwise listed
        edge_list.append({"source": src, "target": dst, "label": label, "count": len(real) + (1 if other else 0)})
    return {
        "level": "char",
        "initial": fsm.initial,
        "finals": sorted(s for s in fsm.finals if s in kept),
        "nodes": [{"id": s, "final": s in fsm.finals} for s in order],
        "edges": edge_list,
        "total_states": len(fsm.states),
        "truncated": len(fsm.states) > len(order),
    }


def token_dfa_payload(
    index: Any,
    token_text: Callable[[int], str],
    state_cap: int = TOKEN_STATE_CAP,
    samples: int = TOKEN_EDGE_SAMPLES,
) -> dict[str, Any]:
    """Serialise an `outlines_core.Index` as a graph.

    `index.get_transitions()` is `{state: {token_id: next_state}}`. States are
    opaque integers chosen by outlines_core, so we renumber them in BFS order
    from the initial state to keep the graph readable, but we also keep the
    original id (`raw`) because that is what `Guide.get_state()` reports
    during generation.
    """
    transitions = index.get_transitions()
    initial = index.get_initial_state()
    finals = set(index.get_final_states())
    order: list[int] = []
    seen = {initial}
    queue = deque([initial])
    while queue and len(order) < state_cap:
        state = queue.popleft()
        order.append(state)
        for _, target in sorted(transitions.get(state, {}).items()):
            if target not in seen:
                seen.add(target)
                queue.append(target)
    renumber = {raw: i for i, raw in enumerate(order)}
    edges: dict[tuple[int, int], list[int]] = defaultdict(list)
    for src in order:
        for token_id, dst in transitions.get(src, {}).items():
            if dst in renumber:
                edges[(src, dst)].append(token_id)
    edge_list = []
    for (src, dst), token_ids in edges.items():
        token_ids.sort()
        sample = [clean_bpe_glyphs(token_text(t)) for t in token_ids[:samples]]
        edge_list.append(
            {
                "source": renumber[src],
                "target": renumber[dst],
                "label": " | ".join(repr(s)[1:-1] for s in sample) + (" …" if len(token_ids) > samples else ""),
                "count": len(token_ids),
                "sample_token_ids": token_ids[:samples],
            }
        )
    return {
        "level": "token",
        "initial": renumber[initial],
        "finals": sorted(renumber[s] for s in finals if s in renumber),
        "nodes": [{"id": renumber[s], "raw": s, "final": s in finals} for s in order],
        "edges": edge_list,
        "total_states": len(transitions),
        "truncated": len(transitions) > len(order),
    }
