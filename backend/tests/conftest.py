import os
import tempfile
from datetime import date

_tmpdir = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{_tmpdir}/test.db"
os.environ["JWT_SECRET"] = "test-secret-that-is-at-least-32-bytes-long"
os.environ["ANTHROPIC_API_KEY"] = ""

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import SQLModel  # noqa: E402

from app.db import engine  # noqa: E402
from app.main import app  # noqa: E402
from app.services.ai import AIError, JournalAI, get_ai  # noqa: E402
from app.services.ai_schemas import (  # noqa: E402
    Emotion,
    EntryAnalysis,
    LifeArea,
    LifeProfile,
    PeriodInsight,
    Scores,
    Trigger,
)
from app.services.transcription import get_transcriber  # noqa: E402


class FakeAI(JournalAI):
    """Deterministic stand-in for Claude: 'great' days score high, everything else low."""

    def __init__(self):
        super().__init__(api_key="", model="fake")
        self.calls: dict[str, list[dict]] = {"analyze": [], "profile": [], "insight": [], "chat": []}
        self.fail_analysis = False

    def analyze_entry(self, **kwargs):
        self.calls["analyze"].append(kwargs)
        if self.fail_analysis:
            raise AIError("AI is down")
        good = "great" in kwargs["text"].lower()
        return EntryAnalysis(
            title="A great day" if good else "A hard day",
            summary="You had a day.",
            mood_label="Happy" if good else "Low",
            scores=Scores(
                mood=8 if good else 3,
                energy=7 if good else 4,
                productivity=8 if good else 4,
                stress=3 if good else 8,
                anxiety=2 if good else 7,
                social_connection=7 if good else 3,
                sleep_quality=None,
                sleep_hours=None,
            ),
            emotions=[Emotion(name="joy" if good else "worry", intensity=7)],
            triggers=[
                Trigger(
                    label="Morning run" if good else "Deadline pressure",
                    effect="positive" if good else "negative",
                    category="health" if good else "work",
                    detail="It mattered.",
                )
            ],
            activities=["running"] if good else ["deep work"],
            people=["Sam"],
            wins=[],
            challenges=[],
            gratitude=[],
            themes=["work"],
            reflection="Nice.",
            suggestion="Rest.",
            wellbeing_flag="none" if good else "watch",
            wellbeing_note="" if good else "Several low days in a row.",
        )

    def build_profile(self, **kwargs):
        self.calls["profile"].append(kwargs)
        return LifeProfile(
            headline="A busy person finding balance",
            summary="Summary.",
            current_chapter="Work is intense.",
            life_areas=[LifeArea(area="Work & career", status="mixed", note="Deadlines.")],
            patterns=["Runs lift your mood"],
            whats_working=["Running"],
            whats_not_working=["Late nights"],
            positive_triggers=["Morning run"],
            negative_triggers=["Deadline pressure"],
            people=[],
            goals=["Ship the project"],
            habits=["Running"],
            focus_suggestions=["Protect sleep"],
        )

    def period_insight(self, **kwargs):
        self.calls["insight"].append(kwargs)
        return PeriodInsight(
            headline="A mixed week", narrative="It went.", highlights=["Run"], watch_outs=[], suggestions=["Sleep"]
        )

    def chat(self, **kwargs):
        self.calls["chat"].append(kwargs)
        return f"Echo: {kwargs['message']}"


class FakeTranscriber:
    def __init__(self):
        self.text = "Today was a great day"

    def transcribe(self, path, filename):
        return self.text


@pytest.fixture
def fake_ai():
    ai = FakeAI()
    app.dependency_overrides[get_ai] = lambda: ai
    yield ai
    app.dependency_overrides.pop(get_ai, None)


@pytest.fixture
def fake_transcriber():
    t = FakeTranscriber()
    app.dependency_overrides[get_transcriber] = lambda: t
    yield t
    app.dependency_overrides.pop(get_transcriber, None)


@pytest.fixture
def client(fake_ai, fake_transcriber):
    SQLModel.metadata.drop_all(engine)
    with TestClient(app) as c:  # lifespan creates the tables
        yield c


def register(client, email="me@example.com", name="Alex", password="password123"):
    r = client.post("/auth/register", json={"email": email, "password": password, "name": name})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture
def auth(client):
    return register(client)


def add_entry(client, auth, text, day: date):
    r = client.post("/entries", json={"text": text, "entry_date": day.isoformat()}, headers=auth)
    assert r.status_code == 201, r.text
    return r.json()
