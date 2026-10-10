"""Speech-to-text for voice entries. Claude reads text, so audio is transcribed first."""

import threading
from functools import lru_cache
from typing import Protocol

import httpx

from ..config import get_settings


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
                        "or set TRANSCRIPTION_PROVIDER=openai."
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


class OpenAITranscriber:
    URL = "https://api.openai.com/v1/audio/transcriptions"

    def __init__(self, api_key: str, model: str):
        self.api_key = api_key
        self.model = model

    def transcribe(self, path: str, filename: str) -> str:
        if not self.api_key:
            raise TranscriptionError("OPENAI_API_KEY is not set on the server.")
        try:
            with open(path, "rb") as audio:
                response = httpx.post(
                    self.URL,
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    data={"model": self.model, "response_format": "json"},
                    files={"file": (filename, audio)},
                    timeout=300,
                )
        except httpx.HTTPError as e:
            raise TranscriptionError("Couldn't reach the transcription service.") from e
        if response.status_code != 200:
            raise TranscriptionError(f"Transcription failed ({response.status_code}): {response.text[:200]}")
        return response.json().get("text", "").strip()


@lru_cache
def get_transcriber() -> Transcriber:
    settings = get_settings()
    if settings.transcription_provider == "openai":
        return OpenAITranscriber(settings.openai_api_key, settings.openai_transcribe_model)
    return LocalWhisperTranscriber(settings.whisper_model_size)
