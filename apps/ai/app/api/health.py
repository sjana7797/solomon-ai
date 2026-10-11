from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.core.db.session import db_service
from app.core.redis import redis_service

health_router = APIRouter(prefix="/health", tags=["Health"])


@health_router.get("/check")
async def check():
    return {"status": "ok"}


@health_router.get("/ready")
async def ready():
    services = {"database": db_service, "redis": redis_service}
    results = {}
    for name, service in services.items():
        try:
            await service.ping()
            results[name] = "ok"
        except Exception:
            results[name] = "unavailable"

    healthy = all(status == "ok" for status in results.values())
    return JSONResponse(
        status_code=200 if healthy else 503,
        content={"status": "ok" if healthy else "degraded", "services": results},
    )
