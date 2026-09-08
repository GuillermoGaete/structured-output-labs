"""strip_to_json + classify on hand-written texts. No model."""

from __future__ import annotations

import pytest

from app.validate import FAILURE_CLASSES, strip_to_json, validate_text

SCHEMA = {
    "type": "object",
    "properties": {"name": {"type": "string"}, "age": {"type": "integer"}, "city": {"type": "string"}},
    "required": ["name", "age", "city"],
    "additionalProperties": False,
}
OK = '{"name": "Ada Lovelace", "age": 36, "city": "London"}'


def test_strip_fence():
    stripped, applied = strip_to_json("```json\n" + OK + "\n```")
    assert stripped == OK
    assert applied == ["fence"]


def test_strip_preamble_and_trailing():
    stripped, applied = strip_to_json("Sure, here is the JSON you asked for:\n" + OK + "\nLet me know if you need anything else.")
    assert stripped == OK
    assert applied == ["preamble", "trailing"]


def test_strip_keeps_brackets_inside_strings():
    text = '{"name": "A{da [x", "age": 1, "city": "L}"}'
    stripped, applied = strip_to_json(text + " trailing")
    assert stripped == text
    assert applied == ["trailing"]


def test_strip_nothing_to_do():
    assert strip_to_json(OK) == (OK, [])
    assert strip_to_json("I cannot do that.") == ("I cannot do that.", [])


CASES = [
    ("ok", OK, "eos", "ok", "ok"),
    ("fence", "```json\n" + OK + "\n```", "eos", "fence", "ok"),
    ("unclosed fence, truncated", '```json\n{"name": "Ada", "age": 3', "max_new_tokens", "fence", "truncated"),
    ("preamble", "Sure! Here is the JSON:\n" + OK, "eos", "preamble", "ok"),
    ("trailing", OK + "\nHope this helps!", "eos", "preamble", "ok"),
    ("truncated", '{"name": "Ada", "age": 3', "max_new_tokens", "truncated", "truncated"),
    ("garbage", "I cannot do that.", "eos", "invalid_json", "invalid_json"),
    ("missing key", '{"name": "Ada", "age": 36}', "eos", "schema_missing_key", "schema_missing_key"),
    ("extra key", '{"name": "Ada", "age": 36, "city": "London", "country": "UK"}', "eos", "schema_extra_key", "schema_extra_key"),
    ("wrong type", '{"name": "Ada", "age": "36", "city": "London"}', "eos", "schema_type", "schema_type"),
    ("fence hiding a schema error", '```json\n{"name": "Ada", "age": 36}\n```', "eos", "fence", "schema_missing_key"),
]


@pytest.mark.parametrize("label,text,stop,expected,expected_stripped", CASES, ids=[c[0] for c in CASES])
def test_classify(label, text, stop, expected, expected_stripped):
    v = validate_text(text, SCHEMA, stop)
    assert v.failure_class == expected, v
    assert v.failure_class_stripped == expected_stripped, v
    assert v.failure_class in FAILURE_CLASSES
    assert v.failure_class_stripped not in ("fence", "preamble")
    assert v.stop_reason == stop


def test_report_fields():
    v = validate_text("```json\n" + '{"name": "Ada", "age": 36}' + "\n```", SCHEMA, "eos")
    assert not v.raw_parse_ok and v.parse_ok
    assert not v.schema_ok
    assert v.schema_error["validator"] == "required"
    assert "city" in v.schema_error["message"]
    assert v.schema_error_counts["required"] == 1
    assert v.parsed == {"name": "Ada", "age": 36}
    bad = validate_text('{"name": "Ada", "age": 3', SCHEMA, "max_new_tokens")
    assert bad.parse_error is not None and "pos" in bad.parse_error
    assert bad.parsed is None
