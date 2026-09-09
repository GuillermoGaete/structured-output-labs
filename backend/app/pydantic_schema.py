"""Turn a pasted Pydantic model into the JSON Schema `outlines` compiles.

The pasted source is **never executed**. It is parsed with `ast`, every class,
annotation and `Field(...)` keyword is checked against an allowlist, and the
models are then rebuilt with `pydantic.create_model` from real Python type
objects. So the schema is Pydantic's own `model_json_schema()` output, while a
pasted `os.system("rm -rf /")` is an unsupported statement in this grammar
rather than a shell command.

What is supported, and nothing else:

* `class X(BaseModel)` with annotated fields, and `class C(str, Enum)`.
* `str`, `int`, `float`, `bool`, `None`.
* `list[T]`, `dict[str, T]`, `set[T]`, `tuple[T, ...]`, `Optional[T]`,
  `Union[A, B]`, `A | B`, `Literal[...]`.
* References to the other classes in the same source, including forward
  references in quotes, so recursive models work.
* `Field(...)` with the constraint keywords in `FIELD_KEYS`.
* `model_config = ConfigDict(extra=...)`.
"""

from __future__ import annotations

import ast
import enum
import sys
import types
from typing import Any, ForwardRef, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, create_model

MAX_SOURCE_CHARS = 8_000
MAX_CLASSES = 12
MAX_FIELDS = 40
MAX_LITERALS = 64

SCALARS: dict[str, type] = {"str": str, "int": int, "float": float, "bool": bool}
# Generic containers, by the name written in the annotation.
CONTAINERS = {"list": list, "List": list, "set": set, "Set": set, "dict": dict, "Dict": dict, "tuple": tuple, "Tuple": tuple}
# `Field()` keywords forwarded to pydantic; anything else is rejected by name.
FIELD_KEYS = {
    "default",
    "title",
    "description",
    "max_length",
    "min_length",
    "pattern",
    "ge",
    "le",
    "gt",
    "lt",
    "multiple_of",
}
# Statements allowed at module level besides class definitions.
_REBUILD = "model_rebuild"
# A synthetic module holds the rebuilt classes so pydantic can resolve forward refs.
_NAMESPACE = "sol_pasted_models"


class BadModel(Exception):
    """The source is not a Pydantic model this converter accepts."""

    def __init__(self, message: str, line: int | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.line = line

    def to_dict(self) -> dict[str, Any]:
        return {"message": self.message, "line": self.line}


def _reject(node: ast.AST, what: str) -> BadModel:
    return BadModel(what, getattr(node, "lineno", None))


def _is_base_model(node: ast.expr) -> bool:
    return isinstance(node, ast.Name) and node.id == "BaseModel"


def _enum_mixin(bases: list[ast.expr]) -> type | None:
    """`(str, Enum)` -> str, `(int, Enum)` -> int, `(Enum,)` -> object. None if not an enum."""
    names = [b.id for b in bases if isinstance(b, ast.Name)]
    if "Enum" not in names and "IntEnum" not in names and "StrEnum" not in names:
        return None
    if "IntEnum" in names:
        return int
    if "StrEnum" in names:
        return str
    for name in names:
        if name in ("str", "int"):
            return SCALARS[name]
    return object


def _literal_value(node: ast.expr) -> Any:
    if isinstance(node, ast.Constant) and (isinstance(node.value, (str, int, float, bool)) or node.value is None):
        return node.value
    raise _reject(node, "only strings, numbers, booleans and None are allowed here")


class _Converter:
    def __init__(self, source: str) -> None:
        self.source = source
        self.classes: dict[str, ast.ClassDef] = {}
        self.order: list[str] = []
        self.enums: dict[str, type[enum.Enum]] = {}
        self.models: dict[str, type[BaseModel]] = {}
        self.referenced: set[str] = set()
        self.warnings: list[str] = []

    # ---------------------------------------------------------------- parsing

    def collect(self) -> None:
        if len(self.source) > MAX_SOURCE_CHARS:
            raise BadModel(f"the source is longer than {MAX_SOURCE_CHARS} characters")
        try:
            tree = ast.parse(self.source)
        except SyntaxError as e:
            raise BadModel(f"syntax error: {e.msg}", e.lineno) from e

        for stmt in tree.body:
            if isinstance(stmt, ast.ClassDef):
                if stmt.name in self.classes:
                    raise _reject(stmt, f"{stmt.name} is defined twice")
                self.classes[stmt.name] = stmt
                self.order.append(stmt.name)
                continue
            if isinstance(stmt, (ast.Import, ast.ImportFrom)):
                continue  # imports are not needed: the names come from the allowlist
            if isinstance(stmt, ast.Expr) and isinstance(stmt.value, ast.Constant) and isinstance(stmt.value.value, str):
                continue  # module docstring
            if isinstance(stmt, ast.Expr) and isinstance(stmt.value, ast.Call):
                func = stmt.value.func
                if isinstance(func, ast.Attribute) and func.attr == _REBUILD:
                    continue  # `Model.model_rebuild()` is implicit here
            raise _reject(stmt, f"only class definitions are supported, found {type(stmt).__name__}")

        if not self.classes:
            raise BadModel("no class definition found: paste a class that inherits from BaseModel")
        if len(self.classes) > MAX_CLASSES:
            raise BadModel(f"more than {MAX_CLASSES} classes")

    # ------------------------------------------------------------ annotations

    def annotation(self, node: ast.expr) -> Any:
        if isinstance(node, ast.Name):
            return self.name(node, node.id)
        if isinstance(node, ast.Constant):
            if node.value is None:
                return type(None)
            if isinstance(node.value, str):
                return self.name(node, node.value)  # forward reference in quotes
            raise _reject(node, f"{node.value!r} is not a type")
        if isinstance(node, ast.BinOp) and isinstance(node.op, ast.BitOr):
            return Union[self.annotation(node.left), self.annotation(node.right)]
        if isinstance(node, ast.Subscript):
            return self.subscript(node)
        raise _reject(node, f"unsupported annotation: {ast.unparse(node)}")

    def name(self, node: ast.expr, ident: str) -> Any:
        if ident in SCALARS:
            return SCALARS[ident]
        if ident in ("None", "NoneType"):
            return type(None)
        if ident == "Any":
            return Any
        if ident in self.classes:
            self.referenced.add(ident)
            return self.enums.get(ident) or ForwardRef(ident)
        raise _reject(node, f"unknown type {ident!r}; define it in the same file or use str/int/float/bool")

    def subscript(self, node: ast.Subscript) -> Any:
        head = node.value
        if not isinstance(head, ast.Name):
            raise _reject(node, f"unsupported annotation: {ast.unparse(node)}")
        args = node.slice.elts if isinstance(node.slice, ast.Tuple) else [node.slice]
        if head.id == "Literal":
            if len(args) > MAX_LITERALS:
                raise _reject(node, f"Literal with more than {MAX_LITERALS} values")
            return Literal[tuple(_literal_value(a) for a in args)]  # type: ignore[misc]
        if head.id == "Optional":
            if len(args) != 1:
                raise _reject(node, "Optional takes exactly one type")
            return Optional[self.annotation(args[0])]
        if head.id == "Union":
            return Union[tuple(self.annotation(a) for a in args)]  # type: ignore[misc]
        if head.id in CONTAINERS:
            container = CONTAINERS[head.id]
            if container is dict:
                if len(args) != 2:
                    raise _reject(node, "dict takes a key type and a value type")
                key = self.annotation(args[0])
                if key is not str:
                    raise _reject(node, "JSON object keys are strings, so dict keys must be str")
                return dict[str, self.annotation(args[1])]  # type: ignore[misc]
            if container is tuple:
                inner = tuple(Ellipsis if isinstance(a, ast.Constant) and a.value is Ellipsis else self.annotation(a) for a in args)
                return tuple[inner]  # type: ignore[misc]
            if len(args) != 1:
                raise _reject(node, f"{head.id} takes exactly one type")
            return container[self.annotation(args[0])]  # type: ignore[index]
        raise _reject(node, f"unsupported annotation: {ast.unparse(node)}")

    # ----------------------------------------------------------------- fields

    def field_info(self, node: ast.Call) -> Any:
        kwargs: dict[str, Any] = {}
        if node.args:
            kwargs["default"] = _literal_value(node.args[0])
        for kw in node.keywords:
            if kw.arg is None:
                raise _reject(node, "`**kwargs` is not supported in Field()")
            if kw.arg not in FIELD_KEYS:
                raise _reject(node, f"Field({kw.arg}=…) is not supported; try {', '.join(sorted(FIELD_KEYS))}")
            kwargs[kw.arg] = _literal_value(kw.value)
        return Field(**kwargs)

    def config_of(self, body: list[ast.stmt]) -> ConfigDict | None:
        for stmt in body:
            if not (isinstance(stmt, ast.Assign) and len(stmt.targets) == 1):
                continue
            target = stmt.targets[0]
            if not (isinstance(target, ast.Name) and target.id == "model_config"):
                continue
            call = stmt.value
            if not (isinstance(call, ast.Call) and isinstance(call.func, ast.Name) and call.func.id == "ConfigDict"):
                raise _reject(stmt, "model_config must be a ConfigDict(...) call")
            options: dict[str, Any] = {}
            for kw in call.keywords:
                if kw.arg != "extra":
                    raise _reject(stmt, f"ConfigDict({kw.arg}=…) is not supported, only extra=")
                value = _literal_value(kw.value)
                if value not in ("forbid", "allow", "ignore"):
                    raise _reject(stmt, "extra must be 'forbid', 'allow' or 'ignore'")
                options["extra"] = value
            return ConfigDict(**options)  # type: ignore[typeddict-item]
        return None

    # ------------------------------------------------------------------ build

    def build_enums(self) -> None:
        for name in self.order:
            node = self.classes[name]
            mixin = _enum_mixin(node.bases)
            if mixin is None:
                continue
            members: dict[str, Any] = {}
            for stmt in node.body:
                if isinstance(stmt, ast.Pass):
                    continue
                if isinstance(stmt, ast.Expr) and isinstance(stmt.value, ast.Constant):
                    continue  # docstring
                if isinstance(stmt, ast.Assign) and len(stmt.targets) == 1 and isinstance(stmt.targets[0], ast.Name):
                    members[stmt.targets[0].id] = _literal_value(stmt.value)
                    continue
                raise _reject(stmt, f"{name} is an Enum, so its body must be NAME = value")
            if not members:
                raise _reject(node, f"{name} has no members")
            if mixin is object:
                self.enums[name] = enum.Enum(name, members, module=_NAMESPACE)  # type: ignore[misc]
            else:
                self.enums[name] = enum.Enum(name, members, type=mixin, module=_NAMESPACE)  # type: ignore[misc]

    def build_models(self) -> None:
        for name in self.order:
            if name in self.enums:
                continue
            node = self.classes[name]
            if not any(_is_base_model(b) for b in node.bases):
                known = ", ".join(sorted(SCALARS))
                raise _reject(node, f"{name} must inherit from BaseModel (or be an Enum); other base classes ({known}) are not supported")
            fields: dict[str, Any] = {}
            for stmt in node.body:
                if isinstance(stmt, ast.Pass):
                    continue
                if isinstance(stmt, ast.Expr) and isinstance(stmt.value, ast.Constant):
                    continue  # docstring, picked up below as the schema description
                if isinstance(stmt, ast.Assign):
                    target = stmt.targets[0] if len(stmt.targets) == 1 else None
                    if isinstance(target, ast.Name) and target.id == "model_config":
                        continue  # handled by config_of
                    raise _reject(stmt, "fields need a type annotation, for example `name: str`")
                if not isinstance(stmt, ast.AnnAssign) or not isinstance(stmt.target, ast.Name):
                    raise _reject(stmt, f"unsupported statement in {name}: {type(stmt).__name__}")
                annotation = self.annotation(stmt.annotation)
                if stmt.value is None:
                    info = Field()
                elif isinstance(stmt.value, ast.Call) and isinstance(stmt.value.func, ast.Name) and stmt.value.func.id == "Field":
                    info = self.field_info(stmt.value)
                else:
                    info = Field(default=_literal_value(stmt.value))
                fields[stmt.target.id] = (annotation, info)
            if not fields:
                raise _reject(node, f"{name} has no fields")
            if len(fields) > MAX_FIELDS:
                raise _reject(node, f"{name} has more than {MAX_FIELDS} fields")
            config = self.config_of(node.body)
            kwargs: dict[str, Any] = {"__module__": _NAMESPACE}
            if config is not None:
                kwargs["__config__"] = config
            doc = ast.get_docstring(node)
            if doc:
                kwargs["__doc__"] = doc
            self.models[name] = create_model(name, **kwargs, **fields)

    def resolve_forward_refs(self) -> None:
        """Publish every class in a throwaway module so pydantic can resolve the forward refs."""
        module = types.ModuleType(_NAMESPACE)
        for name, model in self.models.items():
            setattr(module, name, model)
        for name, member in self.enums.items():
            setattr(module, name, member)
        previous = sys.modules.get(_NAMESPACE)
        sys.modules[_NAMESPACE] = module
        try:
            for name, model in self.models.items():
                try:
                    model.model_rebuild(force=True)
                except Exception as e:  # pragma: no cover - defensive: pydantic raising on a validated tree
                    raise BadModel(f"{name} could not be built: {e}", self.classes[name].lineno) from e
        finally:
            if previous is None:
                sys.modules.pop(_NAMESPACE, None)
            else:
                sys.modules[_NAMESPACE] = previous

    def root_name(self, requested: str | None) -> str:
        names = [n for n in self.order if n in self.models]
        if not names:
            raise BadModel("no BaseModel found: an Enum on its own has no JSON Schema to compile")
        if requested:
            if requested not in self.models:
                raise BadModel(f"unknown model {requested!r}; this file defines {', '.join(names)}")
            return requested
        # The interesting model is the one nothing else points at; ties go to the last defined.
        standalone = [n for n in names if n not in self.referenced]
        return standalone[-1] if standalone else names[-1]


def from_pydantic(source: str, model: str | None = None) -> dict[str, Any]:
    """Parse `source` and return the JSON Schema of its root model.

    Raises `BadModel` with a message and a line number for anything unsupported.
    """
    converter = _Converter(source)
    converter.collect()
    converter.build_enums()
    converter.build_models()
    converter.resolve_forward_refs()
    root = converter.root_name(model)
    try:
        schema = converter.models[root].model_json_schema()
    except Exception as e:  # pragma: no cover - defensive
        raise BadModel(f"pydantic could not produce a schema for {root}: {e}") from e
    return {
        "root": root,
        "models": [n for n in converter.order if n in converter.models],
        "enums": [n for n in converter.order if n in converter.enums],
        "schema": schema,
        "warnings": converter.warnings,
    }
