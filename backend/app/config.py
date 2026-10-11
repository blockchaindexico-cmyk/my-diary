from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Which AI to use. These are defaults: the server owner can change them in the app
    # (You → AI model), which takes precedence. See services/llm/providers.py for the options.
    ai_provider: str = "gemini"  # gemini | openrouter | groq | ollama | openai | anthropic | custom
    ai_model: str = ""  # blank = the provider's default
    ai_base_url: str = ""  # only for ollama on another machine, or custom

    gemini_api_key: str = ""
    openrouter_api_key: str = ""
    groq_api_key: str = ""
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    custom_ai_api_key: str = ""
    claude_effort: str = "medium"  # Claude only: low | medium | high | xhigh | max

    # Signs login tokens. If unset, a random secret is generated once and kept in .jwt_secret
    jwt_secret: str = ""
    jwt_expire_days: int = 60

    database_url: str = "sqlite:///./diary.db"

    transcription_provider: str = "local"  # local | groq | openai
    whisper_model_size: str = "small"
    groq_transcribe_model: str = "whisper-large-v3-turbo"
    openai_transcribe_model: str = "gpt-4o-transcribe"

    allow_signups: bool = True
    cors_origins: list[str] = ["*"]

    # How much history the chat companion sees as "memory"
    chat_memory_days: int = 180
    chat_history_messages: int = 40


@lru_cache
def get_settings() -> Settings:
    return Settings()
