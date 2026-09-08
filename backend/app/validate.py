"""Strip, parse, validate and classify a generation's text. Pure functions, no model.

`strip_to_json` is the regex everyone has written: drop the markdown fence,
the "Sure, here is…" preamble and the trailing prose. The report keeps both
the raw and the stripped verdicts so the UI can show that unconstrained
output still fails sometimes *after* that regex.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from typing import Any

from jsonschema import validators
from jsonschema.exceptions import best_match

from .tracing import Validation

FENCE_RE = re.compile(r"```(?:json|JSON)?[ \t]*\r?\n?(.*?)(?:```|\Z)", re.DOTALL)

FAILURE_CLASSES = (
    "ok",
    "fence",
    "preamble",
    "invalid_json",
    "truncated",
    "schema_type",
    "schema_missing_key",
    "schema_extra_key",
)

_SCHEMA_CLASS = {"required": "schema_missing_key", "additionalProperties": "schema_extra_key"}
_COUNTED_VALIDATORS = ("required", "additionalProperties", "type")


def _balanced_end(text: str, start: int) -> int | None:
    """Index just past the bracket that closes the value opened at `start`, or None."""
    depth = 0
    in_string = False
    escaped = False
    for i in range(start, len(text)):
        ch = text[i]
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
            depth -= 1
            if depth == 0:
                return i + 1
    return None


def strip_to_json(text: str) -> tuple[str, list[str]]:
    """Return (stripped, applied) where applied ⊆ ["fence", "preamble", "trailing"]."""
    applied: list[str] = []
    stripped = text
    match = FENCE_RE.search(stripped)
    if match:
        stripped = match.group(1)
        applied.append("fence")
    first = next((i for i, ch in enumerate(stripped) if ch in "{["), None)
    if first is not None and stripped[:first].strip():
        stripped = stripped[first:]
        applied.append("preamble")
        first = 0
    if first is not None:
        lead = len(stripped) - len(stripped.lstrip())
        end = _balanced_end(stripped, lead)
        if end is not None and stripped[end:].strip():
            stripped = stripped[:end]
            applied.append("trailing")
    return stripped.strip(), applied


def _parse(text: str) -> tuple[Any, dict[str, Any] | None]:
    try:
        return json.loads(text), None
    except json.JSONDecodeError as exc:
        return None, {"message": exc.msg, "pos": exc.pos, "lineno": exc.lineno, "colno": exc.colno}


def _schema_errors(obj: Any, schema: dict[str, Any]) -> tuple[bool, dict[str, Any] | None, dict[str, int]]:
    validator = validators.validator_for(schema)(schema)
    errors = list(validator.iter_errors(obj))
    counts = Counter(err.validator if err.validator in _COUNTED_VALIDATORS else "other" for err in errors)
    counts_out = {name: int(counts.get(name, 0)) for name in (*_COUNTED_VALIDATORS, "other")}
    if not errors:
        return True, None, counts_out
    best = best_match(errors)
    detail = {
        "message": best.message,
        "validator": best.validator,
        "path": [str(p) for p in best.absolute_path],
        "json_path": best.json_path,
        "schema_path": [str(p) for p in best.absolute_schema_path],
        "validator_value": _jsonable(best.validator_value),
    }
    return False, detail, counts_out


def _jsonable(value: Any) -> Any:
    try:
        json.dumps(value)
        return value
    except (TypeError, ValueError):
        return str(value)


def classify(
    parse_ok: bool,
    schema_ok: bool,
    best_validator: str | None,
    applied: list[str],
    stop_reason: str,
    *,
    strip_classes: bool = True,
) -> str:
    if parse_ok and schema_ok:
        return "ok"
    if parse_ok:
        return _SCHEMA_CLASS.get(best_validator or "", "schema_type")
    if strip_classes:
        if "fence" in applied:
            return "fence"
        if "preamble" in applied or "trailing" in applied:
            return "preamble"
    if stop_reason != "eos":
        return "truncated"
    return "invalid_json"


def validate_text(raw_text: str, schema: dict[str, Any], stop_reason: str) -> Validation:
    raw_obj, raw_err = _parse(raw_text)
    raw_parse_ok = raw_err is None
    raw_schema_ok, raw_best, _ = _schema_errors(raw_obj, schema) if raw_parse_ok else (False, None, {})

    stripped, applied = strip_to_json(raw_text)
    obj, err = _parse(stripped)
    parse_ok = err is None
    if parse_ok:
        schema_ok, best, counts = _schema_errors(obj, schema)
    else:
        schema_ok, best, counts = False, None, {name: 0 for name in (*_COUNTED_VALIDATORS, "other")}

    failure_class = classify(
        raw_parse_ok, raw_schema_ok, raw_best["validator"] if raw_best else None, applied, stop_reason
    )
    failure_class_stripped = classify(
        parse_ok, schema_ok, best["validator"] if best else None, applied, stop_reason, strip_classes=False
    )
    return Validation(
        raw_text=raw_text,
        stripped_text=stripped,
        strip_applied=applied,
        raw_parse_ok=raw_parse_ok,
        raw_schema_ok=raw_schema_ok,
        parse_ok=parse_ok,
        parse_error=err,
        schema_ok=schema_ok,
        schema_error=best,
        schema_error_counts=counts,
        stop_reason=stop_reason,
        failure_class=failure_class,
        failure_class_stripped=failure_class_stripped,
        parsed=obj if parse_ok else None,
    )


def legacy_error(raw_text: str, schema: dict[str, Any]) -> str | None:
    """The one-line message the first web client shows under the text."""
    obj, err = _parse(raw_text)
    if err is not None:
        return f"not valid JSON: {err['message']} at position {err['pos']}"
    ok, best, _ = _schema_errors(obj, schema)
    if ok:
        return None
    return f"JSON does not match the schema: {best['message']}"
