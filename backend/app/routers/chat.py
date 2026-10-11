from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import col, delete, select

from ..auth import CurrentUser, DbSession
from ..config import get_settings
from ..models import ChatMessage, Entry, Profile
from ..schemas import ChatMessageOut, ChatRequest, ChatResponse
from ..services.ai import AIError, JournalAI, get_ai
from ..services.memory import build_digest, full_entry_block, render_profile, retrieve_relevant

router = APIRouter(prefix="/chat", tags=["chat"])

RECENT_FULL_ENTRIES = 3


@router.get("/messages", response_model=list[ChatMessageOut])
def list_messages(
    user: CurrentUser,
    session: DbSession,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
    before_id: int | None = None,
):
    """Messages oldest-first; pass `before_id` to page further back."""
    query = select(ChatMessage).where(ChatMessage.user_id == user.id)
    if before_id is not None:
        query = query.where(ChatMessage.id < before_id)
    rows = session.exec(query.order_by(col(ChatMessage.id).desc()).limit(limit)).all()
    return list(reversed(rows))


@router.delete("/messages", status_code=status.HTTP_204_NO_CONTENT)
def clear_messages(user: CurrentUser, session: DbSession):
    session.exec(delete(ChatMessage).where(ChatMessage.user_id == user.id))
    session.commit()


@router.post("", response_model=ChatResponse)
def send_message(
    body: ChatRequest,
    user: CurrentUser,
    session: DbSession,
    ai: Annotated[JournalAI, Depends(get_ai)],
):
    settings = get_settings()
    today = body.today or date.today()

    entries = session.exec(select(Entry).where(Entry.user_id == user.id)).all()
    by_recency = sorted(entries, key=lambda e: (e.entry_date, e.created_at), reverse=True)
    recent_full = by_recency[:RECENT_FULL_ENTRIES]
    window_start = today - timedelta(days=settings.chat_memory_days)
    digest_entries = [e for e in entries if e.entry_date >= window_start]
    profile = session.get(Profile, user.id)

    memory = (
        f"Today is {today.strftime('%A, %d %B %Y')}. The user's name is {user.name}. "
        f"They have {len(entries)} journal entries in total.\n\n"
        f"<life_profile>\n{render_profile(profile.data if profile else None)}\n</life_profile>\n\n"
        f"<journal_digest>\nOne line per entry from the last {settings.chat_memory_days} days, oldest first. "
        f"Scores are 1-10.\n{build_digest(digest_entries)}\n</journal_digest>\n\n"
        "<most_recent_entries>\n"
        + ("\n\n".join(full_entry_block(e) for e in reversed(recent_full)) or "(none yet)")
        + "\n</most_recent_entries>"
    )
    related = retrieve_relevant(entries, body.message, exclude_ids={e.id for e in recent_full})
    retrieved = "\n\n".join(full_entry_block(e) for e in related) or None

    previous = session.exec(
        select(ChatMessage)
        .where(ChatMessage.user_id == user.id)
        .order_by(col(ChatMessage.id).desc())
        .limit(settings.chat_history_messages)
    ).all()
    history = [{"role": m.role, "content": m.content} for m in reversed(previous)]
    while history and history[0]["role"] != "user":  # the API expects the first turn to be the user's
        history.pop(0)

    try:
        reply_text = ai.chat(memory=memory, history=history, message=body.message, retrieved=retrieved)
    except AIError as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(e))

    user_message = ChatMessage(user_id=user.id, role="user", content=body.message)
    session.add(user_message)
    session.commit()
    reply = ChatMessage(user_id=user.id, role="assistant", content=reply_text)
    session.add(reply)
    session.commit()
    session.refresh(user_message)
    session.refresh(reply)
    return ChatResponse(
        user_message=ChatMessageOut.model_validate(user_message, from_attributes=True),
        reply=ChatMessageOut.model_validate(reply, from_attributes=True),
    )
