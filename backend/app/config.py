from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    anthropic_api_key: str = ""
    claude_model: str = "claude-opus-5-5"
    claude_effort: str = "medium"  # low | medium | high | xhigh | max

    # Signs login tokens. If unset, a random secret is generated once and kept in .jwt_secret
    jwt_secret: str = ""
    jwt_expire_days: int = 60

    database_url: str = "sqlite:///./diary.db"

    transcription_provider: str = "local"  # "local" | "openai"
    whisper_model_size: str = "small"
    openai_api_key: str = ""
    openai_transcribe_model: str = "gpt-4o-transcribe"

    allow_signups: bool = True
    cors_origins: list[str] = ["*"]

    # How much history the chat companion sees as "memory"
    chat_memory_days: int = 180
    chat_history_messages: int = 40


@lru_cache
def get_settings() -> Settings:
    return Settings()
