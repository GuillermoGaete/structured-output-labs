"""Preset schemas the UI offers as editable starting points.

Each preset is a Pydantic model (the way the original notebook defined them)
plus a prompt. The JSON schema is derived from the model, so what the UI shows
is exactly what `outlines` compiles.

`model_source` is the same model as pasteable source, so the UI can open in
Pydantic mode. `tests/test_pydantic_schema.py` asserts that running it back
through `pydantic_schema.from_pydantic` reproduces `schema` exactly, which is
what keeps the two from drifting.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class Person(BaseModel):
    # `extra="forbid"` becomes `additionalProperties: false`, so the grammar engine
    # (which follows the JSON Schema default of allowing extra keys) matches the
    # regex engine (which never allows them).
    model_config = ConfigDict(extra="forbid")

    name: str = Field(max_length=24)
    age: int
    city: str = Field(max_length=24)


class LineItem(BaseModel):
    # `extra="forbid"` becomes `additionalProperties: false`, so the grammar engine
    # (which follows the JSON Schema default of allowing extra keys) matches the
    # regex engine (which never allows them).
    model_config = ConfigDict(extra="forbid")

    sku: str = Field(max_length=12)
    qty: int
    unit_price: float


class Invoice(BaseModel):
    # `extra="forbid"` becomes `additionalProperties: false`, so the grammar engine
    # (which follows the JSON Schema default of allowing extra keys) matches the
    # regex engine (which never allows them).
    model_config = ConfigDict(extra="forbid")

    invoice_id: str = Field(max_length=12)
    customer: str = Field(max_length=24)
    items: list[LineItem]
    paid: bool


class TreeNode(BaseModel):
    """A recursive schema: every node holds a list of nodes."""

    model_config = ConfigDict(extra="forbid")

    value: int
    children: list["TreeNode"]


TreeNode.model_rebuild()


FORBID = '    model_config = ConfigDict(extra="forbid")'

PERSON_SOURCE = f"""from pydantic import BaseModel, ConfigDict, Field


class Person(BaseModel):
{FORBID}

    name: str = Field(max_length=24)
    age: int
    city: str = Field(max_length=24)
"""

INVOICE_SOURCE = f"""from pydantic import BaseModel, ConfigDict, Field


class LineItem(BaseModel):
{FORBID}

    sku: str = Field(max_length=12)
    qty: int
    unit_price: float


class Invoice(BaseModel):
{FORBID}

    invoice_id: str = Field(max_length=12)
    customer: str = Field(max_length=24)
    items: list[LineItem]
    paid: bool
"""

TREE_SOURCE = f'''from pydantic import BaseModel, ConfigDict


class TreeNode(BaseModel):
    """A recursive schema: every node holds a list of nodes."""

{FORBID}

    value: int
    children: list["TreeNode"]
'''


PRESETS: dict[str, dict[str, Any]] = {
    "person": {
        "id": "person",
        "name": "Person (flat)",
        "description": "Three scalar fields. Compiles to a plain regex and a small finite-state machine.",
        "schema": Person.model_json_schema(),
        "model_source": PERSON_SOURCE,
        "prompt": "Extract the person from this text as JSON: "
        "Ada Lovelace, 36, lives in London and writes about analytical engines.",
    },
    "invoice": {
        "id": "invoice",
        "name": "Invoice (nested)",
        "description": "An object with an array of objects inside. Still finite: the FSM just gets bigger.",
        "schema": Invoice.model_json_schema(),
        "model_source": INVOICE_SOURCE,
        "prompt": "Turn this order into an invoice JSON: "
        "customer Grace Hopper bought 2 units of SKU COB-1 at 12.5 each and 1 unit of SKU LSP-9 at 99.0; the invoice is unpaid.",
    },
    "tree": {
        "id": "tree",
        "name": "Tree (recursive)",
        "description": "The schema references itself. A regex can only unroll a few levels; a grammar can nest forever.",
        "schema": TreeNode.model_json_schema(),
        "model_source": TREE_SOURCE,
        "prompt": "Write a small tree as JSON: the root has value 1 and two children with values 2 and 3; "
        "the node with value 2 has one child with value 4.",
    },
}


def _refs_in(node: Any) -> set[str]:
    refs: set[str] = set()
    if isinstance(node, dict):
        ref = node.get("$ref")
        if isinstance(ref, str) and ref.startswith("#/$defs/"):
            refs.add(ref.split("/")[-1])
        for value in node.values():
            refs |= _refs_in(value)
    elif isinstance(node, list):
        for item in node:
            refs |= _refs_in(item)
    return refs


def is_recursive(schema: dict[str, Any]) -> bool:
    """True when some definition in `$defs` can reach itself through `$ref`s."""
    defs = schema.get("$defs") or schema.get("definitions") or {}
    graph = {name: _refs_in(body) for name, body in defs.items()}
    # The root may also be one of the defs (Pydantic emits `$ref` at the root
    # for self-referential models); treat the root as a virtual node.
    root_refs = _refs_in({k: v for k, v in schema.items() if k not in ("$defs", "definitions")})

    def reaches_itself(start: str) -> bool:
        seen: set[str] = set()
        stack = list(graph.get(start, ()))
        while stack:
            current = stack.pop()
            if current == start:
                return True
            if current in seen:
                continue
            seen.add(current)
            stack.extend(graph.get(current, ()))
        return False

    return any(reaches_itself(name) for name in graph) or any(
        reaches_itself(name) for name in root_refs
    )
