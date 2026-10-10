from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy import JSON, Column, Text
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    name: str
    password_hash: str
    created_at: datetime = Field(default_factory=utcnow)


class Entry(SQLModel, table=True):
    """One journal entry: something the user said (or typed) about a specific day."""

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    # The day this entry is about (chosen by the user; not necessarily the day it was recorded)
    entry_date: date = Field(index=True)
    # When it was recorded
    created_at: datetime = Field(default_factory=utcnow, index=True)
    updated_at: datetime = Field(default_factory=utcnow)
    text: str = Field(sa_column=Column(Text, nullable=False))
    source: str = "voice"  # "voice" | "text"
    duration_seconds: int | None = None
    status: str = "processing"  # "processing" | "ready" | "failed"
    error: str | None = None
    # EntryAnalysis produced by Claude (see services/ai.py)
    analysis: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))
    analyzed_at: datetime | None = None


class Profile(SQLModel, table=True):
    """The evolving picture of the user's life, rebuilt from their entries."""

    user_id: int = Field(foreign_key="user.id", primary_key=True)
    data: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))
    status: str = "ready"  # "ready" | "updating" | "failed"
    error: str | None = None
    entries_considered: int = 0
    updated_at: datetime = Field(default_factory=utcnow)


class ChatMessage(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    role: str  # "user" | "assistant"
    content: str = Field(sa_column=Column(Text, nullable=False))
    created_at: datetime = Field(default_factory=utcnow)


class Insight(SQLModel, table=True):
    """Cached AI narrative for an analytics period, invalidated when its entries change."""

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    period_start: date
    period_end: date
    fingerprint: str
    data: dict[str, Any] = Field(sa_column=Column(JSON, nullable=False))
    created_at: datetime = Field(default_factory=utcnow)
