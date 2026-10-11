"""Any OpenAI-compatible Chat Completions API: Gemini, OpenRouter, Groq, Ollama, OpenAI, LM Studio…"""

import json
import logging
import threading
from typing import Any

import openai
import pydantic

from .base import AIError, ModelInfo, T
from .json_tools import coerce, extract_json, schema_for_prompt, strip_reasoning

log = logging.getLogger(__name__)

JSON_INSTRUCTIONS = """

Respond with one JSON object that matches this JSON Schema. Fill in every field. \
Output only the JSON object: no explanation and no code fences.
<json_schema>
{schema}
</json_schema>"""

# Ways to ask for JSON, strongest first. Not every provider or model supports every one,
# so we step down on rejection and remember what worked for each model.
_MODES = ("json_schema", "json_object", "prompt")
_working_mode: dict[tuple[str, str], str] = {}
_lock = threading.Lock()

# Model IDs that can't chat (embeddings, image, audio…), hidden from the model picker
_NON_CHAT = ("embed", "tts", "whisper", "imagen", "veo", "dall-e", "moderation", "image-generation", "transcribe", "aqa", "lyria")


class _Unsupported(Exception):
    """The provider rejected the requested response_format."""


class OpenAICompatibleLLM:
    def __init__(
        self,
        *,
        provider: str,
        label: str,
        base_url: str,
        api_key: str,
        model: str,
        http_client: Any = None,
    ):
        self.provider = provider
        self.label = label
        self.base_url = base_url
        self.model = model
        self.last_mode = ""
        self.client = openai.OpenAI(
            api_key=api_key or "not-needed",  # local servers like Ollama ignore it
            base_url=base_url,
            timeout=180,
            max_retries=2,
            default_headers={"X-Title": "My Diary"},  # shows the app name in OpenRouter's dashboard
            http_client=http_client,
        )

    # ---- requests ---------------------------------------------------------------------------

    def _create(self, messages: list[dict[str, Any]], **kwargs: Any) -> str:
        try:
            response = self.client.chat.completions.create(model=self.model, messages=messages, **kwargs)
        except (openai.BadRequestError, openai.NotFoundError, openai.UnprocessableEntityError) as e:
            if "response_format" in kwargs:
                raise _Unsupported from e
            if isinstance(e, openai.NotFoundError):
                raise AIError(f"{self.label} has no model called “{self.model}”. Pick another in You → AI model.") from e
            raise AIError(f"{self.label} rejected the request: {_message(e)}") from e
        except (openai.AuthenticationError, openai.PermissionDeniedError) as e:
            raise AIError(f"{self.label} rejected the API key. Check it in You → AI model.") from e
        except openai.RateLimitError as e:
            raise AIError(
                f"{self.label}'s rate limit was reached. Free tiers allow only a few requests per minute and per day. "
                "Try again later, or switch model in You → AI model."
            ) from e
        except openai.APITimeoutError as e:
            raise AIError(f"{self.label} took too long to answer. Please try again.") from e
        except openai.APIConnectionError as e:
            raise AIError(f"Couldn't reach {self.label} at {self.base_url}.") from e
        except openai.APIStatusError as e:
            log.warning("%s error %s: %s", self.label, e.status_code, _message(e))
            raise AIError(f"{self.label} returned an error ({e.status_code}). Please try again.") from e

        choice = response.choices[0] if response.choices else None
        content = strip_reasoning(choice.message.content or "") if choice else ""
        if not content:
            reason = choice.finish_reason if choice else "no choices"
            raise AIError(f"{self.label} returned an empty response ({reason}). Try again or pick another model.")
        return content

    def _complete_json(self, messages: list[dict[str, Any]], name: str, schema: dict[str, Any]) -> str:
        key = (self.base_url, self.model)
        start = _MODES.index(_working_mode.get(key, _MODES[0]))
        for mode in _MODES[start:]:
            kwargs: dict[str, Any] = {}
            if mode == "json_schema":
                kwargs["response_format"] = {
                    "type": "json_schema",
                    "json_schema": {"name": name, "schema": schema, "strict": True},
                }
            elif mode == "json_object":
                kwargs["response_format"] = {"type": "json_object"}
            try:
                text = self._create(messages, **kwargs)
            except _Unsupported:
                log.info("%s / %s doesn't accept %s output; trying the next way", self.label, self.model, mode)
                continue
            with _lock:
                _working_mode[key] = mode
            self.last_mode = mode
            return text
        raise AIError(f"{self.label} couldn't produce structured output with “{self.model}”. Try another model.")

    # ---- LLM interface ----------------------------------------------------------------------

    def generate(self, *, system: str, prompt: str, output: type[T]) -> T:
        schema = schema_for_prompt(output)
        messages: list[dict[str, Any]] = [
            {"role": "system", "content": system + JSON_INSTRUCTIONS.format(schema=json.dumps(schema))},
            {"role": "user", "content": prompt},
        ]
        text = self._complete_json(messages, output.__name__, schema)
        try:
            data = extract_json(text)
        except ValueError:
            # One repair round: show the model its answer and ask again
            messages += [
                {"role": "assistant", "content": text},
                {"role": "user", "content": "That wasn't a valid JSON object. Reply with only the JSON object."},
            ]
            text = self._complete_json(messages, output.__name__, schema)
            try:
                data = extract_json(text)
            except ValueError as e:
                raise AIError(f"“{self.model}” didn't return usable JSON. Try a larger model.") from e
        try:
            return output.model_validate(coerce(output, data))
        except pydantic.ValidationError as e:
            raise AIError(f"“{self.model}” returned data in an unexpected shape. Try a larger model.") from e

    def chat(self, *, system: str, memory: str, history: list[dict[str, Any]], message: str) -> str:
        messages = [{"role": "system", "content": f"{system}\n\n{memory}"}, *history, {"role": "user", "content": message}]
        return self._create(messages)

    def list_models(self) -> list[ModelInfo]:
        try:
            models = list(self.client.models.list())
        except (openai.AuthenticationError, openai.PermissionDeniedError) as e:
            raise AIError(f"{self.label} rejected the API key.") from e
        except openai.APIConnectionError as e:
            raise AIError(f"Couldn't reach {self.label} at {self.base_url}.") from e
        except openai.OpenAIError as e:
            raise AIError(f"Couldn't list {self.label} models: {_message(e)}") from e

        out = []
        for m in models:
            model_id = m.id.removeprefix("models/")  # Gemini prefixes its IDs
            if any(word in model_id.lower() for word in _NON_CHAT):
                continue
            extra = m.model_extra or {}
            out.append(
                ModelInfo(
                    id=model_id,
                    name=extra.get("name") or extra.get("display_name") or model_id,
                    free=_is_free(self.provider, model_id, extra),
                    context_length=extra.get("context_length") or extra.get("context_window"),
                )
            )
        out.sort(key=lambda m: (not m.free, m.id))
        return out


def _is_free(provider: str, model_id: str, extra: dict[str, Any]) -> bool | None:
    if provider == "ollama":
        return True
    pricing = extra.get("pricing")
    if isinstance(pricing, dict) and "prompt" in pricing:
        try:
            return float(pricing["prompt"]) == 0 and float(pricing.get("completion", 0)) == 0
        except (TypeError, ValueError):
            return None
    if model_id.endswith(":free"):
        return True
    return None


def _message(e: openai.OpenAIError) -> str:
    body = getattr(e, "body", None)
    if isinstance(body, dict):
        err = body.get("error", body)
        if isinstance(err, dict) and err.get("message"):
            return str(err["message"])[:300]
    return str(e)[:300]
