"""
Local image generation with mflux (Apple MLX) — FLUX.2 Klein 4B, 4-bit.

Ollama's image generation is disabled in current releases, so the model runs
in-process on the Mac GPU via mflux. The model (~4.6 GB) loads on first use,
stays resident between requests and unloads after IMAGE_IDLE_UNLOAD_SECONDS.
Generation is blocking MLX work, so it runs in a worker thread, one image at a
time, reporting per-step progress back to the event loop.
"""

from __future__ import annotations

import asyncio
import io
import logging
import random
import threading
from collections.abc import AsyncIterator
from dataclasses import dataclass

from app.api.settings import settings

logger = logging.getLogger(__name__)

_BASE_MODEL = "flux2-klein-4b"  # geometry/config family of the checkpoint


@dataclass(frozen=True)
class ImageProgress:
    completed: int
    total: int


@dataclass(frozen=True)
class GeneratedImage:
    data: bytes
    mime_type: str
    width: int
    height: int
    seed: int | None


class _ModelHolder:
    """Lazily loaded mflux model with idle unloading (guarded by one lock)."""

    def __init__(self) -> None:
        self._model = None
        self._lock = threading.Lock()  # one generation at a time on the GPU
        self._unload_timer: threading.Timer | None = None

    def _load(self):
        if self._model is None:
            from mflux.models.common.resolution.config_resolution import ConfigResolution
            from mflux.models.flux2.variants import Flux2Klein

            repo = settings.IMAGE_MODEL
            config = ConfigResolution.resolve_restricted(
                repo, _BASE_MODEL, model_path=repo, base_model=_BASE_MODEL
            )
            logger.info("Loading image model %s", repo)
            self._model = Flux2Klein(model_config=config, model_path=repo)
        return self._model

    def _schedule_unload(self) -> None:
        if self._unload_timer:
            self._unload_timer.cancel()
        self._unload_timer = threading.Timer(settings.IMAGE_IDLE_UNLOAD_SECONDS, self.unload)
        self._unload_timer.daemon = True
        self._unload_timer.start()

    def unload(self) -> None:
        with self._lock:
            if self._model is not None:
                logger.info("Unloading idle image model")
                self._model = None
                try:
                    import gc

                    import mlx.core as mx

                    gc.collect()
                    mx.clear_cache()
                except Exception:  # best effort
                    pass

    def generate(self, prompt: str, width: int, height: int, seed: int, on_step) -> bytes:
        with self._lock:
            if self._unload_timer:
                self._unload_timer.cancel()
            model = self._load()

            class _Progress:
                def call_in_loop(self, t, seed, prompt, latents, config, time_steps, **_):
                    on_step(t + 1, config.num_inference_steps)

            progress = _Progress()
            model.callbacks.register(progress)
            try:
                image = model.generate_image(
                    seed=seed,
                    prompt=prompt,
                    width=width,
                    height=height,
                    guidance=1.0,  # distilled Klein checkpoints require 1.0
                    num_inference_steps=settings.IMAGE_STEPS,
                )
            finally:
                if progress in model.callbacks.in_loop:
                    model.callbacks.in_loop.remove(progress)
                self._schedule_unload()
            buffer = io.BytesIO()
            image.image.save(buffer, format="PNG")
            return buffer.getvalue()


_holder = _ModelHolder()


async def generate_image(
    prompt: str, *, width: int | None = None, height: int | None = None, seed: int | None = None
) -> AsyncIterator[ImageProgress | GeneratedImage]:
    """Yield ImageProgress per denoising step, then one GeneratedImage."""
    width = width or settings.IMAGE_SIZE
    height = height or settings.IMAGE_SIZE
    seed = seed if seed is not None else random.randint(0, 2**31 - 1)
    loop = asyncio.get_running_loop()
    updates: asyncio.Queue[ImageProgress] = asyncio.Queue()

    def on_step(done: int, total: int) -> None:
        loop.call_soon_threadsafe(updates.put_nowait, ImageProgress(done, total))

    task = asyncio.create_task(
        asyncio.to_thread(_holder.generate, prompt, width, height, seed, on_step)
    )
    while not task.done():
        try:
            yield await asyncio.wait_for(updates.get(), timeout=0.5)
        except TimeoutError:
            continue
    data = await task  # re-raises generation errors
    yield GeneratedImage(data, "image/png", width, height, seed)
