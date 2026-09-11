"""A BNF reading of a JSON Schema: the shape llguidance's compiler builds, printed.

llguidance compiles a schema to its grammar inside the Rust crate and offers no
way to print the result (`JsonCompiler.compile` only wraps the schema in a
grammar envelope). So the lab derives this text itself, from the same schema
and with the separators the CFG mode asks for (`x-guidance`:
`whitespace_flexible: false`, so `","` and `":"` exactly), the way the FSM mode
shows the regex outlines_core builds. It is a reading of the schema, not a dump
of the engine.
"""

from __future__ import annotations

import json
import re
from typing import Any

TERMINALS = {
    "INT": r"/-?(0|[1-9][0-9]*)/",
    "NUMBER": r"/-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?/",
    "STRING": r'/"([^"\\]|\\.)*"/',
    "BOOL": '"true" | "false"',
}


def _ref_name(ref: str) -> str:
    return ref.rsplit("/", 1)[-1]


def _symbol(name: str) -> str:
    """A rule name the grammar can use: letters, digits and underscores."""
    cleaned = re.sub(r"[^A-Za-z0-9_]", "_", name).strip("_")
    return cleaned or "rule"


def render_grammar(schema: dict[str, Any]) -> dict[str, Any]:
    """Return ``{"text": ..., "rules": n, "names": [...]}`` for `schema`."""
    defs: dict[str, Any] = {**schema.get("definitions", {}), **schema.get("$defs", {})}
    rules: dict[str, str] = {}
    used_terminals: list[str] = []

    def terminal(name: str) -> str:
        if name not in used_terminals:
            used_terminals.append(name)
        return name

    def string_terminal(sub: dict[str, Any]) -> str:
        max_len = sub.get("maxLength")
        if max_len is None:
            return terminal("STRING")
        name = f"STRING{int(max_len)}"
        TERMINALS.setdefault(name, rf'/"([^"\\]|\\.){{0,{int(max_len)}}}"/')
        return terminal(name)

    def resolve(sub: dict[str, Any]) -> tuple[dict[str, Any], str | None]:
        if "$ref" in sub:
            name = _ref_name(sub["$ref"])
            return defs.get(name, {}), name
        return sub, None

    def expr(sub: dict[str, Any], hint: str) -> str:
        sub, ref = resolve(sub)
        if ref is not None:
            name = _symbol(ref)
            ensure_rule(name, sub)
            return name
        if "enum" in sub:
            return " | ".join(json.dumps(json.dumps(v)) for v in sub["enum"])
        if "const" in sub:
            return json.dumps(json.dumps(sub["const"]))
        for key in ("anyOf", "oneOf"):
            if key in sub:
                return "(" + " | ".join(expr(x, hint) for x in sub[key]) + ")"
        kind = sub.get("type")
        if isinstance(kind, list):
            return "(" + " | ".join(expr({**sub, "type": k}, hint) for k in kind) + ")"
        if kind == "object":
            name = _symbol(sub.get("title") or hint)
            ensure_rule(name, sub)
            return name
        if kind == "array":
            item = expr(sub.get("items", {}), f"{hint}_item")
            if sub.get("minItems", 0) >= 1:
                return f'"[" {item} ("," {item})* "]"'
            return f'"[" ({item} ("," {item})*)? "]"'
        if kind == "string":
            return string_terminal(sub)
        if kind == "integer":
            return terminal("INT")
        if kind == "number":
            return terminal("NUMBER")
        if kind == "boolean":
            return terminal("BOOL")
        if kind == "null":
            return '"null"'
        return "VALUE"

    def ensure_rule(name: str, sub: dict[str, Any]) -> None:
        if name in rules:
            return
        rules[name] = ""  # reserve the slot first: a recursive schema comes back here
        required = set(sub.get("required", []))
        parts = ['"{"']
        first = True
        for key, value in sub.get("properties", {}).items():
            piece = f'{json.dumps(json.dumps(key) + ":")} {expr(value, key)}'
            if key in required:
                parts.append(piece if first else f'"," {piece}')
                first = False
            else:
                parts.append(f"({piece})?" if first else f'("," {piece})?')
        parts.append('"}"')
        rules[name] = " ".join(parts)

    root_schema, root_ref = resolve(schema)
    if root_ref is not None:
        start = _symbol(root_ref)
        ensure_rule(start, root_schema)
    elif root_schema.get("type") == "object" or "properties" in root_schema:
        start = _symbol(root_schema.get("title") or "root")
        ensure_rule(start, root_schema)
    else:
        start = "start_value"
        rules[start] = expr(root_schema, "value")

    lines = [f"start: {start}"]
    lines += [f"{name}: {body}" for name, body in rules.items()]
    lines += [f"{name}: {TERMINALS[name]}" for name in used_terminals]
    return {"text": "\n".join(lines), "rules": len(rules) + len(used_terminals) + 1, "names": list(rules)}
