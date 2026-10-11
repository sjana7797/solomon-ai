from __future__ import annotations

from redis.asyncio import Redis

from app.api.settings import settings


class RedisService:
    def __init__(self, url: str) -> None:
        self._url = url
        self._client: Redis | None = None

    @property
    def client(self) -> Redis:
        if self._client is None:
            raise RuntimeError("RedisService is not connected")
        return self._client

    async def connect(self) -> None:
        if self._client is None:
            self._client = Redis.from_url(self._url, decode_responses=True)

    async def ping(self) -> None:
        await self.client.ping()

    async def disconnect(self) -> None:
        if self._client is not None:
            await self._client.aclose()
        self._client = None


redis_service = RedisService(settings.REDIS_URL)
