"""Helpers for getting reliable JSON out of models that don't support strict structured output.

Smaller and free models sometimes wrap JSON in prose or code fences, skip a field, write
"Positive" instead of "positive", or return 7.5 where we want an integer. Rather than fail the
whole entry, we extract the JSON and coerce it onto the schema.
"""

import json
import re
import types
from typing import Any, Literal, Union, get_args, get_origin

from pydantic import BaseModel

_THINK = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)
_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)


def strip_reasoning(text: str) -> str:
    """Remove <think>…</think> blocks some reasoning models put in their visible output."""
    return _THINK.sub("", text).strip()


def extract_json(text: str) -> Any:
    """Parse the first JSON object in `text`. Raises ValueError if there isn't one."""
    cleaned = _FENCE.sub("", strip_reasoning(text).strip())
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("no JSON object found")
    candidate = cleaned[start : end + 1]
    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        # Trailing commas are the most common slip
        return json.loads(re.sub(r",\s*([}\]])", r"\1", candidate))


def schema_for_prompt(model: type[BaseModel]) -> dict[str, Any]:
    """A self-contained JSON Schema (no $refs, no titles), easier for small models to follow."""
    schema = model.model_json_schema()
    defs = schema.pop("$defs", {})

    def resolve(node: Any) -> Any:
        if isinstance(node, dict):
            if "$ref" in node:
                return resolve(defs[node["$ref"].split("/")[-1]])
            # Drop schema "title" annotations, but not properties that happen to be named title
            out = {k: resolve(v) for k, v in node.items() if k not in ("title", "properties")}
            if "properties" in node:
                out["properties"] = {name: resolve(prop) for name, prop in node["properties"].items()}
            if out.get("type") == "object":
                out["additionalProperties"] = False
                out["required"] = list(out.get("properties", {}))
            return out
        if isinstance(node, list):
            return [resolve(v) for v in node]
        return node

    return resolve(schema)


def _literal_default(options: tuple[Any, ...]) -> Any:
    for preferred in ("other", "unknown", "none", "neutral"):
        if preferred in options:
            return preferred
    return options[0]


def _number(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _coerce(tp: Any, value: Any) -> Any:
    origin = get_origin(tp)

    if origin in (Union, types.UnionType):
        args = [a for a in get_args(tp) if a is not type(None)]
        if value is None:
            return None
        if args[0] in (int, float):  # optional number: unknown stays unknown
            n = _number(value)
            return None if n is None else (int(round(n)) if args[0] is int else n)
        return _coerce(args[0], value)

    if isinstance(tp, type) and issubclass(tp, BaseModel):
        data = value if isinstance(value, dict) else {}
        lowered = {str(k).lower(): v for k, v in data.items()}
        return {
            name: _coerce(field.annotation, data.get(name, lowered.get(name.lower())))
            for name, field in tp.model_fields.items()
        }

    if origin is list:
        (item_type,) = get_args(tp) or (Any,)
        if value is None:
            return []
        items = value if isinstance(value, list) else [value]
        out = [_coerce(item_type, v) for v in items if v is not None]
        return [v for v in out if v not in ("", None, {})]

    if origin is Literal:
        options = get_args(tp)
        if isinstance(value, str):
            for option in options:
                if value.strip().lower() == str(option).lower():
                    return option
        return _literal_default(options)

    if tp is str:
        if value is None:
            return ""
        if isinstance(value, list):
            return ", ".join(str(v) for v in value)
        return str(value).strip()

    if tp is int:
        n = _number(value)
        return 5 if n is None else int(round(n))  # every int in our schemas is a 1–10 score; 5 is neutral

    if tp is float:
        return _number(value)

    if tp is bool:
        if isinstance(value, str):
            return value.strip().lower() in ("true", "yes", "1")
        return bool(value)

    return value


def coerce(model: type[BaseModel], data: Any) -> dict[str, Any]:
    """Fit loosely-shaped model output onto `model`'s fields, filling sensible defaults."""
    return _coerce(model, data)
