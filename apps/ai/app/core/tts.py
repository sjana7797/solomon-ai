"""
Text-to-speech for "read aloud": Kokoro-82M through mlx-audio (Apple MLX).

The model (~330 MB) loads on first use and unloads after
TTS_IDLE_UNLOAD_SECONDS. Synthesis is blocking MLX work, run in a worker
thread one request at a time. Markdown is reduced to speakable text first.
"""

from __future__ import annotations

import asyncio
import io
import logging
import re
import threading
import wave

import numpy as np

from app.api.settings import settings

logger = logging.getLogger(__name__)

SAMPLE_RATE = 24_000
MAX_CHARS = 2_000  # per request; the browser sends answers a chunk at a time

# Kokoro English voices (American "a*", British "b*").
VOICES = ("af_heart", "af_bella", "af_nicole", "am_michael", "am_fenrir", "bf_emma", "bm_george")


def speakable(markdown: str) -> str:
    """Strip markdown, code and citation markers so the voice reads prose only."""
    text = re.sub(r"```.*?```", " (code omitted) ", markdown, flags=re.DOTALL)
    text = re.sub(r"`([^`]*)`", r"\1", text)
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", text)  # images
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)  # links → their text
    text = re.sub(r"【\d+[^】]*】|\[\d+\]", "", text)  # citations
    text = re.sub(r"https?://\S+", "", text)
    text = re.sub(r"^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"[*_~|]+", "", text)
    text = re.sub(r"\n{2,}", "\n", text)
    return re.sub(r"[ \t]+", " ", text).strip()


class _Holder:
    def __init__(self) -> None:
        self._model = None
        self._lock = threading.Lock()
        self._timer: threading.Timer | None = None

    def _unload(self) -> None:
        with self._lock:
            if self._model is not None:
                logger.info("Unloading idle TTS model")
                self._model = None

    def synthesize(self, text: str, voice: str, speed: float) -> bytes:
        with self._lock:
            if self._timer:
                self._timer.cancel()
            if self._model is None:
                from mlx_audio.tts.utils import load_model

                logger.info("Loading TTS model %s", settings.TTS_MODEL)
                self._model = load_model(settings.TTS_MODEL)
            try:
                chunks = [
                    np.array(result.audio)
                    for result in self._model.generate(
                        text, voice=voice, speed=speed, lang_code=voice[0]
                    )
                ]
            finally:
                self._timer = threading.Timer(settings.TTS_IDLE_UNLOAD_SECONDS, self._unload)
                self._timer.daemon = True
                self._timer.start()
        audio = np.concatenate(chunks) if chunks else np.zeros(0, dtype=np.float32)
        pcm = (np.clip(audio, -1.0, 1.0) * 32767).astype("<i2")
        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as out:
            out.setnchannels(1)
            out.setsampwidth(2)
            out.setframerate(SAMPLE_RATE)
            out.writeframes(pcm.tobytes())
        return buffer.getvalue()


_holder = _Holder()


async def synthesize(text: str, *, voice: str | None = None, speed: float = 1.0) -> bytes:
    """WAV bytes (24 kHz mono) for the speakable form of `text`."""
    spoken = speakable(text)[:MAX_CHARS]
    if not spoken:
        raise ValueError("Nothing to read aloud.")
    return await asyncio.to_thread(_holder.synthesize, spoken, voice or settings.TTS_VOICE, speed)
