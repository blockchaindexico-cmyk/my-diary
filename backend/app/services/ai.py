"""The journal's AI features: analyzing entries, the life profile, period insights and chat.

The prompts live here; which model runs them is decided by services/ai_config.py.
"""

from datetime import date
from typing import Annotated, Any

from fastapi import Depends
from pydantic import BaseModel, Field
from sqlmodel import Session

from ..db import get_session
from .ai_config import build_llm, resolve
from .ai_schemas import EntryAnalysis, LifeProfile, PeriodInsight
from .llm.base import LLM, AIError

__all__ = ["AIError", "JournalAI", "get_ai"]


ANALYSIS_SYSTEM = """\
You analyze entries from a private voice journal. The user talks freely about their day — how it \
started and ended, what they did, how they felt. Entries are usually speech transcripts, so expect \
filler words, rambling and transcription mistakes; read through them for meaning.

Ground every field in what they actually said. When a score isn't stated outright, infer it from \
tone and content; when the entry gives almost nothing to go on for a score, use 5. Leave the sleep \
fields null unless sleep comes up.

Write the summary, reflection and suggestion directly to the user ("you"), warmly and plainly, like a \
perceptive friend rather than a therapist or coach. Be specific to this entry; skip generic advice.

To keep patterns trackable over time, reuse a label from the user's existing vocabulary whenever one \
fits, and only coin a new label when none does. Never diagnose. Set the wellbeing flag honestly using \
its definition."""

PROFILE_SYSTEM = """\
You maintain a living profile of a person, built from their private voice journal. They read it on \
their "You" screen, and their AI companion uses it as long-term memory.

Update the profile with the new evidence: keep what is still true, revise what has changed, and drop \
what no longer holds. Weigh recent weeks most heavily, but keep durable facts such as people, long-term \
goals and recurring patterns. A pattern needs support from more than one entry; prefer concrete \
specifics over generalities. Write to them in second person, warmly and honestly, and name what isn't \
working as clearly as what is. Never diagnose. Where there is too little evidence, say so briefly \
instead of inventing it (use status "unknown" for life areas with no evidence)."""

INSIGHT_SYSTEM = """\
You write the reflection shown on the insights screen of a private journaling app, covering one \
period of the user's journal. You get the computed stats for the period and its entries. Write to the \
user in second person. Be specific and grounded: mention actual days, events and numbers where they \
help. Be warm and honest, skip generic wellness advice, and never diagnose."""

CHAT_SYSTEM = """\
You are the companion inside the user's private voice journal. You know them through their journal \
entries and the life profile below; that is your memory of them. They come to you to talk things \
through, understand what is going on with them, and get advice that fits their actual life.

- Be specific to them. Connect what they ask to concrete things from their entries (say when, e.g. \
"on Tuesday you mentioned...") and to patterns in their profile. Use their data rather than reciting it.
- Give practical, personal suggestions they can act on, and be honest when something they're doing \
isn't working for them.
- Sound like a perceptive, caring friend: warm, direct, plain language. Ask a follow-up question when \
it would help them reflect.
- This is a phone chat. Keep replies short (usually under 150 words) with short paragraphs and at most \
simple "- " bullets. Don't use markdown headings, bold or tables.
- If the journal doesn't cover something, say so instead of guessing.
- You are not a therapist and don't diagnose. If they mention self-harm, suicide or being in danger, \
respond with care, encourage them to contact local emergency services or a crisis line \
(findahelpline.com lists lines for every country), and keep talking with them."""


class Ping(BaseModel):
    greeting: str = Field(description="A short, friendly hello (at most 8 words)")
    number: int = Field(description="Any whole number from 1 to 10")


class JournalAI:
    def __init__(self, llm: LLM | None):
        self.llm = llm

    @property
    def model(self) -> str:
        return self.llm.model if self.llm else ""

    def analyze_entry(
        self,
        *,
        text: str,
        entry_date: date,
        user_name: str,
        known_triggers: list[str],
        known_activities: list[str],
        profile_context: str,
    ) -> EntryAnalysis:
        context = (
            f"This entry is about {entry_date.strftime('%A, %d %B %Y')}.\n"
            f"The user's name is {user_name}.\n"
            f"Their existing trigger labels: {', '.join(known_triggers) or '(none yet)'}\n"
            f"Their existing activity labels: {', '.join(known_activities) or '(none yet)'}\n"
            f"What we know about them so far: {profile_context}"
        )
        analysis = self.llm.generate(
            system=ANALYSIS_SYSTEM,
            prompt=f"<context>\n{context}\n</context>\n\n<entry>\n{text}\n</entry>",
            output=EntryAnalysis,
        )
        return _clamp_scores(analysis)

    def build_profile(
        self,
        *,
        user_name: str,
        today: date,
        previous_profile: str,
        digest: str,
        latest_entries: str,
    ) -> LifeProfile:
        prompt = (
            f"Today is {today.strftime('%A, %d %B %Y')}. The user's name is {user_name}.\n\n"
            f"<previous_profile>\n{previous_profile}\n</previous_profile>\n\n"
            f"<journal_digest>\nOne line per entry, oldest first. Scores are 1-10.\n{digest}\n</journal_digest>\n\n"
            f"<latest_entries>\n{latest_entries}\n</latest_entries>\n\n"
            "Write the updated profile."
        )
        return self.llm.generate(system=PROFILE_SYSTEM, prompt=prompt, output=LifeProfile)

    def period_insight(self, *, user_name: str, period: str, stats: str, digest: str) -> PeriodInsight:
        prompt = (
            f"The user's name is {user_name}. The period is {period}.\n\n"
            f"<stats>\n{stats}\n</stats>\n\n"
            f"<entries>\n{digest}\n</entries>"
        )
        return self.llm.generate(system=INSIGHT_SYSTEM, prompt=prompt, output=PeriodInsight)

    def chat(
        self,
        *,
        memory: str,
        history: list[dict[str, Any]],
        message: str,
        retrieved: str | None,
    ) -> str:
        if retrieved:
            message = (
                "<related_journal_entries>\nOlder entries that may relate to this message:\n"
                f"{retrieved}\n</related_journal_entries>\n\n{message}"
            )
        return self.llm.chat(system=CHAT_SYSTEM, memory=memory, history=history, message=message)

    def ping(self) -> Ping:
        return self.llm.generate(
            system="You are checking that a connection works.", prompt="Say hello and pick a number.", output=Ping
        )


def _clamp(value: int | float | None, low: float = 1, high: float = 10) -> int | None:
    if value is None:
        return None
    return int(round(min(max(value, low), high)))


def _clamp_scores(analysis: EntryAnalysis) -> EntryAnalysis:
    s = analysis.scores
    for field in ("mood", "energy", "productivity", "stress", "anxiety", "social_connection"):
        setattr(s, field, _clamp(getattr(s, field)))
    s.sleep_quality = _clamp(s.sleep_quality)
    if s.sleep_hours is not None:
        s.sleep_hours = round(min(max(s.sleep_hours, 0.0), 24.0), 1)
    for emotion in analysis.emotions:
        emotion.intensity = _clamp(emotion.intensity) or 1
    return analysis


def get_ai(session: Annotated[Session, Depends(get_session)]) -> JournalAI:
    """The AI for this request, using whatever provider and model are currently selected."""
    return JournalAI(build_llm(resolve(session)))
