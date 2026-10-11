"""
Live market data for chat answers, from the finance module of the NestJS API
(apps/api, Yahoo Finance today). Names the user mentions are resolved to
symbols with the API's search, then fetched as quote + key stats snapshots.
Every call degrades to "no data" so a market outage never breaks a reply.
"""

from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass
from datetime import UTC, datetime

import httpx

from app.api.settings import settings

logger = logging.getLogger(__name__)

_TIMEOUT_SECONDS = 6
_MAX_SYMBOLS = 3
_SEARCHABLE_TYPES = {"EQUITY", "INDEX", "ETF", "CURRENCY", "CRYPTOCURRENCY", "MUTUALFUND", "FUTURE"}


def _base() -> str:
    return settings.FINANCE_API_URL.rstrip("/")


_TICKER = re.compile(r"^\^?[A-Z0-9&.\-]{1,20}(=X)?$")


@dataclass(frozen=True)
class MarketTerm:
    """A security the user asked about: a guessed ticker and its name."""

    ticker: str
    name: str


async def _search(client: httpx.AsyncClient, query: str) -> str | None:
    res = await client.get(f"{_base()}/finance/search", params={"q": query})
    res.raise_for_status()
    for result in res.json().get("results", []):
        if result.get("type") in _SEARCHABLE_TYPES:
            return result["symbol"]
    return None


async def _resolve(client: httpx.AsyncClient, term: MarketTerm) -> str | None:
    """The guessed ticker if it trades, else the best search match for the name."""
    ticker = term.ticker.strip().upper()
    if _TICKER.match(ticker):
        res = await client.get(f"{_base()}/finance/quotes", params={"symbols": ticker})
        if res.is_success and any(q.get("price") is not None for q in res.json()):
            return ticker
    # Tickers change (renames, demergers); names stay searchable.
    for query in (term.name, term.ticker):
        if query.strip() and (symbol := await _search(client, query.strip())):
            return symbol
    return None


async def _snapshot(client: httpx.AsyncClient, symbol: str) -> dict | None:
    res = await client.get(f"{_base()}/finance/stocks/{symbol}")
    if res.status_code == 404:
        return None
    res.raise_for_status()
    body = res.json()
    return {**body["quote"], "stats": body["stats"]}


async def lookup_quotes(terms: list[MarketTerm]) -> list[dict]:
    """Snapshots (quote + `stats`) for up to three securities; [] on failure."""
    terms = [t for t in terms if t.ticker.strip() or t.name.strip()][:_MAX_SYMBOLS]
    if not terms:
        return []
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
            resolved = await asyncio.gather(
                *(_resolve(client, t) for t in terms), return_exceptions=True
            )
            symbols = list(dict.fromkeys(s for s in resolved if isinstance(s, str)))
            snapshots = await asyncio.gather(
                *(_snapshot(client, s) for s in symbols), return_exceptions=True
            )
    except Exception as exc:
        logger.warning("Market data unavailable: %s", exc)
        return []
    return [s for s in snapshots if isinstance(s, dict)]


def _fmt(value: float | None, digits: int = 2) -> str:
    return "n/a" if value is None else f"{value:,.{digits}f}"


def _compact(value: float | None) -> str:
    if value is None:
        return "n/a"
    for size, suffix in ((1e12, "T"), (1e9, "B"), (1e6, "M")):
        if abs(value) >= size:
            return f"{value / size:.2f}{suffix}"
    return _fmt(value, 0)


def market_context(quotes: list[dict]) -> str:
    """System-prompt block with the snapshots, their time and a disclaimer."""
    lines = []
    for q in quotes:
        stats = q.get("stats") or {}
        when = (
            datetime.fromtimestamp(q["time"] / 1000, UTC).strftime("%d %b %Y %H:%M UTC")
            if q.get("time")
            else "unknown time"
        )
        currency = q.get("currency") or ""
        lines.append(
            f"- {q['name']} ({q['symbol']}, {q.get('exchange') or 'n/a'}): "
            f"price {_fmt(q.get('price'))} {currency}, "
            f"today's change {_fmt(q.get('change'))} {currency} ({_fmt(q.get('changePercent'))}%), "
            f"day range {_fmt(stats.get('dayLow'))}–{_fmt(stats.get('dayHigh'))}, "
            f"52-week range {_fmt(stats.get('fiftyTwoWeekLow'))}–{_fmt(stats.get('fiftyTwoWeekHigh'))}, "
            f"market cap {_compact(stats.get('marketCap'))}, P/E {_fmt(stats.get('peRatio'))}, "
            f"market {(q.get('marketState') or 'unknown').lower()}, as of {when}."
        )
    return (
        "Live market data (Yahoo Finance; may be delayed). Use these figures for any "
        "prices and changes and mention their as-of time. The user already sees these "
        "figures above your reply, so don't restate them all: answer the question in a "
        "few sentences, using only the numbers that matter. Don't give investment advice.\n"
        + "\n".join(lines)
    )
