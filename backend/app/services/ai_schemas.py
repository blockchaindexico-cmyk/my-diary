"""Structured output the AI produces. Field descriptions double as instructions to the model."""

from typing import Literal

from pydantic import BaseModel, Field

TriggerCategory = Literal[
    "work", "relationships", "family", "health", "sleep", "money", "self", "social", "environment", "other"
]


class Scores(BaseModel):
    mood: int = Field(description="Overall mood, 1 (very low) to 10 (excellent)")
    energy: int = Field(description="Physical and mental energy, 1 (drained) to 10 (energized)")
    productivity: int = Field(
        description="Efficiency: how effectively they spent the day relative to what they wanted to do, 1 to 10"
    )
    stress: int = Field(description="Stress level, 1 (calm) to 10 (extremely stressed)")
    anxiety: int = Field(description="Worry or anxiety, 1 (none) to 10 (severe)")
    social_connection: int = Field(description="How connected and supported they felt, 1 (isolated) to 10 (very connected)")
    sleep_quality: int | None = Field(description="Sleep quality 1 to 10, or null if sleep isn't mentioned")
    sleep_hours: float | None = Field(description="Hours slept if stated or clearly implied, else null")


class Emotion(BaseModel):
    name: str = Field(description="Single lowercase emotion word, e.g. 'grateful', 'frustrated', 'lonely'")
    intensity: int = Field(description="1 (faint) to 10 (overwhelming)")


class Trigger(BaseModel):
    label: str = Field(description="Short, reusable label (2-5 words), e.g. 'Deadline pressure', 'Morning workout'")
    effect: Literal["positive", "negative"]
    category: TriggerCategory
    detail: str = Field(description="One sentence on what happened and how it affected them")


class EntryAnalysis(BaseModel):
    title: str = Field(description="Evocative 3-6 word title for this entry")
    summary: str = Field(description="2-3 sentence summary written to the user in second person ('You...')")
    mood_label: str = Field(description="One or two words for the overall emotional tone, e.g. 'Hopeful', 'Overwhelmed'")
    scores: Scores
    emotions: list[Emotion] = Field(description="Up to 6 emotions present, strongest first")
    triggers: list[Trigger] = Field(description="Specific things that noticeably lifted or lowered their state")
    activities: list[str] = Field(description="Short lowercase activity labels, e.g. 'deep work', 'gym', 'family dinner'")
    people: list[str] = Field(description="People mentioned, by name or role ('mom', 'manager')")
    wins: list[str] = Field(description="Accomplishments or good moments, however small")
    challenges: list[str] = Field(description="Difficulties, setbacks, or unresolved worries")
    gratitude: list[str] = Field(description="Things they expressed appreciation for")
    themes: list[str] = Field(description="1-4 lowercase life themes touched on, e.g. 'career growth', 'self-doubt'")
    reflection: str = Field(description="One warm, perceptive observation (1-2 sentences) that helps them see their day")
    suggestion: str = Field(description="One small, concrete, doable next step tailored to this entry")
    wellbeing_flag: Literal["none", "watch", "concern", "crisis"] = Field(
        description=(
            "none: ordinary ups and downs. watch: sustained low mood, burnout or isolation signs. "
            "concern: hopelessness, inability to function, substance misuse, or abuse. "
            "crisis: any mention of self-harm, suicide, or being in danger."
        )
    )
    wellbeing_note: str = Field(description="If the flag is not 'none', a gentle one-sentence note; otherwise empty")


class LifeArea(BaseModel):
    area: str = Field(description="e.g. 'Work & career', 'Health & body', 'Relationships', 'Mind', 'Growth', 'Money'")
    status: Literal["thriving", "steady", "mixed", "struggling", "unknown"]
    note: str = Field(description="One specific sentence grounded in their entries")


class Person(BaseModel):
    name: str
    relationship: str = Field(description="e.g. 'partner', 'manager', 'friend', or 'unknown'")
    influence: Literal["positive", "negative", "mixed", "neutral"]
    note: str = Field(description="One sentence on how this person shows up in their life")


class LifeProfile(BaseModel):
    headline: str = Field(description="One line capturing who they are and where they are right now")
    summary: str = Field(description="A warm, specific paragraph (4-6 sentences) describing their life lately")
    current_chapter: str = Field(description="2-3 sentences on what is going on in their life at the moment")
    life_areas: list[LifeArea]
    patterns: list[str] = Field(
        description="Recurring patterns linking behaviours, triggers and mood, e.g. 'Your mood dips after nights under 6h of sleep'"
    )
    whats_working: list[str]
    whats_not_working: list[str]
    positive_triggers: list[str] = Field(description="Things that reliably lift them")
    negative_triggers: list[str] = Field(description="Things that reliably drain or upset them")
    people: list[Person]
    goals: list[str] = Field(description="Goals and aspirations they have expressed or clearly care about")
    habits: list[str] = Field(description="Routines and habits, good or bad, that keep showing up")
    focus_suggestions: list[str] = Field(description="3-5 specific, practical suggestions for the coming week")


class PeriodInsight(BaseModel):
    headline: str = Field(description="One short line summing up the period")
    narrative: str = Field(description="3-5 sentences on how the period went emotionally and practically")
    highlights: list[str] = Field(description="2-4 things that went well")
    watch_outs: list[str] = Field(description="0-3 things worth keeping an eye on")
    suggestions: list[str] = Field(description="2-3 practical suggestions for the next period")
