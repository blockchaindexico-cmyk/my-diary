from datetime import date, datetime, timezone
from typing import Annotated, Any, Literal

from pydantic import AfterValidator, BaseModel, EmailStr, Field


def _as_utc(value: datetime) -> datetime:
    # SQLite hands back naive datetimes; they're stored as UTC, so say so in the JSON.
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


UTCDateTime = Annotated[datetime, AfterValidator(_as_utc)]


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    name: str = Field(min_length=1, max_length=80)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    email: str
    name: str
    created_at: UTCDateTime


class AuthResponse(BaseModel):
    token: str
    user: UserOut


class TranscriptionOut(BaseModel):
    text: str


class EntryCreate(BaseModel):
    text: str = Field(min_length=1, max_length=50_000)
    entry_date: date
    source: Literal["voice", "text"] = "voice"
    duration_seconds: int | None = None


class EntryUpdate(BaseModel):
    text: str | None = Field(default=None, min_length=1, max_length=50_000)
    entry_date: date | None = None


class EntryOut(BaseModel):
    id: int
    entry_date: date
    created_at: UTCDateTime
    updated_at: UTCDateTime
    text: str
    source: str
    duration_seconds: int | None
    status: str
    error: str | None
    analysis: dict[str, Any] | None


class ProfileOut(BaseModel):
    status: str
    error: str | None
    data: dict[str, Any] | None
    entries_considered: int
    updated_at: UTCDateTime | None


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    # The user's local date, so "today"/"yesterday" mean what they expect
    today: date | None = None


class ChatMessageOut(BaseModel):
    id: int
    role: str
    content: str
    created_at: UTCDateTime


class ChatResponse(BaseModel):
    user_message: ChatMessageOut
    reply: ChatMessageOut
