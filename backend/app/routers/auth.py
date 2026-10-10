from fastapi import APIRouter, HTTPException, status
from sqlmodel import delete, select

from ..auth import CurrentUser, DbSession, create_token, hash_password, verify_password
from ..config import get_settings
from ..models import ChatMessage, Entry, Insight, Profile, User
from ..schemas import AuthResponse, LoginRequest, RegisterRequest, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, session: DbSession):
    if not get_settings().allow_signups:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Sign-ups are closed on this server.")
    email = body.email.lower()
    if session.exec(select(User).where(User.email == email)).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists.")
    user = User(email=email, name=body.name.strip(), password_hash=hash_password(body.password))
    session.add(user)
    session.commit()
    session.refresh(user)
    return AuthResponse(token=create_token(user.id), user=UserOut.model_validate(user, from_attributes=True))


@router.post("/login", response_model=AuthResponse)
def login(body: LoginRequest, session: DbSession):
    user = session.exec(select(User).where(User.email == body.email.lower())).first()
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong email or password.")
    return AuthResponse(token=create_token(user.id), user=UserOut.model_validate(user, from_attributes=True))


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return user


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(user: CurrentUser, session: DbSession):
    """Permanently delete the account and every entry, message and insight that belongs to it."""
    for model in (Entry, ChatMessage, Insight, Profile):
        session.exec(delete(model).where(model.user_id == user.id))
    session.delete(user)
    session.commit()
