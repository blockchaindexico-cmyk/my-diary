from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends

from ..auth import CurrentUser, DbSession
from ..models import Profile
from ..schemas import ProfileOut
from ..services.ai import JournalAI, get_ai
from ..services.pipeline import refresh_profile_job

router = APIRouter(prefix="/profile", tags=["profile"])


def _out(profile: Profile | None) -> ProfileOut:
    if profile is None:
        return ProfileOut(status="empty", error=None, data=None, entries_considered=0, updated_at=None)
    return ProfileOut.model_validate(profile, from_attributes=True)


@router.get("", response_model=ProfileOut)
def get_profile(user: CurrentUser, session: DbSession):
    return _out(session.get(Profile, user.id))


@router.post("/refresh", response_model=ProfileOut)
def refresh_profile(
    user: CurrentUser,
    session: DbSession,
    ai: Annotated[JournalAI, Depends(get_ai)],
    background: BackgroundTasks,
):
    profile = session.get(Profile, user.id) or Profile(user_id=user.id)
    profile.status, profile.error = "updating", None
    session.add(profile)
    session.commit()
    session.refresh(profile)
    background.add_task(refresh_profile_job, user.id, ai)
    return _out(profile)
