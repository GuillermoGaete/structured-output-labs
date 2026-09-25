"""A conversation instead of a single prompt: the replay mode's input.

A trace imported in the browser arrives as a list of `{"role", "content"}`
messages, roles limited to system / user / assistant (tool calls and tool
results are flattened into text by the client). This module turns that list
into what each backend needs, without touching torch, so the providers can use
it too:

- `plain_transcript` for a model without a chat template (and for showing a
  hosted request as text);
- `with_hint` for the "none" mode, which asks for the shape in words;
- `fit_template` for chat templates that refuse a system role or insist on
  strict user/assistant alternation (Gemma, Mistral…);
- `to_gemini` for Gemini's `systemInstruction` + `user`/`model` contents.
"""

from __future__ import annotations

Message = dict[str, str]

ROLE_LABEL = {"system": "System", "user": "User", "assistant": "Assistant"}


def plain_transcript(messages: list[Message]) -> str:
    """The conversation as plain text, ending where the assistant should write.

    A single user message is its own text, untouched: that is what a prompt was
    before conversations existed, and what a completion-style trace recorded.
    """
    if len(messages) == 1 and messages[0]["role"] == "user":
        return messages[0]["content"]
    blocks = [f"{ROLE_LABEL.get(m['role'], m['role'])}: {m['content']}" for m in messages]
    return "\n\n".join(blocks + ["Assistant:"])


def with_hint(messages: list[Message], hint: str) -> list[Message]:
    """The "none" mode's hint, appended to the last user message, or as a new one after a trailing system message."""
    out = [dict(m) for m in messages]
    for m in reversed(out):
        if m["role"] == "system":
            break
        if m["role"] == "user":
            m["content"] = f"{m['content']}\n\n{hint}"
            return out
    out.append({"role": "user", "content": hint})
    return out


def _merge_same_roles(messages: list[Message]) -> list[Message]:
    merged: list[Message] = []
    for m in messages:
        if merged and merged[-1]["role"] == m["role"]:
            merged[-1] = {"role": m["role"], "content": f"{merged[-1]['content']}\n\n{m['content']}"}
        else:
            merged.append(dict(m))
    return merged


def fit_template(messages: list[Message]) -> tuple[list[Message], list[str]]:
    """The conversation reshaped for a strict template, and what was changed.

    System messages fold into the first user message, consecutive messages of
    one role merge, and a conversation that would start with the assistant gets
    an empty user turn in front.
    """
    notes: list[str] = []
    system = [m["content"] for m in messages if m["role"] == "system"]
    rest = [dict(m) for m in messages if m["role"] != "system"]
    if system:
        notes.append(f"{len(system)} system message{'s' if len(system) > 1 else ''} folded into the first user message")
        joined = "\n\n".join(system)
        first_user = next((m for m in rest if m["role"] == "user"), None)
        if first_user is not None:
            first_user["content"] = f"{joined}\n\n{first_user['content']}"
        else:
            rest.insert(0, {"role": "user", "content": joined})
    merged = _merge_same_roles(rest)
    if len(merged) < len(rest):
        notes.append(f"{len(rest) - len(merged)} consecutive same-role message{'s' if len(rest) - len(merged) > 1 else ''} merged")
    if merged and merged[0]["role"] == "assistant":
        merged.insert(0, {"role": "user", "content": ""})
        notes.append("an empty user turn added before the first assistant message")
    return merged, notes


def to_gemini(messages: list[Message]) -> tuple[str | None, list[dict]]:
    """(systemInstruction text, contents): Gemini calls the assistant `model` and wants alternating turns."""
    system = "\n\n".join(m["content"] for m in messages if m["role"] == "system") or None
    rest = _merge_same_roles([m for m in messages if m["role"] != "system"])
    contents = [{"role": "model" if m["role"] == "assistant" else "user", "parts": [{"text": m["content"]}]} for m in rest]
    return system, contents
