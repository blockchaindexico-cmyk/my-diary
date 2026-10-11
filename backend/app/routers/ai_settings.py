import time
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from ..auth import CurrentUser, DbSession
from ..models import AIConfig, utcnow
from ..services.ai import AIError, JournalAI, get_ai
from ..services.ai_config import ResolvedAI, build_llm, describe, get_row, is_owner, resolve
from ..services.llm.providers import PROVIDERS, TRANSCRIPTION_PROVIDERS

router = APIRouter(prefix="/ai", tags=["ai settings"])


class AISettingsUpdate(BaseModel):
    provider: str | None = None
    model: str | None = Field(default=None, max_length=200)
    # For the provider being saved. "" removes a key saved in the app (falls back to .env).
    api_key: str | None = Field(default=None, max_length=500)
    base_url: str | None = Field(default=None, max_length=500)
    transcription_provider: str | None = None


class ModelsRequest(BaseModel):
    provider: str
    # Let the app list models for a key or address it hasn't saved yet
    api_key: str | None = Field(default=None, max_length=500)
    base_url: str | None = Field(default=None, max_length=500)


def _require_owner(session, user) -> None:
    if not is_owner(session, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the server owner (the first account) can change AI settings.")


@router.get("/settings")
def get_settings_(user: CurrentUser, session: DbSession) -> dict[str, Any]:
    return {**describe(session), "can_edit": is_owner(session, user)}


@router.put("/settings")
def update_settings(body: AISettingsUpdate, user: CurrentUser, session: DbSession) -> dict[str, Any]:
    _require_owner(session, user)
    row = get_row(session) or AIConfig(id=1)
    target = body.provider or row.provider or resolve(session).provider.id
    if target not in PROVIDERS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Unknown provider “{target}”.")
    if body.transcription_provider is not None and body.transcription_provider not in TRANSCRIPTION_PROVIDERS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Unknown speech-to-text option.")

    # Assign new dicts so SQLAlchemy notices the change to the JSON columns
    if body.provider is not None:
        row.provider = body.provider
    if body.model is not None:
        row.models = {**row.models, target: body.model.strip()}
    if body.api_key is not None:
        keys = {**row.api_keys, target: body.api_key.strip()}
        row.api_keys = {k: v for k, v in keys.items() if v}
    if body.base_url is not None:
        urls = {**row.base_urls, target: body.base_url.strip().rstrip("/")}
        row.base_urls = {k: v for k, v in urls.items() if v}
    if body.transcription_provider is not None:
        row.transcription_provider = body.transcription_provider
    row.updated_at = utcnow()
    session.add(row)
    session.commit()
    return {**describe(session), "can_edit": True}


@router.post("/models")
def list_models(body: ModelsRequest, user: CurrentUser, session: DbSession) -> dict[str, Any]:
    _require_owner(session, user)
    if body.provider not in PROVIDERS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Unknown provider “{body.provider}”.")
    ai = resolve(session, body.provider)
    draft = ResolvedAI(
        provider=ai.provider,
        model=ai.model,
        base_url=(body.base_url or ai.base_url).strip(),
        api_key=(body.api_key or ai.api_key).strip(),
        key_source=ai.key_source,
        transcription_provider=ai.transcription_provider,
    )
    try:
        models = build_llm(draft, for_listing=True).list_models()
    except AIError as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(e))
    return {"models": [m.__dict__ for m in models]}


@router.post("/test")
def test_connection(user: CurrentUser, session: DbSession, ai: Annotated[JournalAI, Depends(get_ai)]) -> dict[str, Any]:
    """Make one small structured request with the saved settings."""
    resolved = resolve(session)
    started = time.monotonic()
    try:
        ping = ai.ping()
    except AIError as e:
        return {"ok": False, "provider": resolved.provider.label, "model": resolved.model, "error": str(e)}
    return {
        "ok": True,
        "provider": resolved.provider.label,
        "model": resolved.model,
        "seconds": round(time.monotonic() - started, 1),
        "json_mode": getattr(ai.llm, "last_mode", ""),
        "reply": ping.greeting,
    }
