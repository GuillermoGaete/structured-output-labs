"""Pasted Pydantic source -> JSON Schema. No model, no network, no `exec`."""

from __future__ import annotations

import pytest

from app.presets import PRESETS
from app.pydantic_schema import BadModel, from_pydantic


@pytest.mark.parametrize("preset_id", sorted(PRESETS))
def test_preset_source_reproduces_the_preset_schema(preset_id: str):
    """The served source and the served schema cannot drift: this is the check that pins them."""
    preset = PRESETS[preset_id]
    out = from_pydantic(preset["model_source"])
    assert out["schema"] == preset["schema"], preset_id


def test_flat_model():
    out = from_pydantic(
        """
from pydantic import BaseModel, ConfigDict, Field

class Person(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(max_length=24)
    age: int
"""
    )
    assert out["root"] == "Person" and out["models"] == ["Person"]
    schema = out["schema"]
    assert schema["additionalProperties"] is False
    assert schema["properties"]["name"] == {"maxLength": 24, "title": "Name", "type": "string"}
    assert schema["required"] == ["name", "age"]


def test_nested_model_becomes_a_def_and_the_outer_class_is_the_root():
    out = from_pydantic(
        """
from pydantic import BaseModel

class LineItem(BaseModel):
    sku: str

class Invoice(BaseModel):
    items: list[LineItem]
"""
    )
    assert out["root"] == "Invoice"  # LineItem is referenced, so it is not the root
    assert out["models"] == ["LineItem", "Invoice"]
    assert out["schema"]["$defs"]["LineItem"]["properties"]["sku"]["type"] == "string"
    assert out["schema"]["properties"]["items"]["items"] == {"$ref": "#/$defs/LineItem"}


def test_recursive_model_resolves_its_own_forward_reference():
    out = from_pydantic(
        """
from pydantic import BaseModel

class TreeNode(BaseModel):
    value: int
    children: list["TreeNode"]
"""
    )
    assert out["root"] == "TreeNode"
    assert out["schema"]["$ref"] == "#/$defs/TreeNode"
    assert out["schema"]["$defs"]["TreeNode"]["properties"]["children"]["items"] == {"$ref": "#/$defs/TreeNode"}


def test_enum_literal_optional_and_union():
    out = from_pydantic(
        """
from enum import Enum
from typing import Literal, Optional
from pydantic import BaseModel

class Colour(str, Enum):
    red = "red"
    blue = "blue"

class Thing(BaseModel):
    colour: Colour
    size: Literal["s", "m"]
    note: Optional[str] = None
    ratio: float | None
"""
    )
    assert out["enums"] == ["Colour"] and out["models"] == ["Thing"]
    schema = out["schema"]
    assert schema["$defs"]["Colour"]["enum"] == ["red", "blue"]
    assert schema["properties"]["size"]["enum"] == ["s", "m"]
    assert {"type": "null"} in schema["properties"]["note"]["anyOf"]
    assert {"type": "null"} in schema["properties"]["ratio"]["anyOf"]


def test_field_constraints_reach_the_schema():
    out = from_pydantic(
        """
from pydantic import BaseModel, Field

class Bounded(BaseModel):
    code: str = Field(pattern="^[A-Z]+$", min_length=2)
    qty: int = Field(ge=1, le=99)
    label: str = Field(default="none", description="what it is")
"""
    )
    props = out["schema"]["properties"]
    assert props["code"]["pattern"] == "^[A-Z]+$" and props["code"]["minLength"] == 2
    assert props["qty"]["minimum"] == 1 and props["qty"]["maximum"] == 99
    assert props["label"]["default"] == "none" and props["label"]["description"] == "what it is"
    assert out["schema"]["required"] == ["code", "qty"]


def test_the_requested_model_wins_over_the_root_heuristic():
    source = """
from pydantic import BaseModel

class A(BaseModel):
    x: int

class B(BaseModel):
    y: int
"""
    assert from_pydantic(source)["root"] == "B"  # last defined
    assert from_pydantic(source, "A")["root"] == "A"
    with pytest.raises(BadModel) as e:
        from_pydantic(source, "C")
    assert "unknown model" in e.value.message


@pytest.mark.parametrize(
    "source,expected",
    [
        ("import os\nos.system('echo pwned')\n", "only class definitions"),
        ("from pydantic import BaseModel\ndef helper():\n    return 1\n", "only class definitions"),
        ("PAYLOAD = open('/etc/passwd').read()\n", "only class definitions"),
        ("from pydantic import BaseModel\nclass A(BaseModel):\n    x: SomeThing\n", "unknown type"),
        ("from pydantic import BaseModel\nclass A(BaseModel):\n    x: dict[int, str]\n", "keys must be str"),
        ("from pydantic import BaseModel, Field\nclass A(BaseModel):\n    x: str = Field(default_factory=list)\n", "is not supported"),
        ("from pydantic import BaseModel\nclass A(BaseModel):\n    x = 1\n", "type annotation"),
        ("from pydantic import BaseModel\nclass A(BaseModel):\n    pass\n", "no fields"),
        ("from pydantic import BaseModel\nclass A(int):\n    x: int\n", "must inherit from BaseModel"),
        ("class A(BaseModel:\n", "syntax error"),
        ("x = 1\n", "only class definitions"),
        ("from enum import Enum\nclass C(str, Enum):\n    a = 'a'\n", "no BaseModel found"),
    ],
)
def test_unsupported_source_is_rejected_with_a_reason(source: str, expected: str):
    with pytest.raises(BadModel) as e:
        from_pydantic(source)
    assert expected in e.value.message, e.value.message


def test_rejections_carry_a_line_number():
    with pytest.raises(BadModel) as e:
        from_pydantic("from pydantic import BaseModel\n\n\nclass A(BaseModel):\n    x: Nope\n")
    assert e.value.line == 5


def test_source_size_is_capped():
    with pytest.raises(BadModel) as e:
        from_pydantic("# padding\n" * 2000)
    assert "longer than" in e.value.message


def test_a_module_docstring_and_model_rebuild_are_tolerated():
    out = from_pydantic(
        '''"""My models."""
from pydantic import BaseModel

class Node(BaseModel):
    kids: list["Node"]
    n: int

Node.model_rebuild()
'''
    )
    assert out["root"] == "Node"
