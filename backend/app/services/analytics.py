"""Turns analyzed entries into the numbers shown on the insights screen."""

from collections import defaultdict
from collections.abc import Iterable, Sequence
from datetime import date, timedelta
from statistics import mean
from typing import Any

from ..models import Entry

METRICS = ["mood", "energy", "productivity", "stress", "anxiety", "social_connection", "sleep_quality", "sleep_hours"]
FLAG_SEVERITY = {"none": 0, "watch": 1, "concern": 2, "crisis": 3}


def _avg(values: Iterable[float | None], digits: int = 1) -> float | None:
    present = [v for v in values if v is not None]
    return round(mean(present), digits) if present else None


def wellbeing_score(scores: dict[str, Any]) -> float | None:
    """0-100 composite: higher mood, energy, efficiency, connection and sleep; lower stress and anxiety."""
    parts = [
        scores.get("mood"),
        scores.get("energy"),
        scores.get("productivity"),
        11 - scores["stress"] if scores.get("stress") is not None else None,
        11 - scores["anxiety"] if scores.get("anxiety") is not None else None,
        scores.get("social_connection"),
        scores.get("sleep_quality"),
    ]
    avg = _avg(parts, digits=3)
    return None if avg is None else round((avg - 1) / 9 * 100)


def _analyzed(entries: Iterable[Entry]) -> list[Entry]:
    return [e for e in entries if e.status == "ready" and e.analysis]


def daily_series(entries: Sequence[Entry], start: date, end: date) -> list[dict[str, Any]]:
    by_day: dict[date, list[Entry]] = defaultdict(list)
    for e in _analyzed(entries):
        by_day[e.entry_date].append(e)

    days = []
    d = start
    while d <= end:
        day_entries = by_day.get(d, [])
        scores = [e.analysis["scores"] for e in day_entries]
        row: dict[str, Any] = {"date": d.isoformat(), "entries": len(day_entries)}
        for m in METRICS:
            row[m] = _avg(s.get(m) for s in scores)
        row["wellbeing"] = _avg((wellbeing_score(s) for s in scores), digits=0)
        row["mood_label"] = day_entries[-1].analysis.get("mood_label") if day_entries else None
        days.append(row)
        d += timedelta(days=1)
    return days


def period_averages(daily: Sequence[dict[str, Any]]) -> dict[str, float | None]:
    """Average of daily values, so a day with three entries doesn't outweigh a day with one."""
    return {m: _avg(day[m] for day in daily) for m in [*METRICS, "wellbeing"]}


def streak(entry_dates: set[date], end: date) -> int:
    """Consecutive journaled days ending at `end` (or the day before, if today isn't journaled yet)."""
    d = end if end in entry_dates else end - timedelta(days=1)
    count = 0
    while d in entry_dates:
        count += 1
        d -= timedelta(days=1)
    return count


def overview(
    entries: Sequence[Entry],
    previous_entries: Sequence[Entry],
    start: date,
    end: date,
    all_entry_dates: set[date],
) -> dict[str, Any]:
    analyzed = _analyzed(entries)
    daily = daily_series(entries, start, end)
    span = (end - start).days + 1
    previous_daily = daily_series(previous_entries, start - timedelta(days=span), start - timedelta(days=1))
    averages = period_averages(daily)

    emotions: dict[str, list[int]] = defaultdict(list)
    triggers: dict[tuple[str, str], dict[str, Any]] = {}
    categories: dict[str, dict[str, int]] = defaultdict(lambda: {"positive": 0, "negative": 0})
    activity_moods: dict[str, list[float]] = defaultdict(list)
    worst_flag: dict[str, Any] | None = None

    for e in sorted(analyzed, key=lambda e: (e.entry_date, e.created_at)):
        a = e.analysis
        for em in a.get("emotions", []):
            emotions[em["name"].lower()].append(em["intensity"])
        for t in a.get("triggers", []):
            key = (t["label"].strip().lower(), t["effect"])
            item = triggers.setdefault(
                key, {"label": t["label"].strip(), "effect": t["effect"], "category": t["category"], "count": 0}
            )
            item["count"] += 1
            item["last_detail"] = t.get("detail", "")
            item["last_date"] = e.entry_date.isoformat()
            categories[t["category"]][t["effect"]] += 1
        for activity in {x.strip().lower() for x in a.get("activities", [])}:
            activity_moods[activity].append(a["scores"]["mood"])
        flag = a.get("wellbeing_flag", "none")
        if FLAG_SEVERITY.get(flag, 0) > 0 and (
            worst_flag is None or FLAG_SEVERITY[flag] >= FLAG_SEVERITY[worst_flag["flag"]]
        ):
            worst_flag = {"flag": flag, "note": a.get("wellbeing_note", ""), "date": e.entry_date.isoformat()}

    def top_triggers(effect: str) -> list[dict[str, Any]]:
        items = [t for t in triggers.values() if t["effect"] == effect]
        items.sort(key=lambda t: (t["count"], t["last_date"]), reverse=True)
        return items[:6]

    mood_avg = averages["mood"]
    activities = [
        {
            "name": name,
            "count": len(moods),
            "avg_mood": round(mean(moods), 1),
            "mood_lift": round(mean(moods) - mood_avg, 1) if mood_avg is not None else None,
        }
        for name, moods in activity_moods.items()
    ]
    activities.sort(key=lambda a: (a["count"], a["avg_mood"]), reverse=True)

    scored_days = [d for d in daily if d["wellbeing"] is not None]
    best = max(scored_days, key=lambda d: d["wellbeing"], default=None)
    toughest = min(scored_days, key=lambda d: d["wellbeing"], default=None)

    return {
        "period": {"start": start.isoformat(), "end": end.isoformat(), "days": span},
        "entry_count": len(entries),
        "analyzed_count": len(analyzed),
        "days_journaled": len({e.entry_date for e in entries}),
        "streak": streak(all_entry_dates, end),
        "averages": averages,
        "previous_averages": period_averages(previous_daily),
        "daily": daily,
        "emotions": sorted(
            (
                {"name": name, "count": len(vals), "avg_intensity": round(mean(vals), 1)}
                for name, vals in emotions.items()
            ),
            key=lambda x: (x["count"], x["avg_intensity"]),
            reverse=True,
        )[:10],
        "positive_triggers": top_triggers("positive"),
        "negative_triggers": top_triggers("negative"),
        "trigger_categories": sorted(
            ({"category": c, **counts} for c, counts in categories.items()),
            key=lambda x: x["positive"] + x["negative"],
            reverse=True,
        ),
        "activities": activities[:8],
        "best_day": best and {"date": best["date"], "wellbeing": best["wellbeing"], "mood_label": best["mood_label"]},
        "toughest_day": toughest
        and {"date": toughest["date"], "wellbeing": toughest["wellbeing"], "mood_label": toughest["mood_label"]},
        "wellbeing_flag": worst_flag,
    }


def stats_for_prompt(data: dict[str, Any]) -> str:
    a, p = data["averages"], data["previous_averages"]

    def fmt(key: str) -> str:
        cur, prev = a.get(key), p.get(key)
        if cur is None:
            return f"{key}: n/a"
        return f"{key}: {cur}" + (f" (previous period {prev})" if prev is not None else "")

    lines = [
        f"Entries: {data['entry_count']} across {data['days_journaled']} of {data['period']['days']} days; "
        f"current streak {data['streak']} days.",
        "Averages (1-10; wellbeing 0-100): " + "; ".join(fmt(k) for k in [*METRICS, "wellbeing"]),
        "Daily wellbeing: "
        + ", ".join(f"{d['date']}={d['wellbeing'] if d['wellbeing'] is not None else '-'}" for d in data["daily"]),
        "Top emotions: " + ", ".join(f"{e['name']} x{e['count']}" for e in data["emotions"]),
        "Lifting triggers: " + ", ".join(f"{t['label']} x{t['count']}" for t in data["positive_triggers"]),
        "Draining triggers: " + ", ".join(f"{t['label']} x{t['count']}" for t in data["negative_triggers"]),
        "Activities (avg mood): " + ", ".join(f"{x['name']} {x['avg_mood']}" for x in data["activities"]),
    ]
    return "\n".join(lines)
