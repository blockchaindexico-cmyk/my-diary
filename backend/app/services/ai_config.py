"""Works out which AI provider, model and key to use: app settings first, then .env."""

from dataclasses import dataclass
from typing import Any

from sqlmodel import Session, func, select

from ..config import get_settings
from ..models import AIConfig, User
from .llm.anthropic_llm import AnthropicLLM
from .llm.base import LLM, AIError, ModelInfo, T
from .llm.openai_llm import OpenAICompatibleLLM
from .llm.providers import PROVIDERS, TRANSCRIPTION_PROVIDERS, Provider


@dataclass
class ResolvedAI:
    provider: Provider
    model: str
    base_url: str
    api_key: str
    key_source: str | None  # "app" | "env" | None
    transcription_provider: str


def get_row(session: Session) -> AIConfig | None:
    return session.get(AIConfig, 1)


def env_key(provider: Provider) -> str:
    if not provider.key_env:
        return ""
    return getattr(get_settings(), provider.key_env.lower(), "") or ""


def resolve_key(provider: Provider, row: AIConfig | None) -> tuple[str, str | None]:
    if row and row.api_keys.get(provider.id):
        return row.api_keys[provider.id], "app"
    if key := env_key(provider):
        return key, "env"
    return "", None


def resolve(session: Session, provider_id: str | None = None) -> ResolvedAI:
    settings = get_settings()
    row = get_row(session)
    chosen = provider_id or (row.provider if row and row.provider else settings.ai_provider)
    provider = PROVIDERS.get(chosen) or PROVIDERS["gemini"]
    from_env = provider.id == settings.ai_provider

    model = (row.models.get(provider.id) if row else None) or (settings.ai_model if from_env else "") or provider.default_model
    base_url = (
        (row.base_urls.get(provider.id) if row else None)
        or (settings.ai_base_url if from_env else "")
        or provider.base_url
    )
    api_key, source = resolve_key(provider, row)
    transcription = (row.transcription_provider if row else None) or settings.transcription_provider
    return ResolvedAI(provider, model.strip(), base_url.strip(), api_key, source, transcription)


class _NotReady:
    """Stands in for a provider that isn't set up yet, so the problem shows where it's used."""

    def __init__(self, provider: str, model: str, reason: str):
        self.provider, self.model, self.reason = provider, model, reason
        self.last_mode = ""

    def generate(self, *, system: str, prompt: str, output: type[T]) -> T:
        raise AIError(self.reason)

    def chat(self, *, system: str, memory: str, history: list[dict[str, Any]], message: str) -> str:
        raise AIError(self.reason)

    def list_models(self) -> list[ModelInfo]:
        raise AIError(self.reason)


def build_llm(ai: ResolvedAI, *, for_listing: bool = False) -> LLM:
    p = ai.provider
    if p.needs_key and not ai.api_key:
        return _NotReady(p.id, ai.model, f"Add your {p.label} API key in You → AI model.")
    if p.kind == "openai" and not ai.base_url:
        return _NotReady(p.id, ai.model, f"Set the server address for {p.label} in You → AI model.")
    if not ai.model and not for_listing:
        return _NotReady(p.id, ai.model, f"Choose a {p.label} model in You → AI model.")
    if p.kind == "anthropic":
        return AnthropicLLM(api_key=ai.api_key, model=ai.model, effort=get_settings().claude_effort)
    return OpenAICompatibleLLM(provider=p.id, label=p.label, base_url=ai.base_url, api_key=ai.api_key, model=ai.model)


def is_owner(session: Session, user: User) -> bool:
    """The first account on the server manages its AI settings."""
    return user.id == session.exec(select(func.min(User.id))).one()


def mask(key: str) -> str | None:
    return f"••••{key[-4:]}" if key else None


def describe(session: Session) -> dict[str, Any]:
    ai = resolve(session)
    llm = build_llm(ai)
    row = get_row(session)
    providers = []
    for p in PROVIDERS.values():
        key, source = resolve_key(p, row)
        r = resolve(session, p.id)
        providers.append(
            {
                "id": p.id,
                "label": p.label,
                "pricing": p.pricing,
                "note": p.note,
                "needs_key": p.needs_key,
                "key_url": p.key_url,
                "key_hint": mask(key),
                "key_source": source,
                "model": r.model,
                "default_model": p.default_model,
                "base_url": r.base_url,
                "default_base_url": p.base_url,
                "editable_base_url": p.id in ("ollama", "custom"),
            }
        )
    return {
        "provider": ai.provider.id,
        "model": ai.model,
        "ready": not isinstance(llm, _NotReady),
        "problem": llm.reason if isinstance(llm, _NotReady) else None,
        "providers": providers,
        "transcription_provider": ai.transcription_provider,
        "transcription_options": [{"id": k, "label": v} for k, v in TRANSCRIPTION_PROVIDERS.items()],
    }
