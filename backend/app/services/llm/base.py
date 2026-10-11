"""What every AI provider has to offer the journal: structured output and chat."""

from dataclasses import dataclass
from typing import Any, Protocol, TypeVar

from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)


class AIError(Exception):
    """A failure worth showing to the user as-is."""


@dataclass
class ModelInfo:
    id: str
    name: str
    free: bool | None = None  # None when the provider doesn't say
    context_length: int | None = None


class LLM(Protocol):
    provider: str
    model: str

    def generate(self, *, system: str, prompt: str, output: type[T]) -> T:
        """Return an instance of `output`, produced by the model from `system` + `prompt`."""
        ...

    def chat(self, *, system: str, memory: str, history: list[dict[str, Any]], message: str) -> str:
        """Continue a conversation. `memory` is long, stable context about the user."""
        ...

    def list_models(self) -> list[ModelInfo]: ...
