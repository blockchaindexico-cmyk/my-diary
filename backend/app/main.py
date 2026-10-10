import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .db import init_db
from .routers import analytics, auth, chat, entries, profile

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


settings = get_settings()
app = FastAPI(title="My Diary API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

for router in (auth.router, entries.router, analytics.router, profile.router, chat.router):
    app.include_router(router)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "model": settings.claude_model,
        "transcription_provider": settings.transcription_provider,
    }
