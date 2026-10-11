"""Speech-to-text for voice entries. The AI reads text, so audio is transcribed first."""

import threading
from functools import lru_cache
from typing import Annotated, Protocol

import httpx
from fastapi import Depends
from sqlmodel import Session

from ..config import get_settings
from ..db import get_session
from .ai_config import get_row, resolve, resolve_key
from .llm.providers import PROVIDERS


class TranscriptionError(Exception):
    pass


class Transcriber(Protocol):
    def transcribe(self, path: str, filename: str) -> str: ...


class LocalWhisperTranscriber:
    """faster-whisper running on this server. Audio never leaves the machine."""

    def __init__(self, model_size: str):
        self.model_size = model_size
        self._model = None
        self._lock = threading.Lock()

    def _get_model(self):
        with self._lock:
            if self._model is None:
                try:
                    from faster_whisper import WhisperModel
                except ImportError as e:
                    raise TranscriptionError(
                        "faster-whisper isn't installed. Run `pip install faster-whisper` "
                        "or choose Groq for speech-to-text in You → AI model."
                    ) from e
                # Downloads the model on first use (~500MB for "small")
                self._model = WhisperModel(self.model_size, device="auto", compute_type="int8")
            return self._model

    def transcribe(self, path: str, filename: str) -> str:
        model = self._get_model()
        try:
            segments, _info = model.transcribe(path, vad_filter=True, beam_size=5)
            return " ".join(segment.text.strip() for segment in segments).strip()
        except Exception as e:  # decoding errors from PyAV/ctranslate2 have no common base class
            raise TranscriptionError(f"Couldn't transcribe the recording: {e}") from e


class APITranscriber:
    """Any OpenAI-compatible transcription endpoint: Groq's free Whisper, or OpenAI."""

    def __init__(self, *, label: str, base_url: str, api_key: str, model: str):
        self.label = label
        self.url = base_url.rstrip("/") + "/audio/transcriptions"
        self.api_key = api_key
        self.model = model

    def transcribe(self, path: str, filename: str) -> str:
        if not self.api_key:
            raise TranscriptionError(f"Add your {self.label} API key in You → AI model to transcribe with {self.label}.")
        try:
            with open(path, "rb") as audio:
                response = httpx.post(
                    self.url,
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    data={"model": self.model, "response_format": "json"},
                    files={"file": (filename, audio)},
                    timeout=300,
                )
        except httpx.HTTPError as e:
            raise TranscriptionError(f"Couldn't reach {self.label} to transcribe.") from e
        if response.status_code == 429:
            raise TranscriptionError(f"{self.label}'s free transcription limit was reached. Try again later.")
        if response.status_code != 200:
            raise TranscriptionError(f"{self.label} transcription failed ({response.status_code}): {response.text[:200]}")
        return response.json().get("text", "").strip()


@lru_cache
def _local(model_size: str) -> LocalWhisperTranscriber:
    # One instance per model size, so the Whisper model loads once
    return LocalWhisperTranscriber(model_size)


def get_transcriber(session: Annotated[Session, Depends(get_session)]) -> Transcriber:
    settings = get_settings()
    choice = resolve(session).transcription_provider
    row = get_row(session)
    if choice in ("groq", "openai"):
        provider = PROVIDERS[choice]
        key, _ = resolve_key(provider, row)
        model = settings.groq_transcribe_model if choice == "groq" else settings.openai_transcribe_model
        return APITranscriber(label=provider.label, base_url=provider.base_url, api_key=key, model=model)
    return _local(settings.whisper_model_size)
