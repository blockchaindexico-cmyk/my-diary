from datetime import date

from app.services.analytics import streak, wellbeing_score


def test_wellbeing_score_bounds():
    best = {"mood": 10, "energy": 10, "productivity": 10, "stress": 1, "anxiety": 1, "social_connection": 10}
    worst = {"mood": 1, "energy": 1, "productivity": 1, "stress": 10, "anxiety": 10, "social_connection": 1}
    assert wellbeing_score(best) == 100
    assert wellbeing_score(worst) == 0
    assert wellbeing_score({**best, "sleep_quality": None}) == 100
    assert wellbeing_score({}) is None


def test_streak_counts_back_from_today_or_yesterday():
    days = {date(2026, 10, d) for d in (5, 7, 8, 9)}
    assert streak(days, date(2026, 10, 9)) == 3
    assert streak(days, date(2026, 10, 10)) == 3  # today not journaled yet
    assert streak(days, date(2026, 10, 12)) == 0
