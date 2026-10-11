from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, Field

from app.core.tts import MAX_CHARS, VOICES, synthesize

tts_router = APIRouter(prefix="/tts", tags=["Text to speech"])


class SpeechRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=MAX_CHARS * 2)
    voice: str | None = Field(None, description=f"One of: {', '.join(VOICES)}")
    speed: float = Field(1.0, ge=0.5, le=2.0)


@tts_router.post("", response_class=Response)
async def speak(request: SpeechRequest):
    """Read text aloud (markdown is cleaned first). Returns 24 kHz mono WAV."""
    if request.voice and request.voice not in VOICES:
        raise HTTPException(status_code=422, detail=f"Unknown voice. Choose one of: {', '.join(VOICES)}")
    try:
        audio = await synthesize(request.text, voice=request.voice, speed=request.speed)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return Response(content=audio, media_type="audio/wav", headers={"Cache-Control": "no-store"})


@tts_router.get("/voices")
async def voices():
    return {"voices": list(VOICES)}
