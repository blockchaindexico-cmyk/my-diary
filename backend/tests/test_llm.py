"""The provider layer, against a fake OpenAI-compatible server."""

import json

import httpx2
import openai
import pytest

from app.services.ai_schemas import EntryAnalysis
from app.services.llm import openai_llm
from app.services.llm.anthropic_llm import AnthropicLLM
from app.services.llm.base import AIError
from app.services.llm.json_tools import coerce, extract_json, schema_for_prompt
from app.services.llm.openai_llm import OpenAICompatibleLLM

GOOD = {
    "title": "A good day", "summary": "You did well.", "mood_label": "Calm",
    "scores": {"mood": 8, "energy": 7, "productivity": 7, "stress": 3, "anxiety": 2, "social_connection": 6,
               "sleep_quality": None, "sleep_hours": None},
    "emotions": [{"name": "calm", "intensity": 6}],
    "triggers": [{"label": "Walk", "effect": "positive", "category": "health", "detail": "Helped."}],
    "activities": ["walk"], "people": [], "wins": [], "challenges": [], "gratitude": [], "themes": ["rest"],
    "reflection": "Nice.", "suggestion": "Rest.", "wellbeing_flag": "none", "wellbeing_note": "",
}


def completion(content: str) -> dict:
    return {
        "id": "c1", "object": "chat.completion", "created": 0, "model": "m",
        "choices": [{"index": 0, "finish_reason": "stop", "message": {"role": "assistant", "content": content}}],
    }


def make_llm(handler, provider="openrouter", model="some/model:free") -> OpenAICompatibleLLM:
    llm = OpenAICompatibleLLM(
        provider=provider, label="OpenRouter", base_url=f"https://{provider}.test/v1", api_key="k", model=model,
        http_client=openai.DefaultHttpxClient(transport=httpx2.MockTransport(handler)),
    )
    llm.client = llm.client.with_options(max_retries=0)
    return llm


@pytest.fixture(autouse=True)
def fresh_mode_cache():
    openai_llm._working_mode.clear()


# ---- JSON helpers ----------------------------------------------------------------------------


@pytest.mark.parametrize(
    "text",
    [
        '{"a": 1}',
        '```json\n{"a": 1}\n```',
        'Sure! Here it is:\n{"a": 1}\nHope that helps.',
        '<think>let me think {"no": 0}</think>{"a": 1}',
        '{"a": 1,}',
    ],
)
def test_extract_json_handles_common_slips(text):
    assert extract_json(text) == {"a": 1}


def test_coerce_repairs_messy_model_output():
    messy = {
        "Title": "Long day",  # wrong case key
        "summary": ["You worked.", "You rested."],  # list instead of string
        "scores": {"mood": "7", "energy": 6.6, "productivity": None, "stress": "high", "anxiety": 2,
                   "social_connection": 5, "sleep_quality": "n/a", "sleep_hours": "7"},
        "emotions": [{"name": "tired", "intensity": "8"}],
        "triggers": [{"label": "Deadline", "effect": "Negative", "category": "career", "detail": "Stressful"}],
        "wellbeing_flag": "NONE",
        # many fields missing entirely
    }
    a = EntryAnalysis.model_validate(coerce(EntryAnalysis, messy))
    assert a.title == "Long day"
    assert a.summary == "You worked., You rested."
    assert (a.scores.mood, a.scores.energy, a.scores.productivity, a.scores.stress) == (7, 7, 5, 5)
    assert a.scores.sleep_quality is None and a.scores.sleep_hours == 7.0
    assert a.emotions[0].intensity == 8
    assert a.triggers[0].effect == "negative" and a.triggers[0].category == "other"
    assert a.wellbeing_flag == "none" and a.wins == [] and a.reflection == ""


def test_prompt_schema_is_self_contained():
    schema = schema_for_prompt(EntryAnalysis)
    assert "$ref" not in json.dumps(schema)
    assert "title" in schema["properties"] and "title" not in schema  # the field survives, the annotation doesn't
    assert schema["required"] == list(schema["properties"])
    assert schema["properties"]["scores"]["properties"]["mood"]["type"] == "integer"


# ---- OpenAI-compatible provider --------------------------------------------------------------


def test_uses_json_schema_when_supported():
    seen = []

    def handler(request):
        body = json.loads(request.content)
        seen.append(body.get("response_format", {}).get("type"))
        assert body["messages"][0]["role"] == "system" and "<json_schema>" in body["messages"][0]["content"]
        return httpx2.Response(200, json=completion(json.dumps(GOOD)))

    llm = make_llm(handler)
    result = llm.generate(system="Analyze.", prompt="I walked.", output=EntryAnalysis)
    assert result.title == "A good day" and seen == ["json_schema"] and llm.last_mode == "json_schema"


def test_steps_down_when_response_format_is_rejected_and_remembers():
    seen = []

    def handler(request):
        mode = json.loads(request.content).get("response_format", {}).get("type", "prompt")
        seen.append(mode)
        if mode == "json_schema":
            return httpx2.Response(400, json={"error": {"message": "response_format json_schema not supported"}})
        if mode == "json_object":
            return httpx2.Response(404, json={"error": {"message": "No endpoints support response_format"}})
        return httpx2.Response(200, json=completion("Here you go:\n```json\n" + json.dumps(GOOD) + "\n```"))

    llm = make_llm(handler)
    assert llm.generate(system="s", prompt="p", output=EntryAnalysis).title == "A good day"
    assert seen == ["json_schema", "json_object", "prompt"]
    llm.generate(system="s", prompt="p", output=EntryAnalysis)
    assert seen[3:] == ["prompt"]  # goes straight to what worked


def test_repairs_invalid_json_once():
    replies = iter(["I think the mood was good!", json.dumps(GOOD)])

    def handler(request):
        return httpx2.Response(200, json=completion(next(replies)))

    assert make_llm(handler).generate(system="s", prompt="p", output=EntryAnalysis).mood_label == "Calm"


@pytest.mark.parametrize(
    ("status", "expected"),
    [(429, "rate limit"), (401, "rejected the API key"), (503, r"returned an error \(503\)")],
)
def test_errors_become_readable(status, expected):
    llm = make_llm(lambda request: httpx2.Response(status, json={"error": {"message": "nope"}}))
    with pytest.raises(AIError, match=expected):
        llm.chat(system="s", memory="m", history=[], message="hi")


def test_unknown_model_is_explained():
    llm = make_llm(lambda request: httpx2.Response(404, json={"error": {"message": "model not found"}}))
    with pytest.raises(AIError, match="has no model called"):
        llm.chat(system="s", memory="m", history=[], message="hi")


def test_chat_sends_memory_and_hides_reasoning():
    def handler(request):
        body = json.loads(request.content)
        assert "MEMORY" in body["messages"][0]["content"]
        assert [m["role"] for m in body["messages"]] == ["system", "user", "assistant", "user"]
        return httpx2.Response(200, json=completion("<think>hmm</think>You seem tired."))

    history = [{"role": "user", "content": "a"}, {"role": "assistant", "content": "b"}]
    assert make_llm(handler).chat(system="S", memory="MEMORY", history=history, message="c") == "You seem tired."


def test_lists_models_with_free_flags():
    def handler(request):
        assert request.url.path.endswith("/models")
        return httpx2.Response(200, json={"object": "list", "data": [
            {"id": "big/paid", "object": "model", "created": 0, "owned_by": "x", "pricing": {"prompt": "0.000001", "completion": "0.000002"}},
            {"id": "small/free:free", "object": "model", "created": 0, "owned_by": "x", "name": "Small (free)", "pricing": {"prompt": "0", "completion": "0"}, "context_length": 131072},
            {"id": "text-embedding-3", "object": "model", "created": 0, "owned_by": "x"},
        ]})

    models = make_llm(handler).list_models()
    assert [(m.id, m.free) for m in models] == [("small/free:free", True), ("big/paid", False)]
    assert models[0].name == "Small (free)" and models[0].context_length == 131072


def test_gemini_model_ids_lose_their_prefix():
    def handler(request):
        return httpx2.Response(200, json={"object": "list", "data": [
            {"id": "models/gemini-flash-latest", "object": "model", "created": 0, "owned_by": "google"},
            {"id": "models/gemini-embedding-001", "object": "model", "created": 0, "owned_by": "google"},
        ]})

    assert [m.id for m in make_llm(handler, provider="gemini").list_models()] == ["gemini-flash-latest"]


def test_anthropic_without_key_is_a_clear_error(monkeypatch):
    for var in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_PROFILE"):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setenv("HOME", "/nonexistent")
    with pytest.raises(AIError, match="Anthropic API key"):
        AnthropicLLM(api_key="", model="claude-opus-5-5").chat(system="s", memory="m", history=[], message="hi")
