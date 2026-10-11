from datetime import date

from app.main import app
from app.services.ai import get_ai
from tests.conftest import register


def test_defaults_to_gemini_and_explains_whats_missing(client, auth):
    s = client.get("/ai/settings", headers=auth).json()
    assert s["provider"] == "gemini" and s["model"] == "gemini-flash-latest"
    assert s["ready"] is False and s["can_edit"] is True
    assert s["problem"] == "Add your Google Gemini API key in You → AI model."
    gemini = next(p for p in s["providers"] if p["id"] == "gemini")
    assert gemini["key_hint"] is None and gemini["key_url"].startswith("https://")


def test_owner_switches_provider_model_and_key(client, auth):
    r = client.put(
        "/ai/settings",
        json={"provider": "openrouter", "api_key": "sk-or-secret-1234", "model": "vendor/model:free"},
        headers=auth,
    )
    s = r.json()
    assert s["provider"] == "openrouter" and s["model"] == "vendor/model:free" and s["ready"] is True
    openrouter = next(p for p in s["providers"] if p["id"] == "openrouter")
    assert openrouter["key_hint"] == "••••1234" and openrouter["key_source"] == "app"
    assert "sk-or-secret" not in r.text  # keys never go back to the app

    # Switching away and back keeps each provider's own model
    client.put("/ai/settings", json={"provider": "gemini"}, headers=auth)
    s = client.put("/ai/settings", json={"provider": "openrouter"}, headers=auth).json()
    assert s["model"] == "vendor/model:free"

    # Clearing the key
    s = client.put("/ai/settings", json={"api_key": ""}, headers=auth).json()
    assert s["ready"] is False


def test_only_the_owner_can_change_settings(client, auth):
    other = register(client, email="friend@example.com", name="Friend")
    assert client.get("/ai/settings", headers=other).json()["can_edit"] is False
    assert client.put("/ai/settings", json={"provider": "groq"}, headers=other).status_code == 403
    assert client.post("/ai/models", json={"provider": "groq"}, headers=other).status_code == 403


def test_rejects_unknown_choices(client, auth):
    assert client.put("/ai/settings", json={"provider": "nope"}, headers=auth).status_code == 422
    assert client.put("/ai/settings", json={"transcription_provider": "nope"}, headers=auth).status_code == 422
    assert client.post("/ai/models", json={"provider": "nope"}, headers=auth).status_code == 422


def test_unconfigured_ai_fails_entries_with_a_fix_it_message(client, auth):
    app.dependency_overrides.pop(get_ai)  # use the real provider resolution
    r = client.post("/entries", json={"text": "Hello", "entry_date": date.today().isoformat()}, headers=auth)
    entry = client.get(f"/entries/{r.json()['id']}", headers=auth).json()
    assert entry["status"] == "failed"
    assert entry["error"] == "Add your Google Gemini API key in You → AI model."

    test = client.post("/ai/test", headers=auth).json()
    assert test["ok"] is False and "API key" in test["error"]


def test_model_list_needs_a_key(client, auth):
    r = client.post("/ai/models", json={"provider": "openrouter"}, headers=auth)
    assert r.status_code == 502 and "API key" in r.json()["detail"]


def test_speech_to_text_choice(client, auth):
    s = client.put("/ai/settings", json={"transcription_provider": "groq"}, headers=auth).json()
    assert s["transcription_provider"] == "groq"
    assert {o["id"] for o in s["transcription_options"]} == {"local", "groq", "openai"}
