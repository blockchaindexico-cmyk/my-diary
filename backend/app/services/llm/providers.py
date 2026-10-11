"""The AI providers the journal can use. Switch between them in the app (You → AI model) or .env."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Provider:
    id: str
    label: str
    kind: str  # "anthropic" | "openai" (any OpenAI-compatible Chat Completions API)
    base_url: str
    key_env: str | None  # environment variable holding the API key
    default_model: str  # "" means: pick one from the provider's model list
    pricing: str  # shown in the app
    key_url: str = ""
    needs_key: bool = True
    note: str = ""


PROVIDERS: dict[str, Provider] = {
    p.id: p
    for p in [
        Provider(
            id="gemini",
            label="Google Gemini",
            kind="openai",
            base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
            key_env="GEMINI_API_KEY",
            # Google's alias for its newest Flash model, so this keeps working as versions change
            default_model="gemini-flash-latest",
            pricing="Free tier",
            key_url="https://aistudio.google.com/apikey",
            note="Free with a Google account. Daily limits apply, and Google may use free-tier data to improve its products.",
        ),
        Provider(
            id="openrouter",
            label="OpenRouter",
            kind="openai",
            base_url="https://openrouter.ai/api/v1",
            key_env="OPENROUTER_API_KEY",
            default_model="",
            pricing="Free models available",
            key_url="https://openrouter.ai/keys",
            note="Hundreds of models behind one key. Models ending in :free cost nothing but have low daily limits, and some free providers may train on what you send.",
        ),
        Provider(
            id="groq",
            label="Groq",
            kind="openai",
            base_url="https://api.groq.com/openai/v1",
            key_env="GROQ_API_KEY",
            default_model="",
            pricing="Free tier",
            key_url="https://console.groq.com/keys",
            note="Very fast open models with a free tier. Its free Whisper can also transcribe your voice notes.",
        ),
        Provider(
            id="ollama",
            label="Ollama (your computer)",
            kind="openai",
            base_url="http://localhost:11434/v1",
            key_env=None,
            default_model="",
            pricing="Free, fully private",
            key_url="https://ollama.com/download",
            needs_key=False,
            note="Runs models on the same machine as the server. Nothing leaves your computer. Needs a reasonably powerful machine.",
        ),
        Provider(
            id="openai",
            label="OpenAI",
            kind="openai",
            base_url="https://api.openai.com/v1",
            key_env="OPENAI_API_KEY",
            default_model="",
            pricing="Paid",
            key_url="https://platform.openai.com/api-keys",
        ),
        Provider(
            id="anthropic",
            label="Anthropic Claude",
            kind="anthropic",
            base_url="",
            key_env="ANTHROPIC_API_KEY",
            default_model="claude-opus-5-5",
            pricing="Paid",
            key_url="https://console.anthropic.com/settings/keys",
        ),
        Provider(
            id="custom",
            label="Other (OpenAI-compatible)",
            kind="openai",
            base_url="",
            key_env="CUSTOM_AI_API_KEY",
            default_model="",
            pricing="Depends",
            note="Any service with an OpenAI-compatible API: LM Studio, Together, DeepSeek, Mistral, vLLM…",
            needs_key=False,
        ),
    ]
}

TRANSCRIPTION_PROVIDERS = {
    "local": "On this server (free, private)",
    "groq": "Groq Whisper (free tier, fast)",
    "openai": "OpenAI (paid)",
}
