"""Fill a demo account with three weeks of sample entries so every screen has data.

    python -m app.seed                       # demo@example.com / demo1234
    python -m app.seed --email you@x.com --password secret123 --name You

No API key needed: the analyses and profile are pre-written sample data.
"""

import argparse
import random
from datetime import date, datetime, time, timedelta, timezone

from sqlmodel import Session, delete, select

from .auth import hash_password
from .db import engine, init_db
from .models import ChatMessage, Entry, Insight, Profile, User, utcnow

DAYS = [
    # (text, mood, energy, productivity, stress, anxiety, social, sleep_h, title, label, emotions, pos, neg, activities, people)
    ("Woke up early, went for a run before work. Shipped the onboarding feature and the team loved it. Dinner with Priya.",
     8, 8, 9, 3, 2, 8, 7.5, "Momentum and a good run", "Energized", [("proud", 8), ("grateful", 6)],
     ["Morning run", "Shipping work"], [], ["running", "deep work", "dinner with friends"], ["Priya"]),
    ("Slept badly, maybe five hours. Back-to-back meetings all day and I barely got anything done. Felt foggy and irritable.",
     4, 3, 3, 7, 6, 4, 5.0, "Foggy meeting marathon", "Drained", [("irritated", 6), ("tired", 8)],
     [], ["Poor sleep", "Back-to-back meetings"], ["meetings"], []),
    ("Quiet day. Worked from a cafe, read a few chapters, called mom in the evening. Felt calm.",
     7, 6, 6, 3, 3, 7, 7.0, "A calm cafe day", "Calm", [("calm", 7), ("content", 6)],
     ["Calling mom", "Reading"], [], ["reading", "deep work"], ["mom"]),
    ("Deadline for the investor deck moved up. Stayed late, skipped the gym, ate junk. Worried we're not ready.",
     4, 4, 7, 8, 7, 3, 6.0, "Deadline crunch", "Stressed", [("anxious", 7), ("overwhelmed", 6)],
     [], ["Deadline pressure", "Skipping exercise"], ["deep work"], ["Arjun"]),
    ("Weekend hike with Priya and Sam. Phone off for hours. Best I've felt in a while.",
     9, 8, 5, 2, 1, 9, 8.0, "Phone off, on the trail", "Joyful", [("joyful", 9), ("free", 7)],
     ["Time in nature", "Friends"], [], ["hiking"], ["Priya", "Sam"]),
    ("Sunday scaries. Spent too long scrolling, didn't plan the week. Low energy.",
     5, 4, 3, 5, 6, 4, 7.0, "Scrolling into Sunday night", "Restless", [("restless", 6), ("guilty", 4)],
     [], ["Doomscrolling"], ["scrolling"], []),
    ("Good focus block in the morning, gym at lunch. Hard 1:1 with Arjun about scope, but we sorted it out.",
     7, 7, 8, 5, 4, 6, 7.0, "Hard talk, good outcome", "Relieved", [("relieved", 7), ("focused", 6)],
     ["Gym", "Clear conversations"], ["Conflict at work"], ["gym", "deep work"], ["Arjun"]),
]


# Which sample day fits each weekday (Mon=0): meetings on Monday, the hike on Saturday...
WEEKDAY_TEMPLATE = {0: 1, 1: 0, 2: 2, 3: 3, 4: 6, 5: 4, 6: 5}


def _analysis(day, rnd: random.Random) -> dict:
    (text, mood, energy, prod, stress, anxiety, social, sleep_h, title, label, emotions, pos, neg, acts, people) = day
    j = lambda v: max(1, min(10, v + rnd.choice([-1, 0, 0, 1])))  # noqa: E731
    sleep_quality = 8 if sleep_h >= 7.5 else 6 if sleep_h >= 6.5 else 3
    triggers = [{"label": t, "effect": "positive", "category": "health" if t in ("Morning run", "Gym", "Time in nature") else "self",
                 "detail": f"{t} lifted your day."} for t in pos]
    triggers += [{"label": t, "effect": "negative", "category": "work" if "eadline" in t or "eeting" in t or "work" in t else "sleep" if "sleep" in t else "self",
                  "detail": f"{t} weighed on you."} for t in neg]
    flag = "watch" if mood <= 4 and stress >= 7 else "none"
    return {
        "title": title,
        "summary": f"You described a day that felt {label.lower()}. " + text.split(". ")[0] + ".",
        "mood_label": label,
        "scores": {"mood": j(mood), "energy": j(energy), "productivity": j(prod), "stress": j(stress),
                   "anxiety": j(anxiety), "social_connection": j(social), "sleep_quality": sleep_quality, "sleep_hours": sleep_h},
        "emotions": [{"name": n, "intensity": i} for n, i in emotions],
        "triggers": triggers,
        "activities": acts,
        "people": people,
        "wins": [f"Made time for {acts[0]}"] if mood >= 7 else [],
        "challenges": [f"Dealing with {neg[0].lower()}"] if neg else [],
        "gratitude": [f"Time with {people[0]}"] if people and mood >= 7 else [],
        "themes": ["work-life balance"],
        "reflection": "Notice how much the shape of your morning sets the tone for everything after it.",
        "suggestion": "Block 30 minutes tomorrow morning for something that's just for you.",
        "wellbeing_flag": flag,
        "wellbeing_note": "A few draining days in a row; keep an eye on rest." if flag != "none" else "",
    }


PROFILE = {
    "headline": "A builder in a demanding season, learning to protect your energy",
    "summary": "You're deep in a high-stakes stretch at work and you care a lot about doing it well. Your best days start with movement and include real time with people you love; your hardest ones come from short sleep and calendars packed with meetings. You bounce back quickly once you get outside or talk things through.",
    "current_chapter": "The investor deck and product deadlines are setting the pace right now. You're trying to keep exercise and friendships in the mix while the pressure is high.",
    "life_areas": [
        {"area": "Work & career", "status": "mixed", "note": "Shipping wins feel great, but deadline crunches and meeting-heavy days drain you."},
        {"area": "Health & body", "status": "steady", "note": "Runs and gym sessions reliably lift your mood; sleep is the weak link."},
        {"area": "Relationships", "status": "thriving", "note": "Time with Priya, Sam and calls with your mom are consistent bright spots."},
        {"area": "Mind", "status": "mixed", "note": "Sunday evenings and late scrolling tend to bring restlessness."},
    ],
    "patterns": [
        "Your mood drops about 3 points after nights under 6 hours of sleep",
        "Mornings that start with exercise are your most productive days",
        "Sunday evenings without a plan for the week tend to feel heavy",
    ],
    "whats_working": ["Morning runs", "Phone-free time outdoors", "Direct conversations at work"],
    "whats_not_working": ["Late nights before deadlines", "Back-to-back meetings", "Scrolling before bed"],
    "positive_triggers": ["Morning run", "Time in nature", "Friends", "Calling mom"],
    "negative_triggers": ["Poor sleep", "Deadline pressure", "Back-to-back meetings", "Doomscrolling"],
    "people": [
        {"name": "Priya", "relationship": "close friend", "influence": "positive", "note": "Shows up on many of your best days."},
        {"name": "Arjun", "relationship": "colleague", "influence": "mixed", "note": "Hard conversations, but they usually end in clarity."},
        {"name": "Mom", "relationship": "mother", "influence": "positive", "note": "Evening calls leave you calm."},
    ],
    "goals": ["Ship the product and land the investor round", "Stay consistent with exercise"],
    "habits": ["Running before work", "Working from cafes", "Late-night scrolling"],
    "focus_suggestions": [
        "Protect a 7-hour sleep window for the next five nights",
        "Keep one meeting-free morning block each day",
        "Spend 10 minutes on Sunday afternoon planning the week",
        "Schedule one phone-off outing with friends this weekend",
    ],
}


def seed(email: str, password: str, name: str, days: int = 21) -> None:
    init_db()
    rnd = random.Random(42)
    with Session(engine) as session:
        user = session.exec(select(User).where(User.email == email)).first()
        if user is None:
            user = User(email=email, name=name, password_hash=hash_password(password))
            session.add(user)
            session.commit()
            session.refresh(user)
        for model in (Entry, ChatMessage, Insight, Profile):
            session.exec(delete(model).where(model.user_id == user.id))

        today = date.today()
        for offset in range(days - 1, -1, -1):
            d = today - timedelta(days=offset)
            if rnd.random() < 0.12 and offset > 1:  # skip a few days, like real life
                continue
            day = DAYS[WEEKDAY_TEMPLATE[d.weekday()]]
            recorded = datetime.combine(d, time(21, rnd.randint(0, 59)), tzinfo=timezone.utc)
            session.add(Entry(
                user_id=user.id, entry_date=d, created_at=recorded, updated_at=recorded, text=day[0],
                source="voice", duration_seconds=rnd.randint(40, 240), status="ready",
                analysis=_analysis(day, rnd), analyzed_at=recorded,
            ))
        session.add(Profile(user_id=user.id, data=PROFILE, status="ready", entries_considered=days, updated_at=utcnow()))
        session.commit()
    print(f"Seeded {email} (password: {password}) with ~{days} days of entries.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--email", default="demo@example.com")
    parser.add_argument("--password", default="demo1234")
    parser.add_argument("--name", default="Alex")
    parser.add_argument("--days", type=int, default=21)
    args = parser.parse_args()
    seed(args.email, args.password, args.name, args.days)
