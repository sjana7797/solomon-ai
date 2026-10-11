"""
Who is calling. Signed-in users send `Authorization: Bearer <jwt>` (Better
Auth, verified against the web app's JWKS); the token's `sub` (user id) owns
their data. Before signing in, the browser's anonymous `X-Client-Id` does.
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

import jwt
from fastapi import Depends, Header, HTTPException
from fastapi.concurrency import run_in_threadpool

from sqlalchemy import text

from app.api.settings import settings
from app.core.db.session import db_service

# Caches the signing keys; refetched when a token names an unknown `kid`.
_jwks = jwt.PyJWKClient(settings.AUTH_JWKS_URL, cache_keys=True, lifespan=3600)


async def verify_token(token: str) -> UUID:
    """User id from a valid token; raises 401 otherwise."""
    try:
        key = await run_in_threadpool(_jwks.get_signing_key_from_jwt, token)
        claims = jwt.decode(
            token,
            key.key,
            algorithms=["EdDSA"],
            audience=settings.AUTH_AUDIENCE,
            issuer=settings.AUTH_ISSUER,
            options={"require": ["sub", "exp"]},
        )
        return UUID(claims["sub"])
    except (jwt.PyJWTError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired sign-in") from exc


async def is_account_id(candidate: UUID) -> bool:
    """True if this id belongs to a registered user. Account ids are not
    secret (they are the token's `sub`), so they must never be accepted as an
    anonymous client id."""
    async with db_service.session() as session:
        found = await session.scalar(
            text('SELECT 1 FROM "user" WHERE id = :id'), {"id": candidate}
        )
    return found is not None


async def anonymous_client_id(client_id: UUID) -> UUID:
    """The anonymous id from `X-Client-Id`; 401 if it is an account's id."""
    if await is_account_id(client_id):
        raise HTTPException(status_code=401, detail="Sign in required")
    return client_id


def _bearer(authorization: str | None) -> str | None:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip() or None
    return None


async def owner_id(
    authorization: Annotated[str | None, Header()] = None,
    client_id: Annotated[UUID | None, Header(alias="X-Client-Id")] = None,
) -> UUID:
    if token := _bearer(authorization):
        return await verify_token(token)
    if client_id is not None:
        return await anonymous_client_id(client_id)
    raise HTTPException(status_code=401, detail="Not signed in")


async def signed_in_user(authorization: Annotated[str | None, Header()] = None) -> UUID:
    token = _bearer(authorization)
    if token is None:
        raise HTTPException(status_code=401, detail="Sign in required")
    return await verify_token(token)


# The owner of the caller's data: user id when signed in, else the client id.
OwnerId = Annotated[UUID, Depends(owner_id)]
UserId = Annotated[UUID, Depends(signed_in_user)]
