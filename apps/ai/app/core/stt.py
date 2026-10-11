"""
Speech-to-text for voice input: Moonshine (English) through mlx-audio.

The browser uploads 16 kHz mono WAV (it converts the recording itself, so no
ffmpeg is needed). The model (~240 MB) loads on first use, unloads after
STT_IDLE_UNLOAD_SECONDS, and transcribes one clip at a time in a worker thread.
"""

from __future__ import annotations

import asyncio
import io
import logging
import os
import tempfile
import threading
import wave
from dataclasses import dataclass

from app.api.settings import settings

logger = logging.getLogger(__name__)


class AudioError(ValueError):
    """The upload isn't usable audio (wrong format, empty or too long)."""


@dataclass(frozen=True)
class Transcript:
    text: str
    duration_seconds: float


def _duration(wav_bytes: bytes) -> float:
    try:
        with wave.open(io.BytesIO(wav_bytes)) as audio:
            return audio.getnframes() / float(audio.getframerate())
    except (wave.Error, EOFError) as exc:
        raise AudioError("Send audio as WAV (PCM).") from exc


class _Holder:
    def __init__(self) -> None:
        self._model = None
        self._lock = threading.Lock()
        self._timer: threading.Timer | None = None

    def _unload(self) -> None:
        with self._lock:
            if self._model is not None:
                logger.info("Unloading idle STT model")
                self._model = None

    def transcribe(self, path: str) -> str:
        with self._lock:
            if self._timer:
                self._timer.cancel()
            if self._model is None:
                from mlx_audio.stt.utils import load_model

                logger.info("Loading STT model %s", settings.STT_MODEL)
                self._model = load_model(settings.STT_MODEL)
            try:
                result = self._model.generate(path)
            finally:
                self._timer = threading.Timer(settings.STT_IDLE_UNLOAD_SECONDS, self._unload)
                self._timer.daemon = True
                self._timer.start()
        return (getattr(result, "text", None) or "").strip()


_holder = _Holder()


async def transcribe(wav_bytes: bytes) -> Transcript:
    duration = _duration(wav_bytes)
    if duration < 0.2:
        raise AudioError("The recording is too short.")
    if duration > settings.STT_MAX_SECONDS:
        raise AudioError(f"Recordings can be up to {settings.STT_MAX_SECONDS} seconds.")
    # mlx-audio reads from a path; the temp file lives only for this request.
    fd, path = tempfile.mkstemp(suffix=".wav")
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(wav_bytes)
        text = await asyncio.to_thread(_holder.transcribe, path)
    finally:
        os.unlink(path)
    return Transcript(text=text, duration_seconds=round(duration, 2))
