"""The BNF reading of a schema: rule per object, terminals per scalar, recursion by name."""

from app.grammar import render_grammar
from app.presets import PRESETS


def test_person_is_one_rule_with_three_keys():
    g = render_grammar(PRESETS["person"]["schema"])
    lines = g["text"].splitlines()
    assert lines[0] == "start: Person"
    person = next(line for line in lines if line.startswith("Person: "))
    assert person == 'Person: "{" "\\"name\\":" STRING24 "," "\\"age\\":" INT "," "\\"city\\":" STRING24 "}"'
    assert any(line.startswith("STRING24: ") for line in lines)
    assert any(line.startswith("INT: ") for line in lines)
    assert g["names"] == ["Person"]


def test_invoice_nests_a_definition_in_an_array():
    g = render_grammar(PRESETS["invoice"]["schema"])
    text = g["text"]
    assert text.startswith("start: Invoice\n")
    assert '"\\"items\\":" "[" (LineItem ("," LineItem)*)? "]"' in text
    assert "LineItem: " in text
    assert "NUMBER: " in text and "BOOL: " in text


def test_tree_refers_to_itself():
    g = render_grammar(PRESETS["tree"]["schema"])
    text = g["text"]
    assert text.startswith("start: TreeNode\n")
    assert 'TreeNode: "{" "\\"value\\":" INT "," "\\"children\\":" "[" (TreeNode ("," TreeNode)*)? "]" "}"' in text
    assert g["names"] == ["TreeNode"]


def test_optional_properties_enums_and_unions():
    schema = {
        "type": "object",
        "title": "Thing",
        "properties": {
            "kind": {"enum": ["a", "b"]},
            "size": {"anyOf": [{"type": "integer"}, {"type": "null"}]},
            "tags": {"type": "array", "items": {"type": "string"}, "minItems": 1},
        },
        "required": ["kind"],
    }
    text = render_grammar(schema)["text"]
    assert 'Thing: "{" "\\"kind\\":" "\\"a\\"" | "\\"b\\"" ("," "\\"size\\":" (INT | "null"))? ("," "\\"tags\\":" "[" STRING ("," STRING)* "]")? "}"' in text
