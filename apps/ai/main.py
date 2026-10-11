from __future__ import annotations

import logging
from contextlib import asynccontextmanager

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from scalar_fastapi import add_scalar_reference

from app.api.api_router import api_router
from app.api.settings import settings
from app.common.enum import LogLevelEnum
from app.core.crypto import get_chat_cipher
from app.core.db.session import db_service
from app.core.redis import redis_service

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting Solomon AI Service API...")
    # Fail fast if chat encryption keys are missing or malformed.
    get_chat_cipher()
    try:
        await db_service.connect()
        await db_service.ping()
        logger.info("Database connection verified")
    except Exception as exc:
        logger.exception("✗ Database connection failed: %s", exc)
        raise
    try:
        await redis_service.connect()
        await redis_service.ping()
        logger.info("Redis connection verified")
    except Exception as exc:
        logger.exception("Redis connection failed: %s", exc)
        raise
    logger.info("Solomon API AI Service started successfully")
    logger.info("REST API: /v1/*")

    yield
    # Shutdown (also runs if startup failed part-way)
    logger.info("Shutting down Solomon AI Service API...")
    for name, service in (("Redis", redis_service), ("Database", db_service)):
        try:
            await service.disconnect()
            logger.info("%s connection closed", name)
        except Exception as exc:
            logger.exception("✗ Failed to close %s connection: %s", name, exc)

    logger.info("Solomon AI Service API shutdown successfully")


app = FastAPI(
    title="Solomon AI Service",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.ORIGINS.split(",")],
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

add_scalar_reference(app, route="/api/docs")


app.include_router(api_router)


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def server():
    logger.info("Starting server on")
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.ENV == "development",
        log_level=LogLevelEnum.TRACE
        if settings.ENV == "development"
        else LogLevelEnum.ERROR,
    )


if __name__ == "__main__":
    server()
