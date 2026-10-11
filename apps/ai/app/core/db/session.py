from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.api.settings import settings


class DatabaseService:
    def __init__(self, url: str) -> None:
        self._url = url
        self._engine: AsyncEngine | None = None
        self._sessionmaker: async_sessionmaker[AsyncSession] | None = None

    @property
    def engine(self) -> AsyncEngine:
        if self._engine is None:
            raise RuntimeError("DatabaseService is not connected")
        return self._engine

    async def connect(self) -> None:
        if self._engine is not None:
            return
        self._engine = create_async_engine(
            self._url,
            pool_size=settings.DB_POOL_SIZE,
            max_overflow=settings.DB_MAX_OVERFLOW,
            pool_pre_ping=True,
            echo=settings.DB_ECHO,
        )
        self._sessionmaker = async_sessionmaker(self._engine, expire_on_commit=False)

    async def ping(self) -> None:
        async with self.engine.connect() as conn:
            await conn.execute(text("SELECT 1"))

    async def disconnect(self) -> None:
        if self._engine is not None:
            await self._engine.dispose()
        self._engine = None
        self._sessionmaker = None

    async def get_session(self) -> AsyncIterator[AsyncSession]:
        if self._sessionmaker is None:
            raise RuntimeError("DatabaseService is not connected")
        async with self._sessionmaker() as session:
            yield session

    @asynccontextmanager
    async def session(self) -> AsyncIterator[AsyncSession]:
        """Session for use outside request dependencies (e.g. background saves)."""
        if self._sessionmaker is None:
            raise RuntimeError("DatabaseService is not connected")
        async with self._sessionmaker() as session:
            yield session


db_service = DatabaseService(settings.DATABASE_URL)
