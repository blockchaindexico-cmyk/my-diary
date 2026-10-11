import hashlib
from datetime import date, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import select

from ..auth import CurrentUser, DbSession
from ..models import Entry, Insight
from ..services import analytics
from ..services.ai import AIError, JournalAI, get_ai
from ..services.memory import build_digest

router = APIRouter(prefix="/analytics", tags=["analytics"])

Days = Annotated[int, Query(ge=1, le=366)]


def _load(session, user_id: int, days: int, end: date | None):
    end = end or date.today()
    start = end - timedelta(days=days - 1)
    prev_start = start - timedelta(days=days)
    rows = session.exec(
        select(Entry).where(Entry.user_id == user_id, Entry.entry_date >= prev_start, Entry.entry_date <= end)
    ).all()
    current = [e for e in rows if e.entry_date >= start]
    previous = [e for e in rows if e.entry_date < start]
    all_dates = set(session.exec(select(Entry.entry_date).where(Entry.user_id == user_id)).all())
    return start, end, current, previous, all_dates


@router.get("/overview")
def overview(user: CurrentUser, session: DbSession, days: Days = 7, end: date | None = None) -> dict[str, Any]:
    """Mood, energy, efficiency, stress and more for the `days` ending on `end` (the user's today)."""
    start, end, current, previous, all_dates = _load(session, user.id, days, end)
    return analytics.overview(current, previous, start, end, all_dates)


@router.get("/insight")
def insight(
    user: CurrentUser,
    session: DbSession,
    ai: Annotated[JournalAI, Depends(get_ai)],
    days: Days = 7,
    end: date | None = None,
) -> dict[str, Any]:
    """An AI-written reflection on the period. Cached until the period's entries change."""
    start, end, current, previous, all_dates = _load(session, user.id, days, end)
    analyzed = [e for e in current if e.status == "ready" and e.analysis]
    if not analyzed:
        return {"status": "empty", "insight": None}

    fingerprint = hashlib.sha256(
        "|".join(f"{e.id}:{e.analyzed_at}" for e in sorted(analyzed, key=lambda e: e.id)).encode()
    ).hexdigest()
    cached = session.exec(
        select(Insight).where(
            Insight.user_id == user.id,
            Insight.period_start == start,
            Insight.period_end == end,
            Insight.fingerprint == fingerprint,
        )
    ).first()
    if cached:
        return {"status": "ready", "insight": cached.data, "created_at": cached.created_at.isoformat()}

    stats = analytics.overview(current, previous, start, end, all_dates)
    try:
        result = ai.period_insight(
            user_name=user.name,
            period=f"{start.strftime('%a %d %b')} – {end.strftime('%a %d %b %Y')} ({days} days)",
            stats=analytics.stats_for_prompt(stats),
            digest=build_digest(analyzed),
        )
    except AIError as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(e))

    # Keep one cached insight per period
    for old in session.exec(
        select(Insight).where(Insight.user_id == user.id, Insight.period_start == start, Insight.period_end == end)
    ).all():
        session.delete(old)
    row = Insight(user_id=user.id, period_start=start, period_end=end, fingerprint=fingerprint, data=result.model_dump())
    session.add(row)
    session.commit()
    session.refresh(row)
    return {"status": "ready", "insight": row.data, "created_at": row.created_at.isoformat()}
