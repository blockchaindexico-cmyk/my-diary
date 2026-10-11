import logging
from typing import Any

import anthropic
import pydantic

from .base import AIError, ModelInfo, T

log = logging.getLogger(__name__)

# Server-side fallback: if a safety classifier declines a request (e.g. a false positive on a
# heavy mental-health entry), the API retries it on Anthropic's recommended fallback model.
FALLBACK_BETA = "server-side-fallback-2026-07-01"
_FALLBACK_MODELS = ("claude-opus-5", "claude-sonnet-5-5", "claude-fable-5")
_EFFORT_MODELS = (
    "claude-opus-5", "claude-sonnet-5", "claude-fable-5", "claude-haiku-5",
    "claude-opus-4-8", "claude-opus-4-7", "claude-opus-4-6", "claude-sonnet-4-6",
)


class AnthropicLLM:
    provider = "anthropic"

    def __init__(self, api_key: str, model: str, effort: str = "medium", client: anthropic.Anthropic | None = None):
        self._api_key = api_key
        self.model = model
        self.effort = effort
        self._client = client
        self.last_mode = "structured"

    @property
    def client(self) -> anthropic.Anthropic:
        if self._client is None:
            self._client = anthropic.Anthropic(api_key=self._api_key or None)
        return self._client

    def _options(self) -> dict[str, Any]:
        options: dict[str, Any] = {}
        if self.model.startswith(_EFFORT_MODELS):
            options["output_config"] = {"effort": self.effort}
        if self.model.startswith(_FALLBACK_MODELS):
            options["betas"] = [FALLBACK_BETA]
            options["fallbacks"] = "default"
        return options

    def _call(self, method: str, **kwargs):
        try:
            fn = getattr(self.client.beta.messages, method)
            response = fn(model=self.model, max_tokens=16000, **self._options(), **kwargs)
        except anthropic.AuthenticationError as e:
            raise AIError("Anthropic rejected the API key. Check it in You → AI model.") from e
        except anthropic.NotFoundError as e:
            raise AIError(f"Anthropic has no model called “{self.model}”. Pick another in You → AI model.") from e
        except anthropic.RateLimitError as e:
            raise AIError("The AI is busy right now. Please try again in a minute.") from e
        except anthropic.APIStatusError as e:
            log.warning("Claude API error %s: %s", e.status_code, e.message)
            raise AIError("The AI service returned an error. Please try again.") from e
        except anthropic.APIConnectionError as e:
            raise AIError("Couldn't reach Anthropic. Check the server's internet connection.") from e
        except anthropic.AnthropicError as e:
            raise AIError(f"Anthropic isn't configured correctly: {e}") from e
        except TypeError as e:
            # The SDK raises this at request time when no API key or other credentials exist
            if "authentication method" not in str(e):
                raise
            raise AIError("Add your Anthropic API key in You → AI model.") from e

        if response.stop_reason == "refusal":
            raise AIError("The AI declined to respond to this. Try rephrasing it.")
        if response.stop_reason == "max_tokens":
            raise AIError("The AI response was cut off. Please try again.")
        return response

    def generate(self, *, system: str, prompt: str, output: type[T]) -> T:
        try:
            response = self._call(
                "parse", output_format=output, system=system, messages=[{"role": "user", "content": prompt}]
            )
        except pydantic.ValidationError as e:
            raise AIError("The AI returned an unexpected format. Please try again.") from e
        if response.parsed_output is None:
            raise AIError("The AI returned an empty response. Please try again.")
        return response.parsed_output

    def chat(self, *, system: str, memory: str, history: list[dict[str, Any]], message: str) -> str:
        response = self._call(
            "create",
            system=[
                {"type": "text", "text": system},
                # The memory block is stable within a conversation, so cache it.
                {"type": "text", "text": memory, "cache_control": {"type": "ephemeral"}},
            ],
            messages=[*history, {"role": "user", "content": message}],
        )
        reply = "".join(block.text for block in response.content if block.type == "text").strip()
        if not reply:
            raise AIError("The AI returned an empty reply. Please try again.")
        return reply

    def list_models(self) -> list[ModelInfo]:
        try:
            return [ModelInfo(id=m.id, name=m.display_name) for m in self.client.models.list(limit=100)]
        except anthropic.AuthenticationError as e:
            raise AIError("Anthropic rejected the API key.") from e
        except (anthropic.AnthropicError, TypeError) as e:
            raise AIError(f"Couldn't list Anthropic models: {e}") from e
