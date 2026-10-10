"""All Claude calls: analyzing entries, maintaining the life profile, period insights, and chat."""

import logging
from datetime import date
from functools import lru_cache
from typing import Any, TypeVar

import anthropic
import pydantic
from pydantic import BaseModel

from ..config import get_settings
from .ai_schemas import EntryAnalysis, LifeProfile, PeriodInsight

log = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

# Server-side fallback: if a safety classifier declines a request (e.g. a false positive on a
# heavy mental-health entry), the API retries it on Anthropic's recommended fallback model.
FALLBACK_BETA = "server-side-fallback-2026-07-01"


class AIError(Exception):
    """A user-presentable failure from the AI layer."""


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


class JournalAI:
    def __init__(self, api_key: str, model: str, effort: str = "medium"):
        self._api_key = api_key
        self.model = model
        self.effort = effort
        self._client: anthropic.Anthropic | None = None

    @property
    def client(self) -> anthropic.Anthropic:
        if self._client is None:
            self._client = anthropic.Anthropic(api_key=self._api_key or None)
        return self._client

    # ---- low-level -------------------------------------------------------------------------

    def _call(self, method: str, **kwargs):
        try:
            fn = getattr(self.client.beta.messages, method)
            response = fn(
                model=self.model,
                max_tokens=16000,
                output_config={"effort": self.effort},
                betas=[FALLBACK_BETA],
                fallbacks="default",
                **kwargs,
            )
        except anthropic.AuthenticationError as e:
            raise AIError("The server's ANTHROPIC_API_KEY is missing or invalid.") from e
        except anthropic.RateLimitError as e:
            raise AIError("The AI is busy right now. Please try again in a minute.") from e
        except anthropic.APIStatusError as e:
            log.warning("Claude API error %s: %s", e.status_code, e.message)
            raise AIError("The AI service returned an error. Please try again.") from e
        except anthropic.APIConnectionError as e:
            raise AIError("Couldn't reach the AI service. Check the server's internet connection.") from e
        except anthropic.AnthropicError as e:
            raise AIError(f"AI is not configured on the server: {e}") from e
        except TypeError as e:
            # The SDK raises this at request time when no API key or other credentials exist
            if "authentication method" not in str(e):
                raise
            raise AIError("Claude isn't set up on the server yet: add ANTHROPIC_API_KEY to backend/.env.") from e

        if response.stop_reason == "refusal":
            raise AIError("The AI declined to respond to this. Try rephrasing it.")
        if response.stop_reason == "max_tokens":
            raise AIError("The AI response was cut off. Please try again.")
        return response

    def _parse(self, output_format: type[T], **kwargs) -> T:
        try:
            response = self._call("parse", output_format=output_format, **kwargs)
        except pydantic.ValidationError as e:
            raise AIError("The AI returned an unexpected format. Please try again.") from e
        parsed = response.parsed_output
        if parsed is None:
            raise AIError("The AI returned an empty response. Please try again.")
        return parsed

    # ---- features --------------------------------------------------------------------------

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
        analysis = self._parse(
            EntryAnalysis,
            system=ANALYSIS_SYSTEM,
            messages=[
                {
                    "role": "user",
                    "content": f"<context>\n{context}\n</context>\n\n<entry>\n{text}\n</entry>",
                }
            ],
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
        content = (
            f"Today is {today.strftime('%A, %d %B %Y')}. The user's name is {user_name}.\n\n"
            f"<previous_profile>\n{previous_profile}\n</previous_profile>\n\n"
            f"<journal_digest>\nOne line per entry, oldest first. Scores are 1-10.\n{digest}\n</journal_digest>\n\n"
            f"<latest_entries>\n{latest_entries}\n</latest_entries>\n\n"
            "Write the updated profile."
        )
        return self._parse(LifeProfile, system=PROFILE_SYSTEM, messages=[{"role": "user", "content": content}])

    def period_insight(self, *, user_name: str, period: str, stats: str, digest: str) -> PeriodInsight:
        content = (
            f"The user's name is {user_name}. The period is {period}.\n\n"
            f"<stats>\n{stats}\n</stats>\n\n"
            f"<entries>\n{digest}\n</entries>"
        )
        return self._parse(PeriodInsight, system=INSIGHT_SYSTEM, messages=[{"role": "user", "content": content}])

    def chat(
        self,
        *,
        memory: str,
        history: list[dict[str, Any]],
        message: str,
        retrieved: str | None,
    ) -> str:
        user_content: list[dict[str, Any]] = []
        if retrieved:
            user_content.append(
                {
                    "type": "text",
                    "text": "<related_journal_entries>\nOlder entries that may relate to this message:\n"
                    f"{retrieved}\n</related_journal_entries>",
                }
            )
        user_content.append({"type": "text", "text": message})

        response = self._call(
            "create",
            system=[
                {"type": "text", "text": CHAT_SYSTEM},
                # The memory block is stable within a conversation, so cache it.
                {"type": "text", "text": memory, "cache_control": {"type": "ephemeral"}},
            ],
            messages=[*history, {"role": "user", "content": user_content}],
        )
        reply = "".join(block.text for block in response.content if block.type == "text").strip()
        if not reply:
            raise AIError("The AI returned an empty reply. Please try again.")
        return reply


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


@lru_cache
def get_ai() -> JournalAI:
    settings = get_settings()
    return JournalAI(api_key=settings.anthropic_api_key, model=settings.claude_model, effort=settings.claude_effort)
