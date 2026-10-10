from datetime import date, timedelta

from tests.conftest import add_entry, register

TODAY = date(2026, 10, 10)


def test_register_login_and_me(client):
    headers = register(client)
    assert client.get("/auth/me", headers=headers).json()["name"] == "Alex"

    assert client.post("/auth/register", json={"email": "ME@example.com", "password": "password123", "name": "X"}).status_code == 409
    assert client.post("/auth/login", json={"email": "me@example.com", "password": "wrong-pass"}).status_code == 401
    r = client.post("/auth/login", json={"email": "Me@Example.com", "password": "password123"})
    assert r.status_code == 200 and r.json()["token"]


def test_requires_auth(client):
    assert client.get("/entries").status_code == 401
    assert client.get("/entries", headers={"Authorization": "Bearer nonsense"}).status_code == 401


def test_entry_is_analyzed_and_profile_built(client, auth, fake_ai):
    entry = add_entry(client, auth, "Went for a run, great day", TODAY)
    # Background jobs have run by the time the test client returns
    entry = client.get(f"/entries/{entry['id']}", headers=auth).json()
    assert entry["status"] == "ready"
    assert entry["analysis"]["scores"]["mood"] == 8
    assert entry["created_at"].endswith("Z")  # explicit UTC so the app shows local times correctly

    profile = client.get("/profile", headers=auth).json()
    assert profile["status"] == "ready"
    assert profile["data"]["headline"] == "A busy person finding balance"
    assert profile["entries_considered"] == 1

    # The second analysis is told about the vocabulary from the first
    add_entry(client, auth, "Deadline stress", TODAY)
    assert "Morning run" in fake_ai.calls["analyze"][1]["known_triggers"]


def test_failed_analysis_can_be_retried(client, auth, fake_ai):
    fake_ai.fail_analysis = True
    entry = add_entry(client, auth, "Something", TODAY)
    entry = client.get(f"/entries/{entry['id']}", headers=auth).json()
    assert entry["status"] == "failed" and entry["error"] == "AI is down"

    fake_ai.fail_analysis = False
    client.post(f"/entries/{entry['id']}/reanalyze", headers=auth)
    assert client.get(f"/entries/{entry['id']}", headers=auth).json()["status"] == "ready"


def test_update_and_delete_entry(client, auth, fake_ai):
    entry = add_entry(client, auth, "A rough one", TODAY)
    assert len(fake_ai.calls["analyze"]) == 1

    # Changing only the day doesn't need a new analysis
    r = client.patch(f"/entries/{entry['id']}", json={"entry_date": "2026-10-09"}, headers=auth)
    assert r.json()["entry_date"] == "2026-10-09"
    assert len(fake_ai.calls["analyze"]) == 1

    r = client.patch(f"/entries/{entry['id']}", json={"text": "Actually a great day"}, headers=auth)
    assert len(fake_ai.calls["analyze"]) == 2
    assert client.get(f"/entries/{entry['id']}", headers=auth).json()["analysis"]["scores"]["mood"] == 8

    assert client.delete(f"/entries/{entry['id']}", headers=auth).status_code == 204
    assert client.get(f"/entries/{entry['id']}", headers=auth).status_code == 404
    assert client.get("/profile", headers=auth).json()["data"] is None


def test_entries_are_private(client, auth):
    entry = add_entry(client, auth, "Mine", TODAY)
    other = register(client, email="other@example.com", name="Other")
    assert client.get(f"/entries/{entry['id']}", headers=other).status_code == 404
    assert client.delete(f"/entries/{entry['id']}", headers=other).status_code == 404
    assert client.get("/entries", headers=other).json() == []


def test_list_entries_by_range(client, auth):
    for offset in range(5):
        add_entry(client, auth, f"Day {offset}", TODAY - timedelta(days=offset))
    r = client.get("/entries", params={"start": "2026-10-08", "end": "2026-10-09"}, headers=auth)
    assert [e["entry_date"] for e in r.json()] == ["2026-10-09", "2026-10-08"]


def test_analytics_overview(client, auth):
    add_entry(client, auth, "great run", TODAY)
    add_entry(client, auth, "awful deadline", TODAY)
    add_entry(client, auth, "great again", TODAY - timedelta(days=1))
    add_entry(client, auth, "bad", TODAY - timedelta(days=9))  # previous period

    r = client.get("/analytics/overview", params={"days": 7, "end": TODAY.isoformat()}, headers=auth)
    data = r.json()
    assert data["period"] == {"start": "2026-10-04", "end": "2026-10-10", "days": 7}
    assert len(data["daily"]) == 7
    assert data["entry_count"] == 3 and data["days_journaled"] == 2 and data["streak"] == 2
    # Today averages 8 and 3 -> 5.5; yesterday 8; the period averages the days
    assert data["daily"][-1]["mood"] == 5.5
    assert data["averages"]["mood"] == 6.8
    assert data["previous_averages"]["mood"] == 3
    assert data["positive_triggers"][0] == {
        "label": "Morning run", "effect": "positive", "category": "health", "count": 2,
        "last_detail": "It mattered.", "last_date": "2026-10-10",
    }
    assert data["wellbeing_flag"]["flag"] == "watch"
    assert data["best_day"]["date"] == "2026-10-09"


def test_insight_is_cached_until_entries_change(client, auth, fake_ai):
    params = {"days": 7, "end": TODAY.isoformat()}
    assert client.get("/analytics/insight", params=params, headers=auth).json()["status"] == "empty"

    add_entry(client, auth, "great", TODAY)
    first = client.get("/analytics/insight", params=params, headers=auth).json()
    assert first["insight"]["headline"] == "A mixed week"
    client.get("/analytics/insight", params=params, headers=auth)
    assert len(fake_ai.calls["insight"]) == 1

    add_entry(client, auth, "another", TODAY)
    client.get("/analytics/insight", params=params, headers=auth)
    assert len(fake_ai.calls["insight"]) == 2


def test_chat_uses_journal_memory(client, auth, fake_ai):
    add_entry(client, auth, "Argued with my sister about the wedding plans", TODAY - timedelta(days=30))
    for i in range(3):
        add_entry(client, auth, f"Ordinary day {i}", TODAY - timedelta(days=i))

    r = client.post("/chat", json={"message": "How should I handle my sister?", "today": TODAY.isoformat()}, headers=auth)
    assert r.status_code == 200, r.text
    assert r.json()["reply"]["content"] == "Echo: How should I handle my sister?"

    call = fake_ai.calls["chat"][0]
    assert "Saturday, 10 October 2026" in call["memory"]
    assert "Ordinary day 0" in call["memory"]  # recent entries in full
    assert "wedding plans" in call["retrieved"]  # older entry found by keyword
    assert call["history"] == []

    client.post("/chat", json={"message": "Thanks"}, headers=auth)
    assert [m["role"] for m in fake_ai.calls["chat"][1]["history"]] == ["user", "assistant"]
    assert len(client.get("/chat/messages", headers=auth).json()) == 4

    client.delete("/chat/messages", headers=auth)
    assert client.get("/chat/messages", headers=auth).json() == []


def test_transcribe(client, auth, fake_transcriber):
    files = {"audio": ("note.m4a", b"fake-audio", "audio/m4a")}
    r = client.post("/transcribe", files=files, headers=auth)
    assert r.json() == {"text": "Today was a great day"}

    fake_transcriber.text = ""
    assert client.post("/transcribe", files=files, headers=auth).status_code == 422


def test_delete_account(client, auth):
    add_entry(client, auth, "great", TODAY)
    client.post("/chat", json={"message": "hi"}, headers=auth)
    assert client.delete("/auth/me", headers=auth).status_code == 204
    assert client.get("/auth/me", headers=auth).status_code == 401


def test_missing_api_key_is_a_clear_error(monkeypatch):
    import pytest

    from app.services.ai import AIError, JournalAI

    for var in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_PROFILE"):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setenv("HOME", "/nonexistent")  # no `ant auth login` profile either
    ai = JournalAI(api_key="", model="claude-opus-5-5")
    with pytest.raises(AIError, match="ANTHROPIC_API_KEY"):
        ai.chat(memory="m", history=[], message="hi", retrieved=None)
