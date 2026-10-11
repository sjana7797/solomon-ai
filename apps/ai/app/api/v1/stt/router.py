from fastapi import APIRouter, HTTPException, UploadFile

from app.core.stt import AudioError, transcribe

stt_router = APIRouter(prefix="/stt", tags=["Speech to text"])

_MAX_BYTES = 10 * 1024 * 1024  # 2 min of 16 kHz mono PCM is ~3.8 MB


@stt_router.post("")
async def speech_to_text(file: UploadFile):
    """Transcribe a short voice recording (16 kHz mono WAV) to text."""
    data = await file.read(_MAX_BYTES + 1)
    if len(data) > _MAX_BYTES:
        raise HTTPException(status_code=413, detail="The recording is too large.")
    try:
        transcript = await transcribe(data)
    except AudioError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"text": transcript.text, "duration_seconds": transcript.duration_seconds}
