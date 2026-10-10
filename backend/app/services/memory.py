"""Turns stored entries into compact text Claude can use as memory."""

import json
import re
from collections import Counter
from collections.abc import Iterable, Sequence
from datetime import date
from typing import Any

from ..models import Entry

_STOPWORDS = {
    "about", "after", "again", "also", "been", "before", "being", "could", "didn", "does", "doing", "don't",
    "even", "feel", "feeling", "from", "have", "having", "help", "into", "just", "know", "like", "lately",
    "make", "many", "more", "most", "much", "need", "should", "some", "something", "than", "that", "their",
    "them", "then", "there", "these", "they", "thing", "things", "think", "this", "what", "when", "where",
    "which", "while", "with", "would", "your", "you're", "really", "today", "week", "going", "want",
}


def format_day(d: date) -> str:
    return d.strftime("%a %d %b %Y")


def entry_digest_line(entry: Entry) -> str:
    a: dict[str, Any] = entry.analysis or {}
    if not a:
        snippet = entry.text[:280] + ("…" if len(entry.text) > 280 else "")
        return f"- {format_day(entry.entry_date)} · (not analyzed yet) · {snippet}"
    s = a.get("scores", {})
    parts = [
        f"mood {s.get('mood')}",
        f"energy {s.get('energy')}",
        f"efficiency {s.get('productivity')}",
        f"stress {s.get('stress')}",
        f"anxiety {s.get('anxiety')}",
    ]
    if s.get("sleep_hours") is not None:
        parts.append(f"slept {s['sleep_hours']}h")
    triggers = "; ".join(
        f"{'+' if t.get('effect') == 'positive' else '-'}{t.get('label')}" for t in a.get("triggers", [])
    )
    line = f"- {format_day(entry.entry_date)} · \"{a.get('title', '')}\" · {', '.join(parts)} · {a.get('summary', '')}"
    if triggers:
        line += f" Triggers: {triggers}."
    if a.get("people"):
        line += f" People: {', '.join(a['people'])}."
    return line


def build_digest(entries: Iterable[Entry]) -> str:
    ordered = sorted(entries, key=lambda e: (e.entry_date, e.created_at))
    return "\n".join(entry_digest_line(e) for e in ordered) or "(no entries yet)"


def full_entry_block(entry: Entry) -> str:
    return f'<entry date="{format_day(entry.entry_date)}">\n{entry.text}\n</entry>'


def render_profile(profile: dict[str, Any] | None) -> str:
    if not profile:
        return "(no profile yet — too few entries)"
    return json.dumps(profile, indent=1, ensure_ascii=False)


def known_labels(entries: Sequence[Entry], limit: int = 40) -> tuple[list[str], list[str]]:
    """The user's most-used trigger and activity labels, so new analyses reuse the same vocabulary."""
    triggers: Counter[str] = Counter()
    activities: Counter[str] = Counter()
    for e in entries:
        a = e.analysis or {}
        triggers.update(t["label"] for t in a.get("triggers", []) if t.get("label"))
        activities.update(x for x in a.get("activities", []) if x)
    return [t for t, _ in triggers.most_common(limit)], [x for x, _ in activities.most_common(limit)]


def keywords(text: str) -> set[str]:
    words = re.findall(r"[a-zA-Z][a-zA-Z']{3,}", text.lower())
    return {w for w in words if w not in _STOPWORDS}


def retrieve_relevant(
    entries: Sequence[Entry], query: str, exclude_ids: set[int], limit: int = 5
) -> list[Entry]:
    """Older entries whose words overlap the question, best matches first."""
    terms = keywords(query)
    if not terms:
        return []
    scored: list[tuple[int, Entry]] = []
    for e in entries:
        if e.id in exclude_ids:
            continue
        hits = len(terms & keywords(e.text))
        if hits:
            scored.append((hits, e))
    scored.sort(key=lambda pair: (pair[0], pair[1].entry_date), reverse=True)
    return [e for _, e in scored[:limit]]
