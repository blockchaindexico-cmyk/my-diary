"""Background jobs: analyze an entry, then fold it into the user's life profile.

Each job reads what it needs, closes its DB session, calls the AI, then writes in a fresh
session, so no database transaction stays open during a slow AI call.
"""

import logging
import threading
from collections import defaultdict
from datetime import date, timedelta

from sqlmodel import Session, col, select

from ..db import engine
from ..models import Entry, Profile, User, utcnow
from .ai import AIError, JournalAI
from .memory import build_digest, full_entry_block, known_labels, render_profile

log = logging.getLogger(__name__)

PROFILE_WINDOW_DAYS = 120

_profile_locks: defaultdict[int, threading.Lock] = defaultdict(threading.Lock)
_profile_pending: set[int] = set()


def analyze_entry_job(entry_id: int, ai: JournalAI, update_profile: bool = True) -> None:
    with Session(engine) as session:
        entry = session.get(Entry, entry_id)
        if entry is None:
            return
        user = session.get(User, entry.user_id)
        assert user is not None
        others = session.exec(
            select(Entry).where(Entry.user_id == user.id, Entry.id != entry.id, Entry.status == "ready")
        ).all()
        known_triggers, known_activities = known_labels(others)
        profile = session.get(Profile, user.id)
        profile_context = "(nothing yet)"
        if profile and profile.data:
            profile_context = f"{profile.data.get('headline', '')} {profile.data.get('current_chapter', '')}".strip()
        text, entry_date, user_id, user_name = entry.text, entry.entry_date, user.id, user.name

    try:
        analysis = ai.analyze_entry(
            text=text,
            entry_date=entry_date,
            user_name=user_name,
            known_triggers=known_triggers,
            known_activities=known_activities,
            profile_context=profile_context,
        )
        result, error = analysis.model_dump(), None
    except AIError as e:
        result, error = None, str(e)
    except Exception:
        log.exception("Unexpected error analyzing entry %s", entry_id)
        result, error = None, "Something went wrong while analyzing this entry."

    with Session(engine) as session:
        entry = session.get(Entry, entry_id)
        # Deleted, or edited while we were analyzing (the edit queued its own analysis)
        if entry is None or entry.text != text:
            return
        if result is not None:
            entry.analysis, entry.status, entry.error, entry.analyzed_at = result, "ready", None, utcnow()
        else:
            entry.status, entry.error = "failed", error
        session.add(entry)
        session.commit()

    if result is not None and update_profile:
        refresh_profile_job(user_id, ai)


def refresh_profile_job(user_id: int, ai: JournalAI) -> None:
    """Rebuild the profile; if more entries land while it runs, rebuild once more afterwards."""
    lock = _profile_locks[user_id]
    if not lock.acquire(blocking=False):
        _profile_pending.add(user_id)
        return
    try:
        while True:
            _profile_pending.discard(user_id)
            _rebuild_profile(user_id, ai)
            if user_id not in _profile_pending:
                break
    finally:
        lock.release()


def _rebuild_profile(user_id: int, ai: JournalAI) -> None:
    today = date.today()
    with Session(engine) as session:
        user = session.get(User, user_id)
        if user is None:
            return
        ready = select(Entry).where(Entry.user_id == user_id, Entry.status == "ready")
        recent = session.exec(
            ready.where(Entry.entry_date >= today - timedelta(days=PROFILE_WINDOW_DAYS))
        ).all()
        if not recent:  # nothing recent; fall back to whatever exists
            recent = session.exec(ready).all()
        total = len(session.exec(ready).all())
        latest = session.exec(ready.order_by(col(Entry.created_at).desc()).limit(3)).all()

        profile = session.get(Profile, user_id) or Profile(user_id=user_id)
        if not recent:
            profile.data, profile.status, profile.entries_considered = None, "ready", 0
            session.add(profile)
            session.commit()
            return
        previous = render_profile(profile.data)
        profile.status, profile.error = "updating", None
        session.add(profile)
        session.commit()
        user_name = user.name
        digest = build_digest(recent)
        latest_text = "\n\n".join(full_entry_block(e) for e in reversed(latest))

    try:
        new_profile = ai.build_profile(
            user_name=user_name, today=today, previous_profile=previous, digest=digest, latest_entries=latest_text
        )
        data, error = new_profile.model_dump(), None
    except AIError as e:
        data, error = None, str(e)
    except Exception:
        log.exception("Unexpected error rebuilding profile for user %s", user_id)
        data, error = None, "Something went wrong while updating your profile."

    with Session(engine) as session:
        profile = session.get(Profile, user_id)
        if profile is None:
            return
        if data is not None:
            profile.data, profile.status, profile.error = data, "ready", None
            profile.entries_considered, profile.updated_at = total, utcnow()
        else:
            profile.status, profile.error = "failed", error
        session.add(profile)
        session.commit()
