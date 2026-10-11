import os
import tempfile
from datetime import date
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, UploadFile, status
from sqlmodel import col, select

from ..auth import CurrentUser, DbSession
from ..models import Entry, utcnow
from ..schemas import EntryCreate, EntryOut, EntryUpdate, TranscriptionOut
from ..services.ai import JournalAI, get_ai
from ..services.pipeline import analyze_entry_job, refresh_profile_job
from ..services.transcription import Transcriber, TranscriptionError, get_transcriber

router = APIRouter(tags=["entries"])

AI = Annotated[JournalAI, Depends(get_ai)]
MAX_AUDIO_BYTES = 50 * 1024 * 1024


@router.post("/transcribe", response_model=TranscriptionOut)
def transcribe(
    user: CurrentUser,
    audio: UploadFile,
    transcriber: Annotated[Transcriber, Depends(get_transcriber)],
):
    """Turn a voice recording into text. The audio is deleted as soon as it's transcribed."""
    suffix = os.path.splitext(audio.filename or "")[1] or ".m4a"
    fd, path = tempfile.mkstemp(suffix=suffix)
    try:
        size = 0
        with os.fdopen(fd, "wb") as out:
            while chunk := audio.file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_AUDIO_BYTES:
                    raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Recording is too long.")
                out.write(chunk)
        try:
            text = transcriber.transcribe(path, audio.filename or f"recording{suffix}")
        except TranscriptionError as e:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(e))
    finally:
        os.remove(path)
    if not text:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Couldn't hear any speech in that recording.")
    return TranscriptionOut(text=text)


def _get_owned(session, user, entry_id: int) -> Entry:
    entry = session.get(Entry, entry_id)
    if entry is None or entry.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entry not found.")
    return entry


@router.post("/entries", response_model=EntryOut, status_code=status.HTTP_201_CREATED)
def create_entry(body: EntryCreate, user: CurrentUser, session: DbSession, ai: AI, background: BackgroundTasks):
    entry = Entry(
        user_id=user.id,
        text=body.text.strip(),
        entry_date=body.entry_date,
        source=body.source,
        duration_seconds=body.duration_seconds,
    )
    session.add(entry)
    session.commit()
    session.refresh(entry)
    background.add_task(analyze_entry_job, entry.id, ai)
    return entry


@router.get("/entries", response_model=list[EntryOut])
def list_entries(
    user: CurrentUser,
    session: DbSession,
    start: date | None = None,
    end: date | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    query = select(Entry).where(Entry.user_id == user.id)
    if start:
        query = query.where(Entry.entry_date >= start)
    if end:
        query = query.where(Entry.entry_date <= end)
    query = query.order_by(col(Entry.entry_date).desc(), col(Entry.created_at).desc()).offset(offset).limit(limit)
    return session.exec(query).all()


@router.get("/entries/{entry_id}", response_model=EntryOut)
def get_entry(entry_id: int, user: CurrentUser, session: DbSession):
    return _get_owned(session, user, entry_id)


@router.patch("/entries/{entry_id}", response_model=EntryOut)
def update_entry(
    entry_id: int, body: EntryUpdate, user: CurrentUser, session: DbSession, ai: AI, background: BackgroundTasks
):
    entry = _get_owned(session, user, entry_id)
    text_changed = body.text is not None and body.text.strip() != entry.text
    if body.entry_date is not None:
        entry.entry_date = body.entry_date
    if text_changed:
        entry.text = body.text.strip()
        entry.status, entry.error = "processing", None
    entry.updated_at = utcnow()
    session.add(entry)
    session.commit()
    session.refresh(entry)
    if text_changed:
        background.add_task(analyze_entry_job, entry.id, ai)
    return entry


@router.post("/entries/{entry_id}/reanalyze", response_model=EntryOut)
def reanalyze_entry(entry_id: int, user: CurrentUser, session: DbSession, ai: AI, background: BackgroundTasks):
    entry = _get_owned(session, user, entry_id)
    entry.status, entry.error = "processing", None
    session.add(entry)
    session.commit()
    session.refresh(entry)
    background.add_task(analyze_entry_job, entry.id, ai)
    return entry


@router.delete("/entries/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_entry(entry_id: int, user: CurrentUser, session: DbSession, ai: AI, background: BackgroundTasks):
    entry = _get_owned(session, user, entry_id)
    was_analyzed = entry.status == "ready"
    session.delete(entry)
    session.commit()
    if was_analyzed:
        background.add_task(refresh_profile_job, user.id, ai)
